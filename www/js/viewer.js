/* ═══════════════════════════════════════════════════════════
   viewer.js — 사진 크게 보기 (좌우로 밀어 다음 사진, 사용자 요청 2026-09-05)
   ----------------------------------------------------------------
   왜 필요한가:
     지금까지 사진을 누르면 태그·메모 시트 안의 작은 미리보기가 전부였다.
     찍은 사진을 확인하려면 갤러리 앱으로 나가야 했다.

   ⚠️ 현장매니저 events.js 의 사진 뷰어를 그대로 옮겨 온 규칙들 —
      그쪽에서 실제로 손봐 가며 정한 값이라 임의로 바꾸지 말 것:
      ① 넘기기 연출 (2026-09-06 개선, 사용자 지적: "그냥 흐려지기만 해"):
         · 다음/이전 사진을 **미리 읽어 두었으면** 나가는 사진은 밀려 나가고
           들어오는 사진은 반대편에서 밀려 들어온다 — 사진이 움직이는 게 보인다.
         · 아직 못 읽었으면 예전대로 **슬라이드 아웃 → 제자리 페이드 인**.
           안 읽힌 사진을 밀어 넣으면 빈 사각형이 따라 들어와서 더 끊겨 보인다.
         ☠️ 그래서 미리 읽기(warm)를 없애면 안 된다. 없애는 순간 연출이
            통째로 옛날 페이드로 되돌아간다.
      ② 확대(줌 > 1.01) 중에는 스와이프를 막는다. 안 막으면 확대한 사진을
         손으로 옮기려다 계속 다음 장으로 넘어가 버린다.
      ③ 스와이프 판정: 가로 45px 이상 + 세로보다 1.3배 이상 + (60px 이상이거나 0.4초 이내).
         세로 조건이 없으면 사진을 위아래로 훑을 때마다 장이 넘어간다.
      ④ 배경(어두운 곳)을 눌러도 안 닫는다. 확대 중에 실수로 닫히는 사고가 잦았다 —
         닫기는 ✕ 버튼과 안드로이드 뒤로가기뿐이다.

   ☠️ URL 은 반드시 Photos.url() 로만 얻는다. 여기서 createObjectURL 을 직접 쓰면
      뷰어를 닫을 때 새는 URL 이 생기고, photos.js 의 캐시 상한과도 어긋난다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var V = window.Viewer = {};

  var _el = null;         // 뷰어 껍데기 (한 번만 만들고 재사용)
  var _ids = [];          // 지금 보고 있는 사진 id 목록
  var _idx = 0;
  var _anim = false;
  var _unreg = null;      // 뒤로가기 스택에서 빼는 함수
  var _onEdit = null;     // '✏️ 태그 · 메모' 를 눌렀을 때 (「지금」 탭에서만 넘어온다)
  var _zoom = 1, _panX = 0, _panY = 0;
  var _warm = {};         // 사진 id → 이미 읽고 디코딩까지 끝난 URL (앞뒤 한 장씩만)

  function img() { return _el && _el.querySelector('.pvf-img'); }
  function W() { return window.innerWidth || 360; }

  function resetZoom() {
    _zoom = 1; _panX = 0; _panY = 0;
    var im = img();
    if (im) { im.style.transform = ''; im.style.transformOrigin = ''; }
  }

  function build() {
    if (_el) return _el;
    _el = document.createElement('div');
    _el.className = 'ov-lock pv-full';
    _el.innerHTML =
      '<button type="button" class="pvf-x" aria-label="닫기">✕</button>' +
      '<div class="pvf-cnt"></div>' +
      '<button type="button" class="pvf-nav prev" aria-label="이전 사진">‹</button>' +
      '<img class="pvf-img" alt="">' +
      '<button type="button" class="pvf-nav next" aria-label="다음 사진">›</button>' +
      '<div class="pvf-cap"></div>' +
      '<button type="button" class="pvf-edit" style="display:none;">✏️ 태그 · 메모</button>';
    document.body.appendChild(_el);

    _el.querySelector('.pvf-x').onclick = function (e) { e.stopPropagation(); V.close(); };
    _el.querySelector('.pvf-edit').onclick = function (e) {
      e.stopPropagation();
      var id = _ids[_idx], fn = _onEdit;
      V.close();
      if (fn) fn(id);
    };
    _el.querySelector('.pvf-nav.prev').onclick = function (e) { e.stopPropagation(); go(-1); };
    _el.querySelector('.pvf-nav.next').onclick = function (e) { e.stopPropagation(); go(1); };

    /* 키보드 — PC 브라우저에서 확인할 때 쓰고, 폰에서는 물리 키보드가 붙었을 때만 */
    document.addEventListener('keydown', function (e) {
      if (!_el || _el.style.display !== 'flex') return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Escape') V.close();
    });

    bindSwipe(_el);
    bindPinch(_el);
    return _el;
  }

  /* ── 앞뒤 한 장씩 미리 읽어 두기 ──
     URL 만 받아 놓는 걸로는 부족하다. 큰 사진은 <img> 에 붙인 뒤 디코딩하는 데
     또 한참 걸려서, src 를 넣어도 다음 몇 프레임 동안 빈 자리로 남는다.
     그래서 decode() 까지 끝난 것만 '준비됨(_warm)' 으로 친다. */
  function warm(i) {
    if (i < 0 || i >= _ids.length) return;
    var id = _ids[i];
    if (!id || _warm[id]) return;
    Photos.url(id).then(function (u) {
      if (!u) return;
      var pre = new Image();
      var done = function () { _warm[id] = u; };
      pre.onload = done;
      pre.onerror = function () {};
      pre.src = u;
      if (pre.decode) pre.decode().then(done, function () {});
    }).catch(function () {});
  }

  /* 지금 보는 장에서 두 칸 넘게 떨어진 건 버린다 (URL 자체는 photos.js 캐시가 관리한다) */
  function trimWarm() {
    var keep = {};
    for (var k = _idx - 2; k <= _idx + 2; k++) if (_ids[k]) keep[_ids[k]] = 1;
    Object.keys(_warm).forEach(function (id) { if (!keep[id]) delete _warm[id]; });
  }

  function warmNeighbors() { trimWarm(); warm(_idx - 1); warm(_idx + 1); }

  /* ── 한 장 화면에 올리기 ── */
  function load(i) {
    var im = img();
    if (!im) return;
    var id = _ids[i];
    if (_warm[id]) {
      /* 이미 준비된 사진은 지우지 않고 바로 갈아 끼운다 — 깜빡임이 없다 */
      im.src = _warm[id];
      paint();
      warmNeighbors();
      return;
    }
    im.removeAttribute('src');
    Photos.url(id).then(function (u) {
      /* 읽는 사이에 사용자가 또 넘겼을 수 있다 — 지금 보고 있는 장이 맞을 때만 그린다 */
      if (u && _idx === i && _el && _el.style.display === 'flex') im.src = u;
    }).catch(function () {});
    paint();
    warmNeighbors();
  }

  /* 장수 표시 · 화살표 · 태그 캡션 */
  function paint() {
    if (!_el) return;
    var many = _ids.length > 1;
    /* 장수·화살표를 켜고 끄는 방식까지 현장매니저와 같게 — 한 장뿐이면 셋 다 안 보인다 */
    var cnt = _el.querySelector('.pvf-cnt');
    if (many) { cnt.style.display = 'block'; cnt.textContent = (_idx + 1) + ' / ' + _ids.length; }
    else { cnt.style.display = 'none'; }
    _el.querySelector('.pvf-nav.prev').style.display = (many && _idx > 0) ? 'flex' : 'none';
    _el.querySelector('.pvf-nav.next').style.display = (many && _idx < _ids.length - 1) ? 'flex' : 'none';

    /* 캡션은 '지금 열린 장소'의 태그·메모를 쓴다. 기록 시트에서 연 다른 장소면 못 찾는데,
       그때는 그냥 비워 둔다 — 캡션 때문에 사진 보기가 막히면 안 된다. */
    var cap = '';
    try {
      var p = Place.current();
      var ph = p && (p.photos || []).filter(function (x) { return x.id === _ids[_idx]; })[0];
      if (ph) cap = (ph.tag || '') + (ph.memo ? ' · ' + ph.memo : '');
    } catch (e) {}
    var ce = _el.querySelector('.pvf-cap');
    ce.textContent = cap;
    ce.style.display = cap ? 'block' : 'none';
  }

  /* ── 넘기기 ──
     준비된 사진이면  : 나가는 사진 밀려 나감 → 들어오는 사진 반대편에서 밀려 들어옴
     아직 못 읽었으면 : 나가는 사진 밀려 나감 → 제자리 페이드 인 (예전 연출) */
  function go(dir) {
    if (_anim || _ids.length < 2) return;
    var n = _idx + dir;
    if (n < 0 || n >= _ids.length) return;
    var im = img();
    if (!im) { _idx = n; load(n); return; }
    resetZoom();
    _anim = true;
    var out = (dir > 0 ? -W() : W());
    var nextUrl = _warm[_ids[n]] || '';
    var unlock = function () { _anim = false; im.style.transition = ''; };

    im.style.transition = 'transform .16s ease-in, opacity .16s ease-in';
    im.style.transform = 'translateX(' + out + 'px)';
    im.style.opacity = '0';

    setTimeout(function () {
      _idx = n;
      im.style.transition = 'none';

      if (nextUrl) {
        /* 반대편 화면 밖에 세워 두고 들어오게 한다 */
        im.src = nextUrl;
        paint();
        warmNeighbors();
        var slideIn = function () {
          im.style.transition = 'none';
          im.style.transform = 'translateX(' + (-out) + 'px)';
          im.style.opacity = '1';
          /* ☠️ 이 한 줄을 빼면 안 된다 — 시작 위치가 스타일 계산에 반영되기 전에
             목표값을 덮어써 버려서, 새 사진이 나간 쪽에서 되돌아오는 것처럼 보인다.
             requestAnimationFrame 으로는 못 막는다 (rAF 는 스타일 계산 앞에서 돈다). */
          void im.offsetWidth;
          im.style.transition = 'transform .2s ease-out';
          im.style.transform = 'translateX(0)';
          setTimeout(unlock, 210);
        };
        /* 준비된 사진이라 decode 는 사실상 즉시 끝난다. 그래도 첫 프레임이 비는 걸 막는다 */
        if (im.decode) im.decode().then(slideIn, slideIn); else slideIn();
        return;
      }

      load(n);
      im.style.transform = 'translateX(0)';
      im.style.opacity = '0';
      requestAnimationFrame(function () {
        im.style.transition = 'opacity .2s ease-out';
        im.style.opacity = '1';
        setTimeout(unlock, 210);
      });
    }, 160);
  }

  /* ── 스와이프 ── */
  function bindSwipe(root) {
    var sx = 0, sy = 0, st = 0, on = false;
    root.addEventListener('touchstart', function (e) {
      if (_anim || !e.touches || e.touches.length !== 1 || _zoom > 1.01 || _ids.length < 2) { on = false; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); on = true;
    }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (!on) return;
      on = false;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - sx, dy = t.clientY - sy;
      var fast = (Date.now() - st) < 400;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3 && (Math.abs(dx) > 60 || fast)) {
        go(dx < 0 ? 1 : -1);
      }
    }, { passive: true });
    root.addEventListener('touchcancel', function () { on = false; }, { passive: true });

    /* 마우스로도 끌어서 넘길 수 있게 — PC 로 확인할 때만 쓰인다 */
    var mdx = 0, mon = false;
    root.addEventListener('mousedown', function (e) { mon = true; mdx = e.clientX; });
    root.addEventListener('mouseup', function (e) {
      if (!mon) return;
      mon = false;
      var d = e.clientX - mdx;
      if (Math.abs(d) > 60) go(d < 0 ? 1 : -1);
    });
  }

  /* ── 핀치 줌 + 한 손가락 옮기기 (현장매니저 attachPinchZoomToImage 이식) ── */
  function bindPinch(root) {
    var d0 = 0, z0 = 1, pan0 = null, c0 = null, org = null, pan1 = null, raf = 0, pend = null;
    var dist = function (t) {
      var dx = t[0].x - t[1].x, dy = t[0].y - t[1].y;
      return Math.sqrt(dx * dx + dy * dy);
    };
    var mid = function (t) { return { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 }; };
    var pts = function (tl) {
      return [{ x: tl[0].clientX, y: tl[0].clientY }, { x: tl[1].clientX, y: tl[1].clientY }];
    };
    function apply() {
      var im = img();
      if (!im) return;
      im.style.transformOrigin = 'center center';
      im.style.transform = 'translate(' + _panX + 'px,' + _panY + 'px) scale(' + _zoom + ')';
    }
    root.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        var t = pts(e.touches);
        d0 = dist(t); c0 = mid(t); z0 = _zoom; pan0 = { x: _panX, y: _panY };
        var im = img();
        if (im) {
          var r = im.getBoundingClientRect();
          org = { x: r.left + r.width / 2 - _panX, y: r.top + r.height / 2 - _panY };
        }
      } else if (e.touches.length === 1 && _zoom > 1.05) {
        pan1 = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX: _panX, panY: _panY };
      } else pan1 = null;
    }, { passive: false });

    root.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        pend = { k: 'z', t: pts(e.touches) };
        if (!raf) raf = requestAnimationFrame(step);
      } else if (e.touches.length === 1 && pan1) {
        e.preventDefault();
        pend = { k: 'p', x: e.touches[0].clientX, y: e.touches[0].clientY };
        if (!raf) raf = requestAnimationFrame(step);
      }
    }, { passive: false });

    function step() {
      raf = 0;
      var p = pend; pend = null;
      if (!p) return;
      if (p.k === 'z') {
        var d = dist(p.t), c = mid(p.t);
        if (!d0) { d0 = d; c0 = c; z0 = _zoom; pan0 = { x: _panX, y: _panY }; return; }
        var nz = Math.max(1, Math.min(5, z0 * (d / d0)));
        var ratio = nz / z0;
        if (org) {
          var vx = org.x + pan0.x, vy = org.y + pan0.y;
          _panX = pan0.x + (c.x - c0.x) + (c0.x - vx) * (1 - ratio);
          _panY = pan0.y + (c.y - c0.y) + (c0.y - vy) * (1 - ratio);
        }
        _zoom = nz;
        apply();
      } else if (p.k === 'p' && pan1) {
        _panX = pan1.panX + (p.x - pan1.x);
        _panY = pan1.panY + (p.y - pan1.y);
        apply();
      }
    }

    root.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) { d0 = 0; c0 = null; org = null; }
      if (e.touches.length === 0) {
        pan1 = null;
        /* 거의 원래 크기면 딱 맞춰 되돌린다 — 아니면 살짝 어긋난 채로 남아 스와이프가 계속 막힌다 */
        if (_zoom < 1.05) { resetZoom(); }
      }
    }, { passive: true });
    root.addEventListener('touchcancel', function () { d0 = 0; c0 = null; org = null; pan1 = null; pend = null; }, { passive: true });
  }

  /* ═══ 공개 API ═══════════════════════════════════════════ */

  /* ids: 사진 id 배열(또는 {id} 객체 배열), startId: 처음 보여줄 사진
     opts.onEdit(id): 주면 '✏️ 태그 · 메모' 버튼이 생긴다 (뷰어를 닫고 그 함수를 부른다) */
  V.open = function (ids, startId, opts) {
    var list = (ids || []).map(function (x) { return (typeof x === 'string') ? x : (x && x.id); })
                          .filter(Boolean);
    if (!list.length) return;
    _ids = list;
    _idx = Math.max(0, list.indexOf(startId));
    _warm = {};
    _onEdit = (opts && opts.onEdit) || null;
    build();
    _el.querySelector('.pvf-edit').style.display = _onEdit ? '' : 'none';
    resetZoom();
    var im = img();
    if (im) { im.style.transition = ''; im.style.opacity = '1'; im.style.transform = ''; }
    _el.style.display = 'flex';
    load(_idx);
    /* 안드로이드 뒤로가기로 닫히게 — state.js 의 팝업 스택에 올린다 */
    if (window.registerSheet) _unreg = registerSheet({ close: V.close });
    if (window.syncBodyLock) syncBodyLock();
  };

  V.close = function () {
    if (!_el || _el.style.display !== 'flex') return;
    _el.style.display = 'none';
    resetZoom();
    var im = img();
    if (im) im.removeAttribute('src');
    _warm = {};
    if (_unreg) { try { _unreg(); } catch (e) {} _unreg = null; }
    if (window.syncBodyLock) syncBodyLock();
  };

  V.isOpen = function () { return !!(_el && _el.style.display === 'flex'); };

  /* 화면 한 덩어리 안의 img[data-ph] 를 전부 뷰어에 연결한다.
     같은 덩어리 안의 사진들이 곧 넘겨볼 목록이 된다 (현장매니저가 .thumbs 단위로 묶은 것과 같다).
     ⚠️ 이미 다른 일(태그 시트 열기 등)이 걸린 사진은 건드리지 않는다 —
        opts.stop 을 주면 그 사진의 원래 클릭을 막지 않는다. */
  V.bind = function (root, opts) {
    if (!root) return;
    opts = opts || {};
    var imgs = [].slice.call(root.querySelectorAll('img[data-ph]'));
    if (!imgs.length) return;
    var ids = imgs.map(function (im) { return im.getAttribute('data-ph'); });
    imgs.forEach(function (im) {
      im.style.cursor = 'zoom-in';
      im.addEventListener('click', function (e) {
        if (opts.stop !== false) { e.preventDefault(); e.stopPropagation(); }
        V.open(ids, im.getAttribute('data-ph'), opts);
      });
    });
  };

  console.log('[Viewer] 로드됨');
})();
