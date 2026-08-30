/* ═══════════════════════════════════════════════════════════
   plans.js — 일정(여행 계획)
   ----------------------------------------------------------------
   사용자 요청(2026-08-28): "달력에서 일정으로 여행 내용을 넣고
   확인하고 열어보면서 관리할 수 있도록."

   ⭐ 이 앱에서 일정이 하는 일은 현장매니저와 다르다.
      현장매니저의 일정은 '가야 할 작업'이었다. 여기서는 **'가 볼 곳'** 이고,
      다녀오면 그 자리에서 **기록(place)으로 이어져야** 한다.
      그래서 plan 은 placeId 를 들고, 「방문 시작」을 누르면
      계획의 이름·카테고리를 그대로 물려받은 장소가 만들어진다.
      계획 → 현장 촬영 → 글 이 한 줄로 이어지는 것이 이 기능의 전부다.

   plan {
     id, tripId?, date 'YYYY-MM-DD', time 'HH:MM'|'',
     title, memo, catId(카테고리 프로필 id), placeId(다녀와서 연결된 기록), done
   }

   ⚠️ 일정을 지워도 이어진 기록은 지우지 않는다. 계획은 계획일 뿐이다.
   ⚠️ 계획에는 사진이 없다. 사진은 기록에만 있다 — 두 개를 섞지 말 것.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var P = window.Plans = {};

  P.create = function (date, tripId) {
    return {
      id: Store.newId('pl_'),
      tripId: tripId || null,
      date: date || isoLocal().slice(0, 10),
      time: '',
      title: '',
      memo: '',
      catId: (Profiles.current() || {}).id || '',
      placeId: null,
      done: false,
      createdAt: Date.now(), updatedAt: Date.now()
    };
  };

  P.save = function (x) {
    x.updatedAt = Date.now();
    return Store.planPut(x).then(function () { return x; });
  };
  P.get = function (id) { return Store.planGet(id); };
  P.all = function () { return Store.planAll(); };
  P.on = function (date) {
    return Store.plansOn(date).then(function (l) {
      return (l || []).sort(function (a, b) { return (a.time || '99:99').localeCompare(b.time || '99:99'); });
    });
  };
  P.ofTrip = function (tripId) {
    return Store.plansOfTrip(tripId).then(function (l) {
      return (l || []).sort(function (a, b) {
        return (String(a.date) + (a.time || '99:99')).localeCompare(String(b.date) + (b.time || '99:99'));
      });
    });
  };
  /* 일정만 지운다. 이어진 기록은 그대로 둔다. */
  P.remove = function (id) { return Store.planDelete(id); };

  /* ⭐ 계획 → 기록.
     계획의 이름·카테고리·날짜를 그대로 물려받은 장소를 만들고 서로 연결한다.
     ⚠️ 이미 이어진 기록이 있으면 새로 만들지 않고 그것을 연다 —
        같은 계획으로 두 번 누르면 기록이 둘로 갈라진다. */
  P.startVisit = function (planId) {
    return P.get(planId).then(function (pl) {
      if (!pl) throw new Error('일정을 찾을 수 없어요');
      if (pl.placeId) {
        return Store.placeGet(pl.placeId).then(function (exist) {
          if (exist) return Place.open(pl.placeId).then(function () { return { reused: true, place: exist }; });
          pl.placeId = null;                       // 기록이 지워졌으면 연결을 풀고 새로 만든다
          return P.save(pl).then(function () { return P.startVisit(planId); });
        });
      }
      var p = Place.create(pl.catId || '');
      if (pl.title) p.name = pl.title;
      if (pl.memo) p.memo = pl.memo;
      if (pl.date) p.visitedAt = pl.date + 'T' + (pl.time || isoLocal().slice(11));
      if (pl.tripId) p.tripId = pl.tripId;
      return Place.save().then(function () {
        pl.placeId = p.id;
        pl.done = true;
        var jobs = [P.save(pl)];
        /* 여행에 속한 계획이면 그 여행에도 장소를 담는다 */
        if (pl.tripId) jobs.push(Trips.add(pl.tripId, p.id).catch(function () {}));
        return Promise.all(jobs);
      }).then(function () { return { reused: false, place: Place.current() }; });
    });
  };

  console.log('[Plans] 로드됨');
})();
