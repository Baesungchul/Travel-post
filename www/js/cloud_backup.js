/* ═══════════════════════════════════════════════════════════
   cloud_backup.js — 클라우드 백업 (로컬 백업 위에 얹는다)
   ----------------------------------------------------------------
   구조는 backup.js 와 같다. 다른 것은 '어디에 두느냐'뿐이다.
     Firestore  users/{uid}/backup/meta      설정 + 장소 + 글 + 여행 + 일정 (JSON)
     Storage    userPhotos/{uid}/{photoId}.jpg

   ☠️ 비파괴 원칙은 여기서 더 중요하다.
      내려받기(pull)는 **로컬에 없는 것만** 채운다. 로컬을 지우거나 덮지 않는다.
      현장매니저의 pull 도 같은 규칙이었고, 그래서 재설치 복구가 안전했다.
   ⚠️ Firestore 문서 1MB 제한 — 장소가 많아지면 meta 가 넘친다.
      지금은 넘칠 때 **거부하고 이유를 말한다**(조용히 잘라내지 않는다).
      나눠 담기는 장소 수가 실제로 늘어난 뒤에 만든다.
   ⚠️ 사진은 **이미 올라간 것은 다시 올리지 않는다** — 요금과 시간이 그대로 비용이다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var MAX_META = 900 * 1024;   // Firestore 1MB 문서 제한에 여유를 둔 값

  function need() {
    if (!Cloud.ready) throw new Error(Cloud.why || '아직 서버를 쓸 수 없습니다');
    if (!Cloud.loggedIn()) throw new Error('먼저 로그인해 주세요');
  }
  function metaRef() { return Cloud.db().collection('users').doc(Cloud.uid()).collection('backup').doc('meta'); }
  function photoRef(id) { return Cloud.st().ref('userPhotos/' + Cloud.uid() + '/' + id + '.jpg'); }

  /* ── 올리기 ── */
  async function push() {
    need();
    showOverlay('클라우드 백업 중...');
    try {
      var places = await Store.placeAll();
      var posts = await Store.postAll();
      var trips = await Store.tripAll();
      var plans = await Store.planAll();

      var meta = {
        fmt: Backup.FMT, appVersion: window.APP_VERSION,
        savedAt: new Date().toISOString(),
        settings: Backup.dumpSettings(),
        places: places, posts: posts, trips: trips, plans: plans
      };
      var json = JSON.stringify(meta);
      if (json.length > MAX_META) {
        throw new Error('기록이 많아 한 문서에 담기지 않습니다(' + Math.round(json.length / 1024) + 'KB). ' +
                        '지금은 로컬 ZIP 백업을 써 주세요 — 나눠 담기는 다음 버전입니다.');
      }

      /* 이미 올라간 사진 목록 (직전 백업 기록) — 다시 올리지 않기 위해서다 */
      var prev = {};
      try {
        var d = await metaRef().get();
        ((d.exists && d.data().uploaded) || []).forEach(function (id) { prev[id] = 1; });
      } catch (e) {}

      var all = [];
      places.forEach(function (p) { (p.photos || []).forEach(function (x) { all.push(x.id); }); });
      var uploaded = [], skipped = 0, failed = 0;

      for (var i = 0; i < all.length; i++) {
        setProg((i / Math.max(1, all.length)) * 92, '사진 올리는 중 ' + (i + 1) + '/' + all.length);
        var id = all[i];
        if (prev[id]) { uploaded.push(id); skipped++; continue; }
        var r = null;
        try { r = await Photos.resolvePhoto(id); } catch (e) {}
        if (!r || !r.blob) { failed++; continue; }
        try {
          await photoRef(id).put(r.blob, { contentType: 'image/jpeg' });
          uploaded.push(id);
        } catch (e) { failed++; console.warn('[CloudBackup] 업로드 실패', id, e && e.code); }
        await new Promise(function (res) { setTimeout(res, 0); });
      }

      setProg(96, '기록 저장 중...');
      meta.uploaded = uploaded;
      await metaRef().set(meta);
      try { localStorage.setItem(CFG.k('cloud_backup_at'), String(Date.now())); } catch (e) {}

      hideOverlay();
      return { places: places.length, photos: uploaded.length, skipped: skipped, failed: failed };
    } catch (e) { hideOverlay(); throw e; }
  }

  /* ── 내려받기 (비파괴) ── */
  async function pull() {
    need();
    showOverlay('클라우드에서 가져오는 중...');
    try {
      var doc = await metaRef().get();
      if (!doc.exists) throw new Error('클라우드에 저장된 백업이 없습니다');
      var meta = doc.data();
      var added = { places: 0, posts: 0, photos: 0, trips: 0, plans: 0, skipped: 0, failed: 0 };

      /* 설정 — 로컬에 없는 키만 */
      var st = meta.settings || {};
      Object.keys(st).forEach(function (k) {
        if (k.indexOf(CFG.LS_PREFIX) !== 0) return;
        try { if (localStorage.getItem(k) === null) localStorage.setItem(k, st[k]); } catch (e) {}
      });

      var ids = meta.uploaded || [];
      for (var i = 0; i < ids.length; i++) {
        setProg((i / Math.max(1, ids.length)) * 90, '사진 받는 중 ' + (i + 1) + '/' + ids.length);
        var have = await Store.photoGet(ids[i]);
        if (have) { added.skipped++; continue; }
        try {
          var url = await photoRef(ids[i]).getDownloadURL();
          var blob = await (await fetch(url)).blob();
          await Store.photoPut({ id: ids[i], placeId: '', blob: blob, at: Date.now() });
          added.photos++;
        } catch (e) { added.failed++; }
        if (i % 6 === 5) await new Promise(function (r) { setTimeout(r, 0); });
      }

      setProg(94, '기록 되돌리는 중...');
      var places = meta.places || [];
      for (var a = 0; a < places.length; a++) {
        var cur = await Store.placeGet(places[a].id);
        if (cur) { added.skipped++; continue; }        /* ☠️ 로컬이 이긴다 — 덮지 않는다 */
        await Store.placePut(places[a]);
        added.places++;
        for (var b = 0; b < (places[a].photos || []).length; b++) {
          var rec = await Store.photoGet(places[a].photos[b].id);
          if (rec && !rec.placeId) { rec.placeId = places[a].id; await Store.photoPut(rec); }
        }
      }
      var posts = meta.posts || [];
      for (var c = 0; c < posts.length; c++) {
        if (await Store.postGet(posts[c].id)) { added.skipped++; continue; }
        await Store.postPut(posts[c]);
        added.posts++;
      }
      var trips = meta.trips || [];
      for (var t1 = 0; t1 < trips.length; t1++) {
        if (await Store.tripGet(trips[t1].id)) { added.skipped++; continue; }
        await Store.tripPut(trips[t1]); added.trips++;
      }
      var plans = meta.plans || [];
      for (var q1 = 0; q1 < plans.length; q1++) {
        if (await Store.planGet(plans[q1].id)) { added.skipped++; continue; }
        await Store.planPut(plans[q1]); added.plans++;
      }

      hideOverlay();
      return added;
    } catch (e) { hideOverlay(); throw e; }
  }

  function lastAt() {
    try { var v = localStorage.getItem(CFG.k('cloud_backup_at')); return v ? +v : 0; } catch (e) { return 0; }
  }

  window.CloudBackup = { push: push, pull: pull, lastAt: lastAt };
})();
