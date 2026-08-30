/* ═══════════════════════════════════════════════════════════
   exif.js — 최소 EXIF 리더 (촬영시각 + GPS)
   ----------------------------------------------------------------
   ⭐ 설계안 3장: EXIF 파싱은 **갤러리에서 불러온 사진에만** 필요하다.
      인앱 카메라 경로는 촬영 순간 기기 위치를 장소에 붙이므로 EXIF 가 필요 없다.
      (사진에 위치를 심지 않는 것이 블로거에게 오히려 안전장치다 — 3장의 이유 ①)

   그래서 이 파서는 **불러오기 보조 경로 전용**이고, 딱 두 가지만 읽는다.
      · DateTimeOriginal (0x9003) → 방문 시각 후보
      · GPSLatitude/Longitude    → 장소 좌표 후보
   라이브러리를 넣지 않는 이유: 이 둘만 필요한데 exif-js 는 40KB 다.

   ⚠️ 읽기만 한다. 사진에 EXIF 를 **쓰지 않는다.**
      앱이 저장하는 사진은 canvas 를 거치므로 EXIF 가 애초에 없다 — 그게 의도다.
   ⚠️ 실패는 조용히 null 이다. EXIF 는 기기·앱마다 빠지거나 튄다(특히 실내·메신저로 받은 사진).
      값이 없다고 불러오기가 막히면 안 된다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function readHead(file, bytes) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(new DataView(r.result)); };
      r.onerror = function () { rej(r.error || new Error('읽기 실패')); };
      r.readAsArrayBuffer(file.slice(0, bytes || 262144));   // 앞 256KB 면 APP1 은 다 들어온다
    });
  }

  /* JPEG 마커를 훑어 APP1(Exif) 세그먼트 위치를 찾는다 */
  function findApp1(v) {
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return -1;   // SOI 아님 = JPEG 아님
    var off = 2;
    while (off + 4 < v.byteLength) {
      if (v.getUint8(off) !== 0xFF) return -1;
      var marker = v.getUint8(off + 1);
      var size = v.getUint16(off + 2);
      if (marker === 0xE1) {
        /* "Exif\0\0" 확인 */
        if (off + 10 < v.byteLength && v.getUint32(off + 4) === 0x45786966) return off + 10;
        return -1;
      }
      if (marker === 0xDA) return -1;    // SOS — 여기부터 이미지 데이터
      off += 2 + size;
    }
    return -1;
  }

  function parseIfd(v, tiff, dirStart, le, want, out) {
    if (dirStart + 2 > v.byteLength) return;
    var n = v.getUint16(dirStart, le);
    for (var i = 0; i < n; i++) {
      var e = dirStart + 2 + i * 12;
      if (e + 12 > v.byteLength) return;
      var tag = v.getUint16(e, le);
      if (!want[tag]) continue;
      var type = v.getUint16(e + 2, le);
      var count = v.getUint32(e + 4, le);
      var valOff = (sizeOf(type) * count <= 4) ? (e + 8) : (tiff + v.getUint32(e + 8, le));
      out[tag] = readVal(v, valOff, type, count, le);
    }
  }
  function sizeOf(t) { return [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][t] || 0; }
  function readVal(v, off, type, count, le) {
    try {
      if (type === 2) {              // ASCII
        var s = '';
        for (var i = 0; i < count - 1; i++) s += String.fromCharCode(v.getUint8(off + i));
        return s;
      }
      if (type === 5 || type === 10) {   // RATIONAL
        var out = [];
        for (var j = 0; j < count; j++) {
          var num = le ? v.getUint32(off + j * 8, true) : v.getUint32(off + j * 8);
          var den = le ? v.getUint32(off + j * 8 + 4, true) : v.getUint32(off + j * 8 + 4);
          out.push(den ? num / den : 0);
        }
        return out;
      }
      if (type === 3) return v.getUint16(off, le);
      if (type === 4) return v.getUint32(off, le);
    } catch (e) {}
    return null;
  }

  function dms(a, ref) {
    if (!a || a.length < 3) return null;
    var d = a[0] + a[1] / 60 + a[2] / 3600;
    if (ref === 'S' || ref === 'W') d = -d;
    return d;
  }

  /* File → { at: 'YYYY-MM-DDTHH:MM' | null, geo: {lat,lng} | null } */
  function read(file) {
    return readHead(file).then(function (v) {
      var app1 = findApp1(v);
      if (app1 < 0) return { at: null, geo: null };
      var tiff = app1;
      var le = (v.getUint16(tiff) === 0x4949);            // 'II' = little endian
      if (v.getUint16(tiff + 2, le) !== 0x002A) return { at: null, geo: null };
      var ifd0 = tiff + v.getUint32(tiff + 4, le);

      var main = {};
      /* 0x8769 = ExifIFD 포인터, 0x8825 = GPSIFD 포인터, 0x0132 = DateTime(폴백) */
      parseIfd(v, tiff, ifd0, le, { 0x8769: 1, 0x8825: 1, 0x0132: 1 }, main);

      var ex = {}, gps = {};
      if (main[0x8769]) parseIfd(v, tiff, tiff + main[0x8769], le, { 0x9003: 1 }, ex);
      if (main[0x8825]) parseIfd(v, tiff, tiff + main[0x8825], le,
        { 0x0001: 1, 0x0002: 1, 0x0003: 1, 0x0004: 1 }, gps);

      /* 'YYYY:MM:DD HH:MM:SS' → 'YYYY-MM-DDTHH:MM' (input[type=datetime-local] 형식) */
      var raw = ex[0x9003] || main[0x0132] || '';
      var at = null;
      var m = String(raw).match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/);
      if (m) at = m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5];

      var lat = dms(gps[0x0002], gps[0x0001]);
      var lng = dms(gps[0x0004], gps[0x0003]);
      var geo = (lat != null && lng != null && (lat || lng)) ? { lat: lat, lng: lng, at: Date.now(), src: 'exif' } : null;

      return { at: at, geo: geo };
    }).catch(function () { return { at: null, geo: null }; });
  }

  window.Exif = { read: read };
})();
