/* ═══════════════════════════════════════════════════════════
   photos.js — 사진 추가 / 태그 / 순서 / 해석(resolvePhoto)
   ----------------------------------------------------------------
   현장매니저 gallery.js 의 _resolvePhoto 가 하던 일을 여기서 한다.
   그쪽은 파일 핸들·lazy·dataUrl 세 갈래를 다뤄야 했지만,
   이 앱의 사진은 IndexedDB Blob 한 갈래다(store.js 주석 참고).

   ⭐ 태그가 데이터 모델의 축이다.
      현장매니저의 before/after/special 자리에 카테고리 태그가 들어온다.
      이 태그가 글 마커((사진: 음식)), 공유 순서, 파일명까지 관통한다.
   ⚠️ 순서는 **태그 세트 순서 → 찍은 순서**다. 글의 흐름과 같은 순서여야 한다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _urlCache = {};    // photoId → objectURL (썸네일 표시용)

  function addFromDataUrl(dataUrl, tag) {
    var p = Place.current() || Place.create();
    return Img.dataUrlToBlob(dataUrl).then(function (blob) {
      var id = Store.newId('ph_');
      return Store.photoPut({ id: id, placeId: p.id, blob: blob, at: Date.now() }).then(function () {
        p.photos.push({ id: id, order: p.photos.length, tag: tag || (Place.tags()[0] || '사진'), memo: '' });
        return Place.save();
      });
    });
  }

  /* 갤러리에서 불러오기 (보조 경로 — 설계안 0장)
     ⭐ EXIF 는 **여기서만** 쓴다(exif.js 주석 참고).
        · 좌표: 장소에 위치가 아직 없을 때만 채운다. 인앱 카메라로 잡은 위치를 덮지 않는다.
        · 시각: 불러온 사진들 중 **가장 이른** 촬영시각. 그 장소에 사진이 아직 없을 때만 채운다
          (이미 찍어둔 사진이 있는데 나중에 옛 사진을 보태면 방문 시각이 뒤로 밀려버린다).
     ⚠️ EXIF 는 기기·앱마다 빠지거나 튄다. 없다고 불러오기가 막히면 안 된다 — 조용히 넘어간다. */
  function addFromFiles(fileList, tag) {
    var files = [].slice.call(fileList || []);
    if (!files.length) return Promise.resolve(0);
    var p = Place.current() || Place.create();
    var wasEmpty = !(p.photos || []).length;
    var n = 0, exGeo = null, exAt = null;

    showOverlay('사진 불러오는 중...');
    return files.reduce(function (chain, f, i) {
      return chain.then(function () {
        setProg((i / files.length) * 100, '사진 ' + (i + 1) + '/' + files.length);
        if (!/^image\//.test(f.type)) return;
        return Exif.read(f).then(function (ex) {
          if (ex.geo && !exGeo) exGeo = ex.geo;
          if (ex.at && (!exAt || ex.at < exAt)) exAt = ex.at;
          return Img.compress(f);
        }).then(function (r) {
          var id = Store.newId('ph_');
          return Store.photoPut({ id: id, placeId: p.id, blob: r.blob, at: f.lastModified || Date.now() })
            .then(function () {
              p.photos.push({ id: id, order: p.photos.length, tag: tag || (Place.tags()[0] || '사진'), memo: '' });
              n++;
            });
        });
      });
    }, Promise.resolve()).then(function () {
      var filled = [];
      if (exGeo && !p.geo) { p.geo = exGeo; filled.push('위치'); }
      if (exAt && wasEmpty) { p.visitedAt = exAt; filled.push('촬영 시각'); }
      return Place.save().then(function () {
        /* 좌표만 있고 주소가 비었으면 역지오코딩까지 해준다 (키가 있을 때만) */
        if (exGeo && !p.address && Geo.available()) {
          return Geo.reverse(exGeo).then(function (addr) {
            if (addr) { p.address = addr; p.area = Categories.areaOf(addr); filled.push('주소'); return Place.save(); }
          }).catch(function () {});
        }
      }).then(function () { return filled; });
    }).then(function (filled) {
      hideOverlay();
      showToast(n + '장 불러왔어요' + (filled.length ? ' · 사진 정보에서 ' + filled.join('·') + '을 채웠어요' : ''), 'ok');
      try { if (window.UI && UI.renderNow) UI.renderNow(); } catch (e) {}
      return n;
    }).catch(function (e) {
      hideOverlay();
      showToast('불러오기 실패: ' + e.message, 'err');
      return n;
    });
  }

  /* 사진 한 장 → { blob } | null */
  function resolvePhoto(ref) {
    var id = (typeof ref === 'string') ? ref : (ref && ref.id);
    if (!id) return Promise.resolve(null);
    return Store.photoGet(id).then(function (r) {
      return (r && r.blob) ? { blob: r.blob } : null;
    }).catch(function () { return null; });
  }

  /* 화면 표시용 URL (캐시) */
  function url(ref) {
    var id = (typeof ref === 'string') ? ref : (ref && ref.id);
    if (!id) return Promise.resolve('');
    if (_urlCache[id]) return Promise.resolve(_urlCache[id]);
    return resolvePhoto(id).then(function (r) {
      if (!r) return '';
      var u = URL.createObjectURL(r.blob);
      _urlCache[id] = u;
      return u;
    });
  }
  function forget(id) {
    if (_urlCache[id]) { try { URL.revokeObjectURL(_urlCache[id]); } catch (e) {} delete _urlCache[id]; }
  }

  function remove(photoId) {
    var p = Place.current();
    if (!p) return Promise.resolve();
    p.photos = p.photos.filter(function (x) { return x.id !== photoId; });
    p.photos.forEach(function (x, i) { x.order = i; });
    forget(photoId);
    return Store.photoDelete(photoId).then(function () { return Place.save(); });
  }

  /* 여러 장 한 번에 태그 바꾸기 — 불러온 사진을 정리할 때 한 장씩 누르면 손이 아프다 */
  function setTagMany(ids, tag) {
    var p = Place.current();
    if (!p || !ids || !ids.length) return Promise.resolve(0);
    var set = {};
    ids.forEach(function (i) { set[i] = 1; });
    var n = 0;
    p.photos.forEach(function (x) { if (set[x.id]) { x.tag = tag; n++; } });
    return Place.save().then(function () { return n; });
  }

  function setTag(photoId, tag) {
    var p = Place.current();
    if (!p) return Promise.resolve();
    p.photos.forEach(function (x) { if (x.id === photoId) x.tag = tag; });
    return Place.save();
  }

  function move(photoId, dir) {
    var p = Place.current();
    if (!p) return Promise.resolve();
    var i = p.photos.findIndex(function (x) { return x.id === photoId; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= p.photos.length) return Promise.resolve();
    var t = p.photos[i]; p.photos[i] = p.photos[j]; p.photos[j] = t;
    p.photos.forEach(function (x, k) { x.order = k; });
    return Place.save();
  }

  /* ⭐ 글·공유가 쓰는 정렬 — 태그 세트 순서 → 담긴 순서
     ⚠️ 이 순서가 곧 블로그 글의 사진 순서다. 바꾸면 글 흐름이 어긋난다. */
  function ordered(place) {
    var p = place || Place.current();
    if (!p) return [];
    var tags = Place.tags(p);
    var rank = {};
    tags.forEach(function (t, i) { rank[t] = i; });
    return (p.photos || []).slice().sort(function (a, b) {
      var ra = (rank[a.tag] == null ? 999 : rank[a.tag]);
      var rb = (rank[b.tag] == null ? 999 : rank[b.tag]);
      if (ra !== rb) return ra - rb;
      return (a.order || 0) - (b.order || 0);
    });
  }

  function countByTag(place) {
    var p = place || Place.current();
    var c = {};
    (p && p.photos || []).forEach(function (x) { c[x.tag] = (c[x.tag] || 0) + 1; });
    return c;
  }

  window.Photos = {
    addFromDataUrl: addFromDataUrl,
    addFromFiles: addFromFiles,
    resolvePhoto: resolvePhoto,
    url: url, forget: forget,
    remove: remove, setTag: setTag, setTagMany: setTagMany, move: move,
    ordered: ordered, countByTag: countByTag
  };
})();
