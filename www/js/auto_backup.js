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
  /* ── 언제 도는가 — 현장매니저 auto_backup.js 와 같은 체계 (2026-09-05) ──
     · 기본 간격 4초: 앱을 나가고 들어오기를 반복해도 연달아 돌지 않을 만큼만 막는다.
     · 앱 복귀(return-refresh)만 10분: '바뀐 게 없어도' 매번 훑던 경로라 배터리를 먹었다
       (현장매니저 2026-08-08 개선). 실제 변경은 저장 직후·앱 나갈 때 이미 백업된다. */
  var MIN_GAP_MS = 4000;
  var RETURN_REFRESH_MIN_MS = 10 * 60 * 1000;
  var AFTER_SAVE_DEBOUNCE_MS = 8000;   /* 저장 직후, 조금 몰아서 한 번 */
  var STALE_MS = 3 * 24 * 60 * 60 * 1000;   /* 이만큼 밀리면 화면에 적는다 */
  function minIntervalFor(reason) {
    return (reason === 'return-refresh') ? RETURN_REFRESH_MIN_MS : MIN_GAP_MS;
  }

  /* ☠️ '이전 실행이 끝까지 못 갔다' 를 localStorage 에 남긴다.
     모듈 변수로만 두면 스와이프(강제 종료)로 프로세스가 죽는 순간 사라져서,
     다음에 켰을 때 이어서 할지를 알 수 없다 — 사진 복사가 중간에 끊기면
     그 며칠치가 백업에서 통째로 빠진 채 아무도 모른다(현장매니저 2026-09-02 보강). */
  var INCOMPLETE_LS = function () { return CFG.k('auto_backup_incomplete'); };
  function incomplete() {
    try { return localStorage.getItem(INCOMPLETE_LS()) === '1'; } catch (e) { return false; }
  }
  function setIncomplete(v) {
    try { v ? localStorage.setItem(INCOMPLETE_LS(), '1') : localStorage.removeItem(INCOMPLETE_LS()); } catch (e) {}
  }

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

  /* 자동 경로 — 조건이 맞을 때만 돈다. 실패해도 앱을 막지 않는다(이유는 화면에 남는다). */
  A.runIfDue = async function (reason) {
    reason = reason || 'auto';
    if (_running || !A.available() || !A.enabled()) return null;
    if (Date.now() - _lastRun < minIntervalFor(reason)) return null;
    /* 이어하기(중단됨)는 '바뀐 게 없어도' 반드시 돈다 — 못 옮긴 사진이 남아 있을 수 있다 */
    if (!incomplete()) {
      var st = loadState(), s;
      try { s = await signature(); } catch (e) { return null; }
      if (st.sig === s.sig) { _lastRun = Date.now(); return null; }   /* 바뀐 게 없다 */
    }
    _tried = true;
    return A.run(reason).catch(function (e) {
      _lastErr = (e && e.message) || '알 수 없는 오류';
      console.warn('[자동백업] 실패(' + reason + ')', _lastErr);
      return null;
    });
  };

  A.run = async function (reason) {
    if (_running) return null;
    if (!A.available()) throw new Error('폰에서만 됩니다 (브라우저 미리보기에서는 저장 폴더를 쓸 수 없어요)');
    _running = true;
    /* ☠️ 간격 기준을 '시작할 때' 찍는다. 성공했을 때만 찍으면, 실패하는 동안에는
       트리거가 올 때마다 매번 다시 돌아 배터리를 먹는다(현장매니저도 시작 시점에 찍는다). */
    _lastRun = Date.now();
    setIncomplete(true);   /* 여기서부터 끝까지 못 가면 '중단됨' 으로 남는다 */
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
      setIncomplete(false);   /* 끝까지 갔다 */
      _lastErr = '';
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

  /* ═══ 언제 도는가 — 현장매니저와 같은 시점 ═══════════════
       ① 앱을 벗어날 때(hidden / pagehide / Capacitor appStateChange)
          → 사용자를 안 기다리게 하는 순간이다. 여기가 주 경로.
       ② 앱으로 돌아올 때 — 10분에 한 번만(배터리). 단 지난번이 중단됐으면 곧바로 이어한다.
       ③ 콜드스타트 — 앱을 새로 켤 때 중단 표시가 남아 있으면 3초 뒤 이어한다.
          ☠️ 새로 켠 프로세스는 문서가 처음부터 visible 이라 visibilitychange 가 아예 안 온다.
             이 갈래가 없으면 강제 종료로 끊긴 백업이 '다음에 앱을 나갈 때까지' 방치된다.
       ④ 저장 직후 — 8초 몰아서 한 번. 앱을 나가는 순간에만 기대면 큰 사진 복사가 끊길 때
          최근 며칠이 통째로 빠질 수 있다. */
  function onLeave(reason) { A.runIfDue(reason).catch(function () {}); }
  function onReturn() { A.runIfDue(incomplete() ? 'resume-catchup' : 'return-refresh').catch(function () {}); }

  var _saveT = null;
  A.scheduleAfterSave = function () {
    clearTimeout(_saveT);
    _saveT = setTimeout(function () { A.runIfDue('after-save').catch(function () {}); }, AFTER_SAVE_DEBOUNCE_MS);
  };

  /* 저장·삭제가 실제로 일어나는 곳(Store 쓰기)에 걸어 둔다 —
     화면 코드마다 '백업 예약' 을 흩뿌리면 새 화면을 만들 때 빠뜨린다. */
  function hookStoreWrites() {
    if (!window.Store) return;
    ['placePut', 'placeDelete', 'photoPut', 'photoDelete',
     'postPut', 'postDelete', 'tripPut', 'tripDelete', 'planPut', 'planDelete'].forEach(function (m) {
      var orig = Store[m];
      if (typeof orig !== 'function' || orig.__abHooked) return;
      var wrapped = function () {
        var r = orig.apply(Store, arguments);
        try { A.scheduleAfterSave(); } catch (e) {}
        return r;
      };
      wrapped.__abHooked = true;
      Store[m] = wrapped;
    });
  }

  function start() {
    A.checkSpace();
    hookStoreWrites();

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') onLeave('hidden');
      else if (document.visibilityState === 'visible') onReturn();
    });
    window.addEventListener('pagehide', function () { onLeave('pagehide'); });
    try {
      if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App) {
        Capacitor.Plugins.App.addListener('appStateChange', function (st) {
          if (st && st.isActive === false) onLeave('background');
          else if (st && st.isActive === true) onReturn();
        });
      }
    } catch (e) {}

    /* ③ 콜드스타트 이어하기 */
    setTimeout(function () {
      if (incomplete()) {
        console.warn('[자동백업] 이전 실행이 중단된 채 종료됨 → 이어하기');
        A.runIfDue('cold-start-resume').catch(function () {});
      }
    }, 3000);
    /* 켜고 조금 뒤 한 번 — 처음 설치했을 때 첫 백업이 이때 만들어진다 */
    setTimeout(function () { A.runIfDue('start').catch(function () {}); }, 15000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  console.log('[AutoBackup] 폰 저장소 자동 백업 ' + (A.enabled() ? '켬' : '끔') +
              (A.available() ? '' : ' (브라우저라 대기)'));
})();
