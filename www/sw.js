/* sw.js — 앱 껍데기 캐시.
   ⚠️ 파일을 추가하면 SHELL 에도 넣고 VER 을 올릴 것. */
var VER = 'tp-v24';
var SHELL = [
  './', './index.html', './styles.css', './manifest.json', './icon.svg', './icon-maskable.svg',
  './js/vendor/firebase-app-compat.js', './js/vendor/firebase-auth-compat.js',
  './js/vendor/firebase-firestore-compat.js', './js/vendor/firebase-storage-compat.js',
  './js/config.js', './js/version.js', './js/tokens.js', './js/categories.js',
  './js/profiles.js', './js/store.js', './js/state.js', './js/image.js',
  './js/native-fs.js', './js/exif.js', './js/photos.js', './js/geo.js', './js/camera.js',
  './js/cloud.js', './js/subscription.js', './js/ai.js', './js/share.js',
  './js/backup.js', './js/cloud_backup.js', './js/map.js', './js/trips.js', './js/plans.js', './js/calendar.js', './js/tabbar.js',
  './js/ui_now.js', './js/ui_records.js', './js/ui_posts.js', './js/ui_settings.js',
  './js/app.js',
  /* 눌렀을 때 받는 파일 — 오프라인에서도 백업·ZIP 이 되게 미리 캐시한다 */
  './js/jszip.min.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VER).then(function (c) { return c.addAll(SHELL); }).catch(function () {}));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VER; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   /* API·업로드는 통과 */
  e.respondWith(
    fetch(e.request).then(function (r) {
      var cp = r.clone();
      caches.open(VER).then(function (c) { c.put(e.request, cp); }).catch(function () {});
      return r;
    }).catch(function () { return caches.match(e.request); })
  );
});
