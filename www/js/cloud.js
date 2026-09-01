/* ═══════════════════════════════════════════════════════════
   cloud.js — Firebase 초기화 · 로그인 · 계정
   ----------------------------------------------------------------
   ⚠️ 키가 없으면 **아무것도 하지 않고 이유를 남긴다.** 조용히 실패하지 않는다.
      Cloud.ready 가 false 인 동안 로그인·클라우드 백업·PC 링크 버튼은
      "왜 못 쓰는지"를 화면에 적어 준다(ui_settings.js).

   ☠️ 설계안 7장: **Firebase 프로젝트를 새로 판다.**
      현장매니저는 실사용자가 쓰고 있고 핵심 자산이 사진이다.
      새 앱 개발 중의 규칙 수정·함수 배포가 그쪽으로 번질 여지를 아예 없앤다.

   ⚠️ Play 신규 앱은 개인정보처리방침·데이터 보안·**계정 삭제 URL** 을 새로 써야 한다.
      현장매니저 것을 그대로 쓸 수 없다. 앱 안 계정 삭제(deleteAccount)는 여기 있다.

   로그인 방식: 이메일 + 비밀번호, 구글(사용자 요청 2026-09-01).
   ⬜ 구글 로그인은 코드는 넣었지만 Firebase 콘솔 설정(Google 제공자 켜기 · 웹 클라이언트 ID ·
      SHA-1 지문 등록)이 끝나기 전까지는 config.js 의 GOOGLE_WEB_CLIENT_ID 가 TODO 로 남아
      스스로 꺼져 있다 — 실제로 눌러서 확인하기 전까지 "된다"고 말하지 말 것.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var C = window.Cloud = {
    ready: false,        // Firebase 초기화 성공
    user: null,          // 로그인한 사용자
    why: ''              // 못 쓰는 이유 (화면에 그대로 보여준다)
  };
  var _listeners = [];

  C.onChange = function (fn) { _listeners.push(fn); if (C.ready) fn(C.user); };
  function fire() { _listeners.forEach(function (f) { try { f(C.user); } catch (e) {} }); }

  C.init = function () {
    if (!CFG.hasFirebase()) {
      C.why = 'js/config.js 의 FIREBASE 값이 아직 비어 있습니다. 새 Firebase 프로젝트를 만들어 넣으면 켜집니다.';
      console.log('[Cloud] 미설정 —', C.why);
      return false;
    }
    if (typeof firebase === 'undefined' || !firebase.initializeApp) {
      C.why = 'Firebase SDK 를 불러오지 못했습니다 (js/vendor 확인).';
      console.warn('[Cloud]', C.why);
      return false;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(CFG.FIREBASE);
      /* ⚠️ 안드로이드 WebView 안에서는 브라우저 저장소가 앱 종료 때 비워지는 경우가 있다.
         로그인이 자꾸 풀리면 이 줄을 의심할 것 — LOCAL 은 가능한 저장소 중 가장 오래 남는 것을 쓴다.
         (실패해도 앱은 그대로 돌아간다. 세션이 짧아질 뿐이다) */
      try {
        firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
          .catch(function (e) { console.warn('[Cloud] 로그인 유지 설정 실패:', e && e.code); });
      } catch (e) {}
      C.ready = true;
      firebase.auth().onAuthStateChanged(function (u) {
        C.user = u || null;
        console.log('[Cloud] 로그인 상태:', u ? u.email : '(로그아웃)');
        fire();
      });
      return true;
    } catch (e) {
      C.why = 'Firebase 초기화 실패: ' + (e && e.message);
      console.warn('[Cloud]', C.why);
      return false;
    }
  };

  C.loggedIn = function () { return !!(C.ready && C.user); };
  C.uid = function () { return C.user ? C.user.uid : ''; };
  C.db = function () { return firebase.firestore(); };
  C.st = function () { return firebase.storage(); };

  function need() {
    if (!C.ready) throw new Error(C.why || '아직 서버를 쓸 수 없습니다');
  }

  /* 오류 메시지를 사람 말로 — Firebase 코드는 그대로 보여주면 아무도 못 읽는다 */
  function human(e) {
    var c = (e && e.code) || '';
    if (c === 'auth/invalid-email') return '이메일 형식이 올바르지 않아요';
    if (c === 'auth/missing-password' || c === 'auth/weak-password') return '비밀번호는 6자 이상이어야 해요';
    if (c === 'auth/email-already-in-use') return '이미 가입된 이메일이에요 — 로그인해 주세요';
    if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found')
      return '이메일 또는 비밀번호가 맞지 않아요';
    if (c === 'auth/too-many-requests') return '시도가 너무 잦아요. 잠시 뒤에 다시 해주세요';
    if (c === 'auth/network-request-failed') return '네트워크가 불안정해요';
    if (c === 'auth/requires-recent-login') return '보안을 위해 다시 로그인한 뒤에 해주세요';
    return (e && e.message) || '알 수 없는 오류';
  }
  C.human = human;

  C.signUp = function (email, pw) {
    need();
    return firebase.auth().createUserWithEmailAndPassword(email, pw)
      .catch(function (e) { throw new Error(human(e)); });
  };
  C.signIn = function (email, pw) {
    need();
    return firebase.auth().signInWithEmailAndPassword(email, pw)
      .catch(function (e) { throw new Error(human(e)); });
  };
  /* ── 구글 로그인 (사용자 요청 2026-09-01) ──
     네이티브: @capgo/capacitor-social-login(SocialLogin) 으로 idToken 을 받아 Firebase credential 로 로그인.
     웹(npx serve 등): signInWithPopup 폴백 — WebView 안에서는 구글이 팝업을 막을 수 있다.
     ⚠️ 현장매니저에서 그대로 가져온 구조다 (js/config.js 의 GOOGLE_WEB_CLIENT_ID, Firebase 콘솔의
        Google 제공자 켜기·SHA-1 등록이 먼저 되어 있어야 실제로 동작한다).
     사용자가 취소했을 때는 에러가 아니라 e.code === 'CANCELLED' 로 알린다 —
     호출부(ui_settings.js)가 이걸로 '조용히 아무 일도 안 하기'와 '진짜 오류'를 구분한다. */
  C._slInited = false;
  C.signInWithGoogle = function () {
    need();
    if (!CFG.hasGoogleLogin()) {
      return Promise.reject(new Error('구글 로그인이 아직 설정되지 않았어요 (js/config.js 의 GOOGLE_WEB_CLIENT_ID)'));
    }
    var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    var SL = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SocialLogin;

    function cancelled() { var e = new Error('취소했어요'); e.code = 'CANCELLED'; return e; }

    if (isNative) {
      if (!SL || !SL.login) {
        return Promise.reject(new Error('구글 로그인 플러그인을 불러오지 못했어요 (빌드를 다시 해야 할 수 있어요)'));
      }
      var initP = C._slInited ? Promise.resolve()
        : SL.initialize({ google: { webClientId: CFG.GOOGLE_WEB_CLIENT_ID } }).then(function () { C._slInited = true; });
      return initP.then(function () {
        return SL.login({ provider: 'google' });   // scopes 미지정 — 기본 프로필·이메일만
      }).then(function (res) {
        var r = (res && res.result) || {};
        var idToken = r.idToken;
        var accessToken = r.accessToken && r.accessToken.token;
        if (!idToken) throw new Error('구글 토큰을 받지 못했어요');
        var cred = firebase.auth.GoogleAuthProvider.credential(idToken, accessToken);
        return firebase.auth().signInWithCredential(cred);
      }).catch(function (e) {
        console.warn('[Cloud] 구글 로그인 실패', (e && e.code) || '', (e && e.message) || '', e);
        var code = (e && e.code) || '';
        var msg = (e && (e.message || e.error || '')) + '';
        if (code === 'USER_CANCELLED' || /cancelled by user|popup-closed-by-user|cancelled-popup-request/i.test(msg)) {
          throw cancelled();
        }
        throw new Error(msg.slice(0, 180) || '구글 로그인에 실패했어요');
      });
    }

    var provider = new firebase.auth.GoogleAuthProvider();
    return firebase.auth().signInWithPopup(provider).catch(function (e) {
      var c = (e && e.code) || '';
      if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') throw cancelled();
      throw new Error(human(e));
    });
  };

  C.signOut = function () { need(); return firebase.auth().signOut(); };
  C.resetPassword = function (email) {
    need();
    return firebase.auth().sendPasswordResetEmail(email)
      .catch(function (e) { throw new Error(human(e)); });
  };

  /* ⚠️ 계정 삭제 — Play 정책상 앱 안에 반드시 있어야 한다.
     사용자 데이터(백업·PC 링크 사진)를 먼저 지우고 계정을 지운다.
     ⚠️ 기기 안 사진·기록은 **건드리지 않는다.** 계정을 지운다고 내 사진이 사라지면 그게 더 나쁘다. */
  C.deleteAccount = async function () {
    need();
    if (!C.user) throw new Error('로그인 상태가 아니에요');
    var uid = C.user.uid;
    try {
      await C.db().collection('users').doc(uid).delete();
    } catch (e) { console.warn('[Cloud] 사용자 문서 삭제 실패', e && e.code); }
    try {
      /* 서버 함수가 Storage 하위 경로를 지운다 — 클라이언트는 목록 권한이 없다.
         ⬜ functions/deleteUserData 배포 전에는 여기서 지워지지 않는다(문서에 적어 둘 것). */
      await C.db().collection('deletion_requests').doc(uid).set({
        uid: uid, at: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) { console.warn('[Cloud] 삭제 요청 기록 실패', e && e.code); }
    await C.user.delete().catch(function (e) { throw new Error(human(e)); });
  };

  C.init();
})();
