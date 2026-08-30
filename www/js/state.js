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
    var close = function () { if (ov.parentNode) ov.parentNode.removeChild(ov); lock(); };
    ov.querySelector('.sheet-x').onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.close = close;
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

    save: function () {
      if (!_cur) return Promise.resolve(null);
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
})();
