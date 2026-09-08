/* APP VERSION
   ⚠️ android/app/build.gradle 의 versionName 과 반드시 같아야 한다. */
window.APP_VERSION = '0.4.65';
window.APP_VERSION_DATE = '2026-09-08';
(function () {
  function apply() {
    var el = document.getElementById('appVersion');
    if (el) el.textContent = 'v' + window.APP_VERSION;
    /* 한 줄 설명도 여기서 채운다 — index.html 에 문장을 박아 두면 config.js 와 어긋난다 */
    var tg = document.getElementById('appTagline');
    if (tg && window.CFG && CFG.APP_TAGLINE) tg.textContent = CFG.APP_TAGLINE;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
