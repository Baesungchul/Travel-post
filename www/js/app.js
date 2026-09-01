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
  try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(function () {}); } catch (e) {}
  if (UI.applyDisplay) UI.applyDisplay();

  /* 마지막으로 열었던 장소를 이어서 — 없으면 빈 「지금」 화면 */
  Store.setGet('lastPlaceId').then(function (id) {
    if (!id) return null;
    return Place.open(id).catch(function () { return null; });
  }).catch(function () { return null; }).then(function () {
    UI.switchTab('now');
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

  console.log('[' + CFG.APP_NAME + '] 준비 완료 · v' + window.APP_VERSION);
});
