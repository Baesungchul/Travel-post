/* ═══════════════════════════════════════════════════════════
   gallery.js — 사진을 폰 갤러리로 내보내기 (2026-09-08)
   ----------------------------------------------------------------
   왜 필요한가 (사용자 요청):
     모바일에서 블로그에 올릴 때 공유 시트로 사진을 넘기면, 글쓰기 화면
     **맨 위에 사진이 다 몰린다.** 결국 하나씩 끌어 내려야 했고 그게 제일
     번거로운 단계였다. 갤러리에 저장해 두면 글의 사진 표시 자리에서
     [사진] 버튼으로 꺼내 넣으면 된다.
     (현장매니저가 먼저 이 방식으로 바꿨다 — sns_share.js 의 gallery:true)

   네이티브 GallerySaver 플러그인(MediaStore)을 쓴다.
     · API 29+ : 권한 불필요, 저장 즉시 갤러리에 보인다. 앱을 지워도 사진은 남는다.
     · API 24~28 : WRITE_EXTERNAL_STORAGE 런타임 권한 1회 (매니페스트에 선언돼 있다)
   ☠️ 플러그인은 MainActivity 에서 registerPlugin 해야 붙는다. 빠지면 오류 없이
      Capacitor.Plugins.GallerySaver 가 undefined 가 된다 — 재빌드가 필요한 변경이다.

   ⚠️ 저장 순서·번호는 Photos.ordered(place) 를 따른다. 글의 사진 표시(외관 1,
      음식 2 …)와 참고 화면(preview.js renderRef)이 모두 같은 축이라야
      사장님이 짝을 맞출 수 있다 — 여기서만 순서를 바꾸지 말 것.
   ⚠️ 파일명은 ASCII 로 둔다. 한글 파일명은 기기에 따라 깨진다(share.js 와 같은 이유).
      어차피 갤러리는 썸네일만 보여 주므로 파일명은 순서 보험일 뿐이다.
   · 자동 백업(auto_backup.js, 문서 폴더)과는 별개 경로다 — 충돌하지 않는다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var G = window.Gallery = {};
  var ALBUM = '찍고쓰다';

  function isNative() {
    return !!(window.Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
  }
  function plugin() {
    return window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.GallerySaver;
  }
  G.available = function () { return isNative() && !!plugin(); };

  function b64of(src) {
    return new Promise(function (res, rej) {
      if (!src) { rej(new Error('사진이 비어 있어요')); return; }
      if (typeof src === 'string') {
        var i = src.indexOf(',');
        res(i >= 0 ? src.slice(i + 1) : src);
        return;
      }
      var fr = new FileReader();
      fr.onloadend = function () { var s = String(fr.result), j = s.indexOf(','); res(j >= 0 ? s.slice(j + 1) : s); };
      fr.onerror = function () { rej(fr.error || new Error('사진을 읽지 못했어요')); };
      fr.readAsDataURL(src);
    });
  }

  /* 한 장 저장 — src 는 Blob 또는 dataURL */
  G.saveImage = function (src, filename) {
    if (!isNative()) return Promise.reject(new Error('이 기능은 앱에서만 써요'));
    var p = plugin();
    if (!p) return Promise.reject(new Error('갤러리 플러그인 미등록 (재빌드 필요)'));
    return b64of(src).then(function (b64) {
      return p.saveImage({
        data: b64,
        filename: filename || ('photo_' + Date.now() + '.jpg'),
        album: ALBUM
      });
    }).then(function (r) { return r && r.uri; });
  };

  /* ── 한 장소(또는 여행)의 사진을 전부 갤러리로 ──
     ☠️ 순서는 Photos.ordered — 글의 사진 표시 번호와 같은 축이다. */
  G.exportPlace = async function (place) {
    if (!G.available()) {
      showToast('갤러리 저장은 앱에서만 써요', 'err');
      return { ok: 0, fail: 0 };
    }
    var list = [];
    try { list = Photos.ordered(place) || []; } catch (e) {}
    if (!list.length) { showToast('이 장소에 저장할 사진이 없어요', 'err'); return { ok: 0, fail: 0 }; }

    var tags = [];
    list.forEach(function (x) { if (x.tag && tags.indexOf(x.tag) < 0) tags.push(x.tag); });

    var ok = 0, fail = 0;
    try {
      showOverlay('갤러리에 저장 중...');
      for (var i = 0; i < list.length; i++) {
        if (typeof setProg === 'function') setProg((i / list.length) * 100, '갤러리 저장 ' + (i + 1) + '/' + list.length);
        var blob = null;
        try { blob = await Store.photoGet(list[i].id); } catch (e) {}
        if (!blob) { fail++; continue; }
        /* 파일명은 ASCII — 태그는 번호(t1,t2…)로 적는다(share.js·post.html 과 같은 규칙) */
        var ti = tags.indexOf(list[i].tag);
        var name = String(i + 1).padStart(2, '0') + '_t' + (ti >= 0 ? ti + 1 : 9) + '.jpg';
        try { await G.saveImage(blob, name); ok++; }
        catch (e) { fail++; console.warn('[갤러리] 실패:', name, e && e.message); }
        if (i % 4 === 3) await new Promise(function (r) { setTimeout(r, 0); });
      }
    } finally {
      hideOverlay();
    }
    return { ok: ok, fail: fail };
  };

  console.log('[Gallery] 로드됨' + (G.available() ? '' : ' (플러그인 없음 — 앱에서만 동작)'));
})();
