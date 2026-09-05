/* ═══════════════════════════════════════════════════════════
   auto_backup.js — 폰 저장소로 자동 증분 백업 (사용자 지시 2026-09-05)
   ----------------------------------------------------------------
   ☠️ 왜: 현장매니저에서 사진 1,059장을 잃은 적이 있다. 이 앱은 더 위험했다 —
      백업이 전부 '직접 눌러야 하는' 것이라 안 누르면 아무 일도 안 일어났다.

   ★ 사용자 지시: **서버(클라우드) 백업은 쓰지 않는다. 폰 저장소에만 백업한다.**
     현장매니저와 같은 방식 — 앱이 백그라운드로 갈 때마다 바뀐 것만 복사한다.

   저장 위치:  DOCUMENTS/jjikgo-backups/auto/
                 backup.json        ← 장소·글·여행·일정·설정 (작다, 매번 새로 쓴다)
                 photos/<id>.jpg    ← 사진 (없을 때만 쓴다 = 증분)
   ☠️ DOCUMENTS 를 쓰는 이유: EXTERNAL(앱 전용 외부저장소)은 **앱을 지우면 안드로이드가
      통째로 지운다.** 백업이 앱과 같이 죽으면 백업이 아니다(현장매니저에서 같은 이유로 DOCUMENTS 를 쓴다).

   ⚠️ 폴더 구조를 ZIP 백업과 **똑같이** 맞춰 뒀다(backup.json + photos/).
      그래서 복구는 새로 짜지 않고, 폴더를 그대로 ZIP 으로 싸서 기존 Backup.restore() 에 넘긴다.
      백업 형식을 바꾸면 backup.js 와 여기를 같이 고쳐야 한다.

   ⚠️ 지우지는 않는다. 앱에서 사진을 지워도 백업본은 남긴다 —
      '지운 것까지 따라 지우는 백업' 은 실수를 되돌릴 수 없게 만든다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var A = window.AutoBackup = {};

  var BASE = 'jjikgo-backups/auto';
  var DIR = 'DOCUMENTS';
  var OFF_LS = function () { return CFG.k('auto_backup_off'); };
  var STATE_LS = function () { return CFG.k('auto_backup_state'); };
  var MIN_GAP_MS = 60 * 1000;        /* 너무 잦은 연속 실행 방지 */
  var STALE_MS = 3 * 24 * 60 * 60 * 1000;   /* 이만큼 밀리면 화면에 적는다 */

  function FS() {
    var p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
    return p || null;
  }
  function isNative() {
    try { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }
    catch (e) { return false; }
  }
  /* 폰이 아니면(브라우저 미리보기) 쓸 수 없다 — 못 하는 것을 되는 척하지 않는다 */
  A.available = function () { return isNative() && !!FS(); };

  A.enabled = function () {
    try { return localStorage.getItem(OFF_LS()) !== '1'; } catch (e) { return true; }   /* 기본 켬 */
  };
  A.setEnabled = function (on) {
    try { on ? localStorage.removeItem(OFF_LS()) : localStorage.setItem(OFF_LS(), '1'); } catch (e) {}
  };

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_LS()) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveState(s) { try { localStorage.setItem(STATE_LS(), JSON.stringify(s)); } catch (e) {} }
  A.status = function () { return loadState(); };

  /* 마지막 백업이 얼마나 됐나 */
  A.staleInfo = function () {
    var st = loadState();
    if (!st.at) return { never: true, stale: true, days: 0 };
    var days = Math.floor((Date.now() - st.at) / 86400000);
    return { never: false, stale: (Date.now() - st.at) > STALE_MS, days: days, at: st.at, photos: st.photos || 0 };
  };

  /* 바뀐 게 있는지 — 장소·글 수와 마지막 수정 시각으로 싸게 판단한다.
     (똑같으면 사진 폴더를 훑지도 않는다 — 앱을 자주 들락거려도 디스크를 안 건드린다) */
  async function signature() {
    var places = await Store.placeAll();
    var posts = await Store.postAll();
    var photos = places.reduce(function (n, p) { return n + ((p.photos || []).length); }, 0);
    var maxAt = 0;
    places.forEach(function (p) { maxAt = Math.max(maxAt, p.updatedAt || 0, p.createdAt || 0); });
    posts.forEach(function (o) { maxAt = Math.max(maxAt, o.updatedAt || 0, o.createdAt || 0); });
    return { sig: places.length + '/' + posts.length + '/' + photos + '/' + maxAt, photos: photos, places: places.length };
  }

  var _running = false, _lastRun = 0;
  var _tried = false, _lastErr = '';   /* 한 번이라도 시도했는지 / 마지막 실패 이유 (화면에 그대로 보여준다) */

  A.runIfDue = async function (reason) {
    if (_running || !A.available() || !A.enabled()) return null;
    if (Date.now() - _lastRun < MIN_GAP_MS) return null;
    var st = loadState();
    var s;
    try { s = await signature(); } catch (e) { return null; }
    if (st.sig === s.sig) { _lastRun = Date.now(); return null; }   /* 바뀐 게 없다 */
    _tried = true;
    return A.run(reason || 'auto').catch(function (e) {
      _lastErr = (e && e.message) || '알 수 없는 오류';
      console.warn('[자동백업] 실패', _lastErr);
      return null;
    });
  };

  A.run = async function (reason) {
    if (_running) return null;
    if (!A.available()) throw new Error('폰에서만 됩니다 (브라우저 미리보기에서는 저장 폴더를 쓸 수 없어요)');
    _running = true;
    var fs = FS();
    try {
      var places = await Store.placeAll();
      var posts = await Store.postAll();
      var trips = await Store.tripAll();
      var plans = await Store.planAll();

      try { await fs.mkdir({ path: BASE + '/photos', directory: DIR, recursive: true }); } catch (e) {}

      /* 이미 백업된 사진 목록을 **한 번에** 읽는다 — 사진마다 stat 을 부르면 수백 번이 된다 */
      var have = {};
      try {
        var rd = await fs.readdir({ path: BASE + '/photos', directory: DIR });
        ((rd && rd.files) || []).forEach(function (f) {
          var nm = (typeof f === 'string') ? f : (f && f.name);
          if (nm) have[nm] = true;
        });
      } catch (e) {}

      var total = places.reduce(function (n, p) { return n + ((p.photos || []).length); }, 0);
      var added = 0, missing = 0, done = 0;
      for (var i = 0; i < places.length; i++) {
        var ph = places[i].photos || [];
        for (var j = 0; j < ph.length; j++) {
          done++;
          var name = ph[j].id + '.jpg';
          if (have[name]) continue;                       /* 증분 — 이미 있으면 건너뛴다 */
          var r = null;
          try { r = await Photos.resolvePhoto(ph[j].id); } catch (e) {}
          if (!r || !r.blob) { missing++; continue; }
          var b64 = await NativeFS.blobToBase64(r.blob);
          await fs.writeFile({ path: BASE + '/photos/' + name, data: b64, directory: DIR, recursive: true });
          added++;
          if (added % 8 === 0) await new Promise(function (res) { setTimeout(res, 0); });
        }
      }

      /* 목록·글·설정은 작으니 매번 새로 쓴다. ZIP 백업의 backup.json 과 같은 모양이다. */
      var meta = {
        app: CFG.APP_ID, appName: CFG.APP_NAME, fmt: Backup.FMT,
        appVersion: window.APP_VERSION, exportedAt: new Date().toISOString(),
        source: 'auto',
        counts: { places: places.length, posts: posts.length, photos: total - missing,
                  trips: trips.length, plans: plans.length },
        settings: Backup.dumpSettings(),
        places: places, posts: posts, trips: trips, plans: plans
      };
      await fs.writeFile({
        path: BASE + '/backup.json', directory: DIR, recursive: true,
        data: JSON.stringify(meta), encoding: 'utf8'
      });

      var sg = await signature();
      saveState({ at: Date.now(), sig: sg.sig, photos: total - missing, places: places.length, reason: reason || '' });
      _lastRun = Date.now();
      return { added: added, photos: total - missing, places: places.length };
    } finally {
      _running = false;
    }
  };

  /* ═══ 복구 — 폴더를 ZIP 으로 싸서 기존 복구 코드에 그대로 넘긴다 ═══
     ⚠️ 새 복구 로직을 또 만들지 않는다. 합치기(비파괴) 규칙이 backup.js 한 곳에만 있어야
        나중에 규칙이 갈라지지 않는다. */
  A.readBackup = async function () {
    if (!A.available()) throw new Error('폰에서만 됩니다');
    var fs = FS();
    var txt;
    try {
      var r = await fs.readFile({ path: BASE + '/backup.json', directory: DIR, encoding: 'utf8' });
      txt = r && r.data;
    } catch (e) { throw new Error('자동 백업이 아직 없습니다'); }
    var meta = JSON.parse(txt);

    if (!window.JSZip) {
      await new Promise(function (res, rej) {
        var sc = document.createElement('script');
        sc.src = 'js/jszip.min.js';
        sc.onload = function () { window.JSZip ? res() : rej(new Error('JSZip 로드 실패')); };
        sc.onerror = function () { rej(new Error('JSZip 로드 실패')); };
        document.head.appendChild(sc);
      });
    }
    var zip = new JSZip();
    zip.file('backup.json', JSON.stringify(meta));
    var dir = zip.folder('photos');
    var names = [];
    try {
      var rd = await fs.readdir({ path: BASE + '/photos', directory: DIR });
      names = ((rd && rd.files) || []).map(function (f) { return (typeof f === 'string') ? f : (f && f.name); })
                                      .filter(Boolean);
    } catch (e) {}
    for (var i = 0; i < names.length; i++) {
      if (window.setProg) setProg((i / Math.max(1, names.length)) * 60, '백업 읽는 중 ' + (i + 1) + '/' + names.length);
      var fr = await fs.readFile({ path: BASE + '/photos/' + names[i], directory: DIR });
      dir.file(names[i], NativeFS.base64ToBlob(fr.data, 'image/jpeg'));
      if (i % 8 === 7) await new Promise(function (r2) { setTimeout(r2, 0); });
    }
    return { zip: zip, meta: meta, photos: names.length };
  };

  /* ═══ 저장공간 ═══════════════════════════════════════════
     기기가 꽉 차면 사진 저장이 실패하는데, 그걸 아는 시점은 이미 식당에 앉아 있을 때다. */
  var LOW_FREE_MB = 300;
  var _space = null;
  A.checkSpace = function () {
    if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
    return navigator.storage.estimate().then(function (e) {
      if (!e || !e.quota) return null;
      var freeMB = Math.max(0, (e.quota - (e.usage || 0)) / 1048576);
      _space = { freeMB: freeMB, pct: Math.round(((e.usage || 0) / e.quota) * 100), low: freeMB < LOW_FREE_MB };
      return _space;
    }).catch(function () { return null; });
  };
  A.space = function () { return _space; };

  /* 기록 탭 위에 붙일 알림 */
  A.noticeHTML = function () {
    var out = '';
    if (_space && _space.low) {
      out += '<div class="todo" style="margin-bottom:10px;"><b>저장공간이 얼마 안 남았어요 (' +
        Math.round(_space.freeMB) + 'MB)</b><div class="mini">사진이 저장되지 않을 수 있습니다. ' +
        '설정 → 백업에서 백업 파일을 다른 곳으로 옮기고, 오래된 기록을 정리해 주세요.</div></div>';
    }
    if (A.available() && A.enabled()) {
      var s = A.staleInfo();
      /* ☠️ '한 번도 성공한 적 없음' 을 빼먹으면, 백업이 계속 실패해도 아무 말이 없어
         사용자는 백업된 줄 알고 지낸다 — 이 앱에서 가장 위험한 침묵이다. */
      if (s.never && _tried) {
        out += '<div class="todo" style="margin-bottom:10px;"><b>자동 백업이 아직 한 번도 안 됐어요</b>' +
          '<div class="mini">설정 → 백업 · 이용량에서 「지금 백업」을 눌러 무엇이 막는지 확인해 주세요.' +
          (_lastErr ? ' (' + esc(_lastErr) + ')' : '') + '</div></div>';
      } else if (s.stale) {
        out += '<div class="todo" style="margin-bottom:10px;"><b>자동 백업이 ' + s.days + '일째 안 됐어요</b>' +
          '<div class="mini">설정 → 백업 · 이용량에서 「지금 백업」을 눌러 주세요.</div></div>';
      }
    }
    return out;
  };

  /* ═══ 언제 도는가 ═══════════════════════════════════════
     현장매니저와 같은 시점 — **앱을 벗어날 때**. 그때가 사용자를 안 기다리게 하는 유일한 순간이다.
     + 앱을 켜고 조금 뒤 한 번(지난번에 못 끝냈을 수 있으니 이어서). */
  function start() {
    A.checkSpace();
    setTimeout(function () { A.runIfDue('start').catch(function () {}); }, 15000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') A.runIfDue('background').catch(function () {});
    });
    window.addEventListener('pagehide', function () { A.runIfDue('background').catch(function () {}); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  console.log('[AutoBackup] 폰 저장소 자동 백업 ' + (A.enabled() ? '켬' : '끔') +
              (A.available() ? '' : ' (브라우저라 대기)'));
})();
