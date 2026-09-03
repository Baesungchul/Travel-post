/* ═══════════════════════════════════════════════════════════
   iap.js — 실제 구독 결제 (RevenueCat + 구글 플레이 정기결제)
   ----------------------------------------------------------------
   ★ 2026-09-03 사용자 요청: "구독관련 작업 할수 있는 부분부터해줘" → "둘 다 순서대로"
     (실제 결제 연동 + 광고 연동 둘 다, 결제부터) — 코드로 준비할 수 있는 부분을 여기서 다 짜 둔다.

   ⚠️ 이 파일 혼자서는 아무것도 못 켠다. 아래 세 가지가 배성철님 쪽에서 끝나야 실제로 결제가 된다
      (js/config.js 의 REVENUECAT_ANDROID_KEY 주석에 순서를 적어 뒀다):
        1) Play Console 에 구독 상품 6개 등록 (tp_t30_monthly 등 — subscription.js PLANS 참고)
        2) revenuecat.com 계정 만들고 Play Console 과 연결 + entitlement/offering 구성
        3) config.js 의 REVENUECAT_ANDROID_KEY 채우기 + functions 웹훅 시크릿 등록
      그 전까지는 CFG.hasRevenueCat() 이 false 라 이 파일의 함수들은 전부 정직한 안내 메시지로
      막힌다 — 결제창을 흉내내지 않는다(subscription.js 의 기존 원칙 그대로).

   ⚠️ 왜 RevenueCat 이냐: 구글 정기결제는 갱신·해지·유예기간·환불을 서버가 실시간 알림(RTDN)으로
      직접 받아 처리해야 하는데, 그 부분을 통째로 대신해 준다(무료 플랜으로 충분한 규모).
      우리 서버(functions/index.js 의 revenuecatWebhook)는 "결과"만 받아서 Firestore
      users/{uid}.plan 에 반영한다 — admin/plan 필드를 서버만 쓸 수 있게 막아 둔 기존 구조
      (firestore.rules) 그대로 재사용한다.

   ⚠️ 패키지 식별자 규칙(RevenueCat 콘솔에서 이 이름 그대로 맞춰야 한다):
      t30_monthly / t30_yearly / t100_monthly / t100_yearly / unl_monthly / unl_yearly
      (subscription.js 의 PLAN_ORDER 와 짝) */
(function () {
  'use strict';

  var IAP = window.IAP = {};

  var PERIOD_SUFFIX = { monthly: '_monthly', yearly: '_yearly' };
  var _configuredUid = null;   // 마지막으로 configure() 에 넘긴 uid — 바뀌면 다시 연결

  function plugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases) || null;
  }
  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  /* 실제로 구매 버튼을 보여줘도 되는가 — 키가 채워졌고, 네이티브 앱이고, 플러그인이 붙어 있을 때만.
     ⚠️ 이 셋 중 하나라도 빠지면 화면에서 버튼을 아예 숨긴다(subscription.js 참고) —
        눌러도 안 되는 죽은 버튼을 보여주지 않는다(PAID_ONLY 죽은 버튼 사고 반복 방지). */
  IAP.available = function () {
    return CFG.hasRevenueCat() && isNative() && !!plugin();
  };

  function ensureConfigured() {
    if (!IAP.available()) {
      return Promise.reject(new Error('아직 결제를 열지 않았습니다.'));
    }
    if (!(window.Cloud && Cloud.loggedIn())) {
      return Promise.reject(new Error('구독은 로그인 후에 할 수 있어요.'));
    }
    var uid = Cloud.uid();
    if (_configuredUid === uid) return Promise.resolve();
    return plugin().configure({ apiKey: CFG.REVENUECAT_ANDROID_KEY, appUserID: uid })
      .then(function () { _configuredUid = uid; });
  }

  /* 로그아웃하면 다음 로그인 때 다시 configure 하도록 캐시를 비운다(계정 바뀌는 경우 대비) */
  try {
    if (window.Cloud && Cloud.onChange) {
      Cloud.onChange(function (u) { if (!u) _configuredUid = null; });
    }
  } catch (e) {}

  function findPackage(planId, period) {
    return plugin().getOfferings().then(function (offerings) {
      var cur = offerings && offerings.current;
      var pkgs = (cur && cur.availablePackages) || [];
      var wanted = planId + (PERIOD_SUFFIX[period] || '_monthly');
      var pkg = pkgs.filter(function (p) { return p.identifier === wanted; })[0];
      if (!pkg) throw new Error('아직 상품 준비가 끝나지 않았어요(' + wanted + '). 잠시 뒤 다시 시도해 주세요.');
      return pkg;
    }).catch(function (e) {
      if (e && /상품 준비/.test(e.message)) throw e;
      throw new Error('요금제 목록을 가져오지 못했어요: ' + ((e && e.message) || e));
    });
  }

  function human(e) {
    var code = String((e && e.code) || '');
    if (e && e.userCancelled) return null;                 // 사용자가 그냥 닫음 — 오류 아님
    if (code === '6') return '이미 이 상품을 구독 중이에요.';
    if (code === '10' || code === '35') return '네트워크가 불안정해요. 다시 시도해 주세요.';
    if (code === '3') return '이 계정으로는 구매할 수 없어요(결제 수단·지역 제한 등을 확인해 주세요).';
    return (e && e.message) || '구매에 실패했어요.';
  }

  /* ── 구독 구매 ── planId: 't30'|'t100'|'unl', period: 'monthly'|'yearly' */
  IAP.purchase = function (planId, period) {
    return ensureConfigured()
      .then(function () { return findPackage(planId, period); })
      .then(function (pkg) { return plugin().purchasePackage({ aPackage: pkg }); })
      .then(function () {
        showToast('구매가 완료됐어요! 반영까지 잠깐 걸릴 수 있어요.', 'ok');
        /* 서버(웹훅)가 plan 을 채우는 데 약간의 시차가 있을 수 있어 두 번 나눠 다시 당겨온다 */
        setTimeout(function () { if (window.Subs && Subs.refresh) Subs.refresh(); }, 2000);
        setTimeout(function () { if (window.Subs && Subs.refresh) Subs.refresh(); }, 8000);
        return true;
      })
      .catch(function (e) {
        var msg = human(e);
        if (msg) showToast(msg, 'err');
        return false;
      });
  };

  /* ── 이전 구매 복원 (기기 변경·재설치 때) ── */
  IAP.restore = function () {
    return ensureConfigured()
      .then(function () { return plugin().restorePurchases(); })
      .then(function () {
        showToast('구매 내역을 복원했어요.', 'ok');
        setTimeout(function () { if (window.Subs && Subs.refresh) Subs.refresh(); }, 1500);
        return true;
      })
      .catch(function (e) {
        showToast('복원에 실패했어요: ' + ((e && e.message) || e), 'err');
        return false;
      });
  };
})();
