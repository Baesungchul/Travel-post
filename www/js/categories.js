/* ═══════════════════════════════════════════════════════════
   categories.js — 카테고리 카탈로그
   ----------------------------------------------------------------
   현장매니저 industries.js 의 자리. '업종'이 '카테고리'가 되고,
   업종의 [보고서 제목 / 호수 호칭 / 작업 단계 호칭] 세 축이
   [글 제목 형식 / 장소 호칭 / **사진 태그 세트**] 로 대응된다.

   ⭐ 사진 태그 세트가 카테고리마다 다른 것이 이 앱의 뼈대다(설계안 1장).
      현장매니저에서 '작업 전 / 작업 후 / 특이사항' 이 데이터 모델·파일명·
      공유 순서까지 관통했던 그 축이, 여기서는 카테고리마다 달라진다.
   ⚠️ 여기 값은 **씨앗**일 뿐이다. 사용자가 프로필에서 태그를 고치고 추가할 수 있어야 한다
      (현장매니저에서 업종을 직접 입력할 수 있게 한 것과 같다).
   ⚠️ 제목 형식·해시태그의 도메인 단어는 토큰으로 둔다 — tokens.js 참고.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* v1(MVP)에서 켜는 것은 맛집·관광지 두 개다(설계안 9장 1단계).
     나머지는 카탈로그에 있고, 사용자가 [카테고리 추가]로 바로 꺼내 쓸 수 있다. */
  var CATALOG = [
    { id: 'food',  name: '맛집',   icon: '🍚', mvp: true,
      placeLabel: '가게',
      tags: ['외관', '내부', '음식', '메뉴판'],
      titleFmt: '{지역} {상호} — 솔직 후기',
      hashtags: ['{지역}맛집', '{상호}', '맛집추천', '{지역}맛집추천', '내돈내산'] },

    { id: 'spot',  name: '관광지', icon: '🏞️', mvp: true,
      placeLabel: '코스',
      tags: ['풍경', '안내판', '인물', '디테일'],
      titleFmt: '{지역} {상호} 다녀왔어요',
      hashtags: ['{지역}여행', '{상호}', '{지역}가볼만한곳', '주말나들이', '여행기록'] },

    { id: 'cafe',  name: '카페',   icon: '☕', mvp: false,
      placeLabel: '카페',
      tags: ['외관', '내부', '음료', '디저트'],
      titleFmt: '{지역} {상호} 카페 후기',
      hashtags: ['{지역}카페', '{상호}', '카페추천', '{지역}카페추천', '디저트'] },

    { id: 'stay',  name: '숙소',   icon: '🛏️', mvp: false,
      placeLabel: '숙소',
      tags: ['외관', '객실', '욕실', '조식', '뷰'],
      titleFmt: '{지역} {상호} 숙박 후기',
      hashtags: ['{지역}숙소', '{상호}', '{지역}호텔', '숙소추천', '여행숙소'] },

    { id: 'play',  name: '체험',   icon: '🎟️', mvp: false,
      placeLabel: '체험',
      tags: ['입구', '체험중', '결과물', '안내'],
      titleFmt: '{지역} {상호} 체험 후기',
      hashtags: ['{지역}체험', '{상호}', '아이와가볼만한곳', '주말체험'] },

    { id: 'show',  name: '전시',   icon: '🖼️', mvp: false,
      placeLabel: '전시',
      tags: ['입구', '작품', '공간', '굿즈'],
      titleFmt: '{상호} 전시 관람 후기',
      hashtags: ['{상호}', '전시추천', '{지역}전시', '주말전시'] }
  ];

  function get(id) {
    for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i];
    return null;
  }
  function mvp() { return CATALOG.filter(function (c) { return c.mvp; }); }

  /* 제목/해시태그의 {지역} {상호} 는 카테고리가 아니라 **그 장소**의 값이다.
     장소가 없을 때는 빈 문자열로 지우고 남는 공백을 정리한다. */
  function fillPlace(s, place) {
    if (!s) return '';
    var area = '', name = '';
    if (place) {
      name = place.name || '';
      area = place.area || _areaOf(place.address) || '';
    }
    return String(s)
      .replace(/\{지역\}/g, area)
      .replace(/\{상호\}/g, name)
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s*—\s*/, '')
      .trim();
  }

  /* 주소에서 '지역'을 뽑는다 — 블로그 검색 키워드로 쓰이는 단위(구/시/군)까지만.
     ⚠️ 상세 주소를 그대로 쓰지 않는다. 블로거 안전 문제이기도 하다. */
  function _areaOf(addr) {
    if (!addr) return '';
    var t = String(addr).trim().split(/\s+/);
    for (var i = t.length - 1; i >= 0; i--) {
      if (/(구|시|군)$/.test(t[i])) return t[i];
    }
    return t[1] || t[0] || '';
  }

  window.Categories = { CATALOG: CATALOG, get: get, mvp: mvp, fillPlace: fillPlace, areaOf: _areaOf };
})();
