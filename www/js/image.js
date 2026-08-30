/* ═══════════════════════════════════════════════════════════
   image.js — 이미지 최적화 (리사이즈 + 압축)
   ----------------------------------------------------------------
   현장매니저 image.js 이식. **한 가지를 바꿨다.**

   ☠️ 현장매니저는 모든 사진을 가로 4:3 으로 중앙 크롭했다(보고서 사진 칸 비율).
      여행·맛집에서 그대로 쓰면 안 된다:
        · 음식 사진은 위에서 내려찍은 정사각/세로가 표준이다
        · 인스타 피드는 4:5(세로), 스토리는 9:16
        · 풍경은 가로, 건물·메뉴판은 세로
      가로 4:3 고정은 접시 가장자리와 메뉴판 아래를 잘라 먹는다.
   → **원본 비율을 그대로 둔다.** 크롭은 하지 않고 긴 변만 줄인다.
      비율은 촬영할 때 카메라에서 고른다(camera.js).
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var IMG_MAX_PX  = 1600;   // 블로그 본문에 충분하고 저장도 가볍다
  var IMG_QUALITY = 0.82;

  /* File/Blob → { blob, dataUrl, w, h, origKB, newKB } */
  function compressImage(file, maxPx, quality) {
    maxPx = maxPx || IMG_MAX_PX;
    quality = quality || IMG_QUALITY;
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          var origKB = Math.round(ev.target.result.length * 0.75 / 1024);
          var sc = Math.min(1, maxPx / Math.max(w, h));
          var outW = Math.max(1, Math.round(w * sc));
          var outH = Math.max(1, Math.round(h * sc));

          var cv = document.createElement('canvas');
          cv.width = outW; cv.height = outH;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, outW, outH);
          ctx.drawImage(img, 0, 0, outW, outH);

          var dataUrl = cv.toDataURL('image/jpeg', quality);
          var newKB = Math.round(dataUrl.length * 0.75 / 1024);
          dataUrlToBlob(dataUrl).then(function (blob) {
            resolve({ blob: blob, dataUrl: dataUrl, w: outW, h: outH, origKB: origKB, newKB: newKB });
          });
        };
        img.onerror = function () {
          resolve({ blob: file, dataUrl: ev.target.result, w: 0, h: 0, origKB: 0, newKB: 0 });
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function dataUrlToBlob(u) {
    return fetch(u).then(function (r) { return r.blob(); }).catch(function () {
      /* fetch(data:) 가 막힌 환경 폴백 */
      var s = String(u), i = s.indexOf(',');
      var bin = atob(s.slice(i + 1));
      var arr = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      return new Blob([arr], { type: 'image/jpeg' });
    });
  }

  /* 공유·업로드용 축소 — 원본을 건드리지 않고 사본만 줄인다 */
  function shrinkBlob(blob, maxDim, q) {
    return new Promise(function (res) {
      var done = false, fin = function (v) { if (!done) { done = true; res(v); } };
      setTimeout(function () { fin(blob); }, 8000);   // 못 줄이면 원본으로 진행
      try {
        var u = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.width, h = img.height, sc = Math.min(1, maxDim / Math.max(w, h));
            if (sc >= 1) { try { URL.revokeObjectURL(u); } catch (e) {} fin(blob); return; }
            var cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(w * sc));
            cv.height = Math.max(1, Math.round(h * sc));
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            try { URL.revokeObjectURL(u); } catch (e) {}
            if (cv.toBlob) cv.toBlob(function (b) { fin(b && b.size ? b : blob); }, 'image/jpeg', q || 0.82);
            else fin(blob);
          } catch (e) { fin(blob); }
        };
        img.onerror = function () { try { URL.revokeObjectURL(u); } catch (e) {} fin(blob); };
        img.src = u;
      } catch (e) { fin(blob); }
    });
  }

  window.Img = {
    compress: compressImage,
    dataUrlToBlob: dataUrlToBlob,
    shrink: shrinkBlob,
    MAX_PX: IMG_MAX_PX
  };
  window.compressImage = compressImage;
})();
