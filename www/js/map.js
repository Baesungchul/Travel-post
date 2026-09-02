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
    if (!withGeo.length) {
      container.innerHTML = '<div class="empty">좌표가 있는 기록이 아직 없어요.<br>' +
        '<span class="mini">촬영할 때 위치를 잡으면 여기에 찍힙니다.</span></div>';
      return;
    }

    container.innerHTML = '<div class="mapbox" id="mapBox"></div>' +
      '<div class="mini" style="margin-top:6px;">지도에 ' + withGeo.length + '곳' +
      (noGeo ? ' · 좌표 없는 기록 ' + noGeo + '곳은 목록에만 있어요' : '') + '</div>';

    loadSdk().then(function () {
      var box = container.querySelector('#mapBox');
      var first = withGeo[0].geo;
      var map = new kakao.maps.Map(box, {
        center: new kakao.maps.LatLng(first.lat, first.lng),
        level: 7
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
    }).catch(function (e) {
      fallback(container, places, onPick, e.message);
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
