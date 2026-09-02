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
  function showOverlay(msg) {
    if (!_ovEl) {
      _ovEl = document.createElement('div');
      _ovEl.id = 'busy';
      _ovEl.className = 'ov-lock';
      _ovEl.innerHTML = '<div class="busy-box"><div class="spin"></div>' +
        '<div class="busy-msg"></div><div class="busy-bar"><i></i></div></div>';
      document.body.appendChild(_ovEl);
    }
    _ovEl.querySelector('.busy-msg').textContent = msg || '처리 중...';
    _ovEl.querySelector('.busy-bar i').style.width = '0%';
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
  window.showOverlay = showOverlay;
  window.hideOverlay = hideOverlay;
  window.setProg = setProg;

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
  window.closeTopOverlay = function () {
    if (!_ovStack.length) return false;
    var top = _ovStack[_ovStack.length - 1];
    try { top.close(); } catch (e) {}
    return true;
  };

  /* 오버레이 껍데기 — 세로 flex + 본문만 스크롤 (규칙을 코드로 굳혀 둔다) */
  function overlay(opts) {
    opts = opts || {};
    var ov = document.createElement('div');
    ov.className = 'ov-lock sheet-ov';
    ov.innerHTML =
      '<div class="sheet">' +
        '<div class="sheet-hd">' +
          '<div class="sheet-ti">' + (opts.title || '') + '</div>' +
          '<button type="button" class="sheet-x" aria-label="닫기">✕</button>' +
        '</div>' +
        '<div class="sheet-bd">' + (opts.body || '') + '</div>' +
        (opts.foot ? '<div class="sheet-ft">' + opts.foot + '</div>' : '') +
      '</div>';
    document.body.appendChild(ov);
    var close = function () {
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
