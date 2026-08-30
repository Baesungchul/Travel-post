/* ═══════════════════════════════════════════════════════════
   tokens.js — 카테고리 토큰 **사용 시점** 치환
   ----------------------------------------------------------------
   ☠️ 이 파일이 존재하는 이유 (설계안 1장의 함정 ②)
      현장매니저 v507 사고: ai.js 의 sys 가 "당신은 **에어컨 전문가**의 카피라이터입니다"
      로 하드코딩돼 있어서, 사용자가 조명 지침을 직접 써도 글이 에어컨 쪽으로 끌렸다.
      지침 키만 업종별로 갈라놓은 것으로는 절반이었다.
      → 이 앱에서 같은 사고는 "여행 지침을 썼는데 맛집 글이 나온다" 로 나타난다.
      그래서 기본값·예시 텍스트·글 제목 형식의 **도메인 단어를 전부 토큰으로 둔다.**
   ⚠️ 정의 시점이 아니라 '사용 시점'에 치환해야 한다 — 카테고리는 도중에 바뀐다.
      (문자열 상수 안에 { } 토큰을 남겨 두고, 화면에 그릴 때 catFill 을 통과시킬 것)

   토큰:
     {카테고리}     맛집 / 관광지 / 카페 …
     {카테고리태그} 공백·기호를 뺀 해시태그용 형태
     {장소호칭}     가게 / 코스 / 숙소 …
     {사진태그}     그 카테고리의 사진 태그 목록 (외관, 내부, 음식, 메뉴판)
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function tokensOf(pf) {
    var name = '', place = '', tags = [];
    try {
      if (!pf && window.Profiles && Profiles.forCurrentPlace) pf = Profiles.forCurrentPlace();
      if (pf) {
        name  = pf.name || '';
        place = pf.placeLabel || '';
        tags  = (pf.tags || []).slice();
      }
    } catch (e) {}
    if (!name)  name  = '장소';     // 카테고리 미설정이어도 문장이 어색해지지 않게
    if (!place) place = '장소';
    if (!tags.length) tags = ['사진'];
    return {
      cat: name,
      tag: name.replace(/[\s·/]/g, ''),
      place: place,
      phototags: tags.join(', ')
    };
  }

  function catFill(s, pf) {
    if (!s) return s;
    var t = tokensOf(pf);
    return String(s)
      .replace(/\{카테고리태그\}/g, t.tag)
      .replace(/\{카테고리\}/g, t.cat)
      .replace(/\{장소호칭\}/g, t.place)
      .replace(/\{사진태그\}/g, t.phototags);
  }

  /* 개발용 자가검사 — 치환되지 않고 남은 토큰이 있으면 콘솔에 경고한다.
     ⚠️ 새 문구를 추가하고 토큰을 빠뜨리면 여기서 잡힌다. */
  function assertNoToken(s, where) {
    var m = String(s || '').match(/\{[가-힣]+\}/g);
    if (m && m.length) console.warn('[토큰 미치환]', where || '', m.join(' '));
    return s;
  }

  window.Tokens = { of: tokensOf, fill: catFill, assertNoToken: assertNoToken };
  window.catFill = catFill;
})();
