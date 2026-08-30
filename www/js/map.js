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
        var mk = new kakao.maps.Marker({ map: map, position: pos, title: p.name || '' });
        var iw = new kakao.maps.InfoWindow({
          content: '<div style="padding:6px 10px;font-size:12px;white-space:nowrap;">' +
                   esc(p.name || '(이름 없음)') + '</div>'
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
              '<div><div class="ti">' + esc(p.name || '(이름 없음)') + '</div>' +
              '<div class="sb">' + esc(String(p.visitedAt || '').slice(0, 10)) +
                (p.address ? ' · ' + esc(p.address) : '') + '</div></div>' +
              '<div class="rt">' + (d == null ? '' : (d < 1000 ? d + 'm' : (d / 1000).toFixed(1) + 'km')) + '</div></div>';
          }).join('') + '</div>';
      }).join('');

    container.querySelectorAll('.mapRow').forEach(function (r) {
      r.onclick = function () { if (onPick) onPick(r.getAttribute('data-id')); };
    });
  }

  window.MapView = { render: render, distM: distM, available: function () { return CFG.hasKakaoMap(); } };
})();
