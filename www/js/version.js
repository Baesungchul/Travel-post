/* APP VERSION
   ⚠️ android/app/build.gradle 의 versionName 과 반드시 같아야 한다. */
window.APP_VERSION = '0.3.0';
window.APP_VERSION_DATE = '2026-08-28';
(function () {
  function apply() {
    var el = document.getElementById('appVersion');
    if (el) el.textContent = 'v' + window.APP_VERSION;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
