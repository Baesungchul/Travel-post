/* ═══════════════════════════════════════════════════════════
   trips.js — 여행 단위 묶기 (설계안 9장 4단계)
   ----------------------------------------------------------------
   장소 하나 = 글 하나가 기본이다(설계안 0장 확정 전제).
   여행은 그 위에 얹는 **선택 묶음**이다 — "부산 2박 3일" 한 편으로 합쳐 쓰고 싶을 때.

   ⚠️ 여행을 지워도 장소는 지우지 않는다. 묶음만 푼다.
   ⚠️ 한 장소는 한 여행에만 들어간다(place.tripId 하나). 두 여행에 겹치면
      "이 사진이 어느 글에 들어갔지"가 사람 머릿속에서 무너진다.

   ☠️ 여기서 토큰 함정이 **새 얼굴로 다시 나온다**
      여행은 맛집 + 관광지 + 카페가 섞인다. 그런데 {카테고리} 는 프로필 하나에서 나온다.
      한 프로필로 치환하면 "관광지 이야기가 맛집 글처럼 나오는" 현장매니저 v507 과 같은 병이 된다.
      → 여행 글은 **중립 프로필**(아래 tripProfile)로 치환하고,
        실제 카테고리 목록은 프롬프트에 **데이터로** 넘긴다. ai.js 의 generateTripPost 참고.

   ☠️ 사진 마커도 다시 문제가 된다
      한 여행에 '외관' 태그가 장소마다 하나씩 있다. 태그 이름만으로는 어느 가게 외관인지 모른다.
      → 여행 글의 태그는 **'상호 - 태그'** 합성 이름을 쓴다(asPlace 참고).
        site/post.html 은 태그를 정확히 먼저 맞추므로 고칠 필요가 없다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var T = window.Trips = {};

  T.create = function (name) {
    var now = new Date();
    return {
      id: Store.newTripId(now),
      name: name || '새 여행',
      startAt: isoLocal(now).slice(0, 10),
      endAt: '',
      placeIds: [],
      createdAt: Date.now(), updatedAt: Date.now()
    };
  };

  T.save = function (t) {
    t.updatedAt = Date.now();
    return Store.tripPut(t).then(function () { return t; });
  };

  T.all = function () { return Store.tripAll(); };
  T.get = function (id) { return Store.tripGet(id); };

  /* 여행 삭제 — 묶음만 푼다. 장소는 그대로 남는다. */
  T.remove = function (id) {
    return T.placesOf(id).then(function (list) {
      return Promise.all(list.map(function (p) {
        p.tripId = null;
        return Store.placePut(p);
      }));
    }).then(function () { return Store.tripDelete(id); });
  };

  /* 여행에 담긴 장소 — **여행이 정한 순서**대로 (placeIds 순서가 곧 글의 순서다) */
  T.placesOf = function (id) {
    return Promise.all([Store.tripGet(id), Store.placeAll()]).then(function (r) {
      var t = r[0], all = r[1];
      if (!t) return [];
      var by = {};
      all.forEach(function (p) { by[p.id] = p; });
      return (t.placeIds || []).map(function (pid) { return by[pid]; }).filter(Boolean);
    });
  };

  T.add = function (tripId, placeId) {
    return Promise.all([Store.tripGet(tripId), Store.placeGet(placeId)]).then(function (r) {
      var t = r[0], p = r[1];
      if (!t || !p) throw new Error('여행 또는 장소를 찾을 수 없어요');
      /* 다른 여행에 들어 있었으면 거기서 빼고 옮긴다 — 두 곳에 동시에 두지 않는다 */
      var prev = p.tripId && p.tripId !== tripId ? p.tripId : null;
      var chain = prev ? T.removePlace(prev, placeId) : Promise.resolve();
      return chain.then(function () {
        /* ☠️ 2026-08-28 실측으로 잡은 것: 예전엔 무조건 뒤에 붙였다.
           여행은 시간 순서가 곧 글의 흐름이라, 나중에 담은 곳이 앞 이야기로 가버렸다.
           → **방문 시각에 맞는 자리에 끼워 넣는다.**
           ⚠️ 기존 순서는 다시 정렬하지 않는다 — 손으로 ▲▼ 로 맞춰 둔 것을 덮으면 안 된다.
              전부 시간순으로 맞추고 싶으면 여행 화면의 [시간순 정렬] 을 쓴다. */
        if ((t.placeIds || []).indexOf(placeId) < 0) {
          return T.byId(t.placeIds).then(function (cur) {
            var mine = String(p.visitedAt || '');
            var at = t.placeIds.length;
            for (var i = 0; i < cur.length; i++) {
              if (cur[i] && String(cur[i].visitedAt || '') > mine) { at = i; break; }
            }
            t.placeIds.splice(at, 0, placeId);
          }).then(function () { return finish(); });
        }
        return finish();

        function finish() {
        p.tripId = tripId;
        /* 기간을 방문일에 맞춰 넓힌다 (사용자가 직접 고칠 수도 있다) */
        var d = String(p.visitedAt || '').slice(0, 10);
        if (d) {
          if (!t.startAt || d < t.startAt) t.startAt = d;
          if (!t.endAt || d > t.endAt) t.endAt = d;
        }
        return Promise.all([Store.placePut(p), T.save(t)]);
        }
      });
    });
  };

  /* id 목록 → 장소 목록 (순서 유지) */
  T.byId = function (ids) {
    return Store.placeAll().then(function (all) {
      var by = {};
      all.forEach(function (p) { by[p.id] = p; });
      return (ids || []).map(function (i) { return by[i]; });
    });
  };

  /* 전부 방문 시각 순으로 다시 정렬 — 사용자가 명시적으로 누를 때만 */
  T.sortByTime = function (tripId) {
    return Store.tripGet(tripId).then(function (t) {
      if (!t) return;
      return T.byId(t.placeIds).then(function (list) {
        var pairs = (t.placeIds || []).map(function (id, i) { return { id: id, p: list[i] }; });
        pairs.sort(function (a, b) {
          return String((a.p || {}).visitedAt || '').localeCompare(String((b.p || {}).visitedAt || ''));
        });
        t.placeIds = pairs.map(function (x) { return x.id; });
        return T.save(t);
      });
    });
  };

  T.removePlace = function (tripId, placeId) {
    return Promise.all([Store.tripGet(tripId), Store.placeGet(placeId)]).then(function (r) {
      var t = r[0], p = r[1];
      var jobs = [];
      if (t) { t.placeIds = (t.placeIds || []).filter(function (x) { return x !== placeId; }); jobs.push(T.save(t)); }
      if (p && p.tripId === tripId) { p.tripId = null; jobs.push(Store.placePut(p)); }
      return Promise.all(jobs);
    });
  };

  T.movePlace = function (tripId, placeId, dir) {
    return Store.tripGet(tripId).then(function (t) {
      if (!t) return;
      var i = (t.placeIds || []).indexOf(placeId), j = i + dir;
      if (i < 0 || j < 0 || j >= t.placeIds.length) return;
      var tmp = t.placeIds[i]; t.placeIds[i] = t.placeIds[j]; t.placeIds[j] = tmp;
      return T.save(t);
    });
  };

  /* ── 중립 프로필 ──
     여행 글의 토큰 치환은 이걸로 한다. 특정 카테고리로 끌려가지 않게 하기 위해서다. */
  T.tripProfile = function (places) {
    var tags = [];
    (places || []).forEach(function (p) {
      var nm = p.name || '장소';
      Place.tags(p).forEach(function (t) { tags.push(nm + ' - ' + t); });
    });
    return {
      id: '', catId: '', name: '여행', icon: '🧳',
      placeLabel: '장소',
      tags: tags.length ? tags : ['사진'],
      titleFmt: '{지역} 여행 기록',
      hashtags: ['여행기록', '{지역}여행'],
      fixedText: ''
    };
  };

  /* ── 여행을 '가상 장소'로 ──
     이렇게 만들어 두면 사진 정렬·공유·PC 링크가 장소 하나일 때와 **똑같은 코드**로 돈다.
     태그가 '상호 - 태그' 합성 이름이라 여행 안에서 사진이 안 섞인다. */
  T.asPlace = function (trip, places) {
    var pf = T.tripProfile(places);
    var photos = [];
    (places || []).forEach(function (p) {
      var nm = p.name || '장소';
      Photos.ordered(p).forEach(function (x) {
        photos.push({ id: x.id, order: photos.length, tag: nm + ' - ' + x.tag, memo: x.memo || '' });
      });
    });
    var areas = [];
    (places || []).forEach(function (p) { if (p.area && areas.indexOf(p.area) < 0) areas.push(p.area); });
    return {
      id: trip.id,
      _trip: true,
      profileId: '', profileSnap: pf,
      name: trip.name,
      visitedAt: trip.startAt || '',
      address: '', area: areas.join('·'),
      memo: '', rating: 0,
      photos: photos,
      tripId: trip.id
    };
  };

  console.log('[Trips] 로드됨');
})();
