/* ═══════════════════════════════════════════════════════════
   config.js — 이 앱의 이름과 외부 연결값을 **한 곳에** 모은다.
   ----------------------------------------------------------------
   ⭐ 설계안 7장: 새 Firebase 프로젝트, 인증 붙인 AI 프록시.
      현장매니저는 프록시가 인증 없이 열려 있고 주소가 APK 안에 있었다.
      같은 구조를 반복하지 않기 위해 PROXY 는 처음부터 토큰을 같이 보낸다.
   ⚠️ 여기 값이 'TODO' 로 남아 있으면 해당 기능은 스스로 꺼지고
      사용자에게 "무엇을 넣어야 하는지"를 화면에 적어준다(조용히 실패 금지).
   ⚠️ 앱 이름을 바꾸려면 이 파일 + capacitor.config.json + manifest.json 세 곳.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = {
    /* ── 이름 ── */
    APP_NAME:   '찍고쓰다',
    APP_SHORT:  '찍고쓰다',
    APP_TAGLINE:'찍고 나오면 글이 완성돼 있어요',
    APP_ID:     'com.baesungchul.travelpost',   // Play 패키지명 (아직 등록 전)

    /* ── 저장소 접두사 ── 현장매니저(ac_)와 절대 겹치면 안 된다 ── */
    LS_PREFIX:  'tp_',
    DB_NAME:    'TravelPostDB',
    APP_FOLDER: 'travel-post',                  // 네이티브 파일 저장 폴더명

    /* ── Firebase (새 프로젝트를 새로 판다 — 설계안 7장) ── */
    FIREBASE: {
      apiKey:            'AIzaSyC2GV5Xif1EB8IX8oxxrYZZZG-u3PlhCLA',
      authDomain:        'travel-post-52713.firebaseapp.com',
      projectId:         'travel-post-52713',
      storageBucket:     'travel-post-52713.firebasestorage.app',
      messagingSenderId: '53661457167',
      appId:             '1:53661457167:web:0768b11c5ea1b076ad3c7a'
    },

    /* ── AI 프록시 ──
       ⚠️ 인증 없는 프록시를 만들지 말 것. 서버가 Authorization 헤더를 검사하고,
          앱은 로그인 사용자의 Firebase ID 토큰을 실어 보낸다. */
    PROXY_URL:  'TODO_PROXY_URL',
    PROXY_AUTH: true,                            // false 로 두지 말 것 (개발 중 임시만)
    MODEL:      'claude-sonnet-4-6',

    /* ── PC 링크 공개 페이지 (site/post.html 을 올린 주소) ── */
    POST_BASE:  'TODO_HOSTING_URL/post.html',
    LINK_TTL_MS: 24 * 60 * 60 * 1000,            // 24시간 (현장매니저와 동일)
    LINK_MAX:   30,

    /* ── 장소 검색 ──
       ⬜ 미확인(설계안 10장): 카카오 로컬 API 무료 쿼터·약관·상업적 이용 조건.
          키를 넣기 전까지 '주변 장소 자동 채움'은 꺼진 채로 동작한다. */
    KAKAO_REST_KEY: 'TODO_KAKAO_REST_KEY',
    /* ⚠️ 지도(JS SDK)는 REST 키가 아니라 **JavaScript 키**를 쓴다 — 서로 다른 값이다.
       또 카카오 개발자 콘솔에 이 앱의 도메인을 등록해야 지도가 뜬다. */
    KAKAO_JS_KEY: 'TODO_KAKAO_JS_KEY',
    KAKAO_LOCAL_URL: 'https://dapi.kakao.com/v2/local/search/category.json',
    KAKAO_KEYWORD_URL: 'https://dapi.kakao.com/v2/local/search/keyword.json'
  };

  /* 'TODO' 로 시작하면 아직 안 채운 값 */
  function set(v) { return !!v && String(v).indexOf('TODO') < 0; }
  CFG.isSet = function (path) {
    var v = CFG, parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) { if (v == null) return false; v = v[parts[i]]; }
    return set(v);
  };
  CFG.hasFirebase = function () { return CFG.isSet('FIREBASE.apiKey') && CFG.isSet('FIREBASE.projectId'); };
  CFG.hasProxy    = function () { return CFG.isSet('PROXY_URL'); };
  CFG.hasKakao    = function () { return CFG.isSet('KAKAO_REST_KEY'); };
  CFG.hasKakaoMap = function () { return CFG.isSet('KAKAO_JS_KEY'); };
  CFG.hasHosting  = function () { return CFG.isSet('POST_BASE'); };

  /* 아직 안 채운 값 목록 — 설정 화면이 그대로 보여준다 */
  CFG.missing = function () {
    var out = [];
    if (!CFG.hasFirebase()) out.push({ k: 'FIREBASE', why: '로그인·백업·PC 링크에 필요합니다. 새 Firebase 프로젝트를 만들어 config.js 에 넣으세요.' });
    if (!CFG.hasProxy())    out.push({ k: 'PROXY_URL', why: 'AI 글 생성에 필요합니다. 인증(Authorization) 검사를 붙인 프록시 주소를 넣으세요.' });
    if (!CFG.hasHosting())  out.push({ k: 'POST_BASE', why: 'PC 링크 모드에 필요합니다. site/post.html 을 올린 주소를 넣으세요.' });
    if (!CFG.hasKakao())    out.push({ k: 'KAKAO_REST_KEY', why: '주변 장소 자동 채움에 필요합니다. 없으면 상호·주소를 손으로 적게 됩니다.' });
    if (!CFG.hasKakaoMap()) out.push({ k: 'KAKAO_JS_KEY', why: '기록 탭 지도 보기에 필요합니다(REST 키와 다른 값). 없으면 목록으로만 보입니다.' });
    return out;
  };

  /* localStorage 키에 접두사를 붙인다 — 현장매니저와 한 기기에 같이 깔려도 안 섞인다 */
  CFG.k = function (name) { return CFG.LS_PREFIX + name; };

  window.CFG = CFG;
  console.log('[CFG]', CFG.APP_NAME, '미설정:', CFG.missing().map(function (m) { return m.k; }).join(', ') || '없음');
})();
