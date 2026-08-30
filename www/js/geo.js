/* ═══════════════════════════════════════════════════════════
   geo.js — 위치 + 주변 장소 검색
   ----------------------------------------------------------------
   ⭐ 설계안 3장의 결론을 그대로 구현한다.
      "사진에 위치를 심는 대신, **장소(place)에 위치를 붙인다.**"
      · 인앱 카메라로 그 자리에서 찍으니 촬영 순간 기기 위치를 한 번 읽으면 끝이다.
      · EXIF 파싱도, 카메라 canvas 경로 개조도 필요 없다.
      이쪽이 나은 이유 셋:
        ① 사진 자체엔 위치가 안 남는다 → 블로그에 올려도 집·동선이 노출되지 않는다.
        ② 실내에서 자주 비거나 튀는 사진 EXIF 보다 정확하고, 사용자가 확인·수정할 수 있다.
        ③ 현장매니저 카메라 코드를 그대로 쓸 수 있다.

   ⬜ 미확인(설계안 10장) — 사실처럼 말하지 말 것:
      · 카카오 로컬 API 무료 쿼터·약관·상업적 이용 조건
      · 해외 위치 검색 수단 (지금은 국내만)
   키가 없으면 검색은 조용히 죽지 않고, 화면에 "왜 안 되는지"를 적어준다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LAST_KEY = CFG.k('last_geo');

  /* 기기 위치 한 번 읽기 */
  function read(opts) {
    opts = opts || {};
    return new Promise(function (res, rej) {
      if (!navigator.geolocation) { rej(new Error('이 기기에서는 위치를 쓸 수 없어요')); return; }
      navigator.geolocation.getCurrentPosition(
        function (p) {
          var g = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
          try { localStorage.setItem(LAST_KEY, JSON.stringify(g)); } catch (e) {}
          res(g);
        },
        function (e) {
          var m = (e && e.code === 1) ? '위치 권한이 꺼져 있어요' :
                  (e && e.code === 3) ? '위치를 잡지 못했어요 (실내에서는 느릴 수 있어요)' :
                  '위치를 읽지 못했어요';
          rej(new Error(m));
        },
        { enableHighAccuracy: opts.high !== false, timeout: opts.timeout || 8000, maximumAge: opts.maxAge || 30000 }
      );
    });
  }

  function last() {
    try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch (e) { return null; }
  }

  /* 카테고리 → 카카오 로컬 카테고리 그룹 코드
     FD6 음식점 / CE7 카페 / AD5 숙박 / AT4 관광명소 / CT1 문화시설 */
  var CAT_CODE = { food: 'FD6', cafe: 'CE7', stay: 'AD5', spot: 'AT4', show: 'CT1', play: 'AT4' };

  function _kakao(url, params) {
    if (!CFG.hasKakao()) {
      return Promise.reject(new Error('KAKAO_REST_KEY 미설정'));
    }
    var qs = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    return fetch(url + '?' + qs, {
      headers: { Authorization: 'KakaoAK ' + CFG.KAKAO_REST_KEY }
    }).then(function (r) {
      if (!r.ok) throw new Error('장소 검색 실패 (HTTP ' + r.status + ')');
      return r.json();
    });
  }

  function _mapDoc(d) {
    return {
      name: d.place_name || '',
      address: d.road_address_name || d.address_name || '',
      area: (window.Categories ? Categories.areaOf(d.road_address_name || d.address_name || '') : ''),
      category: d.category_name || '',
      phone: d.phone || '',
      lat: parseFloat(d.y), lng: parseFloat(d.x),
      dist: d.distance ? parseInt(d.distance, 10) : null,
      url: d.place_url || ''
    };
  }

  /* 주변 장소 후보 — 사용자는 고르기만 하면 된다(설계안 3장: 이 앱의 승부처) */
  function nearby(geo, catId, radius) {
    var code = CAT_CODE[catId || ''] || '';
    if (!geo) return Promise.reject(new Error('위치를 먼저 잡아야 해요'));
    if (!code) return keyword('', geo, radius);
    return _kakao(CFG.KAKAO_LOCAL_URL, {
      category_group_code: code,
      x: geo.lng, y: geo.lat,
      radius: radius || 300,
      sort: 'distance', size: 15
    }).then(function (j) { return ((j && j.documents) || []).map(_mapDoc); });
  }

  /* 이름으로 찾기 (해외·검색 실패 시 손으로 찾는 길) */
  function keyword(q, geo, radius) {
    var p = { query: q || '', size: 15 };
    if (geo) { p.x = geo.lng; p.y = geo.lat; p.radius = radius || 2000; p.sort = 'distance'; }
    return _kakao(CFG.KAKAO_KEYWORD_URL, p)
      .then(function (j) { return ((j && j.documents) || []).map(_mapDoc); });
  }

  /* 좌표만 있고 주소를 모를 때 — 카카오 좌표→주소 */
  function reverse(geo) {
    if (!geo) return Promise.resolve('');
    return _kakao('https://dapi.kakao.com/v2/local/geo/coord2address.json', { x: geo.lng, y: geo.lat })
      .then(function (j) {
        var d = (j && j.documents && j.documents[0]) || null;
        if (!d) return '';
        return (d.road_address && d.road_address.address_name) || (d.address && d.address.address_name) || '';
      }).catch(function () { return ''; });
  }

  window.Geo = {
    read: read, last: last,
    nearby: nearby, keyword: keyword, reverse: reverse,
    available: function () { return CFG.hasKakao(); },
    whyUnavailable: '주변 장소 자동 채움을 쓰려면 js/config.js 의 KAKAO_REST_KEY 를 채워야 합니다. ' +
                    '지금은 상호·주소를 손으로 적어 주세요.'
  };
})();
