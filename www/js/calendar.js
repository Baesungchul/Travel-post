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
  /* 장소별 '이미 쓴 글' 묶음 — collect() 가 채우고, 목록·상세의 채널 아이콘(chIconsOf)이 읽는다
     (사용자 요청 2026-09-02: 이름 옆에 어느 채널에 썼는지 표시). */
  var _postsByPlace = {};

  /* ── 펼치기(확대) 상태 ────────────────────────────────────
     현장매니저와 '같은 손짓'을 쓴다:
       · 좌우로 끌기      → 이전/다음 달 (손가락을 따라 움직이고, 놓으면 넘어간다)
       · 아래로 당기기    → 달력이 화면 가득 커진다
       · 위로 밀기        → 다시 접힌다
     펼친 동안에는 보기를 둘 중에 고를 수 있다:
       · 격자(grid) — 7열 달력을 화면 가득. 어느 날이 비었는지 한눈에 보인다
       · 목록(list) — 그 달의 내용이 있는 날만 세로로. 무엇이 있었는지 읽기 좋다

     ⚠️ 현장매니저 코드를 그대로 옮기지 않았다. 그쪽은 #customerBody 라는 자체 스크롤
        컨테이너와 CSS zoom(글자 크기) 위에서 좌표를 맞추느라 보정 로직이 크다.
        찍고쓰다는 페이지(body) 자체가 스크롤되고 글자 배율도 없어서,
        펼친 동안 body 스크롤을 잠그는 방식이 훨씬 짧고 안 깨진다.
        → 손짓은 같고, 속은 이 앱에 맞게 새로 짰다. */
  var _expanded  = false;
  var _expView   = 'grid';          // 'grid' | 'list'
  var _lastNatH  = 0;               // 접힌 격자의 '원래 높이' (접을 때 목표값)
  var _EXPVIEW_KEY = 'tp_cal_expview';
  try {
    var _sv = localStorage.getItem(_EXPVIEW_KEY);
    if (_sv === 'grid' || _sv === 'list') _expView = _sv;
  } catch (e) {}

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
    return Promise.all([Store.placeAll(), Plans.all(), Trips.all(), Store.postAll()]).then(function (r) {
      var byDate = {};
      function slot(d) { return (byDate[d] = byDate[d] || { places: [], plans: [], trips: [] }); }

      /* 장소별로 쓴 글을 묶어 둔다 — 목록·상세에서 이름 옆에 '어느 채널에 썼는지' 아이콘을
         보여주고, 눌러서 바로 그 글을 열기 위해서다 (사용자 요청 2026-09-02).
         postAll() 이 최신순 정렬이라 [0]이 가장 최근 글이다. */
      _postsByPlace = {};
      (r[3] || []).forEach(function (o) {
        (_postsByPlace[o.placeId] = _postsByPlace[o.placeId] || []).push(o);
      });

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

  /* ── 칸 하나 그리기 ──
     접힌 달력은 점 세 개로, 펼친 격자는 아이콘+개수로 보여준다.
     칸 너비가 화면의 1/7(≈50px)뿐이라 펼쳐도 글자는 거의 못 넣는다 — 그래서 아이콘이다. */
  function cellHTML(key, d, dow, s, today, expandedGrid) {
    var hol = holidayOf(key);
    var cls = 'cal-c';
    if (key === today) cls += ' today';
    if (key === _sel) cls += ' sel';
    if (dow === 0 || hol) cls += ' sun'; else if (dow === 6) cls += ' sat';

    /* ⚠️ 2026-09-02 사용자 지적: '글' 을 기록과 별개의 점/아이콘으로 더했더니
       장소 하나(대상 하나)에 점이 두 개(기록+글) 찍혀 오히려 헷갈렸다.
       → 작은(접힌) 달력·펼친 격자는 원래대로 여행/일정/기록 세 가지만 표시하고,
          '어느 채널에 글을 썼는지'는 이름이 보이는 목록·상세에서만(아래 agendaHTML·renderDay) 보여준다. */
    var inner;
    if (expandedGrid) {
      var ic = '';
      if (s.trips.length)  ic += '<b class="ci trip">🧳</b>';
      if (s.plans.length)  ic += '<b class="ci plan">📌' + (s.plans.length > 1 ? s.plans.length : '') + '</b>';
      if (s.places.length) ic += '<b class="ci place">📷' + (s.places.length > 1 ? s.places.length : '') + '</b>';
      inner = '<span class="n">' + d + '</span>' +
              (hol ? '<span class="hol">' + esc(hol.slice(0, 4)) + '</span>' : '') +
              '<span class="cal-icos">' + ic + '</span>';
    } else {
      var marks = '';
      if (s.trips.length) marks += '<i class="m-trip"></i>';
      if (s.plans.length) marks += '<i class="m-plan"></i>';
      if (s.places.length) marks += '<i class="m-place"></i>';
      inner = '<span class="n">' + d + '</span>' +
              (hol ? '<span class="hol">' + esc(hol.slice(0, 4)) + '</span>' : '') +
              '<span class="marks">' + marks + '</span>';
    }
    return '<div class="' + cls + '" data-d="' + key + '">' + inner + '</div>';
  }

  /* ── 펼침·목록 보기 ──
     그 달에서 '내용이 있는 날'만 세로로 늘어놓는다.
     빈 날까지 넣으면 스크롤만 길어지고 정작 볼 게 안 보인다. */
  function agendaHTML(byDate) {
    var lastDate = new Date(_y, _m + 1, 0).getDate();
    var today = todayStr();
    var out = '', any = false;
    /* ⚠️ 여행은 기간이라 걸치는 날마다 byDate 에 들어 있다(달력에서는 그게 맞다).
       목록에서까지 매일 되풀이하면 같은 줄이 8번 나와 정작 볼 것을 덮는다.
       → 그 달에 처음 나오는 날에만, 기간을 붙여 한 번 보여준다. */
    var shownTrip = {};

    for (var d = 1; d <= lastDate; d++) {
      var key = ds(_y, _m, d);
      var s = byDate[key];
      if (!s) continue;

      var newTrips = s.trips.filter(function (t) {
        if (shownTrip[t.id]) return false;
        shownTrip[t.id] = true;
        return true;
      });
      /* 이어지는 여행뿐이고 일정·기록이 없는 날은 통째로 건너뛴다 */
      if (!newTrips.length && !s.plans.length && !s.places.length) continue;
      any = true;

      var dt = new Date(key + 'T00:00');
      var wd = ['일','월','화','수','목','금','토'][dt.getDay()];
      var hol = holidayOf(key);
      var hcls = 'ag-date' + (key === today ? ' today' : '') +
                 ((dt.getDay() === 0 || hol) ? ' sun' : (dt.getDay() === 6 ? ' sat' : ''));

      var rows = '';
      newTrips.forEach(function (t) {
        var per = esc(String(t.startAt || '').slice(5).replace('-', '.'));
        if (t.endAt && t.endAt !== t.startAt) per += '~' + esc(String(t.endAt).slice(5).replace('-', '.'));
        rows += '<div class="ag-row calTrip" data-id="' + t.id + '"><span class="ag-ic">🧳</span>' +
                '<span class="ag-tx">' + esc(t.name) + '</span>' +
                '<span class="ag-rt">' + per + '</span></div>';
      });
      s.plans.forEach(function (pl) {
        var pf = pl.catId ? Profiles.get(pl.catId) : null;
        rows += '<div class="ag-row calPlan" data-id="' + pl.id + '"><span class="ag-ic">' +
                esc(pf ? (pf.icon || '📌') : '📌') + '</span>' +
                '<span class="ag-tx' + (pl.done ? ' done' : '') + '">' + esc(pl.title || '(제목 없음)') + '</span>' +
                '<span class="ag-rt">' + esc(pl.time || '일정') + '</span></div>';
      });
      s.places.forEach(function (p) {
        var snap = p.profileSnap || {};
        rows += '<div class="ag-row calPlace" data-id="' + p.id + '"><span class="ag-ic">' +
                esc(snap.icon || '📷') + '</span>' +
                '<span class="ag-tx">' + esc(placeLabel(p)) + '</span>' +
                chIconsOf(p.id) +
                '<span class="ag-rt">사진 ' + (p.photos || []).length + '</span></div>';
      });

      out += '<div class="ag-day" data-d="' + key + '">' +
               '<div class="' + hcls + '">' + (_m + 1) + '.' + d + ' <span>(' + wd + ')</span>' +
                 (hol ? '<em>' + esc(hol) + '</em>' : '') + '</div>' + rows +
             '</div>';
    }

    if (!any) {
      out = '<div class="ag-empty">이 달에는 아직 아무것도 없어요.' +
            '<span class="mini">달력으로 돌아가 날짜를 누르면 일정을 넣을 수 있어요.</span></div>';
    }
    return out;
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
      var expGrid = _expanded && _expView === 'grid';
      var expList = _expanded && _expView === 'list';
      var cells = '';

      for (var i = 0; i < first; i++) cells += '<div class="cal-c out"></div>';
      for (var d = 1; d <= lastDate; d++) {
        var key = ds(_y, _m, d);
        cells += cellHTML(key, d, (first + d - 1) % 7,
                          byDate[key] || { places: [], plans: [], trips: [] }, today, expGrid);
      }
      var remain = (first + lastDate) % 7;
      if (remain) for (var k = remain; k < 7; k++) cells += '<div class="cal-c out"></div>';

      /* ⚠️ 보기 전환 버튼의 아이콘은 '지금 보기'가 아니라 '누르면 갈 보기'를 뜻한다.
         버튼은 상태 표시가 아니라 행동이기 때문이다(현장매니저에서 같은 결론). */
      var toList = (_expView === 'grid');

      _host.innerHTML =
        '<div class="cal-hd">' +
          '<button class="btn sm ghost" id="calPrev">‹</button>' +
          '<button class="btn sm ghost" id="calTitle">' + _y + '년 ' + (_m + 1) + '월</button>' +
          '<button class="btn sm ghost" id="calNext">›</button>' +
          '<button class="btn sm ghost sp" id="calToday">오늘</button>' +
          '<button class="btn sm ghost cal-vt" id="calViewToggle" type="button" ' +
            'title="' + (toList ? '목록으로 보기' : '달력 크게 보기') + '" ' +
            'aria-label="' + (toList ? '목록으로 보기' : '달력 크게 보기') + '">' +
            (toList ? '☰' : '▦') + '</button>' +
        '</div>' +
        '<div class="cal-dow" id="calDow">' + ['일','월','화','수','목','금','토'].map(function (w, i) {
          return '<div class="' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</div>';
        }).join('') + '</div>' +
        '<div class="cal-grid' + (expList ? ' cal-agenda' : '') + '" id="calGrid">' +
          (expList ? agendaHTML(byDate) : cells) + '</div>' +
        /* 손잡이 — 당기라고 그려 놓고 정작 못 당기면 안 되므로, 격자와 같은 핸들러를 붙인다.
           누르기만 해도 펼쳐지고 접힌다(제스처를 모르는 사람을 위한 길). */
        '<div class="cal-grab" id="calGrab" role="button" tabindex="0">' +
          '<span class="cal-grab-bar"></span>' +
          '<span class="cal-grab-tx">' + (_expanded ? '⬆️ 위로 밀어 접기' : '⬇️ 아래로 당겨 크게 보기') + '</span>' +
        '</div>' +
        '<div class="cal-legend"><span><i class="m-trip"></i> 여행</span>' +
          '<span><i class="m-plan"></i> 일정</span><span><i class="m-place"></i> 기록</span></div>' +
        '<div id="calDay"></div>';

      _host.querySelector('#calPrev').onclick = function () { move(-1); };
      _host.querySelector('#calNext').onclick = function () { move(1); };
      _host.querySelector('#calToday').onclick = function () {
        var t2 = new Date(); _y = t2.getFullYear(); _m = t2.getMonth(); _sel = todayStr(); Cal.render();
      };
      _host.querySelector('#calTitle').onclick = openMonthPicker;
      _host.querySelector('#calViewToggle').onclick = function (e) {
        e.stopPropagation();
        _switchExpView();
      };

      /* 날짜 누르기 — 접힌 상태에서는 그날 내용을 아래에 펴고,
         펼친 상태에서는 접으면서 그날로 간다(펼친 화면에는 상세가 없으니까). */
      _host.querySelectorAll('.cal-c[data-d]').forEach(function (c) {
        c.onclick = function () {
          if (_swipedJustNow()) return;
          _sel = c.getAttribute('data-d');
          if (_expanded) _setExpanded(false); else Cal.render();
        };
      });
      _host.querySelectorAll('.ag-day').forEach(function (g) {
        var hd = g.querySelector('.ag-date');
        if (hd) hd.onclick = function () {
          if (_swipedJustNow()) return;
          _sel = g.getAttribute('data-d');
          _setExpanded(false);
        };
      });

      /* 목록 보기의 행들도 접힌 상세와 똑같이 동작해야 한다 —
         보기가 달라졌다고 할 수 있는 일이 줄면 그건 '보기'가 아니라 '반쪽짜리 화면'이다. */
      bindRowActions(_host);
      bindPostBadges(_host);

      var grab = _host.querySelector('#calGrab');
      grab.onclick = function () { if (!_swipedJustNow()) _setExpanded(!_expanded); };

      bindGestures(_host);
      _applyExpandedUI(false);

      renderDay(_host.querySelector('#calDay'), _sel, byDate[_sel] || { places: [], plans: [], trips: [] });
    });
  };

  /* ── 여행·일정·기록 행 클릭 (상세 패널과 목록 보기가 함께 쓴다) ── */
  function bindRowActions(root) {
    root.querySelectorAll('.calPlan').forEach(function (r) {
      r.onclick = function () { if (!_swipedJustNow()) Plans.get(r.dataset.id).then(openPlan); };
    });
    root.querySelectorAll('.calPlace').forEach(function (r) {
      r.onclick = function () {
        if (_swipedJustNow()) return;
        Place.open(r.dataset.id).then(function () { UI.switchTab('now'); });
      };
    });
    root.querySelectorAll('.calTrip').forEach(function (r) {
      r.onclick = function () {
        if (_swipedJustNow()) return;
        if (UI.openTripById) UI.openTripById(r.dataset.id);
      };
    });
  }

  /* 이름 옆에 보여줄 '어느 채널에 썼는지' 아이콘들 — 목록·상세에서만 쓴다(칸에는 자리가 없다).
     채널별로 하나씩만 보여준다 — 같은 채널에 여러 편을 써도 아이콘이 여러 개 늘어서지 않게
     (사용자 요청 2026-09-02: 대상 하나에 표시가 여럿이면 헷갈린다). */
  function chIconsOf(pid) {
    var posts = _postsByPlace[pid] || [];
    if (!posts.length) return '';
    var seen = {}, chs = [];
    posts.forEach(function (o) { if (!seen[o.ch]) { seen[o.ch] = true; chs.push(o.ch); } });
    return '<span class="chIcons">' + chs.map(function (ch) {
      return '<button type="button" class="chIconBtn" data-pid="' + pid + '" data-ch="' + ch +
        '" title="' + esc(ClaudeAI.channel(ch).label) + ' 글 열기">' + ClaudeAI.channelIcon(ch, 15) + '</button>';
    }).join('') + '</span>';
  }

  /* ✍️ 채널 아이콘 — 눌러서 그 채널로 쓴 글을 연다. 같은 채널 글이 여러 편이면 장소 시트에서 고른다.
     행 클릭(장소 열기)으로 이어지지 않도록 막는다 (기록 탭 목록과 같은 동작, 사용자 요청 2026-09-02). */
  function bindPostBadges(root) {
    root.querySelectorAll('.chIconBtn[data-pid]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        if (_swipedJustNow()) return;
        var pid = b.getAttribute('data-pid');
        var ch = b.getAttribute('data-ch');
        var posts = (_postsByPlace[pid] || []).filter(function (o) { return o.ch === ch; });
        if (!posts.length) return;
        if (posts.length === 1) {
          Store.placeGet(pid).then(function (p) { if (p) UI.openWriter(p, posts[0]); });
        } else if (UI.openPlaceSheet) {
          UI.openPlaceSheet(pid);
        } else {
          Place.open(pid).then(function () { UI.switchTab('now'); });
        }
      };
    });
  }

  /* ═══ 펼치기 / 접기 ════════════════════════════════════ */

  /* 드래그 직후의 오작동 클릭 막기 — 손을 떼는 순간 그 아래 요소의 click 이 뒤따라 온다 */
  var _swipeTs = 0;
  function _swipedJustNow() { return (Date.now() - _swipeTs) < 400; }

  /* 펼쳤을 때 격자가 차지할 높이: 격자 윗변부터 '손잡이 자리와 탭바'를 뺀 만큼.
     ☠️ 손잡이 높이를 빼지 않으면 손잡이가 탭바 밑으로 밀려 들어가 **접을 수가 없다**.
        (헤드리스 테스트에서 실제로 잡힌 버그다 — 탭바가 클릭을 가로챘다)
        접는 길은 제스처 말고도 반드시 하나 더 남아 있어야 한다. */
  function _expandedHeight(grid) {
    var top  = grid.getBoundingClientRect().top;
    var grab = _host && _host.querySelector('#calGrab');
    var gh   = (grab && grab.offsetHeight) || 34;
    var tab  = 60 + 8;                                  // .tabbar 높이 + 여유
    return Math.max(200, Math.round(window.innerHeight - top - gh - tab));
  }
  /* 접었을 때의 '원래 높이'. 펼친 동안에는 잴 수 없으므로(안이 목록일 수도 있다)
     접혀 있을 때 재 둔 값을 쓴다. */
  function _naturalHeight(grid) {
    if (_expanded) return _lastNatH || 240;
    var h = grid.style.height, ar = grid.style.gridAutoRows, tr = grid.style.transition;
    grid.style.transition = 'none'; grid.style.height = ''; grid.style.gridAutoRows = '';
    var n = grid.offsetHeight;
    grid.style.height = h; grid.style.gridAutoRows = ar; grid.style.transition = tr;
    _lastNatH = n;
    return n;
  }

  /* 화면에 상태를 입힌다. 렌더 직후에도 불러야 펼친 채로 다시 그려도 유지된다. */
  function _applyExpandedUI(animate) {
    if (!_host) return;
    var grid = _host.querySelector('#calGrid');
    if (!grid) return;

    _host.classList.toggle('cal-expanded', _expanded);
    _host.classList.toggle('cal-listview', _expanded && _expView === 'list');
    _host.classList.remove('cal-sizing');   // 드래그가 끝났으므로 임시 클래스는 걷는다
    /* 펼친 동안에는 페이지가 움직이면 안 된다 — 격자를 화면에 맞춰 놨는데 뒤에서
       body 가 스크롤되면 아래쪽이 탭바에 잘린다. 목록 보기는 격자 안에서 따로 스크롤한다. */
    document.body.classList.toggle('cal-lock', _expanded);

    if (_expanded) {
      grid.style.transition   = animate ? 'height .2s ease-out' : 'none';
      grid.style.gridAutoRows = '1fr';          // 5줄이든 6줄이든 남은 높이를 고르게 나눈다
      grid.style.height       = _expandedHeight(grid) + 'px';
      grid.style.opacity      = '1';
    } else {
      _naturalHeight(grid);                     // 접힌 높이를 다음 드래그를 위해 재 둔다
      grid.style.transition   = animate ? 'height .2s ease-out' : 'none';
      grid.style.gridAutoRows = '';
      grid.style.height       = '';
      grid.style.opacity      = '1';
    }
  }

  function _setExpanded(on, animate) {
    if (_expanded === on) { _applyExpandedUI(false); return; }
    _expanded = on;
    if (on) window.scrollTo(0, 0);              // 격자를 화면 위쪽에 붙인 뒤 높이를 잰다
    Cal.render();                               // 칸 내용이 보기마다 다르므로 다시 그린다
    /* render 는 비동기(collect)라 여기서 UI 를 또 만지면 옛 DOM 을 건드린다.
       실제 적용은 render 끝의 _applyExpandedUI 가 한다. animate 는 그 경로에선 생략. */
  }

  function _switchExpView() {
    _expView = (_expView === 'grid') ? 'list' : 'grid';
    try { localStorage.setItem(_EXPVIEW_KEY, _expView); } catch (e) {}
    /* 접힌 상태에서 눌렀다면 '그 보기로 펼쳐 달라'는 뜻으로 받는다 —
       버튼을 눌렀는데 아무 일도 안 일어나는 것만큼 나쁜 건 없다. */
    if (!_expanded) { _setExpanded(true); return; }
    Cal.render();
  }

  /* ── 손짓 ──────────────────────────────────────────────
     한 핸들러에서 방향을 판별한다. 가로/세로를 따로 붙이면 서로 잡아먹는다
     (현장매니저에서 실제로 겪은 문제라 그 구조만은 그대로 가져왔다). */
  function bindGestures(root) {
    var grid = root.querySelector('#calGrid');
    var grab = root.querySelector('#calGrab');
    if (!grid) return;

    var sx = 0, sy = 0, st = 0;
    var mode = 0;          // 0대기 1판별중 2가로(월이동) 3양보(스크롤) 4아래로(펼치기) 5위로(접기)
    var vBase = 0, vLo = 0, vHi = 0;
    var startedAtBottom = false;

    function W() { return grid.offsetWidth || 320; }
    function snapBack() {
      grid.style.transition = 'transform .18s ease-out, opacity .18s ease-out';
      grid.style.transform  = 'none';
      grid.style.opacity    = '1';
    }
    /* 목록 보기는 자기 안에서 스크롤한다 → '바닥에 닿아 있을 때'만 접기로 본다.
       그러지 않으면 마지막 줄을 보려고 위로 미는 동작마다 접혀 버린다.
       격자 보기는 자체 스크롤이 없으니 언제든 접기로 본다. */
    function atBottom() {
      if (!_expanded) return false;
      if (!grid.classList.contains('cal-agenda')) return true;
      return (grid.scrollTop + grid.clientHeight) >= (grid.scrollHeight - 4);
    }

    function onStart(e) {
      if (!e.touches || e.touches.length !== 1) { mode = 3; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
      startedAtBottom = atBottom();
      mode = 1;
    }
    function onMove(e) {
      if (mode === 0 || mode === 3) return;
      var t = e.touches && e.touches[0];
      if (!t) return;
      var dx = t.clientX - sx, dy = t.clientY - sy;

      if (mode === 1) {
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          mode = 2;
        } else if (Math.abs(dy) > 12) {
          if (dy < 0 && _expanded && startedAtBottom) {
            mode = 5;
            vBase = grid.offsetHeight;
            vLo   = Math.min(vBase, _naturalHeight(grid));
            root.classList.add('cal-sizing');   // 세로만 늘어나게 (styles.css 주석 참고)
            if (e.cancelable) e.preventDefault();
            return;
          }
          /* 아래로 당겨 펼치기는 '페이지가 맨 위'일 때만 — 아니면 평소 스크롤을 뺏는다 */
          var atTop = (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
          if (!(dy > 0 && !_expanded && atTop)) { mode = 3; return; }
          vBase = grid.offsetHeight;
          vLo   = vBase;
          vHi   = _expandedHeight(grid);
          if (vHi - vLo < 40) { mode = 3; return; }   // 늘릴 여지가 없으면 그냥 둔다
          root.classList.add('cal-sizing');           // 세로만 늘어나게 (styles.css 주석 참고)
          mode = 4;
        } else return;
      }

      if (mode === 2) {
        if (e.cancelable) e.preventDefault();
        grid.style.transition = 'none';
        grid.style.transform  = 'translateX(' + dx + 'px)';
        grid.style.opacity    = String(Math.max(0.35, 1 - Math.abs(dx) / W()));
      } else if (mode === 4) {
        if (e.cancelable) e.preventDefault();
        var h = Math.min(vHi, Math.max(vLo, vBase + dy));
        grid.style.transition   = 'none';
        grid.style.gridAutoRows = '1fr';
        grid.style.height       = h + 'px';
      } else if (mode === 5) {
        if (e.cancelable) e.preventDefault();
        /* 펼치기의 정확한 반대: 손가락만큼 높이를 줄이면서 같이 흐려진다.
           접힘 높이에 닿으면 이미 접힌 모습이라, 손을 떼면 갈아 끼우기만 하면 된다. */
        var h5 = Math.max(vLo, vBase + dy);
        var pg = (vBase - vLo) > 0 ? (vBase - h5) / (vBase - vLo) : 0;
        grid.style.transition = 'none';
        grid.style.height     = h5 + 'px';
        grid.style.opacity    = String(Math.max(0.15, 1 - pg * 0.85));
      }
    }
    function onEnd(e) {
      var was = mode; mode = 0;
      if (was !== 2 && was !== 4 && was !== 5) return;
      _swipeTs = Date.now();
      var t = e.changedTouches && e.changedTouches[0];

      if (was === 2) {
        if (!t) { snapBack(); return; }
        var dx = t.clientX - sx;
        var fast = (Date.now() - st) < 300 && Math.abs(dx) > 40;
        if (Math.abs(dx) > W() * 0.28 || fast) { grid.style.transform = 'none'; grid.style.opacity = '1'; move(dx < 0 ? 1 : -1); }
        else snapBack();
        return;
      }

      var dy = t ? (t.clientY - sy) : 0;
      if (was === 5) {
        var flick5 = (Date.now() - st) < 300 && dy < -40;
        if (dy < -55 || flick5) { _setExpanded(false); return; }
        /* 문턱을 못 넘었으면 줄어든 높이와 흐려짐을 함께 되돌린다.
           (아직 펼친 상태이므로 .cal-expanded 가 비율을 계속 풀어 준다 — 여기서 걷어도 안전) */
        root.classList.remove('cal-sizing');
        grid.style.transition = 'height .18s ease-out, opacity .18s ease-out';
        grid.style.opacity    = '1';
        grid.style.height     = (vBase || _expandedHeight(grid)) + 'px';
        return;
      }
      // mode 4 — 놓은 위치가 어느 쪽에 가까운지로 결정 (짧고 빠른 튕김도 인정)
      var h2   = Math.min(vHi, Math.max(vLo, vBase + dy));
      var prog = (vHi - vLo) ? (h2 - vLo) / (vHi - vLo) : 0;
      var flick = (Date.now() - st) < 300 && Math.abs(dy) > 40;
      var on = flick ? (dy > 0) : (prog > 0.4);
      if (on) _setExpanded(true); else _applyExpandedUI(true);
    }
    function onCancel() {
      if (mode === 2) snapBack();
      if (mode === 4 || mode === 5) _applyExpandedUI(true);
      root.classList.remove('cal-sizing');
      mode = 0;
    }

    [grid, grab].forEach(function (el) {
      if (!el) return;
      el.addEventListener('touchstart',  onStart,  { passive: true });
      el.addEventListener('touchmove',   onMove,   { passive: false });
      el.addEventListener('touchend',    onEnd,    { passive: true });
      el.addEventListener('touchcancel', onCancel, { passive: true });
    });
  }

  /* 다른 탭으로 갔다가 돌아왔을 때 body 잠금이 남지 않게 한다 */
  Cal.collapse = function () { if (_expanded) _setExpanded(false); };
  Cal.unlock   = function () { document.body.classList.remove('cal-lock'); };

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
            '<div style="min-width:0;"><div class="ti">' + esc(placeLabel(p)) + '</div>' +
            '<div class="sb">사진 ' + (p.photos || []).length + '장</div></div>' +
            chIconsOf(p.id) +
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
    /* 목록 보기와 같은 핸들러를 쓴다 — 두 벌로 나뉘면 한쪽만 고치는 일이 반드시 생긴다 */
    bindRowActions(box);
    bindPostBadges(box);
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
