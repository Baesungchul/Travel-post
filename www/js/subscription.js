/* ═══════════════════════════════════════════════════════════
   subscription.js — 구독 게이트 (구조만, 결제 연결은 자리)
   ----------------------------------------------------------------
   현장매니저 subscription.js 의 **뼈대만** 가져왔다.
     · 차감 순서: 쿠폰 → 월 한도 → 무료 지급분   (그대로)
     · Subs.gateFeature(키, 이름, 설명) 로 기능을 잠근다  (그대로)
   대상이 개인 블로거라 요금 구조는 설계안 8장대로 다시 잡았다.
     비용의 실체는 AI 호출이므로 **글 생성 횟수**를 기준으로 센다.

   ☠️ 재설치 리셋 차단
      현장매니저는 무료 지급분을 **계정에** 붙였다(서버 도장). 기기 localStorage 에만 두면
      앱을 지웠다 깔면 무료 횟수가 되살아난다.
      → 여기서도 같다: 로그인해야 무료 지급분이 나온다. 로그인 전에는 '맛보기'만.
      ⚠️ 서버 도장은 Firebase 키가 들어온 뒤에 켜진다. 그 전까지는 **기기 기준**이라
         무료 횟수를 크게 주지 않는다(아래 TRIAL).

   ⬜ RevenueCat 연결은 실제 상품 등록 뒤에. 지금은 Subs.isPaid() 가 늘 false 다.
      "구독하기"를 누르면 아직 준비 중이라고 정직하게 말한다 — 결제창을 흉내내지 않는다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var Subs = window.Subs = {};

  /* 기준값 (설계안 8장 초안) */
  var TRIAL_FREE   = 3;     // 로그인 전 맛보기 — 기기 기준이라 적게
  var FREE_MONTHLY = 10;    // 로그인 무료: 월 10회 글 생성
  var PAID_MONTHLY = 999999;// 유료: 사실상 무제한
  var KIND_LABEL = { post: '글 생성' };

  var KEY = CFG.k('subs_v1');

  function ym() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function load() {
    var S;
    try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
    if (!S) S = { ym: ym(), used: { post: 0 }, trialUsed: 0, coupon: { post: 0, exp: 0 }, plan: 'free' };
    if (S.ym !== ym()) { S.ym = ym(); S.used = { post: 0 }; }        // 달이 바뀌면 월 한도 초기화
    if (!S.used) S.used = { post: 0 };
    if (!S.coupon) S.coupon = { post: 0, exp: 0 };
    if (S.coupon.exp && Date.now() > S.coupon.exp) S.coupon = { post: 0, exp: 0 };
    return S;
  }
  function save(S) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  Subs.isPaid = function () {
    /* ⬜ 결제 연결 전 — 늘 false. 흉내내지 않는다. */
    return false;
  };
  Subs.loggedIn = function () { return !!(window.Cloud && Cloud.loggedIn()); };

  /* 남은 횟수 {coupon, monthly, trial, total} */
  Subs.quota = function (kind) {
    kind = kind || 'post';
    var S = load();
    var coupon = (S.coupon.exp > Date.now()) ? Math.max(0, S.coupon[kind] || 0) : 0;
    if (Subs.isPaid()) return { coupon: coupon, monthly: PAID_MONTHLY, trial: 0, total: PAID_MONTHLY };
    if (!Subs.loggedIn()) {
      var trial = Math.max(0, TRIAL_FREE - (S.trialUsed || 0));
      return { coupon: coupon, monthly: 0, trial: trial, total: coupon + trial };
    }
    var monthly = Math.max(0, FREE_MONTHLY - (S.used[kind] || 0));
    return { coupon: coupon, monthly: monthly, trial: 0, total: coupon + monthly };
  };

  /* 쓸 수 있는지 — {ok, msg} */
  Subs.can = function (kind) {
    kind = kind || 'post';
    var q = Subs.quota(kind);
    if (q.total > 0) return { ok: true, msg: '' };
    if (!Subs.loggedIn()) {
      return { ok: false, msg: KIND_LABEL[kind] + '은 로그인 후에 쓸 수 있어요. 로그인하면 매달 ' +
                              FREE_MONTHLY + '회를 무료로 드려요.' };
    }
    return { ok: false, msg: '이번 달 ' + KIND_LABEL[kind] + ' 무료 ' + FREE_MONTHLY +
                             '회를 다 썼어요. 다음 달 1일에 다시 채워집니다.' };
  };

  /* 사용 1회 차감 — 쿠폰 → 월 한도 → 맛보기 (현장매니저와 같은 순서) */
  Subs.use = function (kind) {
    kind = kind || 'post';
    var S = load();
    if (Subs.isPaid()) { save(S); return; }
    if (S.coupon.exp > Date.now() && (S.coupon[kind] || 0) > 0) { S.coupon[kind]--; save(S); return; }
    if (Subs.loggedIn()) { S.used[kind] = (S.used[kind] || 0) + 1; save(S); return; }
    S.trialUsed = (S.trialUsed || 0) + 1; save(S);
  };

  /* 화면에 뿌릴 한 줄 */
  Subs.label = function (kind) {
    kind = kind || 'post';
    if (Subs.isPaid()) return '무제한';
    var q = Subs.quota(kind);
    if (!Subs.loggedIn()) return KIND_LABEL[kind] + '은 로그인 후 이용 가능해요 (로그인하면 매달 ' + FREE_MONTHLY + '회 무료)';
    return '이번 달 ' + q.monthly + '/' + FREE_MONTHLY + '회 남음' + (q.coupon ? ' + 쿠폰 ' + q.coupon + '회' : '');
  };

  /* ── 기능 잠금 ──
     쓸 수 있으면 true, 아니면 안내를 띄우고 false.
     ⚠️ 호출부는 반드시 `if (!Subs.gateFeature(...)) return;` 형태로 쓴다. */
  var PAID_ONLY = { pclink: 'PC 링크 만들기', cloudbackup: '클라우드 백업' };

  Subs.gateFeature = function (key, title, why) {
    if (PAID_ONLY[key]) {
      if (Subs.isPaid()) return true;
      openPlans(title || PAID_ONLY[key], why ||
        (PAID_ONLY[key] + '은 구독 사용자 전용입니다.'));
      return false;
    }
    var c = Subs.can('post');
    if (c.ok) return true;
    openPlans(title || '글 생성', c.msg);
    return false;
  };

  /* ── 요금제 안내 ──
     ⬜ 결제가 아직 없다. 결제창을 흉내내지 않고 있는 그대로 말한다. */
  function openPlans(title, msg) {
    var ov = overlay({
      title: '🔒 ' + esc(title),
      body:
        '<div class="notice">' + esc(msg) + '</div>' +
        '<div class="lbl">지금</div>' +
        '<div class="box"><div class="mini">' + esc(Subs.label('post')) + '</div></div>' +
        '<div class="lbl">예정 요금제 <span class="mini">(아직 결제를 열지 않았습니다)</span></div>' +
        '<div class="box">' +
          '<div class="set-row"><div><div class="k">무료</div>' +
            '<div class="d">로그인하면 매달 글 ' + FREE_MONTHLY + '회</div></div></div>' +
          '<div class="set-row"><div><div class="k">구독</div>' +
            '<div class="d">글 무제한 + PC 링크 + 클라우드 백업 · 월 3,000~5,000원대 예정</div></div></div>' +
        '</div>' +
        (Cloud.ready ? '' :
          '<div class="notice">지금은 로그인을 켤 수 없어 <b>맛보기 횟수까지만</b> 쓸 수 있습니다.<br>' +
          '<span class="mini">' + esc(Cloud.why) + '</span></div>') +
        '<div class="mini">사진은 늘 기기에 남습니다. 구독을 안 해도 백업 ZIP 은 언제든 만들 수 있어요.</div>',
      /* ⚠️ 2026-08-28 실측으로 잡은 막다른 길:
           Firebase 키가 없을 때도 '로그인하기'가 떠 있어서, 누르면 "아직 못 켠다"는 창만 또 떴다.
           켤 수 없는 버튼은 아예 내리고, 왜 지금은 방법이 없는지 위에 적는다. */
      foot: ((Cloud.ready && !Subs.loggedIn()) ? '<button class="btn primary" id="plLogin">로그인하기</button>' : '') +
            '<button class="btn ghost" id="plCoupon">쿠폰 등록</button>' +
            '<button class="btn ghost" id="plClose">닫기</button>'
    });
    ov.querySelector('#plClose').onclick = ov.close;
    var lg = ov.querySelector('#plLogin');
    if (lg) lg.onclick = function () { ov.close(); if (UI.openLogin) UI.openLogin(); };
    ov.querySelector('#plCoupon').onclick = function () { ov.close(); openCoupon(); };
  }
  Subs.openPlans = openPlans;

  /* ── 쿠폰 ──
     ⚠️ 서버 검증이 있어야 진짜다. Firebase 가 없으면 '아직 못 쓴다'고 말한다 —
        기기에서 코드만 맞춰보고 횟수를 주면 누구나 무한히 만들 수 있다. */
  function openCoupon() {
    var ov = overlay({
      title: '🎟 쿠폰 등록',
      body: (Cloud.ready
        ? '<label class="lbl">쿠폰 코드</label><input class="inp" id="cpCode" placeholder="코드를 입력하세요">' +
          '<div class="mini" style="margin-top:8px;">등록하면 글 생성 횟수가 충전됩니다.</div>'
        : '<div class="notice">쿠폰은 서버에서 확인해야 해서 아직 쓸 수 없습니다.<br>' +
          '<span class="mini">' + esc(Cloud.why || '') + '</span></div>'),
      foot: (Cloud.ready ? '<button class="btn primary" id="cpGo">등록</button>' : '') +
            '<button class="btn ghost" id="cpClose">닫기</button>'
    });
    ov.querySelector('#cpClose').onclick = ov.close;
    var go = ov.querySelector('#cpGo');
    if (go) go.onclick = function () {
      var code = (ov.querySelector('#cpCode').value || '').trim().toUpperCase();
      if (!code) { showToast('쿠폰 코드를 입력해주세요', 'err'); return; }
      if (!Subs.loggedIn()) { showToast('쿠폰 등록은 로그인 후에 됩니다', 'err'); return; }
      redeem(code).then(function (n) {
        ov.close(); showToast('쿠폰 등록 완료 — 글 ' + n + '회 충전', 'ok'); UI.refresh();
      }).catch(function (e) { showToast(e.message, 'err'); });
    };
  }
  Subs.openCoupon = openCoupon;

  /* 쿠폰 사용 — 트랜잭션으로 '한 번만' 을 서버가 보장한다 */
  function redeem(code) {
    var ref = Cloud.db().collection('coupons').doc(code);
    var mine = Cloud.db().collection('users').doc(Cloud.uid());
    return Cloud.db().runTransaction(function (tx) {
      return tx.get(ref).then(function (doc) {
        if (!doc.exists) throw new Error('존재하지 않는 쿠폰입니다');
        var d = doc.data();
        if (d.active === false) throw new Error('사용이 중지된 쿠폰입니다');
        if (d.expiresAt && d.expiresAt.toMillis && Date.now() > d.expiresAt.toMillis())
          throw new Error('기한이 지난 쿠폰입니다');
        var used = d.usedBy || [];
        if (used.indexOf(Cloud.uid()) >= 0) throw new Error('이미 사용한 쿠폰입니다');
        if (d.maxUses && used.length >= d.maxUses) throw new Error('사용 횟수가 끝난 쿠폰입니다');
        used.push(Cloud.uid());
        tx.update(ref, { usedBy: used });
        tx.set(mine, { couponAt: Date.now() }, { merge: true });
        return d.post || 10;
      });
    }).then(function (n) {
      var S = load();
      S.coupon.post = (S.coupon.post || 0) + n;
      S.coupon.exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
      save(S);
      return n;
    });
  }

  console.log('[Subs]', Subs.label('post'));
})();
