/* ═══════════════════════════════════════════════════════════
   calendar.js — 달력
   ----------------------------------------------------------------
   사용자 요청(2026-08-28)으로 넣었다. 설계안 4장에서는 "달력은 없다"였는데,
   여행은 **날짜가 뼈대**라 계획을 날짜에 놓고 보는 편이 자연스럽다.

   ⚠️ 현장매니저 calendar.js(3,907줄)를 옮기지 않았다.
      그쪽은 작업·호수·팀 공유·월매출이 한 파일에 얽혀 있어, 지우는 게 새로 짜는 것보다 오래 걸린다
      (설계안 7장의 판단 그대로). 여기서 가져온 것은 **두 가지뿐**이다.
        · 한국 공휴일 표(2024~2028) — 음력 명절·대체공휴일이 들어간 실제 자산이다
        · 표에 없는 해는 양력 고정 공휴일만 표시하는 폴백 규칙

   한 칸에 세 가지가 보인다: 여행 기간 · 일정(계획) · 기록(다녀온 곳).
   날짜를 누르면 그날 내용이 한 장에 뜨고, 거기서 바로
   일정 추가 · 계획에서 방문 시작 · 기록 열기 가 된다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var Cal = window.Cal = {};
  var _y, _m, _sel = null, _host = null;

  function pad(n) { return String(n).padStart(2, '0'); }
  function ds(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function todayStr() { return isoLocal().slice(0, 10); }

  /* ★ 한국 공휴일 (음력 명절·대체공휴일 포함, 2024~2028 내장) — 현장매니저에서 그대로 가져왔다.
     ※ 2029년 이후는 이 표에 연도별로 추가해야 한다(양력 고정 공휴일은 자동 표시). */
  var KR_HOLIDAYS = {
    '2024-01-01':'신정','2024-02-09':'설날연휴','2024-02-10':'설날','2024-02-11':'설날연휴','2024-02-12':'대체공휴일',
    '2024-03-01':'삼일절','2024-04-10':'국회의원선거','2024-05-05':'어린이날','2024-05-06':'대체공휴일','2024-05-15':'부처님오신날',
    '2024-06-06':'현충일','2024-08-15':'광복절','2024-09-16':'추석연휴','2024-09-17':'추석','2024-09-18':'추석연휴',
    '2024-10-03':'개천절','2024-10-09':'한글날','2024-12-25':'성탄절',
    '2025-01-01':'신정','2025-01-27':'임시공휴일','2025-01-28':'설날연휴','2025-01-29':'설날','2025-01-30':'설날연휴',
    '2025-03-01':'삼일절','2025-03-03':'대체공휴일','2025-05-05':'어린이날·부처님오신날','2025-05-06':'대체공휴일',
    '2025-06-03':'대통령선거','2025-06-06':'현충일','2025-08-15':'광복절','2025-10-03':'개천절',
    '2025-10-05':'추석연휴','2025-10-06':'추석','2025-10-07':'추석연휴','2025-10-08':'대체공휴일','2025-10-09':'한글날','2025-12-25':'성탄절',
    '2026-01-01':'신정','2026-02-16':'설날연휴','2026-02-17':'설날','2026-02-18':'설날연휴',
    '2026-03-01':'삼일절','2026-03-02':'대체공휴일','2026-05-05':'어린이날','2026-05-24':'부처님오신날','2026-05-25':'대체공휴일',
    '2026-06-03':'지방선거','2026-06-06':'현충일','2026-08-15':'광복절','2026-08-17':'대체공휴일',
    '2026-09-24':'추석연휴','2026-09-25':'추석','2026-09-26':'추석연휴','2026-10-03':'개천절','2026-10-05':'대체공휴일','2026-10-09':'한글날','2026-12-25':'성탄절',
    '2027-01-01':'신정','2027-02-06':'설날연휴','2027-02-07':'설날','2027-02-08':'설날연휴','2027-02-09':'대체공휴일',
    '2027-03-01':'삼일절','2027-05-05':'어린이날','2027-05-13':'부처님오신날','2027-06-06':'현충일',
    '2027-08-15':'광복절','2027-08-16':'대체공휴일','2027-09-14':'추석연휴','2027-09-15':'추석','2027-09-16':'추석연휴',
    '2027-10-03':'개천절','2027-10-04':'대체공휴일','2027-10-09':'한글날','2027-10-11':'대체공휴일','2027-12-25':'성탄절','2027-12-27':'대체공휴일',
    '2028-01-01':'신정','2028-01-26':'설날연휴','2028-01-27':'설날','2028-01-28':'설날연휴',
    '2028-03-01':'삼일절','2028-05-02':'부처님오신날','2028-05-05':'어린이날','2028-06-06':'현충일','2028-08-15':'광복절',
    '2028-10-02':'추석연휴','2028-10-03':'추석·개천절','2028-10-04':'추석연휴','2028-10-05':'대체공휴일','2028-10-09':'한글날','2028-12-25':'성탄절'
  };
  var KR_FIXED = { '01-01':'신정','03-01':'삼일절','05-05':'어린이날','06-06':'현충일',
                   '08-15':'광복절','10-03':'개천절','10-09':'한글날','12-25':'성탄절' };
  function holidayOf(d) {
    if (KR_HOLIDAYS[d]) return KR_HOLIDAYS[d];
    var y = d.slice(0, 4);
    if (y >= '2024' && y <= '2028') return '';   // 표가 진실 공급원 — 없으면 공휴일 아님
    return KR_FIXED[d.slice(5)] || '';
  }
  Cal.holidayOf = holidayOf;

  /* 그 달에 걸치는 것들을 한 번에 모은다 */
  function collect(y, m) {
    var from = ds(y, m, 1);
    var last = new Date(y, m + 1, 0).getDate();
    var to = ds(y, m, last);
    return Promise.all([Store.placeAll(), Plans.all(), Trips.all()]).then(function (r) {
      var byDate = {};
      function slot(d) { return (byDate[d] = byDate[d] || { places: [], plans: [], trips: [] }); }

      r[0].forEach(function (p) {
        var d = String(p.visitedAt || '').slice(0, 10);
        if (d >= from && d <= to) slot(d).places.push(p);
      });
      r[1].forEach(function (pl) {
        if (pl.date >= from && pl.date <= to) slot(pl.date).plans.push(pl);
      });
      /* 여행은 기간이라 걸치는 날 전부에 표시한다 */
      r[2].forEach(function (t) {
        var s = t.startAt || '', e = t.endAt || t.startAt || '';
        if (!s || e < from || s > to) return;
        var cur = new Date((s > from ? s : from) + 'T00:00');
        var end = new Date((e < to ? e : to) + 'T00:00');
        while (cur <= end) {
          slot(ds(cur.getFullYear(), cur.getMonth(), cur.getDate())).trips.push(t);
          cur.setDate(cur.getDate() + 1);
        }
      });
      return byDate;
    });
  }

  /* ── 달력 그리기 ── */
  Cal.render = function (host) {
    _host = host || _host;
    if (!_host) return;
    if (_y == null) { var t = new Date(); _y = t.getFullYear(); _m = t.getMonth(); }
    if (!_sel) _sel = todayStr();

    collect(_y, _m).then(function (byDate) {
      var first = new Date(_y, _m, 1).getDay();
      var lastDate = new Date(_y, _m + 1, 0).getDate();
      var today = todayStr();
      var cells = '';

      for (var i = 0; i < first; i++) cells += '<div class="cal-c out"></div>';
      for (var d = 1; d <= lastDate; d++) {
        var key = ds(_y, _m, d);
        var s = byDate[key] || { places: [], plans: [], trips: [] };
        var dow = (first + d - 1) % 7;
        var hol = holidayOf(key);
        var cls = 'cal-c';
        if (key === today) cls += ' today';
        if (key === _sel) cls += ' sel';
        if (dow === 0 || hol) cls += ' sun'; else if (dow === 6) cls += ' sat';

        var marks = '';
        if (s.trips.length) marks += '<i class="m-trip"></i>';
        if (s.plans.length) marks += '<i class="m-plan"></i>';
        if (s.places.length) marks += '<i class="m-place"></i>';

        cells += '<div class="' + cls + '" data-d="' + key + '">' +
          '<span class="n">' + d + '</span>' +
          (hol ? '<span class="hol">' + esc(hol.slice(0, 4)) + '</span>' : '') +
          '<span class="marks">' + marks + '</span></div>';
      }
      var remain = (first + lastDate) % 7;
      if (remain) for (var k = remain; k < 7; k++) cells += '<div class="cal-c out"></div>';

      _host.innerHTML =
        '<div class="cal-hd">' +
          '<button class="btn sm ghost" id="calPrev">‹</button>' +
          '<button class="btn sm ghost" id="calTitle">' + _y + '년 ' + (_m + 1) + '월</button>' +
          '<button class="btn sm ghost" id="calNext">›</button>' +
          '<button class="btn sm ghost sp" id="calToday">오늘</button>' +
        '</div>' +
        '<div class="cal-dow">' + ['일','월','화','수','목','금','토'].map(function (w, i) {
          return '<div class="' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</div>';
        }).join('') + '</div>' +
        '<div class="cal-grid">' + cells + '</div>' +
        '<div class="cal-legend"><span><i class="m-trip"></i> 여행</span>' +
          '<span><i class="m-plan"></i> 일정</span><span><i class="m-place"></i> 기록</span></div>' +
        '<div id="calDay"></div>';

      _host.querySelector('#calPrev').onclick = function () { move(-1); };
      _host.querySelector('#calNext').onclick = function () { move(1); };
      _host.querySelector('#calToday').onclick = function () {
        var t2 = new Date(); _y = t2.getFullYear(); _m = t2.getMonth(); _sel = todayStr(); Cal.render();
      };
      _host.querySelector('#calTitle').onclick = openMonthPicker;
      _host.querySelectorAll('.cal-c[data-d]').forEach(function (c) {
        c.onclick = function () { _sel = c.getAttribute('data-d'); Cal.render(); };
      });

      renderDay(_host.querySelector('#calDay'), _sel, byDate[_sel] || { places: [], plans: [], trips: [] });
    });
  };

  function move(dir) {
    _m += dir;
    if (_m < 0) { _m = 11; _y--; }
    if (_m > 11) { _m = 0; _y++; }
    Cal.render();
  }

  function openMonthPicker() {
    var years = [];
    for (var y = _y - 2; y <= _y + 2; y++) years.push(y);
    var months = [];
    for (var i = 0; i < 12; i++) months.push(i);
    var ov = overlay({
      title: '연·월 고르기',
      body:
        '<label class="lbl">연도</label><div class="tagbar" id="mpY">' +
          years.map(function (y) {
            return '<button type="button" class="tag' + (y === _y ? ' on' : '') + '" data-y="' + y + '">' + y + '</button>';
          }).join('') + '</div>' +
        '<label class="lbl">월</label><div class="tagbar" id="mpM">' +
          months.map(function (i) {
            return '<button type="button" class="tag' + (i === _m ? ' on' : '') + '" data-m="' + i + '">' + (i + 1) + '월</button>';
          }).join('') + '</div>'
    });
    ov.querySelectorAll('#mpY .tag').forEach(function (b) {
      b.onclick = function () { _y = +b.dataset.y; ov.close(); Cal.render(); };
    });
    ov.querySelectorAll('#mpM .tag').forEach(function (b) {
      b.onclick = function () { _m = +b.dataset.m; ov.close(); Cal.render(); };
    });
  }

  /* ── 고른 날짜의 내용 ── */
  function renderDay(box, date, s) {
    if (!box) return;
    var hol = holidayOf(date);
    var d = new Date(date + 'T00:00');
    var wd = ['일','월','화','수','목','금','토'][d.getDay()];

    var htmlTrips = s.trips.map(function (t) {
      return '<div class="row calTrip" data-id="' + t.id + '">' +
        '<div style="font-size:20px;width:28px;text-align:center;">🧳</div>' +
        '<div><div class="ti">' + esc(t.name) + '</div>' +
        '<div class="sb">' + esc(t.startAt || '') +
          (t.endAt && t.endAt !== t.startAt ? ' ~ ' + esc(t.endAt) : '') + '</div></div>' +
        '<div class="rt">›</div></div>';
    }).join('');

    var htmlPlans = s.plans.map(function (pl) {
      var pf = pl.catId ? Profiles.get(pl.catId) : null;
      return '<div class="row calPlan" data-id="' + pl.id + '">' +
        '<div style="width:46px;font-weight:800;color:var(--ac);">' + esc(pl.time || '—') + '</div>' +
        '<div style="min-width:0;"><div class="ti">' +
          (pl.done ? '<span style="opacity:.55;text-decoration:line-through;">' : '') +
          esc(pl.title || '(제목 없음)') + (pl.done ? '</span>' : '') +
          (pl.placeId ? '<span class="badge">기록됨</span>' : '') + '</div>' +
        '<div class="sb">' + esc(pf ? (pf.icon || '📍') + ' ' + pf.name : '') +
          (pl.memo ? ' · ' + esc(pl.memo.slice(0, 20)) : '') + '</div></div>' +
        '<div class="rt">›</div></div>';
    }).join('');

    var htmlPlaces = s.places.length
      ? '<div class="lbl">다녀온 곳</div>' + s.places.map(function (p) {
          var snap = p.profileSnap || {};
          return '<div class="row calPlace" data-id="' + p.id + '">' +
            '<div style="font-size:20px;width:28px;text-align:center;">' + esc(snap.icon || '📍') + '</div>' +
            '<div><div class="ti">' + esc(p.name || '(이름 없음)') + '</div>' +
            '<div class="sb">사진 ' + (p.photos || []).length + '장</div></div>' +
            '<div class="rt">›</div></div>';
        }).join('')
      : '';

    box.innerHTML =
      '<div class="card">' +
        '<div class="sec-hd"><h2>' + esc(date.replace(/-/g, '.')) + ' (' + wd + ')' +
          (hol ? ' <span class="badge" style="background:rgba(196,69,58,.12);color:var(--wn);">' + esc(hol) + '</span>' : '') +
        '</h2><button class="btn sm primary sp" id="dayAdd">＋ 일정</button></div>' +
        htmlTrips + htmlPlans + htmlPlaces +
        (!s.trips.length && !s.plans.length && !s.places.length
          ? '<div class="empty" style="padding:24px;">이 날은 비어 있어요.<br>' +
            '<span class="mini">＋ 일정으로 가 볼 곳을 미리 적어두면,<br>그날 현장에서 바로 촬영으로 이어집니다.</span></div>'
          : '') +
      '</div>';

    box.querySelector('#dayAdd').onclick = function () { openPlan(Plans.create(date)); };
    box.querySelectorAll('.calPlan').forEach(function (r) {
      r.onclick = function () { Plans.get(r.dataset.id).then(openPlan); };
    });
    box.querySelectorAll('.calPlace').forEach(function (r) {
      r.onclick = function () { Place.open(r.dataset.id).then(function () { UI.switchTab('now'); }); };
    });
    box.querySelectorAll('.calTrip').forEach(function (r) {
      r.onclick = function () { if (UI.openTripById) UI.openTripById(r.dataset.id); };
    });
  }

  /* ── 일정 편집 ──
     ⭐ 여기가 이 기능의 핵심이다. 「방문 시작」이 계획을 기록으로 잇는다. */
  function openPlan(pl) {
    if (!pl) return;
    Trips.all().then(function (trips) {
      var pfs = Profiles.list();
      var isNew = !pl.title && !pl.placeId;
      var ov = overlay({
        title: isNew ? '＋ 일정' : '일정',
        body:
          '<label class="lbl">무엇을 / 어디를</label>' +
          '<input class="inp" id="pnTitle" value="' + esc(pl.title) + '" placeholder="예) 감천문화마을, 소문난 국밥">' +
          '<div class="btn-row" style="margin-top:8px;">' +
            '<div style="flex:1.3;"><label class="lbl">날짜</label>' +
              '<input class="inp" id="pnDate" type="date" value="' + esc(pl.date) + '"></div>' +
            '<div style="flex:1;"><label class="lbl">시각 <span class="mini">(선택)</span></label>' +
              '<input class="inp" id="pnTime" type="time" value="' + esc(pl.time || '') + '"></div>' +
          '</div>' +
          '<label class="lbl">카테고리 <span class="mini">(방문 시작하면 이 태그 세트로 열립니다)</span></label>' +
          '<div class="tagbar" id="pnCat">' + pfs.map(function (pf) {
            return '<button type="button" class="tag' + (pl.catId === pf.id ? ' on' : '') + '" data-c="' + pf.id + '">' +
              esc((pf.icon || '📍') + ' ' + pf.name) + '</button>';
          }).join('') + '</div>' +
          '<label class="lbl">여행 <span class="mini">(선택)</span></label>' +
          '<div class="tagbar" id="pnTrip">' +
            '<button type="button" class="tag' + (!pl.tripId ? ' on' : '') + '" data-t="">없음</button>' +
            trips.map(function (t) {
              return '<button type="button" class="tag' + (pl.tripId === t.id ? ' on' : '') + '" data-t="' + t.id + '">🧳 ' + esc(t.name) + '</button>';
            }).join('') + '</div>' +
          '<label class="lbl">메모</label>' +
          '<textarea class="inp" id="pnMemo" placeholder="예) 웨이팅 있음, 11시 전에 도착">' + esc(pl.memo || '') + '</textarea>' +
          (pl.placeId ? '<div class="notice">이 일정은 이미 기록으로 이어졌습니다. 아래 <b>기록 열기</b>로 이어서 작업하세요.</div>' : ''),
        foot: (isNew ? '' : '<button class="btn danger sm" id="pnDel">삭제</button>') +
              '<button class="btn ghost" id="pnSave">저장</button>' +
              '<button class="btn primary" id="pnGo">' + (pl.placeId ? '기록 열기' : '📷 방문 시작') + '</button>'
      });

      ov.querySelectorAll('#pnCat .tag').forEach(function (b) {
        b.onclick = function () {
          ov.querySelectorAll('#pnCat .tag').forEach(function (o) { o.classList.remove('on'); });
          b.classList.add('on'); pl.catId = b.dataset.c;
        };
      });
      ov.querySelectorAll('#pnTrip .tag').forEach(function (b) {
        b.onclick = function () {
          ov.querySelectorAll('#pnTrip .tag').forEach(function (o) { o.classList.remove('on'); });
          b.classList.add('on'); pl.tripId = b.dataset.t || null;
        };
      });

      function commit() {
        pl.title = ov.querySelector('#pnTitle').value.trim();
        pl.date = ov.querySelector('#pnDate').value || pl.date;
        pl.time = ov.querySelector('#pnTime').value || '';
        pl.memo = ov.querySelector('#pnMemo').value;
        if (!pl.title) { showToast('무엇을 갈지 한 줄만 적어주세요', 'err'); return null; }
        return Plans.save(pl);
      }

      ov.querySelector('#pnSave').onclick = function () {
        var r = commit(); if (!r) return;
        r.then(function () { ov.close(); _sel = pl.date; Cal.render(); showToast('저장했어요', 'ok'); });
      };
      var del = ov.querySelector('#pnDel');
      if (del) del.onclick = function () {
        if (!confirm('이 일정을 지울까요?\n이어진 기록은 그대로 남습니다.')) return;
        Plans.remove(pl.id).then(function () { ov.close(); Cal.render(); showToast('지웠어요'); });
      };
      ov.querySelector('#pnGo').onclick = function () {
        var r = commit(); if (!r) return;
        r.then(function () { return Plans.startVisit(pl.id); })
         .then(function (res) {
           ov.close();
           UI.switchTab('now');
           showToast(res.reused ? '이어서 작업할게요' : '방문을 시작했어요 — 이제 찍으면 됩니다', 'ok');
         })
         .catch(function (e) { showToast(e.message, 'err'); });
      };
    });
  }
  Cal.openPlan = openPlan;
  Cal.select = function (date) {
    _sel = date;
    var d = new Date(date + 'T00:00');
    _y = d.getFullYear(); _m = d.getMonth();
  };
  console.log('[Cal] 로드됨');
})();
