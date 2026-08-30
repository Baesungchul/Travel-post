/* ═══════════════════════════════════════════════════════════
   store.js — IndexedDB 저장소 (장소 / 사진 / 글 / 설정)
   ----------------------------------------------------------------
   현장매니저 db.js 의 자리. 고객(customers) 스토어는 가져오지 않는다.

   ⭐ 사진을 Blob 으로 IndexedDB 에 넣는다.
      현장매니저는 파일시스템 핸들(FSA / Capacitor FS)에 사진을 뒀고,
      그래서 '폴더 권한이 풀리면 사진이 안 보이는' 문제를 오래 안고 갔다.
      이 앱의 사진은 한 장소당 수십 장 규모라 Blob 저장으로 충분하고,
      권한 개념이 없어 그 종류의 사고가 처음부터 생기지 않는다.
      (갤러리 내보내기·백업은 별도 경로 — v3)

   스토어
     places   { id, ... }            장소 = 글 하나
     photos   { id, placeId, blob }  사진 원본
     posts    { id, placeId, ch, text, ... }  생성된 글
     settings { key, value }
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DB_NAME = CFG.DB_NAME;
  /* ⚠️ 스토어를 추가하면 DB_VER 을 올린다. onupgradeneeded 는 **없는 것만 만든다** —
     이미 쓰고 있는 사용자의 places/photos/posts 는 절대 건드리지 않는다.
       v1 → v2 : trips 추가 (여행 단위 묶기, 설계안 9장 4단계)
       v2 → v3 : plans 추가 (달력 일정 — 사용자 요청 2026-08-28) */
  var DB_VER  = 3;
  var S_PLACE = 'places', S_PHOTO = 'photos', S_POST = 'posts', S_SET = 'settings',
      S_TRIP = 'trips', S_PLAN = 'plans';
  var _db = null;

  function open() {
    return new Promise(function (res, rej) {
      if (_db) { res(_db); return; }
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(S_PLACE)) {
          var s = d.createObjectStore(S_PLACE, { keyPath: 'id' });
          s.createIndex('visitedAt', 'visitedAt', { unique: false });
          s.createIndex('profileId', 'profileId', { unique: false });
        }
        if (!d.objectStoreNames.contains(S_PHOTO)) {
          var p = d.createObjectStore(S_PHOTO, { keyPath: 'id' });
          p.createIndex('placeId', 'placeId', { unique: false });
        }
        if (!d.objectStoreNames.contains(S_POST)) {
          var o = d.createObjectStore(S_POST, { keyPath: 'id' });
          o.createIndex('placeId', 'placeId', { unique: false });
          o.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!d.objectStoreNames.contains(S_SET)) d.createObjectStore(S_SET, { keyPath: 'key' });
        if (!d.objectStoreNames.contains(S_TRIP)) {
          var t = d.createObjectStore(S_TRIP, { keyPath: 'id' });
          t.createIndex('startAt', 'startAt', { unique: false });
        }
        if (!d.objectStoreNames.contains(S_PLAN)) {
          var pl = d.createObjectStore(S_PLAN, { keyPath: 'id' });
          pl.createIndex('date', 'date', { unique: false });
          pl.createIndex('tripId', 'tripId', { unique: false });
        }
      };
      req.onsuccess = function (e) { _db = e.target.result; res(_db); };
      req.onerror = function (e) { rej(e.target.error); };
    });
  }

  function tx(store, mode, fn) {
    return open().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode);
        var r = fn(t.objectStore(store));
        r.onsuccess = function () { res(r.result); };
        r.onerror = function (e) { rej(e.target.error); };
      });
    });
  }
  function byIndex(store, index, value) {
    return open().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, 'readonly');
        var r = t.objectStore(store).index(index).getAll(value);
        r.onsuccess = function () { res(r.result || []); };
        r.onerror = function (e) { rej(e.target.error); };
      });
    });
  }

  /* ── id 규칙 (설계안 2장) : P{YYYYMMDD}-{HHMM}-{rand4} ── */
  function pad(n, w) { return String(n).padStart(w || 2, '0'); }
  function newPlaceId(d) {
    d = d || new Date();
    var r = Math.random().toString(36).slice(2, 6);
    return 'P' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
           '-' + pad(d.getHours()) + pad(d.getMinutes()) + '-' + r;
  }
  function newTripId(d) {
    d = d || new Date();
    var r = Math.random().toString(36).slice(2, 6);
    return 'T' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + r;
  }
  function newId(prefix) {
    return (prefix || 'X') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  var Store = {
    newPlaceId: newPlaceId,
    newTripId: newTripId,
    newId: newId,

    /* 장소 */
    placePut:  function (p) { return tx(S_PLACE, 'readwrite', function (s) { return s.put(p); }); },
    placeGet:  function (id) { return tx(S_PLACE, 'readonly', function (s) { return s.get(id); }); },
    placeAll:  function () {
      return tx(S_PLACE, 'readonly', function (s) { return s.getAll(); }).then(function (l) {
        return (l || []).sort(function (a, b) { return String(b.visitedAt || '').localeCompare(String(a.visitedAt || '')); });
      });
    },
    placeDelete: function (id) {
      return Store.photosOf(id).then(function (ps) {
        return Promise.all(ps.map(function (p) { return Store.photoDelete(p.id); }));
      }).then(function () {
        return Store.postsOf(id);
      }).then(function (ps) {
        return Promise.all(ps.map(function (p) { return Store.postDelete(p.id); }));
      }).then(function () {
        return tx(S_PLACE, 'readwrite', function (s) { return s.delete(id); });
      });
    },

    /* 사진 (Blob) */
    photoPut: function (rec) { return tx(S_PHOTO, 'readwrite', function (s) { return s.put(rec); }); },
    photoGet: function (id) { return tx(S_PHOTO, 'readonly', function (s) { return s.get(id); }); },
    photosOf: function (placeId) { return byIndex(S_PHOTO, 'placeId', placeId); },
    photoDelete: function (id) { return tx(S_PHOTO, 'readwrite', function (s) { return s.delete(id); }); },

    /* 글 */
    postPut: function (p) { return tx(S_POST, 'readwrite', function (s) { return s.put(p); }); },
    postGet: function (id) { return tx(S_POST, 'readonly', function (s) { return s.get(id); }); },
    postAll: function () {
      return tx(S_POST, 'readonly', function (s) { return s.getAll(); }).then(function (l) {
        return (l || []).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      });
    },
    postsOf: function (placeId) { return byIndex(S_POST, 'placeId', placeId); },
    postDelete: function (id) { return tx(S_POST, 'readwrite', function (s) { return s.delete(id); }); },

    /* 여행 */
    tripPut: function (t) { return tx(S_TRIP, 'readwrite', function (s) { return s.put(t); }); },
    tripGet: function (id) { return tx(S_TRIP, 'readonly', function (s) { return s.get(id); }); },
    tripAll: function () {
      return tx(S_TRIP, 'readonly', function (s) { return s.getAll(); }).then(function (l) {
        return (l || []).sort(function (a, b) { return String(b.startAt || '').localeCompare(String(a.startAt || '')); });
      });
    },
    /* ⚠️ 여행을 지워도 **장소는 지우지 않는다.** 묶음만 푼다.
       여행이 사라졌다고 사진까지 사라지면 그게 더 나쁘다. */
    tripDelete: function (id) { return tx(S_TRIP, 'readwrite', function (s) { return s.delete(id); }); },

    /* 일정(계획) */
    planPut: function (x) { return tx(S_PLAN, 'readwrite', function (s) { return s.put(x); }); },
    planGet: function (id) { return tx(S_PLAN, 'readonly', function (s) { return s.get(id); }); },
    planAll: function () {
      return tx(S_PLAN, 'readonly', function (s) { return s.getAll(); }).then(function (l) {
        return (l || []).sort(function (a, b) {
          return (String(a.date || '') + (a.time || '99:99')).localeCompare(String(b.date || '') + (b.time || '99:99'));
        });
      });
    },
    plansOn: function (date) { return byIndex(S_PLAN, 'date', date); },
    plansOfTrip: function (tripId) { return byIndex(S_PLAN, 'tripId', tripId); },
    planDelete: function (id) { return tx(S_PLAN, 'readwrite', function (s) { return s.delete(id); }); },

    /* 설정 */
    setGet: function (k) { return tx(S_SET, 'readonly', function (s) { return s.get(k); }).then(function (r) { return r ? r.value : null; }); },
    setPut: function (k, v) { return tx(S_SET, 'readwrite', function (s) { return s.put({ key: k, value: v }); }); },

    /* 용량 */
    estimate: function () {
      if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
      return navigator.storage.estimate().catch(function () { return null; });
    }
  };

  window.Store = Store;
})();
