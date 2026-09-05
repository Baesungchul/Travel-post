/* ═══════════════════════════════════════════════════════════
   ads.js — 광고(AdMob) — 무료 사용자의 리워드 광고 적립 + 상시 배너
   ----------------------------------------------------------------
   ★ 2026-09-03 사용자 요청: "광고 연동 준비도 이어서 해줘" (iap.js 다음 순서로 확정된 것).
     설계는 subscription.js 에 이미 있던 그대로다:
       · 글 생성 1회 = 리워드 광고 2편
       · PC 링크 1회 = 리워드 광고 1편 (AI 를 안 써서 원가가 훨씬 낮다 — 같은 'post' 사용 풀에
         적립된다. PC 링크가 이미 그 풀을 같이 쓰고 있어서 — share.js 의 openPc() 참고)
       · 구독자에게는 광고를 아예 안 보여준다.
     "몇 편을 봐야 하는지/적립되는지"는 subscription.js(Subs.creditAdView)가 정하고,
     이 파일은 "광고를 어떻게 보여주는지"만 안다 — 가격(설계)과 실행(SDK)을 나눴다.

   ⚠️ config.js 의 AD_APP_ID·AD_UNIT_* 는 지금 전부 구글 공식 '테스트' 값이다.
      Ads.available() 은 true 를 돌려주므로(테스트 값도 값은 값이다) 실기기에서 광고 흐름을
      그대로 확인할 수 있다 — 다만 진짜 수익은 안 나고, 진짜 사용권은 풀린다.
      config.js/AndroidManifest.xml 을 진짜 값으로 바꾸고 AD_TEST_MODE 를 false 로 돌리기
      전까지는 "테스트"라는 게 광고에 그대로 표시된다.

   ⚠️ 이 SDK 의 함정: showRewardVideoAd() 는 사용자가 끝까지 보고 리워드를 **받았을 때만**
      resolve 된다 — 중간에 닫으면 그 Promise 는 영영 안 끝난다(라이브러리 자체 동작).
      그래서 'onRewardedVideoAdDismissed' 이벤트(광고가 닫히면 보상 여부와 상관없이 항상 온다)
      를 같이 걸어 두고, 그게 먼저 오면 "안 받았다"로 확정 짓는다(아래 showOneReward 참고).
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var Ads = window.Ads = {};

  function plugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) || null;
  }
  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  /* 화면에 '광고 보기' 관련 버튼·배너를 보여줘도 되는가 — 셋 다 있어야 한다.
     ⚠️ 죽은 버튼을 보여주지 않는다(iap.js IAP.available() 와 같은 원칙). */
  Ads.available = function () {
    return CFG.hasAdMob() && isNative() && !!plugin();
  };

  var _inited = false;
  function ensureInit() {
    if (!Ads.available()) return Promise.reject(new Error('광고를 아직 쓸 수 없어요.'));
    if (_inited) return Promise.resolve();
    _inited = true;   /* 초기화 자체는 한 번만 — 실패해도 다시 시도하다 무한 반복되지 않게 */
    return plugin().initialize({ initializeForTesting: !!CFG.AD_TEST_MODE })
      .then(function () {
        /* 동의(UMP) — 필요한 지역(EEA 등)의 사용자에게만 뜬다. 실패해도 광고 자체는 계속 진행한다
           (동의 흐름이 막혀서 광고가 완전히 안 뜨는 것보다야 낫다). */
        return plugin().requestConsentInfo().catch(function () { return null; });
      })
      .then(function (info) {
        if (info && info.isConsentFormAvailable && info.status === 'REQUIRED') {
          return plugin().showConsentForm().catch(function () {});
        }
      })
      .catch(function (e) {
        console.warn('[Ads] 초기화 실패', e && e.message);
        /* 초기화가 실패했다면 다음에 다시 시도할 수 있게 되돌려 둔다 */
        _inited = false;
        throw e;
      });
  }

  function adIdFor(kind) { return kind === 'pclink' ? CFG.AD_UNIT_REWARDED_PCLINK : CFG.AD_UNIT_REWARDED_POST; }

  /* 리워드 광고 한 편을 보여주고, 실제로 끝까지 봐서 보상을 받았는지(true/false)를 돌려준다.
     ⚠️ 위 파일 설명의 함정 참고 — showRewardVideoAd() 만 기다리면 중간에 닫았을 때 영영 안 끝난다. */
  function showOneReward(kind) {
    var P = plugin();
    return P.prepareRewardVideoAd({ adId: adIdFor(kind), isTesting: !!CFG.AD_TEST_MODE }).then(function () {
      return new Promise(function (resolve, reject) {
        var settled = false, dismissHandle = null;
        function finish(ok) {
          if (settled) return;
          settled = true;
          if (dismissHandle) dismissHandle.remove();
          resolve(ok);
        }
        P.addListener('onRewardedVideoAdDismissed', function () { finish(false); })
          .then(function (h) { dismissHandle = h; if (settled) h.remove(); })
          .catch(function () {});
        P.showRewardVideoAd().then(function () { finish(true); }).catch(function (e) {
          if (!settled) { settled = true; if (dismissHandle) dismissHandle.remove(); reject(e); }
        });
      });
    });
  }

  /* ── 리워드 광고 한 편 시청 → 적립 ──
     kind: 'post'(글쓰기) | 'pclink'(PC 링크). 실제 몇 편이 필요한지·적립 여부는
     subscription.js 의 Subs.creditAdView() 가 정한다(가격은 거기서만 관리).
     반환: Subs.creditAdView() 결과 그대로 { unlocked, progress, needed } — 안 봤으면 null. */
  Ads.watchReward = function (kind) {
    return ensureInit()
      .then(function () { return showOneReward(kind); })
      .then(function (rewarded) {
        if (!rewarded) return null;
        return (window.Subs && Subs.creditAdView) ? Subs.creditAdView(kind) : null;
      });
  };

  /* ── 배너 높이를 화면 레이아웃에 알려준다 (2026-09-05) ──
     ☠️ 이 SDK 의 배너는 웹뷰를 밀어내지 않고 **위에 겹쳐서** 뜬다.
        그래서 알려주지 않으면 헤더가 광고에 그대로 덮인다 — 실제로 그렇게 가려져 있었다.
     bannerAdSizeChanged 로 오는 높이(dp = CSS px)를 --ad-h 에 넣으면 styles.css 의
     .hdr 이 딱 그만큼 아래로 내려간다. 숨기거나 없애면 SDK 가 {0,0} 을 보내주므로
     되돌리는 코드를 따로 쓰지 않는다(resumeBanner 도 실제 높이를 다시 보낸다). */
  var _sizeHooked = false;
  function setAdHeight(px) {
    try { document.documentElement.style.setProperty('--ad-h', (px > 0 ? px : 0) + 'px'); } catch (e) {}
  }
  function hookBannerSize() {
    if (_sizeHooked || !plugin()) return;
    _sizeHooked = true;
    try {
      plugin().addListener('bannerAdSizeChanged', function (s) { setAdHeight((s && s.height) || 0); });
    } catch (e) { _sizeHooked = false; }
  }

  /* ── 상시 배너 (무료 사용자만 · 기록 탭에서만, tabbar.js 참고) ── */
  var _bannerOn = false;
  Ads.showBanner = function () {
    if (!Ads.available()) return Promise.resolve();
    return ensureInit().then(function () {
      var P = plugin();
      hookBannerSize();
      if (_bannerOn) return P.resumeBanner().catch(function () {});
      return P.showBanner({
        adId: CFG.AD_UNIT_BANNER,
        isTesting: !!CFG.AD_TEST_MODE,
        adSize: 'ADAPTIVE_BANNER',
        position: 'TOP_CENTER'   /* 하단은 탭바가 이미 차지하고 있어 위쪽에 둔다 */
      }).then(function () { _bannerOn = true; });
    }).catch(function (e) { console.warn('[Ads] 배너 실패', e && e.message); });
  };
  Ads.hideBanner = function () {
    setAdHeight(0);   /* 이벤트가 늦게 와도 화면이 먼저 제자리로 */
    if (!_bannerOn) return Promise.resolve();
    return plugin().hideBanner().catch(function () {});
  };
})();
