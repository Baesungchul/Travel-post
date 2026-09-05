/* ═══════════════════════════════════════════════════════════
   undo.js — 지운 것을 잠시 되돌릴 수 있게 (분석 2026-09-05)
   ----------------------------------------------------------------
   왜 필요한가:
     지금까지 삭제는 confirm() 한 번이 전부였다. 손가락이 미끄러져 「예」를 누르면
     사진·글·기록이 그대로 사라졌고, 자동 백업이 아직 안 돌았으면 되찾을 길이 없었다.

   어떻게 하나:
     지우기 **전에** 원본을 통째로 들고 있다가, 되돌리기를 누르면 그대로 다시 넣는다.
     ☠️ IndexedDB 에서 지운 뒤에는 읽을 수 없다 — 반드시 지우기 전에 스냅샷을 뜬다.

   ⚠️ 스냅샷은 **메모리에만** 둔다(앱을 껐다 켜면 사라진다).
      사진 Blob 을 다시 저장소에 써 두면 '지웠는데 용량이 안 준다'가 되고,
      휴지통을 만들면 그것 자체를 비우는 화면이 또 필요해진다.
      되돌리기는 '방금 실수'를 위한 것이고, 그 뒤는 자동 백업이 맡는다(auto_backup.js).

   ⚠️ 한 번에 하나만 기억한다. 다음 삭제가 오면 앞의 것은 흘려보낸다 —
      여러 개를 쌓으면 사진 Blob 이 메모리에 계속 남는다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var U = window.Undo = {};
  var SHOW_MS = 7000;      /* 되돌리기가 떠 있는 시간. 토스트(2.6초)보다 길어야 손이 따라온다 */
  var _el = null, _timer = null, _pending = null;

  function box() {
    if (_el) return _el;
    _el = document.createElement('div');
    _el.className = 'undo-bar';
    _el.innerHTML = '<span class="undo-tx"></span><button type="button" class="undo-btn">되돌리기</button>';
    document.body.appendChild(_el);
    _el.querySelector('.undo-btn').onclick = function () {
      var p = _pending;
      hide();
      if (!p) return;
      Promise.resolve()
        .then(p.restore)
        .then(function () {
          showToast('되돌렸어요', 'ok');
          try { if (window.UI && UI.refresh) UI.refresh(); } catch (e) {}
        })
        .catch(function (e) { showToast('되돌리기 실패: ' + (e && e.message), 'err'); });
    };
    return _el;
  }

  function hide() {
    _pending = null;
    clearTimeout(_timer);
    if (_el) _el.classList.remove('show');
  }

  /* label: "사진 1장을 지웠어요" / restore: 되돌리는 함수(Promise 여도 됨) */
  U.offer = function (label, restore) {
    _pending = { restore: restore };
    var b = box();
    b.querySelector('.undo-tx').textContent = label;
    b.classList.add('show');
    clearTimeout(_timer);
    _timer = setTimeout(hide, SHOW_MS);
  };
  U.hide = hide;

  /* ── 자주 쓰는 삭제 세 가지 ──
     어느 것이든 "스냅샷 → 삭제 → 되돌리기 제안" 순서를 지킨다. */

  /* 사진 한 장 — 장소 목록의 자리(order)와 Blob 을 같이 들고 있어야 제자리로 돌아온다 */
  U.deletePhoto = function (photoId) {
    var p = Place.current();
    if (!p) return Promise.resolve();
    var meta = (p.photos || []).filter(function (x) { return x.id === photoId; })[0];
    var at = (p.photos || []).findIndex(function (x) { return x.id === photoId; });
    return Store.photoGet(photoId).then(function (rec) {
      return Photos.remove(photoId).then(function () {
        U.offer('사진 1장을 지웠어요', function () {
          if (!rec) return;
          return Store.photoPut(rec).then(function () {
            var cur = Place.current();
            if (!cur || cur.id !== p.id) return;
            var m = meta ? JSON.parse(JSON.stringify(meta)) : { id: photoId, tag: (Place.tags(cur)[0] || '사진'), memo: '' };
            cur.photos.splice(at < 0 ? cur.photos.length : at, 0, m);
            cur.photos.forEach(function (x, i) { x.order = i; });
            return Place.save();
          });
        });
      });
    });
  };

  /* 장소 하나 — 사진 Blob·글까지 전부 (Store.placeDelete 가 셋을 함께 지운다) */
  U.deletePlace = function (placeId) {
    return Promise.all([Store.placeGet(placeId), Store.photosOf(placeId), Store.postsOf(placeId)])
      .then(function (r) {
        var place = r[0], photos = r[1] || [], posts = r[2] || [];
        return Store.placeDelete(placeId).then(function () {
          (photos || []).forEach(function (x) { Photos.forget(x.id); });
          U.offer('기록을 지웠어요 (사진 ' + photos.length + '장 · 글 ' + posts.length + '개)', function () {
            if (!place) return;
            return Promise.all(photos.map(function (x) { return Store.photoPut(x); }))
              .then(function () { return Promise.all(posts.map(function (x) { return Store.postPut(x); })); })
              .then(function () { return Store.placePut(place); });
          });
        });
      });
  };

  U.deletePost = function (postId) {
    return Store.postGet(postId).then(function (rec) {
      return Store.postDelete(postId).then(function () {
        U.offer('글을 지웠어요', function () { return rec ? Store.postPut(rec) : null; });
      });
    });
  };

  /* 여행 — 장소·사진은 원래부터 안 지운다(store.js 주석). 묶음만 푼다.
     ⚠️ Trips.remove 는 여행 기록만 지우는 게 아니라 담겨 있던 장소들의 tripId 도 지운다.
        되돌릴 때 그 연결까지 다시 걸어야 여행 화면에 장소가 도로 나타난다. */
  U.deleteTrip = function (tripId) {
    return Promise.all([Store.tripGet(tripId), Trips.placesOf(tripId)]).then(function (r) {
      var rec = r[0], places = (r[1] || []).map(function (p) { return p.id; });
      return Trips.remove(tripId).then(function () {
        U.offer('여행 묶음을 풀었어요', function () {
          if (!rec) return;
          return Store.tripPut(rec).then(function () {
            return Promise.all(places.map(function (pid) {
              return Store.placeGet(pid).then(function (p) {
                if (!p || p.tripId) return;      /* 그 사이 다른 여행에 담겼으면 건드리지 않는다 */
                p.tripId = tripId;
                return Store.placePut(p);
              });
            }));
          });
        });
      });
    });
  };

  console.log('[Undo] 로드됨');
})();
