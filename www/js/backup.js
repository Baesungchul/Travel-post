/* ═══════════════════════════════════════════════════════════
   backup.js — 로컬 백업 / 복구  (ZIP 한 개)
   ----------------------------------------------------------------
   ⭐ 왜 로그인보다 이걸 먼저 만드는가
      이 앱의 핵심 자산은 사진이고, 사진은 지금 이 기기 안에만 있다.
      Firebase 키가 아직 없어도 **유실을 막는 길은 지금 있어야 한다.**
      그래서 이 파일은 서버 없이 완결된다. 클라우드 백업(cloud.js)은 그 위에 얹는다.

   ZIP 구조
     backup.json          앱·버전·내보낸 시각 + 설정(localStorage) + 장소 + 글 + 여행 + 일정
     photos/<photoId>.jpg 사진 원본
   ⚠️ 스토어를 새로 만들면 **여기에도 넣어야 한다.** 안 넣으면 백업이 조용히 그것만 빠뜨린다
      (2026-08-28 여행·일정을 추가하면서 실제로 빠뜨릴 뻔했다).

   ☠️ 복구는 기본이 **합치기(비파괴)** 다.
      현장매니저에서 배운 것: 덮어쓰기가 기본이면 사용자가 실수 한 번에 전부 잃는다.
      · 합치기 — 같은 id 가 이미 있으면 건드리지 않는다. 없는 것만 채운다.
      · 덮어쓰기 — 사용자가 명시적으로 고를 때만. 그때도 지우지는 않고 같은 id 를 갈아끼운다.
      어느 쪽이든 **기존 데이터를 통째로 지우는 경로는 없다.**

   ⚠️ 파일명은 ASCII 로 둔다 — 크로뮴은 <a download> 에 한글이 들어가면 무시하고
      확장자도 없는 'download' 로 저장한다(현장매니저 2026-08-27 실측).
   ⚠️ JSZip 은 누를 때 받는다 — 앱 시작을 무겁게 하지 않는다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* 백업 파일 형식 번호. 구조를 바꾸면 올린다.
       1 — 설정 + 장소 + 글
       2 — 여행(trips) · 일정(plans) 추가 (2026-08-28)
     ⚠️ 옛 백업(fmt 1)도 그대로 읽힌다 — 없는 배열은 빈 배열로 본다. */
  var FMT = 2;

  function loadJszip() {
    return new Promise(function (res, rej) {
      if (window.JSZip) { res(); return; }
      var sc = document.createElement('script');
      sc.src = './js/jszip.min.js';
      sc.onload = function () { window.JSZip ? res() : rej(new Error('JSZip 로드 실패')); };
      sc.onerror = function () { rej(new Error('JSZip 로드 실패')); };
      document.head.appendChild(sc);
    });
  }

  /* 이 앱이 쓰는 localStorage 값 전부 (접두사로 구분 — 현장매니저 키와 안 섞인다) */
  function dumpSettings() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(CFG.LS_PREFIX) === 0) out[k] = localStorage.getItem(k);
      }
    } catch (e) {}
    return out;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function stamp() {
    var d = new Date();
    return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
           '_' + pad2(d.getHours()) + pad2(d.getMinutes());
  }

  /* ═══ 내보내기 ═══════════════════════════════════════════ */
  async function exportZip() {
    await loadJszip();
    showOverlay('백업 만드는 중...');
    try {
      var places = await Store.placeAll();
      var posts = await Store.postAll();
      var trips = await Store.tripAll();
      var plans = await Store.planAll();
      var zip = new JSZip();
      var dir = zip.folder('photos');

      var total = places.reduce(function (n, p) { return n + (p.photos || []).length; }, 0);
      var done = 0, missing = 0;

      for (var i = 0; i < places.length; i++) {
        var ph = places[i].photos || [];
        for (var j = 0; j < ph.length; j++) {
          setProg((done / Math.max(1, total)) * 100, '사진 모으는 중 ' + (done + 1) + '/' + total);
          done++;
          var r = null;
          try { r = await Photos.resolvePhoto(ph[j].id); } catch (e) {}
          if (!r || !r.blob) { missing++; continue; }
          dir.file(ph[j].id + '.jpg', r.blob);
          if (done % 8 === 0) await new Promise(function (res) { setTimeout(res, 0); });
        }
      }

      zip.file('backup.json', JSON.stringify({
        app: CFG.APP_ID, appName: CFG.APP_NAME, fmt: FMT,
        appVersion: window.APP_VERSION, exportedAt: new Date().toISOString(),
        counts: { places: places.length, posts: posts.length, photos: total - missing,
                  trips: trips.length, plans: plans.length },
        settings: dumpSettings(),
        places: places,
        posts: posts,
        trips: trips,
        plans: plans
      }, null, 1));

      setProg(96, '압축하는 중...');
      /* 사진은 이미 JPEG 이라 다시 압축해도 안 줄어든다 — STORE 로 빠르게 묶기만 한다 */
      var blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      hideOverlay();
      return { blob: blob, name: 'travelpost_backup_' + stamp() + '.zip',
               places: places.length, photos: total - missing, missing: missing,
               trips: trips.length, plans: plans.length };
    } catch (e) {
      hideOverlay();
      throw e;
    }
  }

  /* 저장 — 앱이면 공유시트로 내보내고(사용자가 드라이브·카톡 등으로 보냄), 웹이면 다운로드 */
  async function saveOut(res) {
    var native = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
    var FS = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Filesystem;
    var SH = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Share;
    if (native && FS && SH) {
      var b64 = await NativeFS.blobToBase64(res.blob);
      var path = 'backup/' + res.name;
      await FS.writeFile({ path: path, data: b64, directory: 'CACHE', recursive: true });
      var u = await FS.getUri({ path: path, directory: 'CACHE' });
      await SH.share({ files: [u.uri], dialogTitle: '백업 파일 보내기' });
      return;
    }
    var url = URL.createObjectURL(res.blob);
    var a = document.createElement('a');
    a.href = url; a.download = res.name;          /* ⚠️ ASCII 파일명 */
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 10000);
  }

  /* ═══ 읽어보기 (복구 전 미리보기) ═══════════════════════ */
  async function inspect(file) {
    await loadJszip();
    var zip = await JSZip.loadAsync(file);
    var f = zip.file('backup.json');
    if (!f) throw new Error('이 파일에는 backup.json 이 없습니다 — 이 앱의 백업이 아닙니다');
    var meta = JSON.parse(await f.async('string'));
    if (!meta || !Array.isArray(meta.places)) throw new Error('백업 내용을 읽지 못했습니다');
    if ((meta.fmt || 1) > FMT) throw new Error('이 백업은 더 새 버전에서 만든 것입니다 — 앱을 먼저 업데이트해 주세요');
    return { zip: zip, meta: meta };
  }

  /* ═══ 복구 ═══════════════════════════════════════════════
     mode: 'merge'(기본, 비파괴) | 'overwrite'(같은 id 를 갈아끼움) */
  async function restore(zip, meta, mode) {
    mode = mode || 'merge';
    showOverlay('복구하는 중...');
    var added = { places: 0, posts: 0, photos: 0, trips: 0, plans: 0, skipped: 0 };
    try {
      /* 설정(카테고리 프로필·지침·교정 학습) — 합치기면 **없는 키만** 채운다 */
      var st = meta.settings || {};
      Object.keys(st).forEach(function (k) {
        if (k.indexOf(CFG.LS_PREFIX) !== 0) return;      // 남의 키는 절대 안 쓴다
        try {
          if (mode === 'merge' && localStorage.getItem(k) !== null) return;
          localStorage.setItem(k, st[k]);
        } catch (e) {}
      });

      /* 사진 */
      var dir = zip.folder('photos');
      var files = [];
      dir.forEach(function (rel, f) { if (!f.dir) files.push({ rel: rel, f: f }); });
      for (var i = 0; i < files.length; i++) {
        setProg((i / Math.max(1, files.length)) * 90, '사진 되돌리는 중 ' + (i + 1) + '/' + files.length);
        var id = files[i].rel.replace(/\.jpg$/i, '');
        var exists = await Store.photoGet(id);
        if (exists && mode === 'merge') { added.skipped++; continue; }
        var blob = await files[i].f.async('blob');
        await Store.photoPut({ id: id, placeId: '', blob: blob, at: Date.now() });
        added.photos++;
        if (i % 8 === 7) await new Promise(function (r) { setTimeout(r, 0); });
      }

      /* 장소 · 글 */
      setProg(94, '기록 되돌리는 중...');
      for (var a = 0; a < meta.places.length; a++) {
        var pl = meta.places[a];
        var cur = await Store.placeGet(pl.id);
        if (cur && mode === 'merge') { added.skipped++; continue; }
        await Store.placePut(pl);
        added.places++;
        /* 사진 레코드의 placeId 를 이 장소로 되돌린다 (위에서는 빈 값으로 넣었다) */
        for (var b = 0; b < (pl.photos || []).length; b++) {
          var rec = await Store.photoGet(pl.photos[b].id);
          if (rec && !rec.placeId) { rec.placeId = pl.id; await Store.photoPut(rec); }
        }
      }
      var posts = meta.posts || [];
      for (var c = 0; c < posts.length; c++) {
        var ex = await Store.postGet(posts[c].id);
        if (ex && mode === 'merge') { added.skipped++; continue; }
        await Store.postPut(posts[c]);
        added.posts++;
      }

      /* 여행 · 일정 (fmt 1 백업에는 없다 — 빈 배열로 본다) */
      var trips = meta.trips || [];
      for (var t1 = 0; t1 < trips.length; t1++) {
        if (await Store.tripGet(trips[t1].id) && mode === 'merge') { added.skipped++; continue; }
        await Store.tripPut(trips[t1]); added.trips++;
      }
      var plans = meta.plans || [];
      for (var q1 = 0; q1 < plans.length; q1++) {
        if (await Store.planGet(plans[q1].id) && mode === 'merge') { added.skipped++; continue; }
        await Store.planPut(plans[q1]); added.plans++;
      }

      hideOverlay();
      return added;
    } catch (e) {
      hideOverlay();
      throw e;
    }
  }

  /* ═══ 화면 ═══════════════════════════════════════════════ */
  function openSheet() {
    var ov = overlay({
      title: '💾 백업 / 복구',
      body:
        '<div class="mini">사진과 기록을 <b>ZIP 파일 하나</b>로 내보냅니다. 서버가 없어도 지금 바로 됩니다.</div>' +
        '<div class="btn-row" style="margin:12px 0;">' +
          '<button class="btn primary" id="bkExport">⬇ 백업 만들기</button>' +
          '<button class="btn ghost" id="bkImport">⬆ 복구하기</button>' +
        '</div>' +
        '<div id="bkInfo" class="mini"></div>' +
        '<div class="notice">사진이 많으면 파일이 큽니다. 만든 백업은 <b>기기 밖</b>(드라이브·PC·메일)에 두세요 — ' +
        '기기 안에만 두면 기기를 잃을 때 같이 사라집니다.</div>' +
        '<input type="file" id="bkFile" accept=".zip,application/zip" style="display:none">'
    });

    Store.estimate().then(function (e) {
      if (!e) return;
      ov.querySelector('#bkInfo').textContent = '지금 저장된 용량 약 ' + (e.usage / 1048576).toFixed(1) + ' MB';
    });

    ov.querySelector('#bkExport').onclick = function () {
      exportZip().then(function (res) {
        return saveOut(res).then(function () {
          showToast('백업 완료 — 장소 ' + res.places + '곳 · 사진 ' + res.photos + '장' +
                    (res.missing ? ' (' + res.missing + '장은 읽지 못함)' : ''), 'ok');
        });
      }).catch(function (e) { showToast('백업 실패: ' + e.message, 'err'); });
    };

    ov.querySelector('#bkImport').onclick = function () {
      var f = ov.querySelector('#bkFile');
      f.value = '';
      f.onchange = function () {
        if (!f.files || !f.files[0]) return;
        inspect(f.files[0]).then(function (r) {
          ov.close();
          confirmRestore(r.zip, r.meta);
        }).catch(function (e) { showToast(e.message, 'err'); });
      };
      f.click();
    };
  }

  function confirmRestore(zip, meta) {
    var c = meta.counts || {};
    var ov = overlay({
      title: '복구할까요?',
      body:
        '<div class="box">' +
          '<div class="mini">만든 시각 <b>' + esc(new Date(meta.exportedAt).toLocaleString('ko-KR')) + '</b></div>' +
          '<div class="mini">장소 ' + (c.places || meta.places.length) + '곳 · 사진 ' + (c.photos || '?') +
            '장 · 글 ' + (c.posts || (meta.posts || []).length) + '개' +
            ' · 여행 ' + ((meta.trips || []).length) + '개 · 일정 ' + ((meta.plans || []).length) + '개</div>' +
        '</div>' +
        '<label class="chk"><input type="radio" name="bkMode" value="merge" checked>' +
          '<span><b>합치기</b> — 지금 있는 것은 그대로 두고 <b>없는 것만</b> 채웁니다 (권장)</span></label>' +
        '<label class="chk"><input type="radio" name="bkMode" value="overwrite">' +
          '<span><b>덮어쓰기</b> — 같은 기록이 있으면 백업 쪽으로 갈아끼웁니다</span></label>' +
        '<div class="notice">어느 쪽이든 <b>지금 있는 기록을 지우지는 않습니다.</b></div>',
      foot: '<button class="btn ghost" id="rsCancel">취소</button>' +
            '<button class="btn primary" id="rsGo">복구</button>'
    });
    ov.querySelector('#rsCancel').onclick = ov.close;
    ov.querySelector('#rsGo').onclick = function () {
      var mode = ov.querySelector('input[name=bkMode]:checked').value;
      ov.close();
      restore(zip, meta, mode).then(function (a) {
        showToast('복구 완료 — 장소 ' + a.places + ' · 사진 ' + a.photos + ' · 글 ' + a.posts +
                  ' · 여행 ' + a.trips + ' · 일정 ' + a.plans +
                  (a.skipped ? ' (' + a.skipped + '건은 이미 있어 건너뜀)' : ''), 'ok');
        Place.clear();
        UI.refresh();
      }).catch(function (e) { showToast('복구 실패: ' + e.message, 'err'); });
    };
  }

  window.Backup = {
    openSheet: openSheet,
    exportZip: exportZip, saveOut: saveOut,
    inspect: inspect, restore: restore,
    dumpSettings: dumpSettings, FMT: FMT
  };
})();
