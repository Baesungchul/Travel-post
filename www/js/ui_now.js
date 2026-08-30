/* ═══════════════════════════════════════════════════════════
   ui_now.js — 「지금」 탭
   ----------------------------------------------------------------
   진행 중인 장소 한 곳. 카메라 → 사진 태그별 정리 → 메모 → ✍️ 글 만들기
   (설계안 4장. 장소 하나 = 글 하나)

   ⚠️ 화면 문구에 카테고리 이름을 직접 쓰지 않는다. {장소호칭} 토큰을 통과시킨다.
      (tokens.js 주석 참고 — 이걸 안 지키면 '여행 지침을 썼는데 맛집 글이 나오는' 사고가
       화면 문구에서 먼저 재현된다)
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var UI = window.UI = window.UI || {};
  var _curTagFilter = '';

  UI.startNewPlace = function () {
    var pf = Profiles.current();
    if (!pf) { UI.openCategoryPicker(); return; }
    Place.create(pf.id);
    Place.save().then(function () {
      _curTagFilter = '';
      UI.switchTab('now');
      showToast(catFill('새 {장소호칭}를 시작했어요', pf), 'ok');
    });
  };

  /* ── 카테고리 고르기 ── */
  UI.openCategoryPicker = function () {
    var list = Profiles.list();
    var curId = (Profiles.current() || {}).id;
    var cat = window.Categories.CATALOG.filter(function (c) {
      return !list.some(function (p) { return p.catId === c.id; });
    });

    var ov = overlay({
      title: '카테고리 고르기',
      body:
        '<div class="mini">카테고리가 사진 태그·글 지침·해시태그를 통째로 바꿉니다.</div>' +
        '<div class="box">' + list.map(function (p) {
          return '<div class="row catPick" data-id="' + p.id + '">' +
            '<div style="font-size:24px;width:36px;text-align:center;">' + esc(p.icon || '📍') + '</div>' +
            '<div><div class="ti">' + esc(p.name) + (p.id === curId ? '<span class="badge">지금</span>' : '') + '</div>' +
            '<div class="sb">' + esc((p.tags || []).join(' · ')) + '</div></div></div>';
        }).join('') + '</div>' +
        (cat.length ?
          '<div class="lbl">추가할 수 있는 카테고리</div>' +
          '<div class="tagbar">' + cat.map(function (c) {
            return '<button type="button" class="tag catAdd" data-c="' + c.id + '">' + esc(c.icon + ' ' + c.name) + ' +</button>';
          }).join('') + '</div>' : ''),
      foot: '<button class="btn ghost" id="catCustom">직접 만들기</button>'
    });

    ov.querySelectorAll('.catPick').forEach(function (el) {
      el.onclick = function () {
        var id = el.getAttribute('data-id');
        Profiles.setCurrent(id);
        var p = Place.current();
        /* 사진을 아직 안 찍은 장소면 카테고리를 바꿔 끼운다.
           ⚠️ 사진이 있으면 태그 세트가 어긋나므로 바꾸지 않는다 — 새 장소를 시작하게 한다. */
        if (p && (!p.photos || !p.photos.length)) {
          var st = Profiles.stampForNewPlace(id);
          p.profileId = st.profileId; p.profileSnap = st.profileSnap;
          Place.save();
        } else if (p && p.photos.length) {
          showToast('사진이 있는 기록은 카테고리를 바꿀 수 없어요 — 새로 시작해 주세요');
        }
        ov.close(); UI.refresh();
      };
    });
    ov.querySelectorAll('.catAdd').forEach(function (b) {
      b.onclick = function () {
        var pf = Profiles.createFromCatalog(b.getAttribute('data-c'));
        if (pf) { Profiles.setCurrent(pf.id); ov.close(); UI.refresh(); showToast(pf.name + ' 추가했어요', 'ok'); }
      };
    });
    ov.querySelector('#catCustom').onclick = function () {
      var n = prompt('카테고리 이름 (예: 시장, 캠핑장)');
      if (!n) return;
      var pf = Profiles.createCustom(n.trim());
      Profiles.setCurrent(pf.id);
      ov.close(); UI.refresh();
      showToast('만들었어요. 설정에서 사진 태그를 다듬어 주세요', 'ok');
    };
  };

  /* ── 주변 장소 자동 채움 (설계안 3장: 이 앱의 승부처) ── */
  UI.openPlaceFinder = function () {
    var p = Place.current();
    if (!p) return;
    var pf = Profiles.forCurrentPlace();

    if (!Geo.available()) {
      overlay({
        title: '주변 장소 찾기는 아직 못 켜요',
        body: '<div class="mini">' + esc(Geo.whyUnavailable) + '</div>' +
              '<div class="notice">⬜ 카카오 로컬 API 의 무료 쿼터·약관·상업적 이용 조건은 아직 확인하지 않았습니다. ' +
              '키를 넣기 전에 먼저 확인해 주세요.</div>'
      });
      return;
    }

    var ov = overlay({
      title: '주변 ' + esc((pf && pf.name) || '장소') + ' 찾기',
      body: '<input class="inp" id="pfQ" placeholder="이름으로 찾기 (비우면 주변 검색)">' +
            '<div id="pfList" class="mini" style="margin-top:10px;">위치 잡는 중…</div>',
      foot: '<button class="btn primary" id="pfGo">찾기</button>'
    });

    function draw(list) {
      var box = ov.querySelector('#pfList');
      if (!list.length) { box.textContent = '찾은 곳이 없어요. 이름으로 찾아보세요.'; return; }
      box.innerHTML = list.map(function (d, i) {
        return '<div class="row pfPick" data-i="' + i + '"><div>' +
          '<div class="ti">' + esc(d.name) + '</div>' +
          '<div class="sb">' + esc(d.address) + (d.dist != null ? ' · ' + d.dist + 'm' : '') + '</div>' +
          '</div></div>';
      }).join('');
      box.querySelectorAll('.pfPick').forEach(function (el) {
        el.onclick = function () {
          var d = list[+el.getAttribute('data-i')];
          p.name = d.name; p.address = d.address; p.area = d.area || Categories.areaOf(d.address);
          if (d.lat && d.lng) p.geo = { lat: d.lat, lng: d.lng, at: Date.now() };
          Place.save().then(function () { ov.close(); UI.renderNow(); showToast('채웠어요', 'ok'); });
        };
      });
    }
    function search() {
      var q = ov.querySelector('#pfQ').value.trim();
      ov.querySelector('#pfList').textContent = '찾는 중…';
      var geo = p.geo || Geo.last();
      var run = q ? Geo.keyword(q, geo) : (geo ? Geo.nearby(geo, (pf && pf.catId) || '') : Promise.reject(new Error('위치를 못 잡았어요')));
      run.then(draw).catch(function (e) { ov.querySelector('#pfList').textContent = e.message; });
    }
    ov.querySelector('#pfGo').onclick = search;

    (p.geo ? Promise.resolve(p.geo) : Geo.read()).then(function (g) {
      if (!p.geo) { p.geo = g; Place.save(); }
      search();
    }).catch(function (e) {
      ov.querySelector('#pfList').textContent = e.message + ' — 이름으로 찾아보세요.';
    });
  };

  /* ── 지금 탭 그리기 ── */
  UI.renderNow = function () {
    var el = document.getElementById('pnNow');
    if (!el) return;
    var p = Place.current();
    var pf = Profiles.forCurrentPlace();

    if (!p) {
      el.innerHTML =
        '<div class="empty">' +
          '<div style="font-size:38px;margin-bottom:10px;">📷</div>' +
          '<b>' + esc(catFill('{장소호칭} 하나 = 글 하나', pf)) + '</b><br>' +
          '아래 ＋ 를 눌러 시작하세요.<br>' +
          '<span class="mini">찍고 나오면 글이 거의 완성돼 있어요.</span>' +
        '</div>';
      return;
    }

    var tags = Place.tags(p);
    var cnt = Photos.countByTag(p);
    var shots = Photos.ordered(p).filter(function (x) { return !_curTagFilter || x.tag === _curTagFilter; });

    el.innerHTML =
      '<div class="card">' +
        '<div class="sec-hd"><h2>' + esc(pf ? (pf.icon || '📍') + ' ' + pf.name : '장소') + '</h2>' +
          '<span class="sp mini">' + esc(p.id) + '</span></div>' +
        '<label class="lbl">' + esc(catFill('{장소호칭} 이름', pf)) + '</label>' +
        '<div style="display:flex;gap:8px;">' +
          '<input class="inp" id="plName" value="' + esc(p.name) + '" placeholder="상호 또는 장소명">' +
          '<button class="btn sm" id="plFind" title="주변에서 찾기">📍</button>' +
        '</div>' +
        '<label class="lbl">주소</label>' +
        '<input class="inp" id="plAddr" value="' + esc(p.address) + '" placeholder="' +
          (p.geo ? '위치는 잡혔어요 — 주소를 채우려면 📍' : '위치를 아직 못 잡았어요') + '">' +
        '<label class="lbl">방문 시각</label>' +
        '<input class="inp" id="plWhen" type="datetime-local" value="' + esc(p.visitedAt) + '">' +
        '<label class="lbl">별점</label>' +
        '<div class="tagbar" id="plRate">' +
          [1,2,3,4,5].map(function (n) {
            return '<button type="button" class="tag' + (p.rating >= n ? ' on' : '') + '" data-r="' + n + '">★' + n + '</button>';
          }).join('') +
          '<button type="button" class="tag" data-r="0">지우기</button>' +
        '</div>' +
        '<label class="lbl">한 줄 메모 <span class="mini">(맛·분위기·가격 — AI 가 이걸 재료로 씁니다)</span></label>' +
        '<textarea class="inp" id="plMemo" placeholder="' +
          esc(catFill('예) 웨이팅 20분, {장소호칭} 안이 생각보다 넓다, 대표 메뉴가 특히 좋았다', pf)) +
          '">' + esc(p.memo) + '</textarea>' +
      '</div>' +

      '<div class="card">' +
        '<div class="sec-hd"><h2>📸 사진</h2><span class="sp mini">' + (p.photos.length) + '장</span></div>' +
        '<div class="tagbar">' +
          '<button type="button" class="tag' + (_curTagFilter ? '' : ' on') + '" data-f="">전체<span class="n">' + p.photos.length + '</span></button>' +
          tags.map(function (t) {
            return '<button type="button" class="tag' + (_curTagFilter === t ? ' on' : '') + '" data-f="' + esc(t) + '">' +
              esc(t) + '<span class="n">' + (cnt[t] || 0) + '</span></button>';
          }).join('') +
        '</div>' +
        (shots.length ?
          '<div class="grid">' + shots.map(function (x) {
            return '<div class="ph" data-id="' + x.id + '">' +
              '<img data-ph="' + x.id + '" alt="">' +
              '<span class="t">' + esc(x.tag) + '</span>' +
              '<button type="button" class="x" data-del="' + x.id + '">✕</button>' +
            '</div>';
          }).join('') + '</div>'
          : '<div class="empty" style="padding:22px;">아직 사진이 없어요.<br><span class="mini">태그를 고르고 촬영하면 그대로 글 순서가 됩니다.</span></div>') +
        '<div class="btn-row" style="margin-top:10px;">' +
          '<button class="btn primary" id="btnCam">📷 촬영</button>' +
          '<button class="btn ghost" id="btnPick">🖼 불러오기</button>' +
          (p.photos.length > 1 ? '<button class="btn ghost" id="btnBulk">🏷 정리</button>' : '') +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<button class="btn primary wide" id="btnWrite">✍️ 글 만들기</button>' +
        '<div class="mini" style="margin-top:8px;text-align:center;">' +
          (CFG.hasProxy() ? 'AI 가 사진과 메모를 보고 씁니다' : '⚠️ AI 프록시 미설정 — 지금은 뼈대 초안만 만듭니다') +
        '</div>' +
      '</div>';

    /* 사진 썸네일 (비동기) */
    el.querySelectorAll('img[data-ph]').forEach(function (im) {
      Photos.url(im.getAttribute('data-ph')).then(function (u) { if (u) im.src = u; });
    });

    /* 필드 저장 — blur 에 한 번씩 */
    function bindField(id, key, xf) {
      var f = el.querySelector(id);
      if (!f) return;
      f.onchange = function () {
        p[key] = xf ? xf(f.value) : f.value;
        if (key === 'address') p.area = Categories.areaOf(f.value);
        Place.save();
      };
    }
    bindField('#plName', 'name');
    bindField('#plAddr', 'address');
    bindField('#plWhen', 'visitedAt');
    bindField('#plMemo', 'memo');

    el.querySelectorAll('#plRate .tag').forEach(function (b) {
      b.onclick = function () { p.rating = +b.getAttribute('data-r'); Place.save().then(UI.renderNow); };
    });
    el.querySelectorAll('.tagbar [data-f]').forEach(function (b) {
      b.onclick = function () { _curTagFilter = b.getAttribute('data-f'); UI.renderNow(); };
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        if (!confirm('이 사진을 지울까요?')) return;
        Photos.remove(b.getAttribute('data-del')).then(UI.renderNow);
      };
    });
    el.querySelectorAll('.ph').forEach(function (d) {
      d.onclick = function () { openPhotoSheet(d.getAttribute('data-id')); };
    });

    el.querySelector('#plFind').onclick = UI.openPlaceFinder;
    el.querySelector('#btnCam').onclick = function () { openInAppCamera(_curTagFilter || tags[0]); };
    el.querySelector('#btnPick').onclick = function () {
      var f = document.getElementById('filePick');
      f.value = '';
      f.onchange = function () { Photos.addFromFiles(f.files, _curTagFilter || tags[0]); };
      f.click();
    };
    var bulk = el.querySelector('#btnBulk');
    if (bulk) bulk.onclick = function () { openBulkTag(); };
    el.querySelector('#btnWrite').onclick = function () {
      if (!p.photos.length && !p.memo) { showToast('사진이나 메모가 있어야 글을 만들 수 있어요', 'err'); return; }
      UI.openWriter(p);
    };
  };

  /* ── 여러 장 한 번에 태그 바꾸기 ──
     갤러리에서 20장을 불러오면 전부 첫 태그로 들어온다. 한 장씩 열어 고치면 손이 아프다.
     ⚠️ 순서는 건드리지 않는다 — 태그만 바꾼다. 정렬은 Photos.ordered 가 태그 세트 순으로 다시 한다. */
  function openBulkTag() {
    var p = Place.current();
    if (!p) return;
    var tags = Place.tags(p);
    var list = Photos.ordered(p);
    var sel = {};
    var ov = overlay({
      title: '🏷 사진 정리',
      body:
        '<div class="mini">사진을 골라 태그를 한 번에 바꿉니다.</div>' +
        '<div class="btn-row" style="margin:8px 0;">' +
          '<button class="btn sm ghost" id="bkAll">전체 선택</button>' +
          '<button class="btn sm ghost" id="bkNone">해제</button>' +
        '</div>' +
        '<div class="grid" id="bkGrid">' + list.map(function (x) {
          return '<div class="ph bkCell" data-id="' + x.id + '">' +
            '<img data-ph="' + x.id + '" alt="">' +
            '<span class="t">' + esc(x.tag) + '</span>' +
            '<span class="pick">✓</span></div>';
        }).join('') + '</div>' +
        '<label class="lbl">이 태그로 바꾸기</label>' +
        '<div class="tagbar" id="bkTags">' + tags.map(function (t) {
          return '<button type="button" class="tag" data-t="' + esc(t) + '">' + esc(t) + '</button>';
        }).join('') + '</div>' +
        '<div class="accent" id="bkCnt">0장 선택</div>',
      foot: '<button class="btn primary wide" id="bkApply" disabled>적용</button>'
    });
    ov.querySelectorAll('img[data-ph]').forEach(function (im) {
      Photos.url(im.getAttribute('data-ph')).then(function (u) { if (u) im.src = u; });
    });
    var pickedTag = '';
    function refresh() {
      var n = Object.keys(sel).filter(function (k) { return sel[k]; }).length;
      ov.querySelector('#bkCnt').textContent = n + '장 선택' + (pickedTag ? ' → ' + pickedTag : '');
      ov.querySelector('#bkApply').disabled = !(n && pickedTag);
    }
    ov.querySelectorAll('.bkCell').forEach(function (c) {
      c.onclick = function () {
        var id = c.getAttribute('data-id');
        sel[id] = !sel[id];
        c.classList.toggle('on', !!sel[id]);
        refresh();
      };
    });
    ov.querySelector('#bkAll').onclick = function () {
      ov.querySelectorAll('.bkCell').forEach(function (c) { sel[c.getAttribute('data-id')] = true; c.classList.add('on'); });
      refresh();
    };
    ov.querySelector('#bkNone').onclick = function () {
      ov.querySelectorAll('.bkCell').forEach(function (c) { sel[c.getAttribute('data-id')] = false; c.classList.remove('on'); });
      refresh();
    };
    ov.querySelectorAll('#bkTags .tag').forEach(function (b) {
      b.onclick = function () {
        ov.querySelectorAll('#bkTags .tag').forEach(function (o) { o.classList.remove('on'); });
        b.classList.add('on');
        pickedTag = b.getAttribute('data-t');
        refresh();
      };
    });
    ov.querySelector('#bkApply').onclick = function () {
      var ids = Object.keys(sel).filter(function (k) { return sel[k]; });
      Photos.setTagMany(ids, pickedTag).then(function (n) {
        ov.close(); UI.renderNow(); showToast(n + '장을 ' + pickedTag + ' 으로 바꿨어요', 'ok');
      });
    };
  }

  /* 사진 한 장 — 태그 바꾸기 / 메모 / 순서 */
  function openPhotoSheet(id) {
    var p = Place.current();
    var x = (p.photos || []).filter(function (y) { return y.id === id; })[0];
    if (!x) return;
    var tags = Place.tags(p);
    var ov = overlay({
      title: '사진',
      body:
        '<img id="phBig" style="width:100%;border-radius:10px;" alt="">' +
        '<label class="lbl">태그</label>' +
        '<div class="tagbar" id="phTags">' + tags.map(function (t) {
          return '<button type="button" class="tag' + (x.tag === t ? ' on' : '') + '" data-t="' + esc(t) + '">' + esc(t) + '</button>';
        }).join('') + '</div>' +
        '<label class="lbl">이 사진 메모 <span class="mini">(글에 그대로 재료로 들어갑니다)</span></label>' +
        '<textarea class="inp" id="phMemo" placeholder="예) 겉은 바삭, 소스가 달지 않다">' + esc(x.memo || '') + '</textarea>',
      foot: '<button class="btn ghost sm" id="phUp">◀ 앞으로</button>' +
            '<button class="btn ghost sm" id="phDown">뒤로 ▶</button>' +
            '<button class="btn primary" id="phSave">저장</button>'
    });
    Photos.url(id).then(function (u) { if (u) ov.querySelector('#phBig').src = u; });
    ov.querySelectorAll('#phTags .tag').forEach(function (b) {
      b.onclick = function () {
        ov.querySelectorAll('#phTags .tag').forEach(function (o) { o.classList.remove('on'); });
        b.classList.add('on');
        x.tag = b.getAttribute('data-t');
      };
    });
    ov.querySelector('#phUp').onclick = function () { Photos.move(id, -1).then(function () { ov.close(); UI.renderNow(); }); };
    ov.querySelector('#phDown').onclick = function () { Photos.move(id, 1).then(function () { ov.close(); UI.renderNow(); }); };
    ov.querySelector('#phSave').onclick = function () {
      x.memo = ov.querySelector('#phMemo').value;
      Place.save().then(function () { ov.close(); UI.renderNow(); });
    };
  }
})();
