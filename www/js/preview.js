/* ═══════════════════════════════════════════════════════════
   preview.js — 글 안의 사진 마커를 실제 사진으로 바꿔 보여준다 (사용자 요청 2026-09-05)
   ----------------------------------------------------------------
   왜 필요한가:
     글 결과가 편집 상자라서 (사진: 상호 - 외관) 같은 마커가 '글자'로 보였다.
     사장님은 "중간중간 마커 말고 사진이 보이게" 를 원하셨다.

   ☠️ 그렇다고 **글에서 마커를 빼면 안 된다.**
     이 마커는 블로그에 붙여넣은 뒤 "여기에 어느 사진" 인지 알려주는 유일한 표시고,
     PC 링크 페이지(site/post.html)와 공유 파일명 순번도 같은 축을 쓴다.
     → 그래서 여기서는 **화면만** 바꾼다. 복사되는 글은 마커를 그대로 유지한다.
       (사용자 확인: 2026-09-05 "화면에서만 사진으로, 복사 글은 마커 유지")

   ⚠️ 마커 해석 규칙은 site/post.html 의 render() 와 **같아야 한다.**
      한쪽만 고치면 앱 미리보기와 PC 링크가 서로 다른 자리에 사진을 넣게 된다.
      (post.html 은 배포된 별도 페이지라 이 파일을 못 읽는다 — 고칠 땐 두 곳 다 고칠 것)

   사진 출처는 Photos.ordered(place) 하나뿐이다 — 공유·PC 링크가 쓰는 것과 같은 순서다.
   여행 글은 Trips.asPlace 가 만든 가상 장소가 그대로 넘어오므로 분기가 없다
   (그 장소의 태그는 '상호 - 태그' 합성이라 마커도 그 형식으로 맞는다).
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var P = window.Preview = {};

  /* ⚠️ site/post.html 의 MARK 와 같은 식. 두 형식을 받는다.
       ① (사진: 외관) (사진) → 그 태그의 남은 사진을 전부
       ② [PHOTO_2] [사진2]   → 그 번호 한 장 */
  var MARK_SRC = '[\\(（]\\s*(?:사진|이미지)\\s*[:：\\-]?\\s*([^)）]*)[\\)）]' +
                 '|\\[\\s*(?:PHOTO_|사진\\s*)(\\d+)\\s*\\]';

  /* 글에 사진 마커가 하나라도 있나 — 버튼을 띄울지 정할 때 쓴다 */
  P.hasMarker = function (text) {
    return new RegExp(MARK_SRC, 'i').test(String(text || ''));
  };

  function build(text, photos, urls, tags) {
    var used = urls.map(function () { return false; });

    function takeTag(t) {
      var out = [];
      photos.forEach(function (x, i) {
        if (!used[i] && urls[i] && x.tag === t) { used[i] = true; out.push(urls[i]); }
      });
      return out;
    }
    function takeOne(i) {
      if (urls[i] && !used[i]) { used[i] = true; return [urls[i]]; }
      return [];
    }
    function takeAny() {
      for (var i = 0; i < urls.length; i++) if (!used[i] && urls[i]) { used[i] = true; return [urls[i]]; }
      return [];
    }
    /* 라벨을 태그 이름에 맞춘다. 정확히 같으면 우선, 아니면 포함 관계로 느슨하게.
       (AI 가 '상호 - 외관' 을 '외관' 으로만 적는 일이 있어서 느슨한 단계가 필요하다) */
    function resolve(label) {
      var L = String(label || '').trim();
      if (!L) return takeAny();
      for (var i = 0; i < tags.length; i++) if (tags[i] === L) return takeTag(tags[i]);
      for (var j = 0; j < tags.length; j++) {
        if (L.indexOf(tags[j]) >= 0 || tags[j].indexOf(L) >= 0) return takeTag(tags[j]);
      }
      return takeAny();
    }

    function imgs(list) {
      return list.map(function (u) { return '<img src="' + esc(u) + '" alt="" loading="lazy">'; }).join('');
    }
    function para(t) {
      t = t.trim();
      if (!t) return '';
      return '<p>' + esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') + '</p>';
    }

    var MARK = new RegExp(MARK_SRC, 'gi');
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var html = '';
    lines.forEach(function (ln) {
      var t = ln.replace(/^#{1,6}\s+/, '').replace(/^\s*[-*+]\s+/, '• ').replace(/^\s{0,3}>\s?/, '');
      MARK.lastIndex = 0;
      var last = 0, m, hit = false;
      while ((m = MARK.exec(t)) !== null) {
        hit = true;
        html += para(t.slice(last, m.index));
        html += imgs(m[2] != null ? takeOne(parseInt(m[2], 10) - 1) : resolve(m[1] || ''));
        last = m.index + m[0].length;
      }
      if (hit) { html += para(t.slice(last)); return; }
      html += para(t);
    });

    /* 어느 마커에도 안 걸린 사진은 글 뒤에 순서대로 — post.html 과 같은 처리.
       ⚠️ 여기서 '남은 사진'을 감추면 화면과 실제 블로그 결과가 달라진다. */
    var restList = urls.filter(function (u, i) { return !used[i] && u; });
    if (restList.length) {
      html += '<div class="pv-rest">마커에 안 걸린 사진 ' + restList.length + '장 — 글 뒤에 붙습니다</div>' + imgs(restList);
    }
    return html || '<div class="pv-empty">아직 글이 없어요.</div>';
  }

  /* 글 + 장소 → 사진이 박힌 HTML.
     사진은 IndexedDB Blob 이라 URL 을 만들어야 하는데, Photos.url() 이 캐시·해제를 이미 맡고 있다
     (여기서 createObjectURL 을 따로 쓰면 화면을 닫을 때 새는 URL 이 생긴다 — 쓰지 말 것). */
  P.render = function (text, place) {
    var photos = [];
    try { photos = (window.Photos && Photos.ordered) ? Photos.ordered(place) : []; } catch (e) {}
    var tags = [];
    photos.forEach(function (x) { if (x.tag && tags.indexOf(x.tag) < 0) tags.push(x.tag); });

    if (!photos.length) {
      return Promise.resolve(
        '<div class="pv-empty">이 장소에 담긴 사진이 없어서 글만 보여줍니다.</div>' +
        build(text, [], [], [])
      );
    }
    return Promise.all(photos.map(function (x) {
      return Photos.url(x.id).catch(function () { return ''; });
    })).then(function (urls) {
      return build(text, photos, urls, tags);
    });
  };

  console.log('[Preview] 로드됨');
})();
