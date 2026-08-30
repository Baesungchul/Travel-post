/* ═══════════════════════════════════════════════════════════
   camera.js — 앱 내장 카메라
   ----------------------------------------------------------------
   현장매니저 camera.js 이식. 세 가지가 다르다.

   ① 비율 고정 → **비율 선택**
      현장매니저는 보고서 사진 칸에 맞춰 가로 4:3 으로 고정했다.
      맛집·여행에서는 세로와 정사각이 더 많이 쓰인다(음식 위에서, 메뉴판, 인스타 4:5).
      → 4:5(세로) / 1:1 / 4:3(가로) / 3:4 중에서 고른다. 기본은 4:5.
   ② 촬영 전에 **사진 태그**를 고른다 (외관/내부/음식/메뉴판 …)
      카테고리 프로필의 태그 세트가 그대로 상단 칩으로 뜬다.
      이 태그가 뒤에서 글 마커·공유 순서·파일명까지 관통한다.
   ③ 촬영 순간 **기기 위치를 한 번 읽어 장소에 붙인다** (설계안 3장)
      사진에는 위치를 심지 않는다 — 블로그에 올려도 집·동선이 안 남는다.
      이미 위치가 잡힌 장소면 다시 읽지 않는다.

   ⚠️ 셔터를 누르면 즉시 카메라를 닫고 첨부는 뒤에서 한다(체감 지연 제거) — 원본과 같다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var stream = null, videoEl = null, overlayEl = null;
  var facing = 'environment', capturing = false;
  var curTag = '';

  var RES_KEY   = CFG.k('cam_res_v1');
  var RATIO_KEY = CFG.k('cam_ratio_v1');

  var RATIOS = {
    '4:5': { r: 4 / 5,  label: '4:5 세로', hint: '인스타 피드' },
    '1:1': { r: 1,      label: '1:1 정사각', hint: '음식' },
    '3:4': { r: 3 / 4,  label: '3:4 세로', hint: '메뉴판·건물' },
    '4:3': { r: 4 / 3,  label: '4:3 가로', hint: '풍경' }
  };
  var RATIO_ORDER = ['4:5', '1:1', '3:4', '4:3'];
  var DEF_RATIO = '4:5';

  /* 긴 변 기준 해상도 (비율에 맞춰 계산한다 — 원본은 고정 W×H 였다) */
  var RES = {
    std:   { long: 1280, label: '표준',   short: '표준' },
    high:  { long: 1600, label: '고화질', short: '고화질' },
    ultra: { long: 2048, label: '최고화질', short: '최고' }
  };
  var RES_ORDER = ['std', 'high', 'ultra'];

  function getRatioKey() {
    var k; try { k = localStorage.getItem(RATIO_KEY); } catch (e) {}
    return RATIOS[k] ? k : DEF_RATIO;
  }
  function getResKey() {
    var k; try { k = localStorage.getItem(RES_KEY); } catch (e) {}
    return RES[k] ? k : 'std';
  }
  function outSize() {
    var r = RATIOS[getRatioKey()].r;       // 가로/세로
    var L = RES[getResKey()].long;
    return (r >= 1) ? { w: L, h: Math.round(L / r) } : { w: Math.round(L * r), h: L };
  }

  function ensureDom() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.id = 'camOverlay';
    overlayEl.className = 'ov-lock';
    overlayEl.innerHTML =
      '<div id="camStage"><video id="camVideo" playsinline autoplay muted></video>' +
        '<div id="camGuide"></div></div>' +
      '<div class="cam-top">' +
        '<button id="camClose" type="button" class="cam-rnd">✕</button>' +
        '<button id="camRatio" type="button" class="cam-pill">4:5</button>' +
        '<button id="camRes" type="button" class="cam-pill">표준</button>' +
        '<button id="camFlip" type="button" class="cam-rnd">🔄</button>' +
      '</div>' +
      '<div class="cam-tags" id="camTags"></div>' +
      '<div class="cam-bot">' +
        '<div class="cam-count" id="camCount"></div>' +
        '<button id="camShot" type="button" aria-label="촬영"></button>' +
        '<button id="camDone" type="button" class="cam-done">완료</button>' +
      '</div>';
    document.body.appendChild(overlayEl);

    videoEl = overlayEl.querySelector('#camVideo');
    overlayEl.querySelector('#camShot').addEventListener('click', capture);
    overlayEl.querySelector('#camClose').addEventListener('click', close);
    overlayEl.querySelector('#camDone').addEventListener('click', close);
    overlayEl.querySelector('#camFlip').addEventListener('click', flip);
    overlayEl.querySelector('#camRatio').addEventListener('click', function () { menu('ratio'); });
    overlayEl.querySelector('#camRes').addEventListener('click', function () { menu('res'); });
  }

  function closeMenu() {
    var m = overlayEl && overlayEl.querySelector('.cam-menu');
    if (m) m.remove();
  }
  function menu(kind) {
    if (!overlayEl) return;
    var ex = overlayEl.querySelector('.cam-menu');
    if (ex) { var was = ex.getAttribute('data-kind'); ex.remove(); if (was === kind) return; }
    var order = (kind === 'ratio') ? RATIO_ORDER : RES_ORDER;
    var cur = (kind === 'ratio') ? getRatioKey() : getResKey();
    var el = document.createElement('div');
    el.className = 'cam-menu';
    el.setAttribute('data-kind', kind);
    el.innerHTML = order.map(function (k) {
      var it = (kind === 'ratio') ? RATIOS[k] : RES[k];
      var right = (kind === 'ratio') ? it.hint : (function () {
        var s = (function () { var r = RATIOS[getRatioKey()].r, L = it.long;
          return (r >= 1) ? { w: L, h: Math.round(L / r) } : { w: Math.round(L * r), h: L }; })();
        return s.w + '×' + s.h;
      })();
      return '<div class="cam-opt' + (k === cur ? ' on' : '') + '" data-k="' + k + '">' +
        '<span>' + (kind === 'ratio' ? it.label : it.label) + '</span><span>' + right + (k === cur ? ' ✓' : '') + '</span></div>';
    }).join('');
    overlayEl.appendChild(el);
    el.querySelectorAll('.cam-opt').forEach(function (o) {
      o.onclick = function () {
        var k = o.getAttribute('data-k');
        try { localStorage.setItem(kind === 'ratio' ? RATIO_KEY : RES_KEY, k); } catch (e) {}
        closeMenu(); syncBtns(); applyStageRatio(); startStream();
      };
    });
  }

  function syncBtns() {
    if (!overlayEl) return;
    overlayEl.querySelector('#camRatio').textContent = getRatioKey();
    var s = outSize();
    overlayEl.querySelector('#camRes').textContent = RES[getResKey()].short + ' ' + s.w + '×' + s.h;
  }
  function applyStageRatio() {
    var st = overlayEl && overlayEl.querySelector('#camStage');
    if (st) st.style.aspectRatio = getRatioKey().replace(':', '/');
  }

  function renderTags() {
    var box = overlayEl.querySelector('#camTags');
    var tags = Place.tags();
    if (!curTag || tags.indexOf(curTag) < 0) curTag = tags[0];
    box.innerHTML = tags.map(function (t) {
      return '<button type="button" class="cam-tag' + (t === curTag ? ' on' : '') + '" data-t="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('');
    box.querySelectorAll('.cam-tag').forEach(function (b) {
      b.onclick = function () { curTag = b.getAttribute('data-t'); renderTags(); };
    });
  }
  function renderCount() {
    var p = Place.current();
    var n = (p && p.photos ? p.photos.length : 0);
    var el = overlayEl.querySelector('#camCount');
    if (el) el.textContent = n ? (n + '장') : '';
  }

  async function startStream() {
    stopStream();
    var s = outSize();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width:  { ideal: Math.max(s.w, s.h) * 1.6 },
          height: { ideal: Math.max(s.w, s.h) * 1.6 }
        }
      });
      videoEl.srcObject = stream;
      videoEl.style.transform = (facing === 'user') ? 'scaleX(-1)' : 'none';
      await videoEl.play().catch(function () {});
    } catch (e) {
      showToast('카메라를 열 수 없어요. 권한을 확인해주세요.', 'err');
      close();
    }
  }
  function stopStream() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  }
  function flip() { facing = (facing === 'user') ? 'environment' : 'user'; startStream(); }

  function capture() {
    if (capturing) return;
    var vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    if (!vw || !vh) { showToast('카메라 준비 중이에요. 잠시 후 다시 눌러주세요.'); return; }
    capturing = true;

    var out = outSize();
    var TARGET = out.w / out.h;
    var sw = vw, sh = vh, sx = 0, sy = 0;
    var cur = vw / vh;
    if (cur > TARGET) { sw = Math.round(vh * TARGET); sx = Math.round((vw - sw) / 2); }
    else if (cur < TARGET) { sh = Math.round(vw / TARGET); sy = Math.round((vh - sh) / 2); }

    var cv = document.createElement('canvas');
    cv.width = out.w; cv.height = out.h;
    var c = cv.getContext('2d');
    if (facing === 'user') { c.translate(out.w, 0); c.scale(-1, 1); }   // 전면 좌우 반전 보정
    c.drawImage(videoEl, sx, sy, sw, sh, 0, 0, out.w, out.h);
    var dataUrl = cv.toDataURL('image/jpeg', 0.88);

    var tag = curTag;
    capturing = false;

    /* 셔터 피드백만 주고 카메라는 열어 둔다 — 한 장소에서 여러 장을 연달아 찍는다 */
    flash();
    Photos.addFromDataUrl(dataUrl, tag).then(function () {
      renderCount();
      try { if (window.UI && UI.renderNow) UI.renderNow(); } catch (e) {}
    }).catch(function (e) { showToast('사진 저장 실패: ' + e.message, 'err'); });

    /* ⭐ 위치는 장소에 붙인다 — 사진에는 심지 않는다 (설계안 3장) */
    ensureGeo();
  }

  function flash() {
    var f = document.createElement('div');
    f.className = 'cam-flash';
    overlayEl.appendChild(f);
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 180);
  }

  var _geoTried = false;
  function ensureGeo() {
    var p = Place.current();
    if (!p || p.geo || _geoTried) return;
    _geoTried = true;
    Geo.read().then(function (g) {
      var pl = Place.current();
      if (!pl || pl.geo) return;
      pl.geo = g;
      return Geo.reverse(g).then(function (addr) {
        if (addr && !pl.address) {
          pl.address = addr;
          pl.area = Categories.areaOf(addr);
        }
        return Place.save();
      });
    }).then(function () {
      try { if (window.UI && UI.renderNow) UI.renderNow(); } catch (e) {}
    }).catch(function (e) {
      console.warn('[위치]', e && e.message);
    });
  }

  function close() {
    stopStream();
    closeMenu();
    if (overlayEl) { overlayEl.style.display = 'none'; syncBodyLock(); }
    capturing = false;
    try { if (window.UI && UI.renderNow) UI.renderNow(); } catch (e) {}
  }

  window.isInAppCameraOpen = function () {
    return !!(overlayEl && overlayEl.style.display === 'flex');
  };
  window.closeInAppCamera = close;

  /* 외부 진입점 — 지금 탭의 촬영 버튼이 부른다. tag 를 주면 그 태그로 시작한다. */
  window.openInAppCamera = function (tag) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('이 기기에서는 카메라를 사용할 수 없어요.', 'err');
      return;
    }
    if (!Place.current()) Place.create();
    curTag = tag || '';
    _geoTried = false;
    ensureDom();
    syncBtns(); applyStageRatio(); renderTags(); renderCount();
    overlayEl.style.display = 'flex';
    syncBodyLock();
    startStream();
    ensureGeo();      // 첫 장을 찍기 전에 미리 잡아 둔다 (실내는 느리다)
  };
})();
