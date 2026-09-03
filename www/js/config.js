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
    PROXY_URL:  'https://asia-northeast3-travel-post-52713.cloudfunctions.net/aiProxy',
    PROXY_AUTH: true,                            // false 로 두지 말 것 (개발 중 임시만)
    MODEL:      'claude-sonnet-5',

    /* ── 구글 로그인 (사용자 요청 2026-09-01) ──
       현장매니저와 같은 방식: @capgo/capacitor-social-login 플러그인 + Firebase credential 로그인.
       ⚠️ 이 값 하나만으로는 안 켜진다. Firebase 콘솔(travel-post-52713)에서
          1) Authentication → Sign-in method 에서 Google 을 켜고
          2) 거기서 만들어지는(또는 Google Cloud Console 의) OAuth 2.0 **웹** 클라이언트 ID 를 이 값에 넣고
          3) 안드로이드 앱의 SHA-1 지문을 Firebase 프로젝트의 이 앱(패키지명 com.baesungchul.travelpost /
             .debug 둘 다)에 등록해야 한다 — 안 하면 로그인창이 뜨자마자 조용히 실패한다
             (현장매니저에서 실제로 겪은 문제, 2026-08-30 수정 이력 참고).
          테스트 APK 의 디버그 키 SHA-1: FA:90:5F:18:F9:44:8B:85:F3:20:01:71:B9:98:7E:5C:59:89:F7:34 */
    GOOGLE_WEB_CLIENT_ID: '53661457167-3tengqvb2vajacgpnth7pkl53f0rtf0f.apps.googleusercontent.com',

    /* ── PC 링크 공개 페이지 (site/post.html 을 올린 주소) ── */
    POST_BASE:  'https://travel-post-52713.web.app/post.html',
    LINK_TTL_MS: 24 * 60 * 60 * 1000,            // 24시간 (현장매니저와 동일)
    LINK_MAX:   30,

    /* ── 장소 검색 ──
       ☠️ REST 키는 여기에 직접 적지 말 것. 이 저장소는 공개라 커밋하면 바로 털린다.
          (JS 키와 달리 REST 키에는 도메인 제한이 없다)
          실제 값은 깃허브 시크릿 KAKAO_REST_KEY 에 두고,
          빌드/배포할 때 tools/inject-keys.js 가 이 자리에 끼워 넣는다.
          그래서 로컬(npx serve www)에서는 '주변 장소 찾기'가 꺼진 채로 보이는 것이 정상이다.
       참고: 카카오 로컬 API 는 상업적 이용이 가능하나, 이 API 를 쓰는 기능 자체에
             별도로 요금을 매기는 것은 금지된다 -> 지도/장소검색은 유료 기능에서 제외해 둠. */
    KAKAO_REST_KEY: 'TODO_KAKAO_REST_KEY',
    /* ⚠️ 지도(JS SDK)는 REST 키가 아니라 **JavaScript 키**를 쓴다 — 서로 다른 값이다.
       또 카카오 개발자 콘솔에 이 앱의 도메인을 등록해야 지도가 뜬다. */
    KAKAO_JS_KEY: '7c6b3a6ba30f09cf55bbe5e82c4859f1',
    KAKAO_LOCAL_URL: 'https://dapi.kakao.com/v2/local/search/category.json',
    KAKAO_KEYWORD_URL: 'https://dapi.kakao.com/v2/local/search/keyword.json',

    /* ── 구독 결제 (RevenueCat, 2026-09-03 준비 시작) ──
       ⚠️ 이 값은 '공개 API 키'라 여기 코드에 그대로 적어도 안전하다(현장매니저의 카카오 JS
          키·Firebase apiKey 와 같은 성격 — 도메인/패키지명으로 막는 값이지 비밀값이 아니다).
          진짜 비밀(구글 플레이 서비스 계정, 웹훅 시크릿)은 RevenueCat 콘솔과 Firebase
          Secret Manager 에만 있고 이 파일엔 절대 안 넣는다.
       채우는 순서(배성철님이 콘솔에서 할 일):
         1) Play Console 에서 이 앱에 구독 상품 6개를 만든다(상품 ID 를 정확히 맞출 것):
            tp_t30_monthly / tp_t30_yearly / tp_t100_monthly / tp_t100_yearly /
            tp_unl_monthly / tp_unl_yearly  (숫자는 subscription.js 의 PLANS 요금과 맞춘다)
         2) revenuecat.com 무료 계정을 만들고 새 프로젝트 → Google Play 앱을 추가한다.
            Play Console → 설정 → API 액세스에서 서비스 계정을 만들어 RevenueCat 에 연결하고
            '재무 데이터' 열람 권한을 준다(RevenueCat 가이드가 화면으로 안내해 줌).
         3) 위 상품 6개를 가져와서, entitlement 를 t30 / t100 / unl 세 개로 만들고
            (연간·월간 상품을 같은 entitlement 에 묶는다) 하나의 Offering 에
            패키지 식별자를 t30_monthly / t30_yearly / t100_monthly / t100_yearly /
            unl_monthly / unl_yearly 로 맞춰 담는다 — www/js/iap.js 가 이 이름으로 찾는다.
         4) RevenueCat 프로젝트 설정의 'Public Google API Key' 를 복사해 아래 값에 넣는다.
         5) RevenueCat → Integrations → Webhooks 에서 주소를
            https://asia-northeast3-travel-post-52713.cloudfunctions.net/revenuecatWebhook
            로 등록하고, Authorization 헤더 값을 하나 정해서 넣은 뒤(아무 긴 문자열),
            그 값을 `firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET` 로 등록한다
            (functions/index.js 의 revenuecatWebhook 참고 — 이 값은 여기 config.js 가 아니라
            서버에만 있어야 한다). */
    REVENUECAT_ANDROID_KEY: 'TODO_REVENUECAT_ANDROID_KEY'
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
  CFG.hasGoogleLogin = function () { return CFG.isSet('GOOGLE_WEB_CLIENT_ID'); };
  CFG.hasKakao    = function () { return CFG.isSet('KAKAO_REST_KEY'); };
  CFG.hasKakaoMap = function () { return CFG.isSet('KAKAO_JS_KEY'); };
  CFG.hasHosting  = function () { return CFG.isSet('POST_BASE'); };
  CFG.hasRevenueCat = function () { return CFG.isSet('REVENUECAT_ANDROID_KEY'); };

  /* 아직 안 채운 값 목록 — 설정 화면이 그대로 보여준다 */
  CFG.missing = function () {
    var out = [];
    if (!CFG.hasFirebase()) out.push({ k: 'FIREBASE', why: '로그인·백업·PC 링크에 필요합니다. 새 Firebase 프로젝트를 만들어 config.js 에 넣으세요.' });
    if (!CFG.hasProxy())    out.push({ k: 'PROXY_URL', why: 'AI 글 생성에 필요합니다. 인증(Authorization) 검사를 붙인 프록시 주소를 넣으세요.' });
    if (!CFG.hasGoogleLogin()) out.push({ k: 'GOOGLE_WEB_CLIENT_ID', why: '구글 로그인에 필요합니다. Firebase 콘솔에서 Google 로그인을 켜고 웹 클라이언트 ID를 넣으세요.' });
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
