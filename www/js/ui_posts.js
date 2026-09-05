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
  var _q = '';   /* 완성글 검색어 — 다시 그려도 유지된다 (2026-09-05) */

  /* ═══ 임시 보관 ═══════════════════════════════════════════
     ☠️ 2026-09-05 이전에는 **AI 로 뽑은 글이 오탭 한 번에 사라졌다.**
        차감은 생성 성공 시점에 이미 끝나 있는데(아래 Subs.use), 글 만들기 창은 ✕ 뿐 아니라
        바깥 어두운 곳을 건드리기만 해도 닫히고, 닫으면 본문이 그대로 없어졌다.
        = 돈이 나간 결과물이 실수 하나로 증발하는 구조였다.
     → 생성 직후·글자를 고칠 때마다 기기에 임시 보관하고, 창이 닫힐 때도 한 번 더 보관한다.
        다시 열면 이어서 쓴다. 저장(Store.postPut)이 끝나면 임시본은 지운다.
     ⚠️ localStorage 라 용량이 작다 — 글 하나(수천 자)만 장소별로 둔다. 사진은 안 넣는다. */
  function draftKey(placeId) { return CFG.k('draft_' + placeId); }
  function draftSave(placeId, ch, text) {
    if (!placeId) return;
    try {
      var t = String(text || '');
      if (!t.trim()) { localStorage.removeItem(draftKey(placeId)); return; }
      localStorage.setItem(draftKey(placeId), JSON.stringify({ ch: ch || '', text: t, at: Date.now() }));
    } catch (e) { console.warn('[임시보관] 실패', e && e.message); }
  }
  function draftLoad(placeId) {
    if (!placeId) return null;
    try {
      var r = JSON.parse(localStorage.getItem(draftKey(placeId)) || 'null');
      return (r && r.text && String(r.text).trim()) ? r : null;
    } catch (e) { return null; }
  }
  function draftClear(placeId) { try { localStorage.removeItem(draftKey(placeId)); } catch (e) {} }

  /* ── 사진 미리보기 ⇄ 글 고치기 토글 (사용자 요청 2026-09-05) ──
     ☠️ 편집 상자는 '숨기기'만 한다 — 지우면 저장·복사·공유가 읽을 값이 사라진다
        (저장/복사/올리기는 전부 textarea.value 를 읽는다).
     복사되는 글은 마커가 그대로 남는다. 바뀌는 건 화면뿐이다. */
  function bindPreview(ov, taSel, pvSel, btnSel, getPlace) {
    var ta = ov.querySelector(taSel), pv = ov.querySelector(pvSel), btn = ov.querySelector(btnSel);
    if (!ta || !pv || !btn || !window.Preview) return { show: function () {}, on: function () { return false; } };
    var on = false;
    function paint() {
      if (!on) return;
      pv.innerHTML = '<div class="pv-empty">사진 불러오는 중…</div>';
      Preview.render(ta.value, getPlace()).then(function (html) {
        pv.innerHTML = html;
        /* 미리보기의 사진도 눌러서 크게 보고 좌우로 넘긴다 (사용자 요청 2026-09-05).
           ⚠️ 넘겨보기 순서는 글에 박힌 순서 그대로다 — 화면에 보이는 차례와 같아야 헷갈리지 않는다. */
        try { Viewer.bind(pv); } catch (e) {}
      }).catch(function () { pv.innerHTML = '<div class="pv-empty">미리보기를 만들지 못했어요.</div>'; });
    }
    function show(v) {
      on = !!v;
      ta.style.display = on ? 'none' : '';
      pv.style.display = on ? '' : 'none';
      btn.textContent = on ? '✏️ 글 고치기' : '🖼 사진으로 보기';
      paint();
    }
    btn.onclick = function () { show(!on); };
    show(false);
    return { show: show, on: function () { return on; } };
  }

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
        '<div class="pv-row"><button type="button" class="btn ghost sm" id="wPvBtn">🖼 사진으로 보기</button></div>' +
        '<textarea class="post-ta" id="wText" placeholder="여기에 글이 만들어집니다. 그대로 고쳐도 됩니다.">' +
          esc((existingPost && existingPost.text) || '') + '</textarea>' +
        '<div class="post-pv" id="wPv" style="display:none;"></div>' +
        /* 글 길이 — 채널마다 맞는 길이가 다르다(X 는 280자를 넘으면 아예 안 올라간다) */
        '<div class="len-row"><span id="wLen"></span></div>' +
        '<div class="notice" id="wCut" style="display:none;"></div>' +
        '<div class="mini" id="wHintCopy" style="margin-top:6px;"></div>',
      foot: '<button class="btn ghost" id="wSave">저장</button>' +
            '<button class="btn ghost" id="wCopy">📋 복사</button>' +
            '<button class="btn primary" id="wShare">📤 올리기</button>',
      /* 어떤 방법으로 닫혀도 본문을 잃지 않는다 */
      beforeClose: function () {
        var ta = ov.querySelector('#wText');
        var t = ta ? ta.value : '';
        if (!t.trim()) return;
        var saved = (existingPost && existingPost.text) || '';
        if (t.trim() === saved.trim()) return;      // 이미 저장된 것과 같으면 남길 것이 없다
        draftSave(p.id, chId, t);
        showToast('임시 보관했어요 — 다시 열면 이어서 씁니다');
      }
    });

    /* 저장된 글이 없고 임시본이 있으면 되살린다 (앱이 꺼졌다 켜져도 남아 있다) */
    (function () {
      var ta = ov.querySelector('#wText');
      if (!ta) return;
      if (!(existingPost && String(existingPost.text || '').trim())) {
        var d = draftLoad(p.id);
        if (d) {
          ta.value = d.text;
          if (d.ch) chId = d.ch;
          showToast('임시 보관해 둔 글을 불러왔어요');
        }
      }
      ta.addEventListener('input', function () { draftSave(p.id, chId, ta.value); paintLen(); });
    })();

    /* ── 글자 수 (분석 2026-09-05) ────────────────────────────
       왜: 채널마다 맞는 길이가 다른데 화면에는 아무 표시가 없었다. 인스타에 2,000자를
           붙여넣고 잘리거나, X 에 280자를 넘겨 아예 안 올라가는 일이 사용자 쪽에서 생긴다.
       ⚠️ 길이는 **복사되는 글 기준**이다 — 사진 마커((사진: 외관))도 붙여넣으면 글자로 들어가니
          빼고 세면 안 된다. 화면 미리보기에서 사진으로 보이는 것과는 다른 이야기다. */
    function paintLen() {
      var e = ov.querySelector('#wLen');
      if (!e) return;
      var ta2 = ov.querySelector('#wText');
      var n = (ta2 ? ta2.value : '').length;
      var L = ClaudeAI.channel(chId).len;
      if (!n) { e.textContent = ''; e.className = ''; return; }
      var txt = n.toLocaleString('ko-KR') + '자';
      var cls = '';
      if (L) {
        txt += ' · 권장 ' + (L.min ? L.min.toLocaleString('ko-KR') + '~' : '') + L.max.toLocaleString('ko-KR') + '자';
        if (n > L.max) { cls = L.hard ? 'over-hard' : 'over'; txt += L.hard ? ' — 넘으면 안 올라갑니다' : ' — 조금 깁니다'; }
        else if (L.min && n < L.min) { cls = 'under'; txt += ' — 조금 짧습니다'; }
        else { cls = 'good'; txt += ' ✓'; }
      }
      e.textContent = txt;
      e.className = cls;
    }

    var wPv = bindPreview(ov, '#wText', '#wPv', '#wPvBtn', function () { return p; });
    /* 이미 글이 있는 채로 열렸으면(저장된 글 다시 열기) 곧바로 사진으로 보여준다 */
    if ((existingPost && existingPost.text || '').trim()) wPv.show(true);

    function setCh(k) {
      chId = k;
      ov.querySelectorAll('#wCh .ch').forEach(function (b) { b.classList.toggle('on', b.dataset.ch === k); });
      ov.querySelector('#wHintCopy').textContent = ClaudeAI.channel(k).copyHint || '';
      paintLen();     /* 채널이 바뀌면 권장 길이도 바뀐다 */
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
      paintLen();
      try { wPv.show(true); } catch (e) {}
    }

    /* ── 글이 중간에 끊겼을 때 (분석 2026-09-05) ────────────────
       ☠️ 예전에는 stop_reason 을 안 봤다. 길이 제한에 걸려 문장 한복판에서 멈춘 글이
          아무 표시 없이 화면에 들어갔고, 사용자는 앱이 이상한 줄 알고 처음부터 다시 만들었다
          — 그때마다 횟수가 또 깎였다.
       ⚠️ 이어쓰기는 **차감하지 않는다.** 한 편을 완성하려는 같은 글의 뒷부분이고,
          앞부분에서 이미 한 번 깎았다. 여기서 또 깎으면 잘린 게 사용자 잘못이 된다. */
    var cutBox = ov.querySelector('#wCut');
    function showCut(on) {
      if (!cutBox) return;
      if (!on) { cutBox.style.display = 'none'; cutBox.innerHTML = ''; return; }
      cutBox.style.display = '';
      cutBox.innerHTML = '✂️ 길이 제한에 걸려 <b>글이 중간에서 끊겼어요.</b> ' +
        '<button type="button" class="btn sm primary" id="wCont">이어서 쓰기</button> ' +
        '<span class="mini">(횟수는 더 깎이지 않아요)</span>';
      cutBox.querySelector('#wCont').onclick = function () {
        var ta3 = ov.querySelector('#wText');
        var partial = ta3.value;
        if (!partial.trim()) { showCut(false); return; }
        showOverlay('끊긴 자리부터 이어서 쓰는 중...', function () { if (ClaudeAI.cancel) ClaudeAI.cancel(); });
        ClaudeAI.continuePost(chId, partial).then(function (more) {
          hideOverlay();
          var tail = String(more || '').trim();
          if (!tail) { showToast('이어질 내용을 받지 못했어요', 'err'); return; }
          /* 사용자가 그 사이에 글을 고쳤을 수도 있다 — 지금 값 뒤에 붙인다(덮지 않는다) */
          ta3.value = ta3.value.replace(/\s+$/, '') + '\n' + tail;
          draftSave(p.id, chId, ta3.value);
          paintLen();
          showCut(ClaudeAI.wasTruncated());   /* 이어 쓴 것도 또 잘렸으면 계속 띄운다 */
          try { if (wPv.on()) wPv.show(true); } catch (e) {}
          showToast('이어서 썼어요', 'ok');
        }).catch(function (e) {
          hideOverlay();
          if (e.code === 'CANCELLED') return;
          showToast(e.message, 'err');
        });
      };
    }
    var draftBtn = ov.querySelector('#wDraft');
    if (draftBtn) draftBtn.onclick = fillDraft;

    ov.querySelector('#wGen').onclick = function () {
      if (!CFG.hasProxy()) { fillDraft(); showToast('프록시 미설정 — 뼈대 초안을 넣었어요'); return; }
      /* ⚠️ 게이트는 **호출 직전**에 본다. 비용이 나가는 지점이 여기다. */
      if (!Subs.gateFeature('post', 'AI 글 생성')) return;
      showOverlay(trip ? '여행기 쓰는 중... (장소 ' + tripPlaces.length + '곳)' : '글 쓰는 중... (사진을 보고 있어요)',
        /* 전파가 약한 곳에서 갇히지 않게 — 취소해도 횟수는 안 깎인다(차감은 성공 뒤) */
        function () { if (ClaudeAI.cancel) ClaudeAI.cancel(); });
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
        draftSave(p.id, chId, t);   /* ☠️ 차감이 끝난 결과물이다 — 화면에만 두지 않는다 */
        paintLen();
        var cut = ClaudeAI.wasTruncated();
        showCut(cut);
        wPv.show(true);   /* 마커 대신 사진이 박힌 화면으로 — 고치려면 '✏️ 글 고치기' */
        showToast(cut ? '글이 중간에서 끊겼어요 — 아래 「이어서 쓰기」를 눌러 주세요'
                      : '썼어요. 고쳐서 저장하면 다음 글이 이 말투를 따라갑니다', cut ? '' : 'ok');
      }).catch(function (e) {
        hideOverlay();
        if (e.code === 'CANCELLED') return;              /* 사용자가 스스로 멈춘 것 — 오류가 아니다 */
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
        return Store.postPut(existingPost).then(function () { draftClear(p.id); return existingPost; });
      }
      return ClaudeAI.savePost(p.id, chId, t, aiRaw).then(function (rec) {
        if (trip) { rec.kind = 'trip'; rec.title = trip.name; Store.postPut(rec); }
        existingPost = rec;
        draftClear(p.id);          /* 진짜로 저장됐으니 임시본은 지운다 */
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
  /* 검색칸은 다시 그려도 커서가 튀지 않게 값·포커스를 되살린다 */
  function bindQ() {
    var q = document.getElementById('poQ');
    if (!q) return;
    q.oninput = function () { _q = q.value; UI.renderPosts(); };
    if (_q) { try { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } catch (e) {} }
  }

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
      /* ⭐ 2026-09-05: 글이 쌓이면 스크롤로만 찾아야 했다 — 본문·장소·채널을 한 번에 훑는다.
         글자를 칠 때마다 다시 그리므로(입력칸은 살려 둔다) 목록이 바로 좁혀진다. */
      var qq = _q.trim().toLowerCase();
      var shown = !qq ? posts : posts.filter(function (o) {
        var pl = places[o.placeId] || {};
        var hay = [o.text, pl.name, pl.area, ClaudeAI.channel(o.ch).label].join(' ').toLowerCase();
        return hay.indexOf(qq) >= 0;
      });
      var searchHTML =
        '<div class="srch"><input class="inp" id="poQ" type="search" placeholder="글·장소·채널 검색" value="' +
          esc(_q) + '">' +
        (qq ? '<div class="mini" style="margin-top:6px;">' + shown.length + '건 찾음 (전체 ' + posts.length + ')</div>' : '') +
        '</div>';
      if (!shown.length) {
        el.innerHTML = searchHTML + '<div class="empty"><div style="font-size:34px;margin-bottom:10px;">🔍</div>' +
          '찾는 글이 없어요.<br><span class="mini">다른 낱말로 찾아보세요.</span></div>';
        bindQ();
        return;
      }
      el.innerHTML = searchHTML + '<div class="card">' + shown.map(function (o) {
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
      bindQ();

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
        '<div class="pv-row"><button type="button" class="btn ghost sm" id="poPvBtn">🖼 사진으로 보기</button></div>' +
        '<textarea class="post-ta" id="poText">' + esc(post.text) + '</textarea>' +
        '<div class="post-pv" id="poPv" style="display:none;"></div>' +
        '<label class="chk" style="margin-top:8px;"><input type="checkbox" id="poPub"' +
          (post.published ? ' checked' : '') + '><span>발행 완료로 표시</span></label>',
      foot: '<button class="btn danger sm" id="poDel">삭제</button>' +
            '<button class="btn ghost" id="poCopy">📋 복사</button>' +
            '<button class="btn primary" id="poShare">📤 올리기</button>',
      /* 고쳐 놓고 그냥 닫아도 잃지 않는다 (2026-09-05) */
      beforeClose: function () {
        try {
          var ta = ov.querySelector('#poText');
          if (ta && ta.value !== post.text) { commit(); UI.refresh(); }
        } catch (e) {}
      }
    });
    var poPv = bindPreview(ov, '#poText', '#poPv', '#poPvBtn', function () { return place; });
    if (String(post.text || '').trim()) poPv.show(true);   /* 완성글은 사진이 보이는 쪽이 기본 */

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
      /* 지운 뒤 잠시 되돌릴 수 있다 (undo.js) — confirm 만으로는 오탭을 못 막았다 */
      Undo.deletePost(post.id).then(function () { ov.close(); UI.refresh(); });
    };
    ov.querySelector('#poPub').onchange = commit;
  }
})();
