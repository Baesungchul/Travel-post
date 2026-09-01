/* ═══════════════════════════════════════════════════════════
   ui_settings.js — 「설정」 탭
   카테고리 프로필 관리(사진 태그·제목 형식·해시태그·고정 문구),
   채널별 글쓰기 지침, 교정 학습, 화면, 그리고 **아직 안 채운 설정값**.

   ⚠️ 미설정 값을 화면 맨 위에 그대로 보여준다 — 조용히 실패하는 기능이 없게.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var UI = window.UI = window.UI || {};

  UI.renderSettings = function () {
    var el = document.getElementById('pnSettings');
    if (!el) return;
    var miss = CFG.missing();
    var pfs = Profiles.list();
    var curId = (Profiles.current() || {}).id;

    el.innerHTML =
      (miss.length ?
        '<div class="card">' +
          '<div class="sec-hd"><h2>⚙️ 아직 채우지 않은 설정</h2></div>' +
          '<div class="mini" style="margin-bottom:8px;">js/config.js 한 파일만 고치면 됩니다.</div>' +
          miss.map(function (m) {
            return '<div class="todo"><b>' + esc(m.k) + '</b><div class="mini">' + esc(m.why) + '</div></div>';
          }).join('') +
        '</div>' : '') +

      '<div class="card">' +
        '<div class="sec-hd"><h2>📍 카테고리</h2>' +
          '<button class="btn sm sp" id="stAddCat">＋ 추가</button></div>' +
        pfs.map(function (pf) {
          return '<div class="set-row catEdit" data-id="' + pf.id + '" style="cursor:pointer;">' +
            '<div style="font-size:22px;width:30px;text-align:center;">' + esc(pf.icon || '📍') + '</div>' +
            '<div><div class="k">' + esc(pf.name) + (pf.id === curId ? '<span class="badge">지금</span>' : '') + '</div>' +
            '<div class="d">' + esc((pf.tags || []).join(' · ')) + '</div></div>' +
            '<div class="sp mini">›</div></div>';
        }).join('') +
      '</div>' +

      '<div class="card">' +
        '<div class="sec-hd"><h2>✍️ 채널별 글쓰기 지침</h2></div>' +
        '<div class="mini" style="margin-bottom:6px;">지금 카테고리(' +
          esc((Profiles.current() || {}).name || '') + ') 기준입니다. 카테고리마다 따로 저장됩니다.</div>' +
        ClaudeAI.CH_KEYS.map(function (k) {
          var c = ClaudeAI.channel(k);
          return '<div class="set-row guideEdit" data-ch="' + k + '" style="cursor:pointer;">' +
            '<div style="font-size:20px;width:30px;text-align:center;">' + c.icon + '</div>' +
            '<div><div class="k">' + esc(c.label) +
              (ClaudeAI.hasGuide(k) ? '<span class="badge">작성됨</span>' : '') +
              (c.ready ? '' : '<span class="badge" style="background:rgba(196,69,58,.12);color:var(--wn);">준비중</span>') +
              '</div>' +
            '<div class="d">' + esc(c.ready ? (c.copyHint || '') : (c.pendingWhy || '')) + '</div></div>' +
            '<div class="sp mini">›</div></div>';
        }).join('') +
      '</div>' +

      '<div class="card">' +
        '<div class="sec-hd"><h2>🧠 글 교정 학습</h2></div>' +
        '<div class="mini">AI 초안을 고쳐서 저장하면 그 확정본을 예시로 쌓아, 다음 글의 말투·길이를 맞춥니다. ' +
          '카테고리·채널마다 따로 쌓입니다.</div>' +
        ClaudeAI.readyChannels().map(function (k) {
          var c = ClaudeAI.channel(k);
          return '<div class="set-row"><div class="k">' + c.icon + ' ' + esc(c.label) + '</div>' +
            '<div class="sp mini">' + ClaudeAI.correctionCount(k) + '건 ' +
            '<button class="btn sm ghost corrClear" data-ch="' + k + '">비우기</button></div></div>';
        }).join('') +
        '<label class="chk"><input type="checkbox" id="stLearnOff"' + (ClaudeAI.learnOff() ? ' checked' : '') +
          '><span>학습 끄기</span></label>' +
      '</div>' +

      /* ── 계정 ── */
      '<div class="card">' +
        '<div class="sec-hd"><h2>👤 계정</h2></div>' +
        (Cloud.ready
          ? (Cloud.loggedIn()
              ? '<div class="set-row"><div><div class="k">' + esc(Cloud.user.email || '로그인됨') + '</div>' +
                  '<div class="d">로그인하면 매달 무료 글 생성 횟수가 계정에 붙습니다</div></div>' +
                  '<button class="btn sm ghost sp" id="acOut">로그아웃</button></div>' +
                '<div class="set-row"><div><div class="k">계정 삭제</div>' +
                  '<div class="d">계정과 서버에 올린 사진을 지웁니다. <b>이 기기의 사진·기록은 그대로 남습니다</b></div></div>' +
                  '<button class="btn sm danger sp" id="acDel">삭제</button></div>'
              : '<div class="set-row"><div><div class="k">로그인 안 됨</div>' +
                  '<div class="d">' + esc(Subs.label('post')) + '</div></div>' +
                  '<button class="btn sm primary sp" id="acIn">로그인</button></div>')
          : '<div class="todo"><b>아직 로그인을 켤 수 없습니다</b><div class="mini">' + esc(Cloud.why) + '</div></div>') +
      '</div>' +

      /* ── 백업 ── */
      '<div class="card">' +
        '<div class="sec-hd"><h2>💾 백업</h2></div>' +
        '<div class="set-row"><div><div class="k">이 기기에 백업 파일 만들기</div>' +
          '<div class="d">사진·기록을 ZIP 하나로. <b>서버 없이 지금 바로</b> 됩니다</div></div>' +
          '<button class="btn sm primary sp" id="bkOpen">열기</button></div>' +
        '<div class="set-row"><div><div class="k">클라우드 백업</div>' +
          '<div class="d">' +
            (Cloud.ready
              ? (CloudBackup.lastAt() ? '마지막 ' + new Date(CloudBackup.lastAt()).toLocaleString('ko-KR') : '아직 올린 적 없음')
              : esc(Cloud.why)) +
          '</div></div>' +
          (Cloud.ready
            ? '<div class="sp"><button class="btn sm ghost" id="cbPull">받기</button> ' +
              '<button class="btn sm primary" id="cbPush">올리기</button></div>'
            : '') + '</div>' +
        '<div class="mini" style="margin-top:8px;">사진은 기기에 남습니다. 백업은 <b>기기 밖</b>에 두세요.</div>' +
      '</div>' +

      /* ── 구독 ── */
      '<div class="card">' +
        '<div class="sec-hd"><h2>🎫 이용량</h2></div>' +
        '<div class="set-row"><div><div class="k">글 생성</div>' +
          '<div class="d">' + esc(Subs.label('post')) + '</div></div>' +
          '<button class="btn sm ghost sp" id="subPlans">요금제</button></div>' +
        '<div class="mini">비용의 실체는 AI 호출이라 <b>글 생성 횟수</b>로 셉니다. ' +
          '촬영·정리·백업 ZIP 은 횟수와 무관하게 늘 무료입니다.</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="sec-hd"><h2>🎨 화면</h2></div>' +
        '<div class="set-row"><div class="k">어두운 모드</div>' +
          '<div class="sp"><select class="inp" id="stMode" style="width:auto;">' +
            ['auto:기기 설정', 'light:밝게', 'dark:어둡게'].map(function (o) {
              var v = o.split(':');
              return '<option value="' + v[0] + '"' + (mode() === v[0] ? ' selected' : '') + '>' + v[1] + '</option>';
            }).join('') + '</select></div></div>' +
        '<div class="set-row"><div class="k">색</div>' +
          '<div class="sp"><select class="inp" id="stTheme" style="width:auto;">' +
            ['none:기본(초록)', 'warm:따뜻하게', 'cool:시원하게', 'mono:무채색'].map(function (o) {
              var v = o.split(':');
              return '<option value="' + v[0] + '"' + (theme() === v[0] ? ' selected' : '') + '>' + v[1] + '</option>';
            }).join('') + '</select></div></div>' +
        '<div class="set-row"><div class="k">글자 크기</div>' +
          '<div class="sp"><input type="range" id="stFs" min="0" max="5" value="' + fsIdx() + '"></div></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="sec-hd"><h2>ℹ️ 정보</h2></div>' +
        '<div class="set-row"><div class="k">' + esc(CFG.APP_NAME) + '</div>' +
          '<div class="sp mini">v' + esc(window.APP_VERSION) + '</div></div>' +
        '<div class="set-row"><div class="k">저장 공간</div><div class="sp mini" id="stUsage">…</div></div>' +
        '<div class="mini" style="margin-top:8px;">사진은 이 기기 안에만 있습니다. ' +
          '로그인·백업은 다음 단계(설계안 9장 3단계)입니다.</div>' +
      '</div>';

    Store.estimate().then(function (e) {
      var u = el.querySelector('#stUsage');
      if (!u) return;
      u.textContent = e ? ((e.usage / 1048576).toFixed(1) + ' MB 사용') : '확인 불가';
    });

    var q = function (sel, fn) { var e = el.querySelector(sel); if (e) e.onclick = fn; };
    q('#acIn', function () { UI.openLogin(); });
    q('#acOut', function () {
      Cloud.signOut().then(function () { showToast('로그아웃했어요'); UI.renderSettings(); });
    });
    q('#acDel', function () { openDeleteAccount(); });
    q('#bkOpen', function () { Backup.openSheet(); });
    q('#cbPush', function () {
      if (!Subs.gateFeature('cloudbackup')) return;
      CloudBackup.push().then(function (r) {
        showToast('올렸어요 — 장소 ' + r.places + ' · 사진 ' + r.photos +
                  (r.skipped ? ' (' + r.skipped + '장은 이미 있었음)' : '') +
                  (r.failed ? ' · 실패 ' + r.failed : ''), 'ok');
        UI.renderSettings();
      }).catch(function (e) { showToast(e.message, 'err'); });
    });
    q('#cbPull', function () {
      CloudBackup.pull().then(function (a) {
        showToast('받았어요 — 장소 ' + a.places + ' · 사진 ' + a.photos +
                  (a.skipped ? ' (' + a.skipped + '건은 이미 있어 건너뜀)' : ''), 'ok');
        UI.refresh();
      }).catch(function (e) { showToast(e.message, 'err'); });
    });
    q('#subPlans', function () { Subs.openPlans('요금제', Subs.label('post')); });

    el.querySelector('#stAddCat').onclick = UI.openCategoryPicker;
    el.querySelectorAll('.catEdit').forEach(function (r) {
      r.onclick = function () { openCatEditor(r.getAttribute('data-id')); };
    });
    el.querySelectorAll('.guideEdit').forEach(function (r) {
      r.onclick = function () { openGuideEditor(r.getAttribute('data-ch')); };
    });
    el.querySelectorAll('.corrClear').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        ClaudeAI.clearCorrections(b.getAttribute('data-ch'));
        UI.renderSettings();
        showToast('비웠어요');
      };
    });
    el.querySelector('#stLearnOff').onchange = function () { ClaudeAI.setLearnOff(this.checked); };
    el.querySelector('#stMode').onchange = function () { setMode(this.value); };
    el.querySelector('#stTheme').onchange = function () { setTheme(this.value); };
    el.querySelector('#stFs').oninput = function () { setFs(+this.value); };
  };

  /* ── 카테고리 편집 — ⭐ 사진 태그 세트가 핵심 ── */
  function openCatEditor(id) {
    var pf = Profiles.get(id);
    if (!pf) return;
    var ov = overlay({
      title: esc((pf.icon || '📍') + ' ' + pf.name),
      body:
        '<label class="lbl">이름</label>' +
        '<input class="inp" id="ceName" value="' + esc(pf.name) + '">' +
        '<label class="lbl">아이콘 <span class="mini">(이모지 1개)</span></label>' +
        '<input class="inp" id="ceIcon" value="' + esc(pf.icon || '') + '" maxlength="4">' +
        '<label class="lbl">장소 호칭 <span class="mini">(가게 / 숙소 / 코스 …)</span></label>' +
        '<input class="inp" id="cePlace" value="' + esc(pf.placeLabel || '') + '">' +
        '<label class="lbl">⭐ 사진 태그 <span class="mini">(쉼표로 구분. 이 순서가 곧 글과 공유의 순서입니다)</span></label>' +
        '<input class="inp" id="ceTags" value="' + esc((pf.tags || []).join(', ')) + '">' +
        '<div class="notice">태그를 바꾸면 <b>새로 만드는 기록</b>부터 적용됩니다. ' +
        '이미 저장된 기록은 그때의 태그를 그대로 씁니다(글 맥락이 안 깨지게).</div>' +
        '<label class="lbl">글 제목 형식 <span class="mini">{지역} {상호} 를 쓸 수 있어요</span></label>' +
        '<input class="inp" id="ceTitle" value="' + esc(pf.titleFmt || '') + '">' +
        '<label class="lbl">해시태그 <span class="mini">(쉼표로 구분. # 없이)</span></label>' +
        '<input class="inp" id="ceHash" value="' + esc((pf.hashtags || []).join(', ')) + '">' +
        '<label class="lbl">고정 문구 <span class="mini">(협찬 고지·필명·블로그 주소 등 매 글에 들어갈 문장)</span></label>' +
        '<textarea class="inp" id="ceFixed" placeholder="예) 본 포스팅은 업체로부터 제품을 제공받아 작성했습니다.">' +
          esc(pf.fixedText || '') + '</textarea>',
      foot: '<button class="btn danger sm" id="ceDel">삭제</button>' +
            '<button class="btn primary" id="ceSave">저장</button>'
    });
    ov.querySelector('#ceSave').onclick = function () {
      var g = function (s) { return ov.querySelector(s).value.trim(); };
      var tags = g('#ceTags').split(',').map(function (t) { return t.trim(); }).filter(Boolean);
      if (!tags.length) { showToast('사진 태그는 하나 이상 필요해요', 'err'); return; }
      Profiles.save({
        id: id, name: g('#ceName') || pf.name, icon: g('#ceIcon') || '📍',
        placeLabel: g('#cePlace') || '장소', tags: tags,
        titleFmt: g('#ceTitle'),
        hashtags: g('#ceHash').split(',').map(function (t) { return t.trim().replace(/^#/, ''); }).filter(Boolean),
        fixedText: ov.querySelector('#ceFixed').value
      });
      ov.close(); UI.refresh(); showToast('저장했어요', 'ok');
    };
    ov.querySelector('#ceDel').onclick = function () {
      if (Profiles.list().length <= 1) { showToast('마지막 카테고리는 지울 수 없어요', 'err'); return; }
      if (!confirm('이 카테고리를 지울까요?\n이미 만든 기록은 그대로 남습니다.')) return;
      Profiles.remove(id);
      ov.close(); UI.refresh();
    };
  }

  /* ── 채널 지침 편집 ── */
  function openGuideEditor(chId) {
    var c = ClaudeAI.channel(chId);
    var pf = Profiles.current();
    var ov = overlay({
      title: c.icon + ' ' + esc(c.label) + ' 지침',
      body:
        (c.ready ? '' : '<div class="notice">⬜ ' + esc(c.pendingWhy || '') + '<br>실측 전까지 이 채널은 글 만들기에서 고를 수 없습니다.</div>') +
        '<div class="mini">' + esc((Profiles.current() || {}).name || '') +
          ' 카테고리 전용입니다. 다른 카테고리의 지침과 섞이지 않습니다.</div>' +
        '<label class="lbl">지침</label>' +
        '<textarea class="inp" id="geTxt" style="min-height:34vh;" placeholder="' +
          esc(catFill(c.guidePh || '', pf)) + '">' + esc(ClaudeAI.getGuide(chId)) + '</textarea>',
      foot: '<button class="btn ghost sm" id="geReset">기본값으로</button>' +
            '<button class="btn primary" id="geSave">저장</button>'
    });
    ov.querySelector('#geSave').onclick = function () {
      ClaudeAI.setGuide(chId, ov.querySelector('#geTxt').value);
      ov.close(); UI.renderSettings(); showToast('저장했어요', 'ok');
    };
    ov.querySelector('#geReset').onclick = function () {
      ClaudeAI.resetGuide(chId);
      ov.querySelector('#geTxt').value = ClaudeAI.getGuide(chId);
      showToast('기본값으로 되돌렸어요');
    };
  }

  /* ── 로그인 ── */
  UI.openLogin = function () {
    if (!Cloud.ready) {
      overlay({ title: '아직 로그인을 켤 수 없어요',
        body: '<div class="notice">' + esc(Cloud.why) + '</div>' +
              '<div class="mini">로그인 없이도 촬영·글쓰기·백업 ZIP 은 다 됩니다.</div>' });
      return;
    }
    var mode = 'in';   // 'in' | 'up'
    var ov = overlay({
      title: '로그인',
      body:
        '<div class="view-toggle" id="lgTab">' +
          '<button type="button" class="tag on" data-m="in">로그인</button>' +
          '<button type="button" class="tag" data-m="up">가입</button>' +
        '</div>' +
        '<label class="lbl">이메일</label>' +
        '<input class="inp" id="lgEmail" type="email" autocomplete="username" placeholder="you@example.com">' +
        '<label class="lbl">비밀번호</label>' +
        '<input class="inp" id="lgPw" type="password" autocomplete="current-password" placeholder="6자 이상">' +
        '<div class="mini" style="margin-top:10px;" id="lgWhy">로그인하면 매달 무료 글 생성 횟수를 드리고, 클라우드 백업을 쓸 수 있어요.</div>' +
        '<button class="btn sm ghost" id="lgReset" style="margin-top:10px;">비밀번호를 잊었어요</button>' +
        '<div style="display:flex;align-items:center;gap:8px;margin:14px 0 10px;">' +
          '<span style="flex:1;height:1px;background:var(--bd);"></span>' +
          '<span class="mini">또는</span>' +
          '<span style="flex:1;height:1px;background:var(--bd);"></span>' +
        '</div>' +
        (CFG.hasGoogleLogin()
          ? '<button class="btn ghost wide" id="lgGoogle">🔵 Google로 로그인</button>'
          : '<div class="notice">⚠️ 구글 로그인은 아직 설정 중이에요(js/config.js 의 GOOGLE_WEB_CLIENT_ID). 이메일로 로그인해 주세요.</div>'),
      foot: '<button class="btn primary wide" id="lgGo">로그인</button>'
    });
    ov.querySelectorAll('#lgTab .tag').forEach(function (b) {
      b.onclick = function () {
        mode = b.getAttribute('data-m');
        ov.querySelectorAll('#lgTab .tag').forEach(function (o) { o.classList.toggle('on', o === b); });
        ov.querySelector('#lgGo').textContent = (mode === 'up') ? '가입하기' : '로그인';
      };
    });
    ov.querySelector('#lgReset').onclick = function () {
      var em = ov.querySelector('#lgEmail').value.trim();
      if (!em) { showToast('이메일을 먼저 적어주세요', 'err'); return; }
      Cloud.resetPassword(em).then(function () {
        showToast('비밀번호 재설정 메일을 보냈어요', 'ok');
      }).catch(function (e) { showToast(e.message, 'err'); });
    };
    ov.querySelector('#lgGo').onclick = function () {
      var em = ov.querySelector('#lgEmail').value.trim();
      var pw = ov.querySelector('#lgPw').value;
      var run = (mode === 'up') ? Cloud.signUp(em, pw) : Cloud.signIn(em, pw);
      showOverlay(mode === 'up' ? '가입하는 중...' : '로그인하는 중...');
      run.then(function () {
        hideOverlay(); ov.close();
        showToast(mode === 'up' ? '가입 완료 — 반가워요' : '로그인했어요', 'ok');
        UI.refresh();
      }).catch(function (e) { hideOverlay(); showToast(e.message, 'err'); });
    };
    var gBtn = ov.querySelector('#lgGoogle');
    if (gBtn) gBtn.onclick = function () {
      showOverlay('구글 로그인 중...');
      Cloud.signInWithGoogle().then(function () {
        hideOverlay(); ov.close();
        showToast('구글 계정으로 로그인했어요', 'ok');
        UI.refresh();
      }).catch(function (e) {
        hideOverlay();
        if (e && e.code === 'CANCELLED') return;   /* 사용자가 그냥 닫은 것 — 에러로 안 보여준다 */
        showToast(e.message, 'err');
      });
    };
  };

  /* ⚠️ 계정 삭제 — Play 정책상 앱 안에 반드시 있어야 한다. 되돌릴 수 없으니 두 번 확인한다. */
  function openDeleteAccount() {
    var ov = overlay({
      title: '계정을 삭제할까요?',
      body:
        '<div class="notice">계정과 <b>서버에 올린 사진·백업</b>이 지워집니다. 되돌릴 수 없어요.</div>' +
        '<div class="box"><div class="mini">✅ 이 기기의 사진·기록·글은 <b>그대로 남습니다</b>. ' +
        '지우기 전에 <b>백업 ZIP</b> 을 하나 만들어 두시길 권합니다.</div></div>' +
        '<label class="lbl">확인을 위해 <b>삭제</b> 라고 적어주세요</label>' +
        '<input class="inp" id="daWord" placeholder="삭제">',
      foot: '<button class="btn ghost" id="daBackup">먼저 백업</button>' +
            '<button class="btn danger" id="daGo">삭제</button>'
    });
    ov.querySelector('#daBackup').onclick = function () { ov.close(); Backup.openSheet(); };
    ov.querySelector('#daGo').onclick = function () {
      if ((ov.querySelector('#daWord').value || '').trim() !== '삭제') {
        showToast('확인 문구가 달라요', 'err'); return;
      }
      showOverlay('계정을 삭제하는 중...');
      Cloud.deleteAccount().then(function () {
        hideOverlay(); ov.close();
        showToast('계정을 삭제했어요. 기기의 기록은 그대로 있습니다.', 'ok');
        UI.renderSettings();
      }).catch(function (e) { hideOverlay(); showToast(e.message, 'err'); });
    };
  }

  /* ── 화면 설정 ── */
  function mode() { try { return localStorage.getItem(CFG.k('mode')) || 'auto'; } catch (e) { return 'auto'; } }
  function theme() { try { return localStorage.getItem(CFG.k('theme')) || 'none'; } catch (e) { return 'none'; } }
  function fsIdx() { try { return parseInt(localStorage.getItem(CFG.k('fs')) || '2', 10); } catch (e) { return 2; } }

  function setMode(v) { try { localStorage.setItem(CFG.k('mode'), v); } catch (e) {} applyDisplay(); }
  function setTheme(v) { try { localStorage.setItem(CFG.k('theme'), v); } catch (e) {} applyDisplay(); }
  function setFs(i) { try { localStorage.setItem(CFG.k('fs'), String(i)); } catch (e) {} applyDisplay(); }

  function applyDisplay() {
    var h = document.documentElement;
    var m = mode();
    var dark = (m === 'dark') || (m === 'auto' && window.matchMedia &&
                window.matchMedia('(prefers-color-scheme: dark)').matches);
    h.setAttribute('data-mode', dark ? 'dark' : 'light');
    var t = theme();
    if (t && t !== 'none') h.setAttribute('data-theme', t); else h.removeAttribute('data-theme');
    var sizes = [13, 14, 15, 16.5, 18, 19.5];
    h.style.setProperty('--fs-base', (sizes[Math.max(0, Math.min(5, fsIdx()))] || 15) + 'px');
  }
  UI.applyDisplay = applyDisplay;
})();
