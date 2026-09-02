/* ═══════════════════════════════════════════════════════════
   ui_records.js — 「기록」 탭
   달력 / 목록 / 지도 / 여행 네 가지 보기. 카테고리 필터.
   · 달력 — calendar.js. 여행 기간·일정(계획)·기록을 한 화면에서 관리한다(사용자 요청 2026-08-28).
   · 지도 — map.js. 카카오 지도 키가 없으면 지역별 목록으로 떨어진다(빈 네모를 보여주지 않는다).
   ⚠️ 탭을 늘리지 않고 보기만 늘렸다. 하단 탭 4개는 설계안 4장의 결정이다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var UI = window.UI = window.UI || {};
  var _filter = '';   // profileId
  /* 달력을 기본으로 둔다 — 여행은 날짜가 뼈대라 '언제 뭐 했더라'가 먼저 보이는 편이 낫다 */
  var _view = 'cal';  // 'cal' | 'list' | 'map' | 'trip'

  UI.renderRecords = function () {
    var el = document.getElementById('pnRecords');
    if (!el) return;
    /* 달력을 펼치면 body 스크롤을 잠근다(calendar.js).
       다른 보기로 넘어갈 때 반드시 풀어야 한다 —
       안 풀면 목록·지도 화면이 스크롤되지 않는 '먹통'으로 보인다. */
    if (_view !== 'cal' && window.Cal && Cal.unlock) Cal.unlock();
    Promise.all([Store.placeAll(), Store.postAll()]).then(function (r) {
      var list = r[0];
      /* 장소별로 쓴 글을 묶어 둔다 — 목록에 '이미 쓴 글' 표시를 하고 눌러서 바로 열기 위해서다
         (사용자 요청 2026-09-01). postAll() 이 최신순 정렬이라 postsByPlace[id][0] 이 가장 최근 글이다. */
      var postsByPlace = {};
      (r[1] || []).forEach(function (o) {
        (postsByPlace[o.placeId] = postsByPlace[o.placeId] || []).push(o);
      });
      var pfs = Profiles.list();
      var shown = _filter ? list.filter(function (p) { return p.profileId === _filter; }) : list;

      var head =
        '<div class="view-toggle">' +
          '<button type="button" class="tag' + (_view === 'cal' ? ' on' : '') + '" data-v="cal">📅 달력</button>' +
          '<button type="button" class="tag' + (_view === 'list' ? ' on' : '') + '" data-v="list">🗂 목록</button>' +
          '<button type="button" class="tag' + (_view === 'map' ? ' on' : '') + '" data-v="map">🗺 지도</button>' +
          '<button type="button" class="tag' + (_view === 'trip' ? ' on' : '') + '" data-v="trip">🧳 여행</button>' +
        '</div>' +
        /* ⚠️ 달력·여행 보기에서는 카테고리 필터가 아무 일도 하지 않는다 —
           동작하지 않는 버튼을 띄우면 사용자가 자기가 잘못 누른 줄 안다. 그럴 땐 감춘다. */
        ((_view === 'cal' || _view === 'trip') ? '' :
          '<div class="tagbar" style="margin-bottom:12px;">' +
          '<button type="button" class="tag' + (_filter ? '' : ' on') + '" data-pf="">전체<span class="n">' + list.length + '</span></button>' +
          pfs.map(function (pf) {
            var n = list.filter(function (p) { return p.profileId === pf.id; }).length;
            return '<button type="button" class="tag' + (_filter === pf.id ? ' on' : '') + '" data-pf="' + pf.id + '">' +
              esc((pf.icon || '📍') + ' ' + pf.name) + '<span class="n">' + n + '</span></button>';
          }).join('') + '</div>');

      /* ⚠️ 달력·여행은 기록이 하나도 없어도 쓸 수 있어야 한다(계획을 먼저 세우니까).
         '기록 없음' 안내로 가로막지 않는다. */
      if (_view === 'cal') {
        el.innerHTML = head + '<div id="calHost"></div>';
        Cal.render(el.querySelector('#calHost'));
      } else if (_view === 'trip') {
        el.innerHTML = head + '<div id="tripView"><div class="mini">불러오는 중…</div></div>';
        renderTrips(el.querySelector('#tripView'));
      } else if (!shown.length) {
        el.innerHTML = head + '<div class="empty"><div style="font-size:38px;margin-bottom:10px;">🗂</div>' +
          '아직 기록이 없어요.<br><span class="mini">＋ 를 눌러 첫 장소를 시작해 보세요.</span></div>';
      } else if (_view === 'trip2') {
        el.innerHTML = head + '<div id="tripView"><div class="mini">불러오는 중…</div></div>';
        renderTrips(el.querySelector('#tripView'));
      } else if (_view === 'map') {
        el.innerHTML = head + '<div id="recMap"></div>';
        MapView.render(el.querySelector('#recMap'), shown, openPlaceSheet);
      } else {
        el.innerHTML = head + '<div class="card">' + shown.map(function (p) {
          var snap = p.profileSnap || {};
          var first = (p.photos || [])[0];
          var posts = postsByPlace[p.id] || [];
          return '<div class="row plRow" data-id="' + p.id + '">' +
            '<div class="thumb">' + (first ? '<img data-ph="' + first.id + '" alt="">' : '') + '</div>' +
            '<div style="min-width:0;">' +
              '<div class="ti">' + esc(p.name || '(이름 없음)') + '</div>' +
              '<div class="sb">' + esc((snap.icon || '📍') + ' ' + (snap.name || '')) +
                ' · 사진 ' + (p.photos || []).length + '장' +
                (p.area ? ' · ' + esc(p.area) : '') + '</div>' +
            '</div>' +
            (posts.length ?
              '<button type="button" class="postBadge" data-id="' + p.id + '" title="눌러서 쓴 글 열기">✍️' +
                (posts.length > 1 ? ' ' + posts.length : '') + '</button>' : '') +
            '<div class="rt">' + esc(String(p.visitedAt || '').slice(0, 10)) + '</div>' +
          '</div>';
        }).join('') + '</div>';

        el.querySelectorAll('img[data-ph]').forEach(function (im) {
          Photos.url(im.getAttribute('data-ph')).then(function (u) { if (u) im.src = u; });
        });
        el.querySelectorAll('.plRow').forEach(function (row) {
          row.onclick = function () { openPlaceSheet(row.getAttribute('data-id')); };
        });
        /* ✍️ 뱃지 — 글이 하나면 바로 그 글을 열고, 여러 개면(채널별) 고를 수 있게 장소 시트를 연다.
           row 클릭(장소 시트 열기)으로 이어지지 않도록 막는다. */
        el.querySelectorAll('.postBadge').forEach(function (b) {
          b.onclick = function (e) {
            e.stopPropagation();
            var id = b.getAttribute('data-id');
            var posts = postsByPlace[id] || [];
            if (posts.length === 1) {
              Store.placeGet(id).then(function (p) { if (p) UI.openWriter(p, posts[0]); });
            } else {
              openPlaceSheet(id);
            }
          };
        });
      }

      el.querySelectorAll('[data-pf]').forEach(function (b) {
        b.onclick = function () { _filter = b.getAttribute('data-pf'); UI.renderRecords(); };
      });
      el.querySelectorAll('[data-v]').forEach(function (b) {
        b.onclick = function () { _view = b.getAttribute('data-v'); UI.renderRecords(); };
      });
    });
  };

  UI.openTripById = function (id) { openTrip(id); };
  /* 달력(calendar.js)의 '이미 쓴 글' 배지가 여러 글 중 고를 때 같은 시트를 쓴다 (2026-09-02) */
  UI.openPlaceSheet = function (id) { openPlaceSheet(id); };

  /* ── 여행 목록 ── */
  function renderTrips(box) {
    Promise.all([Trips.all(), Store.placeAll()]).then(function (r) {
      var trips = r[0], all = r[1];
      var loose = all.filter(function (p) { return !p.tripId; }).length;
      if (!trips.length) {
        box.innerHTML =
          '<div class="empty"><div style="font-size:38px;margin-bottom:10px;">🧳</div>' +
            '아직 만든 여행이 없어요.<br>' +
            '<span class="mini">여러 곳을 한 편으로 묶어 쓰고 싶을 때만 쓰면 됩니다.<br>' +
            '장소 하나 = 글 하나가 기본이에요.</span></div>' +
          '<button class="btn primary wide" id="trNew">＋ 여행 만들기</button>';
      } else {
        box.innerHTML = '<div class="card">' + trips.map(function (t) {
          var n = (t.placeIds || []).length;
          return '<div class="row trRow" data-id="' + t.id + '">' +
            '<div style="font-size:24px;width:34px;text-align:center;">🧳</div>' +
            '<div style="min-width:0;"><div class="ti">' + esc(t.name) + '</div>' +
            '<div class="sb">' + esc(t.startAt || '') +
              (t.endAt && t.endAt !== t.startAt ? ' ~ ' + esc(t.endAt) : '') +
              ' · 장소 ' + n + '곳</div></div>' +
            '<div class="rt">›</div></div>';
        }).join('') + '</div>' +
        '<button class="btn primary wide" id="trNew">＋ 여행 만들기</button>' +
        (loose ? '<div class="mini" style="margin-top:8px;text-align:center;">여행에 안 담긴 기록 ' + loose + '곳</div>' : '');
      }
      box.querySelector('#trNew').onclick = function () {
        var n = prompt('여행 이름 (예: 부산 2박 3일)');
        if (!n) return;
        Trips.save(Trips.create(n.trim())).then(function (t) {
          UI.renderRecords();
          openTrip(t.id);
        });
      };
      box.querySelectorAll('.trRow').forEach(function (row) {
        row.onclick = function () { openTrip(row.getAttribute('data-id')); };
      });
    });
  }

  /* ── 여행 하나 ── */
  function openTrip(id) {
    Promise.all([Trips.get(id), Trips.placesOf(id)]).then(function (r) {
      var t = r[0], places = r[1];
      if (!t) return;
      var photoN = places.reduce(function (n, p) { return n + (p.photos || []).length; }, 0);
      var ov = overlay({
        title: '🧳 ' + esc(t.name),
        body:
          '<label class="lbl">여행 이름</label>' +
          '<input class="inp" id="trName" value="' + esc(t.name) + '">' +
          '<div class="btn-row" style="margin-top:8px;">' +
            '<div style="flex:1;"><label class="lbl">시작</label>' +
              '<input class="inp" id="trStart" type="date" value="' + esc(t.startAt || '') + '"></div>' +
            '<div style="flex:1;"><label class="lbl">끝</label>' +
              '<input class="inp" id="trEnd" type="date" value="' + esc(t.endAt || '') + '"></div>' +
          '</div>' +
          '<div class="lbl">담긴 장소 ' + places.length + '곳 · 사진 ' + photoN + '장' +
            ' <span class="mini">(이 순서가 곧 글의 순서입니다)</span></div>' +
          (places.length
            ? '<div class="box">' + places.map(function (p, i) {
                var snap = p.profileSnap || {};
                return '<div class="row"><div style="width:22px;font-weight:800;">' + (i + 1) + '</div>' +
                  '<div style="min-width:0;"><div class="ti">' + esc(p.name || '(이름 없음)') + '</div>' +
                  '<div class="sb">' + esc((snap.icon || '📍') + ' ' + (snap.name || '')) +
                    ' · 사진 ' + (p.photos || []).length + '장</div></div>' +
                  '<div class="rt">' +
                    '<button class="btn sm ghost trUp" data-p="' + p.id + '">▲</button> ' +
                    '<button class="btn sm ghost trDn" data-p="' + p.id + '">▼</button> ' +
                    '<button class="btn sm ghost trOut" data-p="' + p.id + '">빼기</button>' +
                  '</div></div>';
              }).join('') + '</div>'
            : '<div class="mini">아직 담긴 장소가 없어요. 아래에서 담아주세요.</div>') +
          '<div class="btn-row" style="margin-top:8px;">' +
            '<button class="btn ghost" id="trAdd">＋ 장소 담기</button>' +
            (places.length > 1 ? '<button class="btn ghost" id="trSort">🕘 시간순 정렬</button>' : '') +
          '</div>' +
          '<div class="notice">여행을 지워도 <b>장소와 사진은 그대로 남습니다</b> — 묶음만 풀립니다.</div>',
        foot: '<button class="btn danger sm" id="trDel">삭제</button>' +
              '<button class="btn primary" id="trWrite">✍️ 한 편으로 쓰기</button>'
      });

      function commit() {
        t.name = ov.querySelector('#trName').value.trim() || t.name;
        t.startAt = ov.querySelector('#trStart').value;
        t.endAt = ov.querySelector('#trEnd').value;
        return Trips.save(t);
      }
      ov.querySelector('#trName').onchange = commit;
      ov.querySelector('#trStart').onchange = commit;
      ov.querySelector('#trEnd').onchange = commit;

      ov.querySelectorAll('.trUp').forEach(function (b) {
        b.onclick = function () { Trips.movePlace(id, b.dataset.p, -1).then(function () { ov.close(); openTrip(id); }); };
      });
      ov.querySelectorAll('.trDn').forEach(function (b) {
        b.onclick = function () { Trips.movePlace(id, b.dataset.p, 1).then(function () { ov.close(); openTrip(id); }); };
      });
      ov.querySelectorAll('.trOut').forEach(function (b) {
        b.onclick = function () { Trips.removePlace(id, b.dataset.p).then(function () { ov.close(); openTrip(id); UI.renderRecords(); }); };
      });
      ov.querySelector('#trAdd').onclick = function () { ov.close(); pickPlaceForTrip(id); };
      var srt = ov.querySelector('#trSort');
      if (srt) srt.onclick = function () {
        Trips.sortByTime(id).then(function () { ov.close(); openTrip(id); showToast('시간순으로 맞췄어요', 'ok'); });
      };
      ov.querySelector('#trDel').onclick = function () {
        if (!confirm('이 여행을 지울까요?\n장소와 사진은 그대로 남습니다.')) return;
        Trips.remove(id).then(function () { ov.close(); UI.renderRecords(); showToast('묶음을 풀었어요'); });
      };
      ov.querySelector('#trWrite').onclick = function () {
        if (!places.length) { showToast('먼저 장소를 담아주세요', 'err'); return; }
        commit().then(function () { ov.close(); UI.openWriter(places, null, t); });
      };
    });
  }

  /* 여행에 담을 장소 고르기 */
  function pickPlaceForTrip(tripId) {
    Store.placeAll().then(function (all) {
      var free = all.filter(function (p) { return !p.tripId; });
      var ov = overlay({
        title: '여행에 담을 장소',
        body: free.length
          ? '<div class="mini">이미 다른 여행에 담긴 곳은 목록에 없습니다.</div><div class="box">' +
            free.map(function (p) {
              var snap = p.profileSnap || {};
              return '<div class="row pkRow" data-id="' + p.id + '"><div>' +
                '<div class="ti">' + esc(p.name || '(이름 없음)') + '</div>' +
                '<div class="sb">' + esc((snap.icon || '📍') + ' ' + (snap.name || '')) + ' · ' +
                esc(String(p.visitedAt || '').slice(0, 10)) + '</div></div></div>';
            }).join('') + '</div>'
          : '<div class="empty">담을 수 있는 기록이 없어요.</div>'
      });
      ov.querySelectorAll('.pkRow').forEach(function (row) {
        row.onclick = function () {
          Trips.add(tripId, row.getAttribute('data-id')).then(function () {
            ov.close(); openTrip(tripId); UI.renderRecords();
          }).catch(function (e) { showToast(e.message, 'err'); });
        };
      });
    });
  }

  /* 장소 쪽에서 여행 고르기 */
  function pickTrip(placeId) {
    Trips.all().then(function (trips) {
      var ov = overlay({
        title: '어느 여행에 담을까요?',
        body: (trips.length
            ? '<div class="box">' + trips.map(function (t) {
                return '<div class="row tkRow" data-id="' + t.id + '"><div>' +
                  '<div class="ti">🧳 ' + esc(t.name) + '</div>' +
                  '<div class="sb">' + esc(t.startAt || '') + ' · 장소 ' + (t.placeIds || []).length + '곳</div>' +
                  '</div></div>';
              }).join('') + '</div>'
            : '<div class="mini">아직 만든 여행이 없어요.</div>'),
        foot: '<button class="btn primary wide" id="tkNew">＋ 새 여행에 담기</button>'
      });
      ov.querySelectorAll('.tkRow').forEach(function (row) {
        row.onclick = function () {
          Trips.add(row.getAttribute('data-id'), placeId).then(function () {
            ov.close(); UI.renderRecords(); showToast('담았어요', 'ok');
          }).catch(function (e) { showToast(e.message, 'err'); });
        };
      });
      ov.querySelector('#tkNew').onclick = function () {
        var n = prompt('여행 이름 (예: 부산 2박 3일)');
        if (!n) return;
        Trips.save(Trips.create(n.trim())).then(function (t) {
          return Trips.add(t.id, placeId).then(function () {
            ov.close(); UI.renderRecords(); showToast('새 여행에 담았어요', 'ok');
          });
        });
      };
    });
  }

  function openPlaceSheet(id) {
    Promise.all([Store.placeGet(id), Store.postsOf(id)]).then(function (r) {
      var p = r[0], posts = r[1] || [];
      if (!p) return;
      var snap = p.profileSnap || {};
      var ov = overlay({
        title: esc((snap.icon || '📍') + ' ' + (p.name || '(이름 없음)')),
        body:
          '<div class="mini">' + esc(String(p.visitedAt || '').replace('T', ' ')) +
            (p.address ? ' · ' + esc(p.address) : '') +
            (p.rating ? ' · ★' + p.rating : '') + '</div>' +
          (p.memo ? '<div class="box">' + esc(p.memo) + '</div>' : '') +
          '<div class="lbl">사진 ' + (p.photos || []).length + '장</div>' +
          '<div class="grid">' + (p.photos || []).slice(0, 12).map(function (x) {
            return '<div class="ph"><img data-ph="' + x.id + '" alt=""><span class="t">' + esc(x.tag) + '</span></div>';
          }).join('') + '</div>' +
          '<div class="lbl">이 장소로 만든 글 ' + posts.length + '개' +
            (posts.length ? ' <span class="mini">(눌러서 열기)</span>' : '') + '</div>' +
          (posts.length ? '<div class="box">' + posts.map(function (o) {
            var ch = ClaudeAI.channel(o.ch);
            return '<div class="row postRow" data-id="' + o.id + '"><div style="min-width:0;">' +
              '<div class="ti">' + ClaudeAI.channelIcon(o.ch, 16) + ' ' + esc(ch.label) + '</div>' +
              '<div class="sb">' + new Date(o.createdAt).toLocaleDateString('ko-KR') +
                (o.published ? ' · 발행됨' : '') + '</div></div><div class="rt">›</div></div>';
          }).join('') + '</div>' : '<div class="mini">아직 없어요</div>'),
        foot: '<button class="btn danger sm" id="plDel">삭제</button>' +
              '<button class="btn ghost sm" id="plTrip">🧳 여행에 담기</button>' +
              '<button class="btn primary" id="plOpen">이어서 작업</button>'
      });
      ov.querySelectorAll('img[data-ph]').forEach(function (im) {
        Photos.url(im.getAttribute('data-ph')).then(function (u) { if (u) im.src = u; });
      });
      ov.querySelectorAll('.postRow').forEach(function (row) {
        row.onclick = function () {
          var o = posts.filter(function (x) { return x.id === row.getAttribute('data-id'); })[0];
          if (o) { ov.close(); UI.openWriter(p, o); }
        };
      });
      ov.querySelector('#plTrip').onclick = function () { ov.close(); pickTrip(id); };
      ov.querySelector('#plOpen').onclick = function () {
        Place.open(id).then(function () { ov.close(); UI.switchTab('now'); });
      };
      ov.querySelector('#plDel').onclick = function () {
        if (!confirm('이 장소와 사진·글을 모두 지울까요?\n되돌릴 수 없습니다.')) return;
        Store.placeDelete(id).then(function () {
          if (Place.current() && Place.current().id === id) Place.clear();
          ov.close(); UI.refresh(); showToast('지웠어요');
        });
      };
    });
  }
})();
