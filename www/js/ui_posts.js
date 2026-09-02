/* ═══════════════════════════════════════════════════════════
   ui_posts.js — 글 만들기 시트 + 「글」 탭
   ----------------------------------------------------------------
   흐름: 채널 고르기 → 생성 → 고치기 → 저장 → 공유(모바일 / PC 링크)

   ⚠️ 채널 버튼은 ai.js 의 CHANNELS 에서 만든다. 여기에 채널 목록을 따로 적지 않는다.
      (현장매니저는 'fb' vs 'facebook' 로 어긋나 버튼이 조용히 사라졌다)
   ⚠️ 사용자가 글을 고쳐서 저장하면 교정 학습에 쌓인다 — 다음 글의 말투가 그쪽으로 맞춰진다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var UI = window.UI = window.UI || {};

  /* trip 을 넘기면 **여행기 모드**다 — 여러 장소를 한 편으로 묶어 쓴다.
     ⚠️ 공유·PC 링크는 Trips.asPlace 로 만든 '가상 장소'를 그대로 넘긴다.
        그래서 아래 공유 코드는 장소 하나일 때와 같은 코드다(분기 없음). */
  UI.openWriter = function (place, existingPost, trip) {
    var tripPlaces = null, p;
    if (trip) {
      tripPlaces = place;                       // 여행 모드에서는 두 번째 인자가 장소 목록이다
      p = Trips.asPlace(trip, tripPlaces);
    } else {
      p = place || Place.current();
    }
    if (!p) return;
    var chId = (existingPost && existingPost.ch) || lastCh();
    var aiRaw = (existingPost && existingPost.aiRaw) || '';
    var ready = ClaudeAI.readyChannels();

    var ov = overlay({
      title: trip ? ('🧳 ' + esc(trip.name) + ' — 한 편으로') : '✍️ 글 만들기',
      body:
        '<div class="ch-pick" id="wCh">' + ClaudeAI.CH_KEYS.map(function (k) {
          var c = ClaudeAI.channel(k);
          return '<button type="button" class="ch' + (k === chId ? ' on' : '') + '" data-ch="' + k + '"' +
            (c.ready ? '' : ' disabled title="' + esc(c.pendingWhy || '') + '"') + '>' +
            ClaudeAI.channelIcon(k, 18) + ' ' + esc(c.label) + (c.ready ? '' : ' <span class="mini">준비중</span>') + '</button>';
        }).join('') + '</div>' +
        '<label class="lbl">강조하고 싶은 것 <span class="mini">(선택)</span></label>' +
        '<input class="inp" id="wHint" placeholder="예) 웨이팅 정보를 꼭 넣어줘 / 아이랑 가기 좋은 점">' +
        '<div class="btn-row" style="margin:10px 0;">' +
          '<button class="btn primary" id="wGen">' + (CFG.hasProxy() ? '🤖 AI 로 쓰기' : '뼈대 초안 만들기') + '</button>' +
          /* 프록시가 없으면 두 버튼이 같은 일을 한다 — 하나만 둔다 */
          (CFG.hasProxy() ? '<button class="btn ghost" id="wDraft">뼈대만</button>' : '') +
        '</div>' +
        '<div class="mini" id="wQuota" style="margin-bottom:8px;">' + esc(Subs.label('post')) + '</div>' +
        (CFG.hasProxy() ? '' :
          '<div class="notice">⚠️ AI 프록시가 아직 설정되지 않았습니다(js/config.js 의 PROXY_URL). ' +
          '지금 나오는 것은 <b>AI 글이 아니라</b> 메모·태그로 짠 뼈대입니다.</div>') +
        '<textarea class="post-ta" id="wText" placeholder="여기에 글이 만들어집니다. 그대로 고쳐도 됩니다.">' +
          esc((existingPost && existingPost.text) || '') + '</textarea>' +
        '<div class="mini" id="wHintCopy" style="margin-top:6px;"></div>',
      foot: '<button class="btn ghost" id="wSave">저장</button>' +
            '<button class="btn ghost" id="wCopy">📋 복사</button>' +
            '<button class="btn primary" id="wShare">📤 올리기</button>'
    });

    function setCh(k) {
      chId = k;
      ov.querySelectorAll('#wCh .ch').forEach(function (b) { b.classList.toggle('on', b.dataset.ch === k); });
      ov.querySelector('#wHintCopy').textContent = ClaudeAI.channel(k).copyHint || '';
      try { localStorage.setItem(CFG.k('last_ch'), k); } catch (e) {}
    }
    ov.querySelectorAll('#wCh .ch').forEach(function (b) {
      b.onclick = function () { setCh(b.dataset.ch); };
    });
    setCh(ready.indexOf(chId) >= 0 ? chId : ready[0]);

    function fillDraft() {
      ov.querySelector('#wText').value = trip
        ? ClaudeAI.localTripDraft(trip, tripPlaces)
        : ClaudeAI.localDraft(chId, p);
      aiRaw = '';
    }
    var draftBtn = ov.querySelector('#wDraft');
    if (draftBtn) draftBtn.onclick = fillDraft;

    ov.querySelector('#wGen').onclick = function () {
      if (!CFG.hasProxy()) { fillDraft(); showToast('프록시 미설정 — 뼈대 초안을 넣었어요'); return; }
      /* ⚠️ 게이트는 **호출 직전**에 본다. 비용이 나가는 지점이 여기다. */
      if (!Subs.gateFeature('post', 'AI 글 생성')) return;
      showOverlay(trip ? '여행기 쓰는 중... (장소 ' + tripPlaces.length + '곳)' : '글 쓰는 중... (사진을 보고 있어요)');
      var hint = ov.querySelector('#wHint').value.trim();
      var run = trip ? ClaudeAI.generateTripPost(chId, trip, tripPlaces, hint)
                     : ClaudeAI.generatePost(chId, hint, p);
      run.then(function (t) {
        hideOverlay();
        /* ☠️ 차감은 **성공한 뒤에** 한다. 오류로 실패한 호출까지 세면 사용자가 손해다. */
        Subs.use('post');
        var qe = ov.querySelector('#wQuota');
        if (qe) qe.textContent = Subs.label('post');
        aiRaw = t;
        ov.querySelector('#wText').value = t;
        showToast('썼어요. 고쳐서 저장하면 다음 글이 이 말투를 따라갑니다', 'ok');
      }).catch(function (e) {
        hideOverlay();
        if (e.code === 'NO_PROXY' || e.code === 'NO_AUTH') {
          fillDraft();
          showToast(e.message + ' — 뼈대 초안을 넣었어요', 'err');
        } else showToast(e.message, 'err');
      });
    };

    function text() { return ov.querySelector('#wText').value; }

    function save() {
      var t = text().trim();
      if (!t) { showToast('글이 비어 있어요', 'err'); return Promise.resolve(null); }
      /* ⭐ 교정 학습 — AI 초안과 확정본이 다르면 예시로 쌓는다 */
      if (aiRaw) ClaudeAI.saveCorrection(chId, aiRaw, t);
      if (existingPost) {
        existingPost.text = t; existingPost.ch = chId; existingPost.updatedAt = Date.now();
        return Store.postPut(existingPost).then(function () { return existingPost; });
      }
      return ClaudeAI.savePost(p.id, chId, t, aiRaw).then(function (rec) {
        if (trip) { rec.kind = 'trip'; rec.title = trip.name; Store.postPut(rec); }
        existingPost = rec;
        return rec;
      });
    }

    ov.querySelector('#wSave').onclick = function () {
      save().then(function (r) { if (r) { showToast('저장했어요', 'ok'); UI.refresh(); } });
    };
    ov.querySelector('#wCopy').onclick = function () {
      showToast(copyText(text()) ? '복사했어요 — 붙여넣기만 하면 됩니다' : '복사 실패', 'ok');
    };
    ov.querySelector('#wShare').onclick = function () {
      var t = text().trim();
      if (!t) { showToast('글을 먼저 만들어 주세요', 'err'); return; }
      save().then(function () { openShareChooser(chId, t, p); });
    };
  };

  function lastCh() {
    try { return localStorage.getItem(CFG.k('last_ch')) || 'naver'; } catch (e) { return 'naver'; }
  }

  /* 모바일 공유 / PC 링크 갈림길 */
  function openShareChooser(chId, text, p) {
    var ch = ClaudeAI.channel(chId);
    var ov = overlay({
      title: '📤 ' + esc(ch.label) + '에 올리기',
      body:
        '<div class="row" id="shMobile" style="cursor:pointer;">' +
          '<div style="font-size:26px;width:38px;text-align:center;">📱</div>' +
          '<div><div class="ti">폰에서 바로</div>' +
          '<div class="sb">글은 복사되고 사진은 공유 시트로 넘어갑니다' +
            (Share.available() ? '' : ' · <span class="warn">앱에서만</span>') + '</div></div></div>' +
        '<div class="row" id="shPc" style="cursor:pointer;">' +
          '<div style="font-size:26px;width:38px;text-align:center;">💻</div>' +
          '<div><div class="ti">PC 링크 만들기</div>' +
          '<div class="sb">글+사진이 한 번의 Ctrl+V 로 들어갑니다' +
            (Share.canPc() ? '' : ' · <span class="warn">설정 필요</span>') + '</div></div></div>' +
        '<div class="notice">캡션 자동 입력은 어느 앱도 지원하지 않습니다(네이버 글쓰기 API 는 2020년 종료). ' +
        '그래서 글은 <b>항상 클립보드</b>를 거칩니다.</div>'
    });
    ov.querySelector('#shMobile').onclick = function () { ov.close(); Share.open(chId, text, p); };
    ov.querySelector('#shPc').onclick = function () { ov.close(); Share.openPc(chId, text, p); };
  }
  UI.openShareChooser = openShareChooser;

  /* ── 「글」 탭 ── */
  UI.renderPosts = function () {
    var el = document.getElementById('pnPosts');
    if (!el) return;
    Promise.all([Store.postAll(), Store.placeAll(), Store.tripAll()]).then(function (r) {
      var posts = r[0], places = {};
      r[1].forEach(function (p) { places[p.id] = p; });
      (r[2] || []).forEach(function (t) { places[t.id] = { name: '🧳 ' + t.name, _trip: true }; });
      if (!posts.length) {
        el.innerHTML = '<div class="empty"><div style="font-size:38px;margin-bottom:10px;">✍️</div>' +
          '아직 저장한 글이 없어요.<br><span class="mini">「작성」 탭에서 글을 만들면 여기에 쌓입니다.</span></div>';
        return;
      }
      el.innerHTML = '<div class="card">' + posts.map(function (o) {
        var pl = places[o.placeId] || {};
        var ch = ClaudeAI.channel(o.ch);
        var head = String(o.text || '').split('\n').filter(Boolean)[0] || '(빈 글)';
        return '<div class="row postRow" data-id="' + o.id + '">' +
          '<div style="width:32px;text-align:center;">' + ClaudeAI.channelIcon(o.ch, 22) + '</div>' +
          '<div style="min-width:0;"><div class="ti">' + esc(head.slice(0, 30)) + '</div>' +
          '<div class="sb">' + esc(ch.label) + ' · ' + esc(placeLabel(pl)) +
            (o.published ? '<span class="badge">발행</span>' : '') + '</div></div>' +
          '<div class="rt">' + new Date(o.createdAt).toLocaleDateString('ko-KR') + '</div></div>';
      }).join('') + '</div>';

      el.querySelectorAll('.postRow').forEach(function (row) {
        row.onclick = function () {
          var id = row.getAttribute('data-id');
          Store.postGet(id).then(function (o) {
            if (!o) return;
            /* 여행 글은 원래가 '장소'가 아니라 '여행'이다 — 공유하려면 가상 장소로 되살린다 */
            if (o.kind === 'trip') {
              return Trips.get(o.placeId).then(function (t) {
                if (!t) { openPostSheet(o, null); return; }
                return Trips.placesOf(t.id).then(function (list) {
                  openPostSheet(o, Trips.asPlace(t, list));
                });
              });
            }
            return Store.placeGet(o.placeId).then(function (pl) { openPostSheet(o, pl); });
          });
        };
      });
    });
  };

  function openPostSheet(post, place) {
    var ch = ClaudeAI.channel(post.ch);
    var ov = overlay({
      title: ClaudeAI.channelIcon(post.ch, 18) + ' ' + esc(ch.label),
      body:
        '<div class="mini">' + esc(placeLabel(place)) + ' · ' +
          new Date(post.createdAt).toLocaleString('ko-KR') + '</div>' +
        '<textarea class="post-ta" id="poText">' + esc(post.text) + '</textarea>' +
        '<label class="chk" style="margin-top:8px;"><input type="checkbox" id="poPub"' +
          (post.published ? ' checked' : '') + '><span>발행 완료로 표시</span></label>',
      foot: '<button class="btn danger sm" id="poDel">삭제</button>' +
            '<button class="btn ghost" id="poCopy">📋 복사</button>' +
            '<button class="btn primary" id="poShare">📤 올리기</button>'
    });
    function commit() {
      post.text = ov.querySelector('#poText').value;
      post.published = ov.querySelector('#poPub').checked;
      post.updatedAt = Date.now();
      return Store.postPut(post);
    }
    ov.querySelector('#poCopy').onclick = function () {
      commit().then(function () {
        showToast(copyText(post.text) ? '복사했어요' : '복사 실패', 'ok');
      });
    };
    ov.querySelector('#poShare').onclick = function () {
      commit().then(function () {
        if (!place) { showToast('원래 장소를 찾을 수 없어요 — 글만 복사해 쓰세요', 'err'); return; }
        ov.close();
        openShareChooser(post.ch, post.text, place);
      });
    };
    ov.querySelector('#poDel').onclick = function () {
      if (!confirm('이 글을 지울까요?')) return;
      Store.postDelete(post.id).then(function () { ov.close(); UI.refresh(); showToast('지웠어요'); });
    };
    ov.querySelector('#poPub').onchange = commit;
  }
})();
