/* ═══════════════════════════════════════════════════════════
   map.js — 기록 탭 지도 보기
   ----------------------------------------------------------------
   장소에 좌표가 붙어 있다(설계안 3장: 사진이 아니라 장소에 위치를 붙였다).
   그래서 지도는 데이터를 새로 모으지 않고 그대로 찍기만 하면 된다.

   ⚠️ 카카오 지도 JS SDK 는 **JavaScript 키**가 필요하고(REST 키와 다르다),
      개발자 콘솔에 도메인을 등록해야 뜬다.
      키가 없으면 지도를 흉내내지 않고 **지역별 목록**으로 떨어진다.
      (빈 회색 네모를 보여주는 것보다, 왜 없는지 적고 쓸 수 있는 걸 주는 게 낫다)
   ⚠️ SDK 는 지도를 열 때 받는다 — 앱 시작을 무겁게 하지 않는다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _sdk = null;

  function loadSdk() {
    if (_sdk) return _sdk;
    _sdk = new Promise(function (res, rej) {
      if (window.kakao && window.kakao.maps) { res(); return; }
      var s = document.createElement('script');
      s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + encodeURIComponent(CFG.KAKAO_JS_KEY) + '&autoload=false';
      s.onload = function () {
        try { kakao.maps.load(function () { res(); }); } catch (e) { rej(new Error('지도 초기화 실패')); }
      };
      s.onerror = function () { rej(new Error('지도를 불러오지 못했습니다 (키·도메인 등록을 확인해 주세요)')); };
      document.head.appendChild(s);
    });
    return _sdk;
  }

  /* 두 좌표 사이 거리(m) — 폴백 목록에서 '가까운 순'을 만들 때 쓴다 */
  function distM(a, b) {
    if (!a || !b) return null;
    var R = 6371000, t = Math.PI / 180;
    var dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(2 * R * Math.asin(Math.sqrt(s)));
  }

  /* container 에 지도를 그린다. 좌표 있는 장소만 찍는다. */
  function render(container, places, onPick) {
    var withGeo = places.filter(function (p) { return p.geo && p.geo.lat && p.geo.lng; });
    var noGeo = places.length - withGeo.length;

    if (!CFG.hasKakaoMap()) {
      fallback(container, places, onPick,
        '지도를 켜려면 js/config.js 의 KAKAO_JS_KEY 가 필요합니다(REST 키와 다른 값이고, 도메인 등록도 해야 합니다).');
      return;
    }
    /* ⚠️ 2026-09-02 사용자 요청: 좌표 있는 기록이 하나도 없어도 지도는 띄운다 —
       "등록 안 되어 있는 곳도 길게 눌러 입력"하려면 빈 지도라도 길게 누를 대상이 있어야 한다.
       예전엔 여기서 '기록 없음' 안내로 막아 버려, 첫 핀조차 지도로는 못 찍었다. */
    var here = (window.Geo && Geo.last && Geo.last()) || null;
    var DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780 };   // 좌표를 하나도 못 구했을 때만 쓰는 기본값(서울)

    container.innerHTML = '<div class="mapbox" id="mapBox"></div>' +
      '<div class="mini" style="margin-top:6px;">' +
      (withGeo.length ? ('지도에 ' + withGeo.length + '곳' +
        (noGeo ? ' · 좌표 없는 기록 ' + noGeo + '곳은 목록에만 있어요' : ''))
        : '아직 지도에 찍힌 기록이 없어요') +
      ' · 빈 자리를 길게 누르면 그 자리에 새 기록을 시작해요</div>';

    loadSdk().then(function () {
      var box = container.querySelector('#mapBox');
      var first = withGeo.length ? withGeo[0].geo : (here || DEFAULT_CENTER);
      var map = new kakao.maps.Map(box, {
        center: new kakao.maps.LatLng(first.lat, first.lng),
        level: withGeo.length ? 7 : 5
      });
      var bounds = new kakao.maps.LatLngBounds();
      withGeo.forEach(function (p) {
        var pos = new kakao.maps.LatLng(p.geo.lat, p.geo.lng);
        bounds.extend(pos);
        var mk = new kakao.maps.Marker({ map: map, position: pos, title: placeLabel(p) });
        /* ★ 2026-09-02 사용자 지적: 라벨 글씨가 안 보임 — 배경 없이(카카오 기본 말풍선만)
           검정 글씨로 명시해서, 앱 전체 글자색(다크 테마 등)을 물려받지 않게 고정한다. */
        var iw = new kakao.maps.InfoWindow({
          content: '<div style="padding:6px 10px;font-size:12px;white-space:nowrap;' +
                   'background:none;color:#000;">' + esc(placeLabel(p)) + '</div>'
        });
        kakao.maps.event.addListener(mk, 'click', function () {
          iw.open(map, mk);
          if (onPick) onPick(p.id);
        });
      });
      if (withGeo.length > 1) map.setBounds(bounds);
      attachLongPress(map, box);
    }).catch(function (e) {
      if (withGeo.length) fallback(container, places, onPick, e.message);
      else container.innerHTML = '<div class="notice">🗺 ' + esc(e.message) + '</div>';
    });
  }

  /* ── 길게 눌러 새 기록 추가 ──
     사용자 요청(2026-09-02): "지도에 등록 안되어 있는곳도 지도에서 길게눌러서 입력할수 있게 해줘.
     길게누르면 해당 주소가 들어가게 하고 상호는 비워두는 걸로 해줘."

     ★ 2026-09-03 사용자 지적 ①: "지도에서 길게 눌러서 등록도 안돼" — 실기기에서 동작 안 함.
        처음 버전은 지도의 'click' 이벤트(=터치를 뗀 뒤 브라우저가 만들어 주는 합성 클릭)를 기다렸다가
        그 시점에 '길게 눌렀었는지'를 판정했다. 그런데 모바일에서는 손가락을 오래 붙이고 있다가 떼면
        (특히 500ms 넘게 가만히 누르고 있으면) 브라우저·웹뷰가 그걸 '길게 누르기' 제스처로 보고
        click 을 아예 안 만들어 주는 경우가 흔하다 — 그러면 판정 코드 자체가 실행되지 않는다.
        → click 을 기다리지 않고, 누르고 있는 동안 타이머로 직접 LP_MS 가 지나면 그 순간 바로 실행한다
          (뗄 때까지 기다리지 않는다 — 안드로이드 길게 누르기와 같은 느낌).
        → 좌표는 카카오 지원팀이 안내한 공식 방법인 map.coordsFromContainerPoint() 로 구한다
          (devtalk.kakao.com 문의 답변 — 사용자 입력 좌표 변환에는 이 메서드를 쓰라고 안내함).

     ★ 2026-09-03 사용자 지적 ②: 위 수정을 넣은 뒤에도 "여전히 안 된다" — 진짜 원인은 따로 있었다.
        카카오 지도 SDK 는 지도를 그릴 때 box(#mapBox) **안쪽에 자기 타일·마커용 div 를 더 만들고
        그 안쪽 엘리먼트에** 자체 터치 리스너(드래그로 지도 움직이기 등)를 건다. 우리 리스너는
        box(바깥 엘리먼트)에 **버블 단계**로 달려 있었는데, 안쪽 리스너가 지도를 움직이려고
        stopPropagation() 을 부르면 이벤트가 box 까지 올라오지도 못한다 — 그러면 우리 touchstart 는
        아예 실행되지 않고, 타이머도 시작이 안 되니 아무리 오래 눌러도 반응이 없다.
        → 캡처 단계(capture: true)로 등록하면 이벤트가 안쪽(target)까지 내려가기 **전에** 바깥쪽인
          box 를 먼저 지나가면서 우리 리스너부터 실행된다 — 안쪽에서 나중에 stopPropagation 을
          불러도 이미 실행된 우리 코드에는 영향이 없다. DOM 이벤트 캡처 단계의 기본 동작이라
          카카오 SDK 내부 구현이 어떻든 항상 성립한다.
     ⚠️ 마커를 누르면 마커 자체가 이벤트를 먹어서, 마커 위에서는 이 롱프레스가 안 걸린다(지도 SDK 공통 동작). */
  function attachLongPress(map, box) {
    /* ★ 2026-09-03 사용자 확인: 진단 토스트("지도 터치 인식됨")는 뜬다 — 캡처 리스너는
       정상적으로 걸려 있다. 그런데도 "장소 인식은 안 된다"고 하니, 문제는 그 다음 단계
       (0.5초를 채우기 전에 손끝이 조금 움직였다고 우리가 스스로 취소해버리는 것) 로 좁혀진다.
       실제 손가락은 마우스 포인터와 달리 가만히 있어도 접촉면이 미세하게 흔들려서 14px
       허용치를 쉽게 넘는다 — 그러면 원이 다 자라기도 전에 조용히 취소되고, 사용자 눈엔
       "그냥 반응이 없다"로 보인다. 허용치를 넉넉히 늘리고(진짜 지도 드래그는 이보다 훨씬 많이
       움직인다), 타이머가 끝나는 순간·움직임으로 취소되는 순간에도 진단 토스트를 하나씩 더
       띄워서 이번에도 안 되면 정확히 어느 단계인지 바로 알 수 있게 한다. */
    var LP_MS = 550, MOVE_TOL = 32;
    var sx = 0, sy = 0, cx = 0, cy = 0, moved = false, timer = null, ripple = null;
    var CAP = { capture: true, passive: true };   /* 캡처 단계 + 스크롤 막지 않음 */

    var debugShown = false;
    function debugPing() {
      if (debugShown) return;
      debugShown = true;
      try { if (window.showToast) showToast('🔧 지도 터치 인식됨(진단용)', 'ok'); } catch (e) {}
    }

    function toLatLng(x, y) {
      var r = box.getBoundingClientRect();
      return map.coordsFromContainerPoint(new kakao.maps.Point(x - r.left, y - r.top));
    }
    /* 누르는 동안 손끝에 원이 자라는 걸 보여준다 — 실제로 눌림이 잡혔는지 눈으로 확인되고,
       "반응이 없다"는 문의가 다시 오면 이 원이 뜨는지부터 확인해 원인을 좁힐 수 있다. */
    function showRipple(x, y) {
      hideRipple();
      var r = box.getBoundingClientRect();
      var el = document.createElement('div');
      el.className = 'lp-ripple';
      el.style.left = (x - r.left) + 'px';
      el.style.top = (y - r.top) + 'px';
      el.style.setProperty('--lp-ms', LP_MS + 'ms');
      box.appendChild(el);
      void el.offsetWidth;   /* 강제 리플로우 — 바로 grow 를 붙이면 트랜지션 없이 순간이동해 버린다 */
      el.classList.add('grow');
      ripple = el;
    }
    function hideRipple() {
      if (!ripple) return;
      var el = ripple; ripple = null;
      el.classList.add('gone');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
    }
    function start(x, y) {
      sx = x; sy = y; cx = x; cy = y; moved = false;
      clearTimeout(timer);
      showRipple(x, y);
      timer = setTimeout(function () {
        hideRipple();
        if (moved) return;
        try { if (window.showToast) showToast('🔧 롱프레스 인식 — 장소 만드는 중(진단용)', 'ok'); } catch (e) {}
        /* ★ 2026-09-03: 이 토스트는 뜨는데 그 다음(주소 찾기 오버레이·새 화면 전환)이
           전혀 안 일어난다는 확인을 받았다 — 즉 바로 다음 줄에서 조용히 멈추고 있다는
           뜻이다. addPlaceHere() 자체가 아니라 그 인자인 toLatLng() 가 던지는 예외일
           가능성이 가장 크다(setTimeout 콜백 안의 예외는 화면에 아무것도 안 남기고
           콘솔에만 찍힌다) — 감싸서 진짜 오류를 토스트로 그대로 보여준다. */
        try {
          addPlaceHere(toLatLng(cx, cy));   /* 손끝이 허용치 안에서 움직였다면 마지막 위치를 쓴다 */
        } catch (err) {
          try { if (window.showToast) showToast('🔧 좌표 변환 실패(진단용): ' + (err && err.message || err), 'err'); } catch (e2) {}
        }
      }, LP_MS);
    }
    function move(x, y) {
      cx = x; cy = y;
      if (moved) return;
      if (Math.abs(x - sx) > MOVE_TOL || Math.abs(y - sy) > MOVE_TOL) {
        moved = true; clearTimeout(timer); hideRipple();
        try { if (window.showToast) showToast('🔧 움직임으로 취소됨(진단용)', 'err'); } catch (e) {}
      }
    }
    function cancel() { clearTimeout(timer); hideRipple(); }

    /* ⚠️ 반드시 캡처 단계(세 번째 인자 capture:true)로 달아야 한다 — 위 ② 설명 참고.
       버블 단계로 달면 카카오 내부 엘리먼트가 먼저 이벤트를 가로챌 수 있다. */
    box.addEventListener('touchstart', function (e) {
      debugPing();
      var t = e.touches && e.touches[0]; if (t) start(t.clientX, t.clientY);
    }, CAP);
    box.addEventListener('touchmove', function (e) {
      var t = e.touches && e.touches[0]; if (t) move(t.clientX, t.clientY);
    }, CAP);
    box.addEventListener('touchend', cancel, CAP);
    box.addEventListener('touchcancel', cancel, CAP);
    box.addEventListener('mousedown', function (e) { debugPing(); start(e.clientX, e.clientY); }, { capture: true });
    box.addEventListener('mousemove', function (e) { if (e.buttons) move(e.clientX, e.clientY); }, { capture: true });
    box.addEventListener('mouseup', cancel, { capture: true });
    box.addEventListener('mouseleave', cancel, { capture: true });
    /* 안드로이드 WebView 기본 '길게 눌러 선택/저장' 메뉴가 뜨면 우리 손짓을 가로챈다 */
    box.addEventListener('contextmenu', function (e) { e.preventDefault(); }, { capture: true });
  }

  function addPlaceHere(latlng) {
    var pf = window.Profiles && Profiles.current();
    if (!pf) { if (window.UI && UI.openCategoryPicker) UI.openCategoryPicker(); return; }
    var geo = { lat: latlng.getLat(), lng: latlng.getLng() };
    var wantAddr = !!(window.Geo && Geo.available());
    if (window.showOverlay) showOverlay('주소를 찾는 중...');
    /* ★ 2026-09-03: "롱프레스 인식" 진단 토스트는 뜨는데 그 다음(주소 찾기 오버레이 →
       새 화면 전환)이 전혀 안 일어난다는 확인을 받았다. 원래 .then() 안에서 던지는 예외는
       promise 체인의 .catch() 가 잡지만, 그 .catch() 가 실제 오류 내용을 보여주지 않고
       늘 같은 안내문만 띄운 뒤 Place.create 등을 **또** 동기적으로 호출했다 — 그 재시도
       자체가 또 던지면 아무 .catch() 도 없는 채로 조용히 묻힌다. 진짜 오류를 그대로
       보여주고, 재시도 쪽도 감싸서 어디서 멈추는지 이번엔 확실히 잡는다. */
    (wantAddr ? Geo.reverse(geo) : Promise.resolve('')).then(function (addr) {
      if (window.hideOverlay) hideOverlay();
      Place.create(pf.id);
      var p = Place.current();
      p.geo = geo;
      p.address = addr || '';
      p.area = addr ? Categories.areaOf(addr) : '';
      return Place.save().then(function () {
        showToast(catFill('여기에 새 {장소호칭}를 시작했어요', pf) + (addr ? ' — ' + addr : ' (주소를 못 찾았어요, 손으로 적어주세요)'), 'ok');
        if (window.UI && UI.switchTab) UI.switchTab('now');
      });
    }).catch(function (e) {
      if (window.hideOverlay) hideOverlay();
      try { if (window.showToast) showToast('🔧 새 기록 만들기 실패(진단용): ' + ((e && (e.message || e.code)) || e), 'err'); } catch (e2) {}
      showToast('주소를 찾지 못했어요 — 위치만 저장했어요. 손으로 적어주세요.', 'err');
      try {
        Place.create(pf.id);
        Place.current().geo = geo;
        Place.save().then(function () { if (window.UI && UI.switchTab) UI.switchTab('now'); })
          .catch(function (e3) {
            try { if (window.showToast) showToast('🔧 저장 재시도 실패(진단용): ' + ((e3 && e3.message) || e3), 'err'); } catch (e4) {}
          });
      } catch (e5) {
        try { if (window.showToast) showToast('🔧 재시도 중 예외(진단용): ' + (e5 && e5.message || e5), 'err'); } catch (e6) {}
      }
    });
  }

  /* 지도를 못 쓸 때 — 흉내내지 않고, 지역별로 묶어서 보여준다 */
  function fallback(container, places, onPick, why) {
    var here = (window.Geo && Geo.last && Geo.last()) || null;
    var groups = {};
    places.forEach(function (p) {
      var k = p.area || '지역 미상';
      (groups[k] = groups[k] || []).push(p);
    });
    var keys = Object.keys(groups).sort(function (a, b) { return groups[b].length - groups[a].length; });

    container.innerHTML =
      '<div class="notice">🗺 ' + esc(why) + '</div>' +
      keys.map(function (k) {
        var list = groups[k].slice().sort(function (a, b) {
          var da = distM(here, a.geo), db = distM(here, b.geo);
          if (da == null && db == null) return 0;
          if (da == null) return 1;
          if (db == null) return -1;
          return da - db;
        });
        return '<div class="card"><div class="sec-hd"><h2>📍 ' + esc(k) + '</h2>' +
          '<span class="sp mini">' + list.length + '곳</span></div>' +
          list.map(function (p) {
            var d = distM(here, p.geo);
            return '<div class="row mapRow" data-id="' + p.id + '">' +
              '<div><div class="ti">' + esc(placeLabel(p)) + '</div>' +
              '<div class="sb">' + esc(String(p.visitedAt || '').slice(0, 10)) +
                (p.address ? ' · ' + esc(p.address) : '') + '</div></div>' +
              '<div class="rt">' + (d == null ? '' : (d < 1000 ? d + 'm' : (d / 1000).toFixed(1) + 'km')) + '</div></div>';
          }).join('') + '</div>';
      }).join('');

    container.querySelectorAll('.mapRow').forEach(function (r) {
      r.onclick = function () { if (onPick) onPick(r.getAttribute('data-id')); };
    });
  }

  /* ═══ 검색 결과를 지도에 찍기 (주변 장소 찾기용) ═══
     위의 render() 와 데이터 모양이 다르다:
       · render() — 저장된 기록 { name, geo:{lat,lng} }
       · pick()   — 카카오 검색 결과 { name, address, lat, lng, dist }
     그래서 함수를 나눴다. 하나로 합치면 둘 중 하나는 반드시 억지스러워진다.

     고르는 방법은 '찍고 → 아래 막대에서 확인 → 채우기' 두 단계다.
     ⚠️ 마커를 누르자마자 채우면, 지도를 훑다가 잘못 눌렀을 때 이름이 엉뚱하게 바뀐다.
        되돌릴 수 있는 화면이 아니라(오버레이가 곧 닫힌다) 한 단계를 남겨 둔다. */
  function pick(container, items, opts) {
    opts = opts || {};
    var usable = (items || []).filter(function (d) { return d.lat && d.lng; });

    if (!CFG.hasKakaoMap()) {
      container.innerHTML = '<div class="notice">🗺 지도를 켜려면 카카오 <b>JavaScript 키</b>가 필요합니다 ' +
        '(REST 키와 다른 값이고, 개발자 콘솔에 도메인 등록도 해야 합니다).<br>' +
        '지금은 <b>목록</b>으로 골라 주세요.</div>';
      return;
    }
    if (!usable.length) {
      container.innerHTML = '<div class="empty" style="padding:20px;">좌표가 있는 결과가 없어요.<br>' +
        '<span class="mini">목록에서 골라 주세요.</span></div>';
      return;
    }

    container.innerHTML =
      '<div class="pf-map" id="pfMapBox"></div>' +
      '<div class="pf-sel" id="pfSel"><span class="mini">지도에서 장소를 눌러 고르세요</span></div>';

    var box = container.querySelector('#pfMapBox');
    var sel = container.querySelector('#pfSel');

    loadSdk().then(function () {
      var c = (opts.center && opts.center.lat) ? opts.center : usable[0];
      var map = new kakao.maps.Map(box, {
        center: new kakao.maps.LatLng(c.lat, c.lng),
        level: 4
      });
      var bounds = new kakao.maps.LatLngBounds();

      /* 내 위치 — 기준점이 있어야 '어느 쪽이 가까운지'가 눈으로 읽힌다 */
      if (opts.center && opts.center.lat) {
        var me = new kakao.maps.LatLng(opts.center.lat, opts.center.lng);
        bounds.extend(me);
        new kakao.maps.Circle({
          map: map, center: me, radius: 18,
          strokeWeight: 2, strokeColor: '#2F6B4F', strokeOpacity: 0.9,
          fillColor: '#2F6B4F', fillOpacity: 0.5
        });
      }

      usable.forEach(function (d) {
        var pos = new kakao.maps.LatLng(d.lat, d.lng);
        bounds.extend(pos);
        var mk = new kakao.maps.Marker({ map: map, position: pos, title: d.name || '' });
        var iw = new kakao.maps.InfoWindow({
          content: '<div style="padding:6px 10px;font-size:12px;white-space:nowrap;' +
                   'background:none;color:#000;">' + esc(d.name || '') + '</div>'
        });
        kakao.maps.event.addListener(mk, 'click', function () {
          iw.open(map, mk);
          sel.innerHTML =
            '<div class="pf-sel-tx"><b>' + esc(d.name || '') + '</b>' +
            '<span class="mini">' + esc(d.address || '') +
              (d.dist != null ? ' · ' + d.dist + 'm' : '') + '</span></div>' +
            '<button type="button" class="btn sm primary" id="pfMapUse">채우기</button>';
          var btn = sel.querySelector('#pfMapUse');
          if (btn) btn.onclick = function () { if (opts.onPick) opts.onPick(d); };
        });
      });

      if (usable.length > 1 || (opts.center && opts.center.lat)) map.setBounds(bounds);
    }).catch(function (e) {
      container.innerHTML = '<div class="notice">🗺 ' + esc(e.message) + '<br>' +
        '<b>목록</b>으로 골라 주세요.</div>';
    });
  }

  window.MapView = {
    render: render, pick: pick, distM: distM,
    available: function () { return CFG.hasKakaoMap(); }
  };
})();
