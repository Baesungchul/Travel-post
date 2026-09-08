/* ═══════════════════════════════════════════════════════════
   state.js — 공통 UI 도구 + '지금 열린 장소'
   ----------------------------------------------------------------
   토스트 / 진행 오버레이 / body 스크롤 잠금 / 현재 장소(Place)
   ⚠️ 오버레이 규칙 (설계안 5장 — 처음부터 지킬 것)
      · body 에 직접 붙이는 오버레이는 반드시 class="ov-lock" 을 단다.
        아래 잠금이 이 클래스를 보고 뒷 화면 스크롤을 막는다.
      · 오버레이 내부는 세로 flex + **본문만** 스크롤. 헤더/버튼줄은 고정.
      · overscroll-behavior:contain 으로 스크롤 체이닝을 막는다.
      현장매니저는 이걸 나중에 붙이느라 팝업마다 따로 고쳤다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 토스트 ── */
  var _toastEl = null, _toastT = null;
  function showToast(msg, type) {
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.id = 'toast';
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = msg;
    _toastEl.className = 'show ' + (type || '');
    clearTimeout(_toastT);
    _toastT = setTimeout(function () { _toastEl.className = ''; }, 2600);
  }
  window.showToast = showToast;

  /* ── 진행 오버레이 ── */
  var _ovEl = null;
  /* onCancel 을 주면 '취소' 글자가 같이 뜬다 (2026-09-05).
     ☠️ 전파가 약한 곳(지하 식당·여행지)에서 AI 호출이 안 끝나면 예전엔 스피너만 돌고
        빠져나올 길이 없었다. 취소가 없으면 앱을 강제 종료하는 수밖에 없다. */
  function showOverlay(msg, onCancel) {
    if (!_ovEl) {
      _ovEl = document.createElement('div');
      _ovEl.id = 'busy';
      _ovEl.className = 'ov-lock';
      _ovEl.innerHTML = '<div class="busy-box"><div class="spin"></div>' +
        '<div class="busy-msg"></div><div class="busy-bar"><i></i></div>' +
        '<button type="button" class="busy-cancel" style="display:none;">취소</button></div>';
      document.body.appendChild(_ovEl);
    }
    _ovEl.querySelector('.busy-msg').textContent = msg || '처리 중...';
    _ovEl.querySelector('.busy-bar i').style.width = '0%';
    var cx = _ovEl.querySelector('.busy-cancel');
    cx.style.display = onCancel ? '' : 'none';
    cx.onclick = onCancel || null;
    _ovEl.style.display = 'flex';
    lock();
  }
  function setProg(pct, msg) {
    if (!_ovEl) return;
    _ovEl.querySelector('.busy-bar i').style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (msg) _ovEl.querySelector('.busy-msg').textContent = msg;
  }
  function hideOverlay() {
    if (_ovEl) _ovEl.style.display = 'none';
    lock();
  }

  /* ── 가짜 진행바 (AI 글 생성처럼 '얼마나 남았는지' 알 수 없는 일) ──
     ★ 2026-09-07 사용자 요청으로 현장매니저에서 옮겨 왔다.
       스피너만 도는 화면은 멈춘 것처럼 보인다. 진행바를 조금씩 채우면서
       그 구간에 맞는 문구 하나만 보여준다.

     ⚠️ 문구는 앞으로만 나아가고 처음으로 되돌아가 반복하지 않는다.
        초반 문구가 뒤에서 또 뜨면 가짜 진행바인 게 티가 난다.
     ☠️ 상한(92%)에서 멈추고 실제 완료를 기다린다. 100%를 먼저 보여주면 안 된다.
     ☠️ 속도는 '상한까지 걸리는 시간(runSec)'으로 정한다 — 눈금 폭으로 정하면
        문구 개수에 따라 체감 속도가 제멋대로 달라진다.
        늦추려고 틱 간격(700ms)을 키우지 말 것: 막대가 뚝뚝 끊겨 보인다.
     사용법: var stop = startBusyProgress(['문구1','문구2',...]); ... 끝나면 stop(); */
  function startBusyProgress(messages, opts) {
    opts = opts || {};
    var tickMs = opts.interval || 700;
    var msgs = (messages && messages.length) ? messages : ['처리 중...'];
    var cap = 92;
    var seg = cap / msgs.length;          // 문구 하나가 담당하는 진행률 구간
    var pct = Math.min(4, seg * 0.3);
    var runSec = opts.runSec || 32;       // 상한까지 걸리는 대략의 시간
    var ticks = Math.max(1, Math.round(runSec * 1000 / tickMs));
    var step = (cap - pct) / ticks;       // 한 틱에 올릴 평균 폭
    function paint() {
      var idx = Math.min(msgs.length - 1, Math.floor(pct / seg));
      setProg(Math.round(pct), msgs[idx]);
    }
    paint();
    var timer = setInterval(function () {
      if (pct >= cap) return;             // 상한 뒤에는 그대로 두고 실제 완료를 기다린다
      pct = Math.min(pct + step * (0.75 + Math.random() * 0.5), cap);
      paint();
    }, tickMs);
    var stopped = false;
    return function stopBusyProgress() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    };
  }

  window.showOverlay = showOverlay;
  window.hideOverlay = hideOverlay;
  window.setProg = setProg;
  window.startBusyProgress = startBusyProgress;

  /* ── body 스크롤 잠금 ──
     .ov-lock 이 하나라도 보이면 잠근다. 동적으로 붙는 오버레이도 감시한다. */
  function anyOpen() {
    try {
      var l = document.querySelectorAll('.ov-lock');
      for (var i = 0; i < l.length; i++) {
        if (l[i].offsetParent !== null || getComputedStyle(l[i]).display !== 'none') return true;
      }
    } catch (e) {}
    return false;
  }
  var _scrollY = 0;
  function lock() {
    var on = anyOpen();
    var b = document.body;
    if (on && !b.classList.contains('modal-open')) {
      _scrollY = window.scrollY || 0;
      b.classList.add('modal-open');
      b.style.top = (-_scrollY) + 'px';
    } else if (!on && b.classList.contains('modal-open')) {
      b.classList.remove('modal-open');
      b.style.top = '';
      window.scrollTo(0, _scrollY);
    }
  }
  window.syncBodyLock = lock;
  try {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        var nodes = [].concat([].slice.call(m.addedNodes), [].slice.call(m.removedNodes));
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (n && n.nodeType === 1 && n.classList && n.classList.contains('ov-lock')) { lock(); return; }
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  /* ── 열린 시트 스택 (뒤로가기용) ──
     overlay() 로 여는 모든 팝업이 여기 쌓인다 — 앱 전체 팝업이 이 함수 하나로 통일돼 있어서
     (설계안 5장 규칙), 뒤로가기는 이 스택만 보면 '가장 나중에 연 것부터' 닫을 수 있다. */
  var _ovStack = [];
  /* ⭐ 2026-09-05: overlay() 로 만들지 않은 전체화면 팝업(사진 뷰어)도 뒤로가기에 걸리게 —
     { close: fn } 만 주면 스택에 올려 준다. 반환값을 부르면 스택에서 빠진다.
     ☠️ 뷰어를 스택에 안 올리면 뒤로가기가 뷰어를 건너뛰고 탭을 바꿔 버린다. */
  window.registerSheet = function (obj) {
    _ovStack.push(obj);
    return function () {
      var i = _ovStack.indexOf(obj);
      if (i !== -1) _ovStack.splice(i, 1);
    };
  };
  window.closeTopOverlay = function () {
    if (!_ovStack.length) return false;
    var top = _ovStack[_ovStack.length - 1];
    try { top.close(); } catch (e) {}
    return true;
  };

  /* ── 마지막 그물: 스택에 안 올라간 전체화면 팝업 (2026-09-08) ──────────────
     ☠️ 사용자 신고: "참고용 사진자리 보기에서 뒤로가기를 해도 안 닫히고 앱이 닫혀.
        이건 이전에도 자주 있던 문제인데, 팝업에서 뒤로가기했는데 포커스가 뒤편에 있는 증상이야"

     맞는 진단이었다. 원인은 늘 같다 — overlay() 를 안 쓰고 손으로 만든 전체화면 팝업이
     _ovStack 에 없어서, 뒤로가기가 그 팝업을 **못 보고** 탭 이동·종료 흐름으로 내려간다.
     화면에는 팝업이 그대로 떠 있는데 뒤에서 탭이 바뀌거나 앱이 꺼지는 것이다.

     → 스택을 다 훑고도 못 찾았을 때, 화면에 실제로 떠 있는 전체화면 팝업을 직접 찾아 닫는다.
       새 팝업을 만들며 registerSheet 를 잊어도 사용자가 갇히지는 않는다.
     ⚠️ 이건 그물이지 대책이 아니다. 손으로 만든 팝업은 그래도 registerSheet 를 부를 것 —
        여기서는 '어떻게 닫는지'를 모르니 정리(URL 해제 등)를 건너뛴다.
     ⚠️ 탭바(z-index:200)·배너·토스트를 잡으면 안 된다. 그래서 조건이 빡빡하다:
        고정 위치 · z ≥ 500 · 화면 대부분을 덮음 · 눈에 보임. */
  var _BACK_SKIP = { tabbar: 1, camOverlay: 1, toast: 1, busy: 1, fab: 1 };
  window.closeStrayPopup = function () {
    try {
      var nodes = document.querySelectorAll('body > div');
      var best = null, bestZ = -1;
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.id && _BACK_SKIP[el.id]) continue;
        var cs = window.getComputedStyle(el);
        if (cs.position !== 'fixed') continue;
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) continue;
        var z = parseInt(cs.zIndex, 10); if (isNaN(z)) z = 0;
        if (z < 500) continue;
        var r = el.getBoundingClientRect();
        if (r.width < window.innerWidth * 0.7 || r.height < window.innerHeight * 0.5) continue;
        if (z >= bestZ) { bestZ = z; best = el; }
      }
      if (!best) return false;
      console.warn('[뒤로가기] 스택에 없는 팝업을 닫습니다 — registerSheet 를 빠뜨린 곳입니다:', best.id || best.className);
      /* 닫기 버튼이 있으면 그걸 누른다 — 그 안에 정리 코드가 들어 있을 수 있다 */
      var cb = best.querySelector('button[id*="Close"], button[id*="close"], button[id*="Cancel"], button[id*="cancel"]');
      if (cb) { cb.click(); return true; }
      best.remove();
      return true;
    } catch (e) { return false; }
  };

  /* 오버레이 껍데기 — 세로 flex + 본문만 스크롤 (규칙을 코드로 굳혀 둔다) */
  function overlay(opts) {
    opts = opts || {};
    var ov = document.createElement('div');
    ov.className = 'ov-lock sheet-ov';
    ov.innerHTML =
      /* has-ft — 버튼줄이 있으면 그쪽이 아래 시스템 버튼 여백을 받는다.
         없으면 본문이 직접 받는다 (styles.css 의 .sheet-bd 주석 참고). */
      '<div class="sheet' + (opts.foot ? ' has-ft' : '') + '">' +
        '<div class="sheet-hd">' +
          '<div class="sheet-ti">' + (opts.title || '') + '</div>' +
          '<button type="button" class="sheet-x" aria-label="닫기">✕</button>' +
        '</div>' +
        '<div class="sheet-bd">' + (opts.body || '') + '</div>' +
        (opts.foot ? '<div class="sheet-ft">' + opts.foot + '</div>' : '') +
      '</div>';
    document.body.appendChild(ov);
    var close = function () {
      /* ⭐ 2026-09-05: 닫히기 직전에 한 번 불린다. 창을 닫아 내용이 사라지는 것을 막는 자리다.
         ☠️ ✕ 와 '바깥 어두운 곳 탭' 둘 다 이 함수를 쓴다 — ov.close 를 덮어써 봐야 안 걸린다.
            그래서 훅을 여기 안에 둔다. 훅에서 오류가 나도 창은 반드시 닫는다. */
      if (opts.beforeClose) { try { opts.beforeClose(); } catch (e) { console.warn('[overlay] beforeClose', e); } }
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      var idx = _ovStack.indexOf(ov);
      if (idx !== -1) _ovStack.splice(idx, 1);
      lock();
    };
    ov.querySelector('.sheet-x').onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.close = close;
    _ovStack.push(ov);
    lock();
    return ov;
  }
  window.overlay = overlay;

  /* ── 공통 헬퍼 ── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  window.esc = esc;

  /* ── 장소 표시 이름 ──
     이름을 안 적고 사진만 찍어 놔도(빈 장소는 아니라 저장은 됨) 목록·달력·지도에
     '(이름 없음)' 처럼 빈 자리로 보이지 않게, 주소나 방문 날짜로 대신 보여준다.
     ⚠️ p.name 자체는 건드리지 않는다 — 「지금」 탭을 다시 열면 여전히 빈칸이라
        사용자가 실제로 이름을 적을 때까지 '가짜 이름'으로 덮이지 않는다.
     (사용자 요청 2026-09-02: "기록에 (이름없음)이 저장되지 않도록") */
  function placeLabel(p) {
    if (!p) return '';
    if (p.name && String(p.name).trim()) return p.name;
    if (p.address && String(p.address).trim()) return p.address;
    var d = p.visitedAt ? new Date(p.visitedAt) : null;
    if (d && !isNaN(d.getTime())) return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 기록';
    return '새 기록';
  }
  window.placeLabel = placeLabel;

  /* ── 카테고리 아이콘 표시 ──
     카테고리(프로필) 아이콘은 이모지 한 글자(icon)이거나, 사용자가 넣은 사진(iconImg,
     data: URL)일 수 있다(사용자 요청 2026-09-02: "사용자 이미지도 적용할수 있게").
     ⚠️ icon 필드 자체에 data: URL을 넣지 않는다 — esc()로 그대로 이모지 자리에
        찍던 기존 코드가 많아서, 거기서 긴 문자열이 그대로 글자로 보이면 화면이 깨진다.
        그래서 iconImg 를 별도 필드로 두고, 이 헬퍼를 거치는 곳만 사진을 보여준다. */
  function catIconHTML(pf, size) {
    var px = size || 20;
    if (pf && pf.iconImg) {
      return '<img src="' + esc(pf.iconImg) + '" style="width:' + px + 'px;height:' + px +
        'px;border-radius:' + Math.max(4, Math.round(px * 0.22)) + 'px;object-fit:cover;' +
        'vertical-align:-.2em;flex:none;" alt="">';
    }
    var ic = (pf && pf.icon) || '📍';
    return '<span style="font-size:' + px + 'px;line-height:1;vertical-align:-.1em;">' + esc(ic) + '</span>';
  }
  window.catIconHTML = catIconHTML;

  function copyText(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t); return true; } } catch (e) {}
    try {
      var ta = document.createElement('textarea');
      ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta); ta.focus(); ta.select();
      ta.setSelectionRange(0, ta.value.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  window.copyText = copyText;

  function kstNow() { return new Date(); }
  function isoLocal(d) {
    d = d || new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  window.isoLocal = isoLocal;
  window.kstNow = kstNow;

  /* ═══ 지금 열린 장소 ═══════════════════════════════════
     장소 하나 = 글 하나 (설계안 0장 확정 전제) */
  var _cur = null;
  var Place = {
    current: function () { return _cur; },
    set: function (p) { _cur = p; try { if (window.UI && UI.renderNow) UI.renderNow(); } catch (e) {} },
    clear: function () { _cur = null; },

    /* 새 장소 — 카테고리 스탬프를 이때 찍는다(그 뒤에 프로필을 고쳐도 이 글은 안 깨진다) */
    create: function (pfId) {
      var st = Profiles.stampForNewPlace(pfId);
      var now = new Date();
      var p = {
        id: Store.newPlaceId(now),
        profileId: st.profileId,
        profileSnap: st.profileSnap,
        name: '',
        visitedAt: isoLocal(now),
        geo: null,
        address: '',
        area: '',
        memo: '',
        rating: 0,
        photos: [],          // { id, order, tag, memo }
        tripId: null,        // v2
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      _cur = p;
      return p;
    },

    /* ── 빈 장소인가 ──
       ＋ 를 누르면 카테고리·방문시각은 자동으로 채워진다. 그건 '사용자가 넣은 내용'이 아니다.
       사람이 실제로 넣은 것(이름·주소·메모·사진·별점·위치·여행)이 하나도 없으면 빈 장소다.
       ⚠️ visitedAt / profileSnap 을 내용으로 치면 모든 장소가 '내용 있음'이 되어 판정이 무의미해진다. */
    isBlank: function (p) {
      p = p || _cur;
      if (!p) return true;
      return !String(p.name || '').trim() &&
             !String(p.address || '').trim() &&
             !String(p.memo || '').trim() &&
             !(p.photos && p.photos.length) &&
             !p.rating && !p.geo && !p.tripId;
    },

    /* ☠️ 2026-08-30 (사용자 지적) — ＋ 를 누르면 곧바로 저장되던 것을 고쳤다.
         증상: 아무것도 안 적은 채로 다른 장소를 새로 만들면 목록에 '(이름 없음)' 이 남았다.
         원인: startNewPlace 가 create 직후 save 를 불러 빈 껍데기를 그대로 기록했다.
         → 빈 장소는 저장소에 쓰지 않는다. 이름 한 글자든 사진 한 장이든 들어오는 순간 저장된다.
         ⚠️ 이때 반환값을 null 로 준다 — app.js 가 lastPlaceId 를 기억하는데,
            저장소에 없는 id 를 기억해 두면 다음 실행에서 '장소를 찾을 수 없습니다' 가 뜬다. */
    save: function () {
      if (!_cur) return Promise.resolve(null);
      if (Place.isBlank(_cur)) return Promise.resolve(null);
      _cur.updatedAt = Date.now();
      return Store.placePut(_cur).then(function () { return _cur; });
    },

    open: function (id) {
      return Store.placeGet(id).then(function (p) {
        if (!p) throw new Error('장소를 찾을 수 없습니다');
        _cur = p;
        try { if (window.UI && UI.renderNow) UI.renderNow(); } catch (e) {}
        return p;
      });
    },

    /* 이 장소의 태그 세트 — 스냅샷이 먼저다 */
    tags: function (p) {
      p = p || _cur;
      var snap = p && p.profileSnap;
      if (snap && snap.tags && snap.tags.length) return snap.tags.slice();
      var pf = Profiles.forCurrentPlace();
      return (pf && pf.tags && pf.tags.length) ? pf.tags.slice() : ['사진'];
    }
  };
  window.Place = Place;

  /* ════════════════════════════════════════════════
     ★ 2026-09-02: 안드로이드 하드웨어 뒤로가기 (사용자 요청)
        기존: Capacitor 기본 동작 — 어느 화면에서든 뒤로가기 한 번에 앱이 바로 꺼졌다.
        이제: 카메라 닫기 → 열린 팝업 닫기(가장 나중 것부터, 현재 탭 유지) →
              달력 펼침 접기 → 기록 탭이 아니면 기록 탭으로 → 기록 탭이면 한 번 더
              눌러야 종료(2초 내 두 번).
        ⚠️ 현장매니저 state.js 의 같은 자리 코드를 참고했다. 거긴 팝업마다 만든 시기가
           달라 모달 id 를 일일이 나열해야 했지만(주석 참고), 여기는 처음부터 모든 팝업이
           overlay() 하나로 통일돼 있어 위 _ovStack 만 보면 다 잡힌다.
        ⚠️ @capacitor/app 플러그인이 있어야 이 리스너가 동작한다 — 없으면(구버전 APK)
           그냥 아무 일도 안 하고 넘어간다(옛날처럼 즉시 종료).
     ════════════════════════════════════════════════ */
  try {
    var _App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (_App && _App.addListener) {
      var _backExitReady = false;
      _App.addListener('backButton', function () {
        /* 0) 앱 내장 카메라가 열려 있으면 카메라만 닫는다 */
        if (window.isInAppCameraOpen && isInAppCameraOpen()) { closeInAppCamera(); return; }
        /* 1) 열린 팝업(시트/다이얼로그/피커) — 가장 나중에 연 것부터 하나씩 */
        if (window.closeTopOverlay && closeTopOverlay()) return;
        /* 1-2) 스택에 안 올라간 전체화면 팝업이 떠 있으면 그것부터 (위 closeStrayPopup 주석) */
        if (window.closeStrayPopup && closeStrayPopup()) return;
        /* 2) 기록 탭 달력이 펼쳐져(전체화면) 있으면 접기 */
        if (document.body.classList.contains('cal-lock')) {
          if (window.Cal && Cal.collapse) Cal.collapse();
          return;
        }
        /* 3) 기록 탭이 아니면 기록 탭으로 (종료하지 않음) */
        if (window.UI && UI.tab && UI.tab() !== 'records') {
          UI.switchTab('records');
          return;
        }
        /* 4) 기록 탭 + 열린 것 없음 → "한 번 더 누르면 종료" (2초 내 두 번) */
        if (_backExitReady) {
          try { _App.exitApp(); } catch (e) {}
        } else {
          _backExitReady = true;
          showToast('뒤로가기를 한 번 더 누르면 종료됩니다');
          setTimeout(function () { _backExitReady = false; }, 2000);
        }
      });
    }
  } catch (e) { console.warn('[뒤로가기] 네이티브 리스너 등록 실패:', e); }
})();
