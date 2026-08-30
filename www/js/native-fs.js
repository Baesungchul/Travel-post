/* ═══════════════════════════════════════════════════════════
   native-fs.js — Capacitor(안드로이드 앱) 파일시스템 shim
   ----------------------------------------------------------------
   현장매니저 native-fs.js 이식. 마이그레이션 로직(aircon-report → work-report)은
   새 앱에 옮길 이유가 없어 걷어냈다. 폴더명은 CFG.APP_FOLDER 하나로 정해진다.

   쓰는 곳: 공유 캐시 · 백업 파일 · (v3) 갤러리 내보내기
   ⚠️ EXTERNAL = 앱 전용 외부저장소. 권한 불필요, 재설치 후 EACCES 없음.
      공용 Documents 는 스코프 저장소 때문에 재설치 시 소유권을 잃는다 — 쓰지 말 것.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var DIR = 'EXTERNAL';

  function FS() {
    var p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
    if (!p) throw new Error('Capacitor Filesystem 플러그인이 등록되지 않았습니다');
    return p;
  }
  function isNative() {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
      && window.Capacitor.isNativePlatform());
  }

  function blobToBase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onloadend = function () { var s = String(r.result), i = s.indexOf(','); res(i >= 0 ? s.slice(i + 1) : s); };
      r.onerror = function () { rej(r.error || new Error('blob 읽기 실패')); };
      r.readAsDataURL(blob);
    });
  }
  function base64ToBlob(b64, mime) {
    var bin = atob(b64 || ''), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: mime || 'application/octet-stream' });
  }

  async function ensureDir(path) {
    try { await FS().mkdir({ path: path, directory: DIR, recursive: true }); } catch (e) {}
  }
  async function writeBlob(path, blob) {
    var b64 = await blobToBase64(blob);
    await FS().writeFile({ path: path, data: b64, directory: DIR, recursive: true });
    return path;
  }
  async function readBlob(path, mime) {
    var r = await FS().readFile({ path: path, directory: DIR });
    return base64ToBlob(r.data, mime);
  }
  async function uriOf(path, dir) {
    var u = await FS().getUri({ path: path, directory: dir || DIR });
    return u && u.uri;
  }

  window.NativeFS = {
    isNative: isNative,
    DIR: DIR,
    root: function () { return CFG.APP_FOLDER; },
    ensureDir: ensureDir,
    writeBlob: writeBlob,
    readBlob: readBlob,
    uriOf: uriOf,
    blobToBase64: blobToBase64,
    base64ToBlob: base64ToBlob
  };
  console.log('[NativeFS] 로드됨, 네이티브:', isNative());
})();
