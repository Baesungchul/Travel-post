/* ═══════════════════════════════════════════════════════════
   subscription.js — 구독 게이트 (요금제 단계 저장 구조 포함, 실제 결제 연결은 아직 자리)
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

   ⭐ 요금제 단계(사용자 확정 2026-09-03) — 3단계 + 광고형 무료.
      "광고 시청 = 사실상 무제한"이라, 구독이 파는 건 더 이상 '더 많은 양'이 아니라
      '매번 광고 안 보고 바로 쓰는 편함'이다. 그래서 요금제 단계는 users/{uid}.plan 에
      **서버에 저장**한다 — admin 필드와 완전히 같은 패턴이다(pullServerState 참고).
      ⚠️ firestore.rules 도 'plan' 필드를 'admin' 과 똑같이 보호한다 — 본인이 직접
         자기 문서에 plan 을 못 바꾸게 막아야 한다(안 막으면 누구나 공짜로 구독 등급을
         자기한테 줄 수 있다). 아직 실제 결제가 없어서, 지금은 관리자가 수동으로만
         내려준다(Subs.openUserAdmin 화면에 요금제 선택 추가).

   ⬜ RevenueCat/Google Play 정기결제 연동은 실제 상품 등록 뒤에. 지금은 요금제를 관리자가
      수동으로만 내려줄 수 있다. "구독하기"를 누르면 아직 준비 중이라고 정직하게 말한다 —
      결제창을 흉내내지 않는다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var Subs = window.Subs = {};

  /* 기준값 (설계안 8장 초안) */
  var TRIAL_FREE   = 3;     // 로그인 전 맛보기 — 기기 기준이라 적게
  var FREE_MONTHLY = 5;     // 로그인 무료: 월 5회 글 생성 (2026-09-03 사용자 확정 — 아래 광고 정책과 짝)
  var KIND_LABEL = { post: '글 생성' };
  function won(n) { return n.toLocaleString('ko-KR') + '원'; }

  /* ⭐ 구독 요금제 3단계 (사용자 확정 2026-09-03)
     회당 단가를 90원 선으로 맞췄다 — 이전엔 30/50/100회가 회당 단가가 거의 같아서(96.7·98·99원)
     큰 요금제를 살 이유가 약했다. 이번엔 위 단계로 갈수록 확실히 싸지게 잡았다.
       · 30회  2,700원 (회당 90.0원)
       · 100회 8,900원 (회당 89.0원)
       · 무제한 34,900원 — 표시는 '무제한'이지만 내부적으로는 월 600회 안전판을 둔다.
         (통신사 '무제한 요금제'의 페어유즈 정책과 같은 개념. 500회 넘게 쓰는 사람은
         거의 없을 거라는 사용자 전제에 20% 여유를 얹었다. 화면엔 이 숫자를 보여주지
         않는다 — 실제로 이 상한에 걸리는 사람은 거의 없어야 정상이다.)
     연 요금 = 월 요금 x 10개월 값(12개월 결제하면 2개월 무료 — 사용자 확정 2026-09-03).
     클라우드 백업은 요금제에서 뺐다(사용자 확정 2026-09-03, 상품화 안 함) — cloud_backup.js
     기능 자체는 남겨 두고 로그인한 사람 누구나 그대로 쓸 수 있게 둔다(ui_settings.js 참고).
     ⬜ 아직 결제 연동 전이라 여기 숫자는 화면 문구·수동 지정용이다. 실제 상품(Google Play
        정기결제 등) 등록·심사가 끝나면 결제 콜백이 Subs 서버 쪽 plan 필드를 채우게 연결한다. */
  var PLANS = {
    t30:  { id: 't30',  label: '30회 구독',   monthly: 30,  price: 2700,  priceYearly: 27000 },
    t100: { id: 't100', label: '100회 구독',  monthly: 100, price: 8900,  priceYearly: 89000 },
    unl:  { id: 'unl',  label: '무제한 구독', monthly: 600, price: 34900, priceYearly: 349000, unlimited: true }
  };
  var PLAN_ORDER = ['t30', 't100', 'unl'];
  function planOf(S) { return (S && S.plan && PLANS[S.plan]) || null; }

  /* ⭐ 광고형 추가 사용권 (사용자 확정 2026-09-03, 아직 미구현)
     매달 무료 5회를 다 쓴 뒤에는 리워드 광고를 보고 **사실상 무제한**으로 계속 쓸 수 있다 —
     구독 안 해도 완전히 막히지는 않되, 매번 광고를 보는 번거로움이 구독 전환을 유도한다.
       · 글 생성 1회 = 리워드 광고 2편
       · PC 링크 1회 = 리워드 광고 1편 (AI 를 안 쓰고 사진 저장만 하므로 원가가 훨씬 낮다)
     구독자에게는 광고를 아예 보여주지 않는다(상시 배너 포함 — ui_settings.js/기록 탭 참고).

     ⭐ 2026-09-03 사용자 요청: "광고 보고 글작성하는건 좀더 저렴한 모델로 돌리는건 어때?"
        → 광고로 풀리는 글쓰기는 Claude Haiku 4.5 로 돌린다(postModel). Sonnet 5 는 $2/$10
        (입력/출력 100만 토큰당), Haiku 4.5 는 정확히 절반인 $1/$5 다 — 원가가 절반으로
        줄어든다(건당 대략 12.5~25원, 평균 18.75원). 광고 2편 평균 수익(약 43원)과 비교하면
        마진이 평균 13%(Sonnet)에서 평균 56%(Haiku)로 뛰고, 최악의 경우(광고 저단가 + 무거운
        글)에도 적자로 안 빠진다. 무료 5회(광고 없음)는 그대로 Sonnet — 신규 사용자가 첫인상은
        제값(고품질)으로 보게 하고, 광고형과 구독의 품질 차이 자체가 구독 유인이 된다.
     ⬜ AdMob 등 광고 SDK가 아직 앱에 없어서(package.json 확인됨) 이 값은 설계만 확정된
        상태다. ai.js 의 generatePost/generateTripPost 는 이미 네 번째 인자로 model 을 받게
        해뒀다 — 광고 흐름을 붙일 때 ui_posts.js 호출부에서 AD_UNLOCK.postModel 을 넘기면
        된다. 그 전까지는 결제와 마찬가지로 없는 기능을 있는 척하지 않는다. */
  var AD_UNLOCK = { post: 2, pclink: 1, postModel: 'claude-haiku-4-5' };

  var KEY = CFG.k('subs_v1');
  /* ⭐ 관리자 계정(사용자 요청 2026-09-02) — 현장매니저 subscription.js 의 users/{uid}.admin
     구조를 그대로 가져왔다. 부트스트랩(맨 처음 관리자 지정)만 이메일로 하고,
     그 다음부터는 관리자가 앱 안에서(Subs.openUserAdmin) 다른 사람에게 넘길 수 있다.
     ⚠️ 실제 권한은 firestore.rules 의 isBootstrapAdmin()/isAdmin() 이 서버에서 강제한다 —
        아래 admin 플래그는 그 서버 값을 그대로 반영해 보여주는 캐시일 뿐이다. */
  var ADMIN_BOOTSTRAP_EMAIL = 'bsc500327@gmail.com';

  function ym() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function load() {
    var S;
    try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
    if (!S) S = { ym: ym(), used: { post: 0 }, trialUsed: 0, coupon: { post: 0, exp: 0 }, plan: 'free', admin: false };
    if (S.ym !== ym()) { S.ym = ym(); S.used = { post: 0 }; }        // 달이 바뀌면 월 한도 초기화
    if (!S.used) S.used = { post: 0 };
    if (!S.coupon) S.coupon = { post: 0, exp: 0 };
    if (S.coupon.exp && Date.now() > S.coupon.exp) S.coupon = { post: 0, exp: 0 };
    if (S.admin == null) S.admin = false;
    if (!S.plan || !PLANS[S.plan]) S.plan = 'free';
    return S;
  }
  function save(S) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  Subs.isPaid = function () { return !!planOf(load()); };
  Subs.loggedIn = function () { return !!(window.Cloud && Cloud.loggedIn()); };
  Subs.isAdmin = function () { return !!load().admin; };
  Subs.planId = function () { return load().plan; };  // 'free' | 't30' | 't100' | 'unl'

  /* 로그인 상태가 바뀔 때마다 서버의 진짜 admin·plan 값을 당겨 온다(캐시 최신화).
     같은 김에 users/{uid}.email 도 맞춰 둔다 — 관리자가 이메일로 사용자를 찾으려면
     그 필드가 있어야 한다(현장매니저는 shareCode 라는 이름을 썼지만 여기선 그대로 email).
     ⚠️ plan 은 admin 과 똑같이 서버가 정답이다 — 기기 localStorage 는 캐시일 뿐이고,
        본인이 직접 자기 문서의 plan 을 못 바꾸게 firestore.rules 가 막는다. 안 막으면
        누구나 개발자 도구로 자기한테 '무제한 구독'을 공짜로 줄 수 있다. */
  function pullServerState() {
    if (!Subs.loggedIn()) {
      var S0 = load();
      var changed0 = false;
      if (S0.admin) { S0.admin = false; changed0 = true; }
      if (S0.plan !== 'free') { S0.plan = 'free'; changed0 = true; }
      if (changed0) save(S0);
      return;
    }
    var uid = Cloud.uid();
    var email = ((Cloud.user && Cloud.user.email) || '').toLowerCase();
    Cloud.db().collection('users').doc(uid).get().then(function (doc) {
      var d = (doc && doc.exists) ? (doc.data() || {}) : {};
      if (email && d.email !== email) {
        Cloud.db().collection('users').doc(uid).set({ email: email }, { merge: true }).catch(function () {});
      }
      var S = load();
      var wasAdmin = !!S.admin, wasPlan = S.plan;
      S.admin = (d.admin === true);
      S.plan = (d.plan && PLANS[d.plan]) ? d.plan : 'free';
      save(S);
      if (wasAdmin !== S.admin || wasPlan !== S.plan) { try { if (window.UI && UI.refresh) UI.refresh(); } catch (e) {} }
    }).catch(function (e) { console.warn('[Subs] 서버 상태 확인 실패', e && e.code); });
  }
  try { if (window.Cloud && Cloud.onChange) Cloud.onChange(pullServerState); } catch (e) {}

  /* 남은 횟수 {coupon, monthly, trial, total, cap} — cap 은 이번 달 기준(무료 5 또는 요금제 한도) */
  Subs.quota = function (kind) {
    kind = kind || 'post';
    var S = load();
    var coupon = (S.coupon.exp > Date.now()) ? Math.max(0, S.coupon[kind] || 0) : 0;
    if (!Subs.loggedIn()) {
      var trial = Math.max(0, TRIAL_FREE - (S.trialUsed || 0));
      return { coupon: coupon, monthly: 0, trial: trial, total: coupon + trial, cap: 0 };
    }
    var pl = planOf(S);
    var cap = pl ? pl.monthly : FREE_MONTHLY;
    var monthly = Math.max(0, cap - (S.used[kind] || 0));
    return { coupon: coupon, monthly: monthly, trial: 0, total: coupon + monthly, cap: cap };
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
    if (Subs.isPaid()) {
      return { ok: false, msg: '이번 달 ' + planOf(load()).label + ' 한도를 다 썼어요. 다음 달 1일에 다시 채워집니다.' };
    }
    return { ok: false, msg: '이번 달 ' + KIND_LABEL[kind] + ' 무료 ' + FREE_MONTHLY +
                             '회를 다 썼어요. 다음 달까지 기다리거나 구독하면 광고 없이 계속 쓸 수 있어요.' };
  };

  /* 사용 1회 차감 — 쿠폰 → 월 한도 → 맛보기 (현장매니저와 같은 순서).
     ⚠️ 구독자도 이제 월 한도가 있으니(요금제별로 30/100/600) S.used 를 그대로 쌓는다 —
        예전처럼 isPaid() 라고 차감을 건너뛰지 않는다. */
  Subs.use = function (kind) {
    kind = kind || 'post';
    var S = load();
    if (S.coupon.exp > Date.now() && (S.coupon[kind] || 0) > 0) { S.coupon[kind]--; save(S); return; }
    if (Subs.loggedIn()) { S.used[kind] = (S.used[kind] || 0) + 1; save(S); return; }
    S.trialUsed = (S.trialUsed || 0) + 1; save(S);
  };

  /* 화면에 뿌릴 한 줄 */
  Subs.label = function (kind) {
    kind = kind || 'post';
    var q = Subs.quota(kind);
    if (!Subs.loggedIn()) return KIND_LABEL[kind] + '은 로그인 후 이용 가능해요 (로그인하면 매달 ' + FREE_MONTHLY + '회 무료)';
    if (Subs.isPaid()) {
      var pl = planOf(load());
      if (pl.unlimited) return pl.label + ' · 이번 달 계속 쓸 수 있어요';
      return pl.label + ' · 이번 달 ' + q.monthly + '/' + pl.monthly + '회 남음';
    }
    return '이번 달 ' + q.monthly + '/' + FREE_MONTHLY + '회 남음' + (q.coupon ? ' + 쿠폰 ' + q.coupon + '회' : '');
  };

  /* ── 기능 잠금 ──
     쓸 수 있으면 true, 아니면 안내를 띄우고 false.
     ⚠️ 호출부는 반드시 `if (!Subs.gateFeature(...)) return;` 형태로 쓴다.

     ★ 2026-09-03 사용자 요청: "PC링크 만들기가 구독 전용이라고 하면서 실행이 안돼.
        글쓰기횟수와 연동해서 쓸수있게해줘." — 결제가 아직 없어(Subs.isPaid() 는 늘 false)
        PAID_ONLY 에 있던 기능은 사실상 영원히 못 쓰는 죽은 버튼이었다. pclink 는 여기서 뺐다
        → 아래 기본 분기(글 생성 횟수 = 'post')를 그대로 타서, 글쓰기와 같은 월 무료 횟수 풀을
          같이 쓴다(만들 때마다 1회 차감 — share.js 의 openPc() 참고).
        ★ 2026-09-03 사용자 확정: 클라우드 백업은 요금제 혜택으로 안 판다. PAID_ONLY 가 이제
          비어 있다(자리는 남겨 둔다 — 나중에 진짜 유료 전용 기능이 생기면 여기 추가).
          cloud_backup.js 기능 자체는 그대로 있고, ui_settings.js 에서 로그인한 사람이면
          누구나 쓸 수 있다(더 이상 gateFeature 로 안 잠근다). */
  var PAID_ONLY = {};

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
            '<div class="d">로그인하면 매달 글쓰기(PC 링크 포함) ' + FREE_MONTHLY + '회<br>' +
              '그 이후엔 광고를 보면 계속 쓸 수 있어요(준비 중)</div></div></div>' +
          PLAN_ORDER.map(function (id) {
            var pl = PLANS[id];
            return '<div class="set-row"><div><div class="k">' + esc(pl.label) + '</div>' +
              '<div class="d">글쓰기(PC 링크 포함) 월 ' + (pl.unlimited ? '무제한' : (pl.monthly + '회')) +
                ' · 광고 없음<br>' +
                '월 ' + won(pl.price) + ' · 연 ' + won(pl.priceYearly) + '(12개월 결제 시 10개월 값, 2개월 무료)' +
              '</div></div></div>';
          }).join('') +
        '</div>' +
        (Cloud.ready ? '' :
          '<div class="notice">지금은 로그인을 켤 수 없어 <b>맛보기 횟수까지만</b> 쓸 수 있습니다.<br>' +
          '<span class="mini">' + esc(Cloud.why) + '</span></div>') +
        '<div class="mini">사진은 늘 기기에 남습니다. 백업 ZIP·클라우드 백업은 구독 여부와 상관없이 언제든 쓸 수 있어요.</div>',
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

  /* ── 관리자: 쿠폰 발급 ──
     이 앱엔 요금제(플랜)가 없고 '글 생성 횟수'만 세므로, 현장매니저의 쿠폰 발급 화면에서
     플랜별 항목(일정·글작성 등)을 빼고 post 횟수 하나만 남겼다. 스키마는 redeem() 이 읽는
     그대로다: post / maxUses / usedBy / expiresAt(Timestamp) / active. */
  function genCode() {
    var s = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', out = 'TP-';
    for (var i = 0; i < 8; i++) { if (i === 4) out += '-'; out += s[Math.floor(Math.random() * s.length)]; }
    return out;
  }
  Subs.openCouponAdmin = function () {
    if (!Subs.loggedIn() || !Subs.isAdmin()) { showToast('관리자만 사용할 수 있습니다', 'err'); return; }
    var ov = overlay({
      title: '🎟 쿠폰 발급 (관리자)',
      body:
        '<label class="lbl">코드</label><input class="inp" id="cpCode" value="' + genCode() + '">' +
        '<label class="lbl">글 생성 횟수</label><input class="inp" id="cpPost" type="number" value="10">' +
        '<div class="btn-row" style="margin-top:8px;">' +
          '<div style="flex:1;"><label class="lbl">유효기간(일)</label><input class="inp" id="cpDays" type="number" value="30"></div>' +
          '<div style="flex:1;"><label class="lbl">사용 가능 인원</label><input class="inp" id="cpMax" type="number" value="1"></div>' +
        '</div>',
      foot: '<button class="btn ghost" id="cpCancel">취소</button><button class="btn primary" id="cpMake">발급</button>'
    });
    ov.querySelector('#cpCancel').onclick = ov.close;
    ov.querySelector('#cpMake').onclick = function () {
      var code = ov.querySelector('#cpCode').value.trim().toUpperCase();
      var post = parseInt(ov.querySelector('#cpPost').value, 10) || 0;
      var days = parseInt(ov.querySelector('#cpDays').value, 10) || 30;
      var maxUses = parseInt(ov.querySelector('#cpMax').value, 10) || 1;
      if (!code) { showToast('코드를 입력해주세요', 'err'); return; }
      Cloud.db().collection('coupons').doc(code).set({
        post: post, maxUses: maxUses, usedBy: [], active: true,
        expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() + days * 86400000),
        createdBy: Cloud.uid(), createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () {
        ov.close();
        try { if (navigator.clipboard) navigator.clipboard.writeText(code); } catch (e) {}
        showToast('발급됨 — ' + code + ' (클립보드에 복사됨)', 'ok');
      }).catch(function (e) { showToast('발급 실패: ' + ((e && e.code) || ''), 'err'); });
    };
  };

  /* ── 관리자: 다른 사용자에게 관리자 권한 주기/빼기 + 요금제 수동 지정 ──
     이메일로 users 컬렉션을 찾는다 — pullServerState() 가 로그인마다 email 필드를 맞춰 두므로
     상대가 한 번이라도 로그인한 적이 있으면 찾아진다.
     ⭐ 2026-09-03: 실제 결제가 아직 없어서, 요금제(plan)는 지금은 관리자가 여기서 손으로만
        내려줄 수 있다. firestore.rules 가 본인 스스로는 plan 을 못 바꾸게 막아 둔다. */
  Subs.openUserAdmin = function () {
    if (!Subs.loggedIn() || !Subs.isAdmin()) { showToast('관리자만 사용할 수 있습니다', 'err'); return; }
    var ov = overlay({
      title: '🛠 관리자 권한 관리',
      body:
        '<div class="mini">이메일로 찾아 관리자 권한을 주거나 뺍니다. 상대가 이 앱에서 로그인한 적이 있어야 찾을 수 있어요.</div>' +
        '<div style="display:flex;gap:8px;margin-top:8px;">' +
          '<input class="inp" id="uaEmail" placeholder="사용자 이메일" autocapitalize="off" style="flex:1;">' +
          '<button class="btn sm" id="uaFind">검색</button></div>' +
        '<div id="uaResult" style="margin-top:12px;"></div>'
    });
    var box = ov.querySelector('#uaResult');
    var inp = ov.querySelector('#uaEmail');
    function doFind() {
      var email = (inp.value || '').trim().toLowerCase();
      if (!email) { showToast('이메일을 입력해주세요', 'err'); return; }
      box.innerHTML = '<div class="mini">검색 중…</div>';
      Cloud.db().collection('users').where('email', '==', email).limit(1).get().then(function (snap) {
        if (snap.empty) { box.innerHTML = '<div class="mini">해당 이메일의 사용자를 찾을 수 없어요.</div>'; return; }
        var doc = snap.docs[0];
        render(doc.id, doc.data() || {});
      }).catch(function (e) { box.innerHTML = '<div class="mini">검색 실패: ' + esc((e && e.code) || '') + '</div>'; });
    }
    ov.querySelector('#uaFind').onclick = doFind;
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doFind(); });
    function render(uid, d) {
      var isAdm = d.admin === true;
      var curPlan = (d.plan && PLANS[d.plan]) ? d.plan : 'free';
      box.innerHTML =
        '<div class="box"><div class="k">' + esc(d.email || uid) + (isAdm ? ' 👑' : '') + '</div>' +
        '<label class="chk" style="margin-top:8px;"><input type="checkbox" id="uaAdmin"' + (isAdm ? ' checked' : '') +
          '><span>관리자 권한</span></label>' +
        '<label class="lbl" style="margin-top:10px;">요금제 <span class="mini">(결제 연동 전 — 수동 지정)</span></label>' +
        '<select class="inp" id="uaPlan">' +
          '<option value="free"' + (curPlan === 'free' ? ' selected' : '') + '>무료</option>' +
          PLAN_ORDER.map(function (id) {
            return '<option value="' + id + '"' + (curPlan === id ? ' selected' : '') + '>' + esc(PLANS[id].label) + '</option>';
          }).join('') +
        '</select></div>';
      var cb = box.querySelector('#uaAdmin');
      cb.onchange = function () {
        var on = cb.checked;
        Cloud.db().collection('users').doc(uid).set({ admin: on }, { merge: true }).then(function () {
          showToast(on ? '관리자로 지정했어요' : '관리자 권한을 뺐어요', 'ok');
          if (uid === Cloud.uid()) { var S = load(); S.admin = on; save(S); UI.refresh(); }
        }).catch(function (e) { showToast('변경 실패: ' + ((e && e.code) || ''), 'err'); cb.checked = !on; });
      };
      var sel = box.querySelector('#uaPlan');
      sel.onchange = function () {
        var planId = sel.value;
        Cloud.db().collection('users').doc(uid).set({ plan: planId }, { merge: true }).then(function () {
          showToast('요금제를 ' + (PLANS[planId] ? PLANS[planId].label : '무료') + '(으)로 바꿨어요', 'ok');
          if (uid === Cloud.uid()) { var S = load(); S.plan = planId; save(S); UI.refresh(); }
        }).catch(function (e) { showToast('변경 실패: ' + ((e && e.code) || ''), 'err'); sel.value = curPlan; });
      };
    }
  };

  console.log('[Subs]', Subs.label('post'));
})();
