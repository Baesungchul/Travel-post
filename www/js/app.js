/* ═══════════════════════════════════════════════════════════
   app.js — 시작점
═══════════════════════════════════════════════════════════ */

/* 한 곳의 오류로 앱 전체가 멈추지 않게 (현장매니저에서 값을 본 방어) */
window.addEventListener('error', function (e) {
  console.error('[전역에러]', (e.error && e.error.message) || e.message, '\n', e.error && e.error.stack);
});
window.addEventListener('unhandledrejection', function (e) {
  console.error('[Promise 거부]', (e.reason && e.reason.message) || e.reason);
  e.preventDefault();
});

/* 테마·글자크기는 최대한 빨리 (깜빡임 방지) */
(function () {
  try {
    var k = function (n) { return (window.CFG ? CFG.LS_PREFIX : 'tp_') + n; };
    var m = localStorage.getItem(k('mode')) || 'auto';
    var dark = (m === 'dark') || (m === 'auto' && window.matchMedia &&
                window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-mode', dark ? 'dark' : 'light');
    var t = localStorage.getItem(k('theme'));
    if (t && t !== 'none') document.documentElement.setAttribute('data-theme', t);
    var sizes = [13, 14, 15, 16.5, 18, 19.5];
    var i = parseInt(localStorage.getItem(k('fs')) || '2', 10);
    document.documentElement.style.setProperty('--fs-base', (sizes[Math.max(0, Math.min(5, i))] || 15) + 'px');
  } catch (e) {}
})();

/* 서비스 워커
   ☠️ 2026-08-28 헤드리스 실측: controllerchange 는 **첫 설치**에도 발생한다
      (activate 의 clients.claim() 때문). 무조건 reload 하면 앱을 처음 열 때
      화면이 한두 번 새로 뜨고, 느린 기기에서는 새로고침 고리에 빠진다.
      → 페이지가 뜰 때 이미 컨트롤러가 있었을 때(=진짜 업데이트)만 새로고침한다. */
if ('serviceWorker' in navigator) {
  var _hadController = !!navigator.serviceWorker.controller;
  var _reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!_hadController || _reloading) return;
    _reloading = true;
    window.location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then(function (reg) {
    setInterval(function () { reg.update(); }, 30 * 60 * 1000);
    reg.addEventListener('updatefound', function () {
      var w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', function () {
        if (w.state === 'installed' && navigator.serviceWorker.controller) w.postMessage({ type: 'SKIP_WAITING' });
      });
    });
    reg.update();
  }).catch(function () {});
}

document.addEventListener('DOMContentLoaded', function () {
  /* ★ 2026-09-02: 스크롤이 아예 안 먹는다는 제보(지금 탭 맨 아래) 대응 — 안전장치.
     body.modal-open(오버레이 열림 중 스크롤 잠금) / body.cal-lock(달력 펼침 중 잠금) 은
     둘 다 순수 메모리상의 DOM 클래스라 '진짜' 새로고침에서는 있을 수가 없다 —
     즉 이 값이 남아 있다면 웹뷰 프로세스가 앱 업데이트 사이에도 안 죽고 그대로 이어졌고,
     그 전 화면에서 오버레이를 닫다가(혹은 달력을 접다가) 잠금 해제가 씹혔다는 뜻이다.
     원인을 아직 못 잡았어도, 시작할 때 한 번 강제로 풀어두면 최소한 매번 막히지는 않는다. */
  try {
    document.body.classList.remove('modal-open', 'cal-lock');
    document.body.style.top = '';
  } catch (e) {}
  try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(function () {}); } catch (e) {}
  if (UI.applyDisplay) UI.applyDisplay();

  /* 마지막으로 열었던 장소를 이어서 — 없으면 빈 「지금」 화면 */
  Store.setGet('lastPlaceId').then(function (id) {
    if (!id) return null;
    return Place.open(id).catch(function () { return null; });
  }).catch(function () { return null; }).then(function () {
    /* 2026-09-02: 기록 탭이 메인(기본) 탭 — 이어 쓰던 장소는 Place.open 으로 이미
       메모리에 복원돼 있어서, 「지금」 탭을 누르면 바로 이어서 보인다. */
    UI.switchTab('records');
    cleanupBlankPlaces();   // ⚠️ 복구가 끝난 뒤에 — 그래야 '지금 열린 장소'를 정확히 알고 비켜 간다
  });

  /* 장소가 바뀔 때마다 마지막 id 기억 */
  var _save = Place.save;
  Place.save = function () {
    return _save.apply(Place, arguments).then(function (p) {
      if (p) Store.setPut('lastPlaceId', p.id);
      return p;
    });
  };

  /* 예전 버전이 남긴 빈 장소 치우기 (2026-08-30)
     ＋ 를 누르는 즉시 저장하던 시절에 생긴 '(이름 없음)' 껍데기들이다.
     지금은 state.js 가 애초에 저장하지 않지만, 이미 기기에 들어 있는 것은 여기서 치운다.
     ⚠️ 두 가지는 건드리지 않는다 —
        ① 지금 열려 있는 장소 (사용자가 이제 막 채우려는 중일 수 있다)
        ② 일정이 가리키는 장소 (지우면 그 일정의 '기록 열기' 가 깨진다) */
  function cleanupBlankPlaces() {
    return Promise.all([
      Store.placeAll(),
      (window.Plans && Plans.all) ? Plans.all().catch(function () { return []; }) : Promise.resolve([])
    ]).then(function (r) {
      var places = r[0] || [], plans = r[1] || [];
      var keep = {};
      plans.forEach(function (pl) { if (pl && pl.placeId) keep[pl.placeId] = true; });
      var curId = (Place.current() || {}).id;
      var junk = places.filter(function (p) {
        return Place.isBlank(p) && p.id !== curId && !keep[p.id];
      });
      if (!junk.length) return null;
      return Promise.all(junk.map(function (p) { return Store.placeDelete(p.id); }))
        .then(function () {
          console.log('[정리] 내용 없는 장소 ' + junk.length + '건 치움');
          if (UI.refresh) UI.refresh();
        });
    }).catch(function (e) { console.warn('[정리] 실패(무시하고 계속)', e && e.message); });
  }

  /* 로그인 상태가 바뀌면 화면을 갱신한다 (무료 횟수·백업 버튼이 같이 바뀐다) */
  try { Cloud.onChange(function () { if (UI.refresh) UI.refresh(); }); } catch (e) {}

  /* 앱을 열었을 때 로그인이 안 되어 있으면 로그인 화면을 먼저 보여준다 (사용자 요청 2026-09-01).
     ⚠️ 강제로 막지는 않는다 — 다른 오버레이와 똑같이 ✕ 로 닫거나 바깥을 눌러 넘어갈 수 있다.
        이 앱은 로그인 없이도 촬영·글쓰기·백업 ZIP 이 다 되는 게 설계 원칙이라(설계안 참고),
        로그인은 "먼저 권하는 것"이지 "막는 것"이 아니다.
     ☠️ Cloud.onChange 는 등록하는 순간 C.ready 면 곧바로 한 번 부른다 — 그런데 그 시점엔
        firebase 가 기기에 남은 로그인 세션을 아직 안 읽어 온 상태(C.user 가 임시로 null)라
        여기서 곧바로 판단하면 '이미 로그인된 사용자'한테도 로그인창이 잠깐 떴다 만다.
        → 첫 번째 호출(임시값)은 건너뛰고, 두 번째 호출(세션 복원이 끝난 실제 값)에서만,
           딱 한 번 판단한다. */
  try {
    var _authCalls = 0, _askedLogin = false;
    Cloud.onChange(function () {
      _authCalls++;
      if (_authCalls < 2 || _askedLogin) return;
      _askedLogin = true;
      if (Cloud.ready && !Cloud.loggedIn() && UI.openLogin) UI.openLogin();
    });
  } catch (e) {}

  console.log('[' + CFG.APP_NAME + '] 준비 완료 · v' + window.APP_VERSION);
});
