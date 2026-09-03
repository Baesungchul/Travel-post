/* ═══════════════════════════════════════════════════════════
   share.js — 글 + 사진을 블로그/SNS 로 내보내기
   ----------------------------------------------------------------
   현장매니저 sns_share.js 이식. **태그 축만 교체**했다.
     before/after/special  →  카테고리 사진 태그 세트 (외관/내부/음식/메뉴판 …)

   🧠 코드가 아니라 '이미 알아낸 사실'로 물려받은 것 — 새로 조사하지 말 것 (설계안 5장)
     · 네이버 블로그 글쓰기 API 는 2020년 종료 → 자동 발행 경로 없음
     · 캡션 자동 채움은 어느 앱도 불가(인스타·페북·네이버 전부) → 글은 **항상 클립보드**
     · 네이버 스마트에디터는 붙여넣은 HTML 의 외부 이미지를 자기 서버로 재업로드한다
       (2026-08-27 실측, postfiles.pstatic.net 확인). 단 base64 는 차단 → PC 링크 모드의 근거
     · 공유 파일명 순번(01_xxx.jpg)이 **공유 순서의 유일한 보험**
     · 다운로드 ZIP 파일명은 반드시 ASCII (크로뮴이 한글 <a download> 를 무시함)

   ☠️ 채널 키는 ai.js CHANNELS 에서 받아 쓴다. 여기에 따로 적지 않는다.
      현장매니저는 'fb' 와 'facebook' 이 어긋나 **오류 없이 버튼만 사라진 채** 몇 달을 갔다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CACHE_DIR = 'share_cache';

  /* 채널별 '무엇을 골라야 하는지' 사람 말 안내. 키는 ai.js 를 따른다. */
  var STEPS = {
    naver: ['공유 목록에서 <b>네이버 블로그</b>를 고르세요',
            '사진이 들어간 글쓰기 화면이 열립니다',
            '본문 칸을 길게 눌러 <b>붙여넣기</b> 하세요 (글은 이미 복사해 뒀어요)'],
    insta: ['공유 목록에서 <b>인스타그램</b>을 고르세요 (피드/스토리 선택)',
            '사진이 들어간 게시물 작성 화면이 열립니다',
            '캡션 칸을 길게 눌러 <b>붙여넣기</b> 하세요'],
    tistory: ['공유 목록에서 <b>티스토리</b> 또는 <b>브런치</b>를 고르세요',
              '글쓰기 화면이 열리면 본문에 <b>붙여넣기</b> 하세요'],
    threads: ['공유 목록에서 <b>스레드</b>를 고르세요',
              '새 글 작성 화면이 열립니다',
              '본문 칸을 길게 눌러 <b>붙여넣기</b> 하세요'],
    x: ['공유 목록에서 <b>X(트위터)</b>를 고르세요',
        '새 게시물 작성 화면이 열립니다',
        '본문 칸을 길게 눌러 <b>붙여넣기</b> 하세요']
  };

  /* ☠️ 자가검사 등록 — 키가 어긋나면 콘솔에 빨간 경고가 뜬다 */
  try { ClaudeAI.registerChannelConsumer('share.js STEPS', Object.keys(STEPS)); } catch (e) {}

  function isNative() {
    return !!(window.Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
  }
  function _Share() { return window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Share; }
  function _FS() { return window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Filesystem; }
  function available() { return isNative() && !!_Share(); }

  /* ── 사진을 '보이는 순서대로' 모은다 = 글의 흐름과 같은 순서 ── */
  function collect(place) {
    return Photos.ordered(place).map(function (x) {
      return { id: x.id, tag: x.tag, memo: x.memo || '' };
    });
  }

  /* 태그 → ASCII 파일명 조각.
     ⚠️ 파일명은 ASCII 로 둔다 — 한글 파일명은 기기에 따라 깨지고, 크로뮴은
        한글 <a download> 를 무시한다(현장매니저 2026-08-27 실측). */
  function asciiTag(tag, tags) {
    var i = tags.indexOf(tag);
    return 't' + (i < 0 ? 9 : (i + 1));
  }

  async function clearCache() {
    var FS = _FS(); if (!FS) return;
    try { await FS.rmdir({ path: CACHE_DIR, directory: 'CACHE', recursive: true }); } catch (e) {}
    try { await FS.mkdir({ path: CACHE_DIR, directory: 'CACHE', recursive: true }); } catch (e) {}
  }

  /* 캐시에 순번 파일명으로 써서 file:// URI 배열을 만든다 */
  async function stage(list, tags) {
    var FS = _FS();
    if (!FS) throw new Error('파일 플러그인 미등록 (재빌드 필요)');
    await clearCache();
    var uris = [];
    for (var i = 0; i < list.length; i++) {
      setProg((i / list.length) * 100, '사진 준비 ' + (i + 1) + '/' + list.length);
      var r = null;
      try { r = await Photos.resolvePhoto(list[i].id); } catch (e) {}
      if (!r) continue;
      var b64;
      try { b64 = await NativeFS.blobToBase64(r.blob); } catch (e) { continue; }
      /* ⚠️ 파일명 순번이 공유 순서의 유일한 보험이다 — 빼지 말 것 */
      var name = CACHE_DIR + '/' + String(i + 1).padStart(2, '0') + '_' + asciiTag(list[i].tag, tags) + '.jpg';
      try {
        await FS.writeFile({ path: name, data: b64, directory: 'CACHE', recursive: true });
        var u = await FS.getUri({ path: name, directory: 'CACHE' });
        if (u && u.uri) uris.push(u.uri);
      } catch (e) { console.warn('[Share] 사진 준비 실패', name, e && e.message); }
      if (i % 4 === 3) await new Promise(function (res) { setTimeout(res, 0); });
    }
    return uris;
  }

  async function run(chId, text, list, tags) {
    var ch = ClaudeAI.channel(chId);
    var okCopy = copyText(text || '');
    try {
      showOverlay('사진 준비 중...');
      var uris = await stage(list, tags);
      hideOverlay();
      if (!uris.length) { showToast('공유할 사진을 준비하지 못했습니다', 'err'); return; }
      await _Share().share({ files: uris, dialogTitle: ch.label + '에 올리기' });
      if (!okCopy) showToast('사진은 보냈어요 — 글은 복사가 안 됐으니 다시 복사해주세요', 'err');
    } catch (e) {
      hideOverlay();
      var m = (e && (e.message || e.code)) || '';
      if (/cancel|abort|Share canceled/i.test(m)) return;   // 사용자가 그냥 닫은 것은 오류가 아니다
      showToast('공유 실패: ' + m, 'err');
    }
  }

  /* ── 모바일 모드 시트 ── */
  function open(chId, text, place) {
    var ch = ClaudeAI.channel(chId);
    var p = place || Place.current();
    var tags = Place.tags(p);
    var all = collect(p);
    if (!all.length) { showToast('이 장소에 사진이 없어요 — 글만 복사해 쓰세요', 'err'); return; }
    if (!available()) {
      showToast('사진 공유는 앱에서만 쓸 수 있어요. 지금은 글만 복사할게요.', 'err');
      copyText(text || '');
      return;
    }

    var sel = {};
    tags.forEach(function (t) { sel[t] = true; });
    var cnt = {};
    all.forEach(function (x) { cnt[x.tag] = (cnt[x.tag] || 0) + 1; });

    function picked() {
      return all.filter(function (x) { return sel[x.tag] !== false; }).slice(0, ch.max);
    }

    var body =
      '<div class="mini">글은 <b>클립보드에 복사</b>되고, 사진은 <b>공유 시트</b>로 넘어갑니다.</div>' +
      '<div class="box">' + tags.map(function (t) {
        if (!cnt[t]) return '';
        return '<label class="chk"><input type="checkbox" class="shChk" data-t="' + esc(t) + '" checked>' +
               '<span>' + esc(t) + ' <b>' + cnt[t] + '장</b></span></label>';
      }).join('') + '</div>' +
      '<div id="shCnt" class="accent"></div>' +
      '<ol class="steps">' + (STEPS[chId] || STEPS.naver).map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
      '<div class="mini">캡션 자동 입력은 어느 앱도 지원하지 않아서, 글은 붙여넣기로 넣어야 합니다.</div>';

    var ov = overlay({
      title: '📤 ' + esc(ch.label) + '에 올리기',
      body: body,
      foot: '<button class="btn primary" id="shGo">글 복사 + 사진 공유</button>' +
            '<button class="btn ghost" id="shCancel">취소</button>'
    });

    function refresh() {
      var l = picked();
      var chosen = all.filter(function (x) { return sel[x.tag] !== false; }).length;
      var over = chosen - l.length;
      ov.querySelector('#shCnt').innerHTML = '보낼 사진 ' + l.length + '장' +
        (over > 0 ? ' <span class="warn">(' + esc(ch.label) + ' 한 번에 ' + ch.max + '장까지 — 뒤 ' + over + '장은 빠집니다)</span>' : '');
      ov.querySelector('#shGo').disabled = (l.length === 0);
    }
    refresh();
    ov.querySelectorAll('.shChk').forEach(function (b) {
      b.onchange = function () { sel[b.getAttribute('data-t')] = b.checked; refresh(); };
    });
    ov.querySelector('#shCancel').onclick = ov.close;
    ov.querySelector('#shGo').onclick = function () {
      var l = picked();
      ov.close();
      run(chId, text, l, tags);
    };
  }

  /* ═══════════════════════════════════════════════════════════
     PC 링크 모드 — 글+사진을 한 페이지로 올리고 주소를 발급한다.
     ☠️ 이미지는 반드시 실제 https URL 이어야 한다 — base64 는 네이버가 걸러낸다.
     · 링크는 24시간 뒤 만료. 실제 삭제는 서버 함수(cleanup)가 한다.
     · 페이지는 site/post.html.
     ⚠️ 호스팅 주소가 바뀌면 js/config.js 의 POST_BASE 한 줄만 고치면 된다.
     ═══════════════════════════════════════════════════════════ */
  function loggedIn() { return !!(window.Cloud && Cloud.loggedIn()); }
  function canPc() { return CFG.hasFirebase() && CFG.hasHosting() && loggedIn(); }

  async function makeLink(chId, text, list, tags) {
    var uid = Cloud.uid();
    var postId = firebase.firestore().collection('sns_posts').doc().id;
    var use = list.slice(0, CFG.LINK_MAX);
    var urls = [], paths = [], kinds = [];

    for (var i = 0; i < use.length; i++) {
      setProg((i / use.length) * 100, '사진 올리는 중 ' + (i + 1) + '/' + use.length);
      var r = null;
      try { r = await Photos.resolvePhoto(use[i].id); } catch (e) {}
      if (!r || !r.blob || !r.blob.size) continue;
      var b = await Img.shrink(r.blob, 1280, 0.82);
      /* 경로에 uid 를 넣어야 '남의 링크에 사진 끼워 넣기'를 규칙으로 막을 수 있다 */
      var path = 'snsPosts/' + uid + '/' + postId + '/' + String(i + 1).padStart(2, '0') + '.jpg';
      try {
        await firebase.storage().ref(path).put(b, { contentType: 'image/jpeg', cacheControl: 'public,max-age=86400' });
        urls.push(await firebase.storage().ref(path).getDownloadURL());
        paths.push(path);
        kinds.push(use[i].tag || '');     /* ⭐ 태그를 같이 넘겨야 페이지가 (사진: 음식) 자리에 맞는 사진을 넣는다 */
      } catch (e) { console.warn('[Share] 업로드 실패', path, e && (e.code || e.message)); }
      await new Promise(function (res) { setTimeout(res, 0); });
    }
    if (!urls.length) throw new Error('사진을 하나도 올리지 못했습니다');

    var expMs = Date.now() + CFG.LINK_TTL_MS;
    await firebase.firestore().collection('sns_posts').doc(postId).set({
      uid: uid, ch: chId || 'naver', text: String(text || ''),
      photos: urls, paths: paths, kinds: kinds, tags: tags,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt: firebase.firestore.Timestamp.fromMillis(expMs)
    });
    return { url: CFG.POST_BASE + '?id=' + postId, exp: expMs, n: urls.length, skipped: list.length - use.length };
  }

  function showLink(res) {
    try { if (window.UI && UI.refresh) UI.refresh(); } catch (e) {}   /* 설정 화면 등의 남은 횟수 표시 갱신 */
    var ov = overlay({
      title: '💻 PC용 링크를 만들었어요',
      body:
        '<div class="mini">사진 ' + res.n + '장이 글과 함께 담겼습니다.' +
          (res.skipped > 0 ? ' (한 링크에 ' + CFG.LINK_MAX + '장까지 — 뒤 ' + res.skipped + '장은 빠졌어요)' : '') + '</div>' +
        /* ⭐ PC 링크도 글쓰기 횟수를 같이 쓴다(사용자 요청 2026-09-03) — 여기서 바로 보여줘야
           "왜 깎였지?" 싶을 때 다음 화면까지 안 가고 바로 확인된다. */
        (window.Subs ? '<div class="mini">' + esc(Subs.label('post')) + '</div>' : '') +
        '<div class="urlbox">' + esc(res.url) + '</div>' +
        '<ol class="steps">' +
          '<li>이 링크를 <b>PC에서</b> 여세요 (카톡으로 나에게 보내면 편해요)</li>' +
          '<li>페이지의 <b>글+사진 전체 복사</b>를 누르세요</li>' +
          '<li>블로그 글쓰기 본문에 <b>Ctrl+V</b> — 사진까지 한 번에 들어갑니다</li>' +
        '</ol>' +
        '<div class="notice">⏳ 링크는 <b>24시간 뒤 자동으로 사라집니다</b> (' +
          new Date(res.exp).toLocaleString('ko-KR') + ').<br>' +
          '주소를 아는 사람은 누구나 볼 수 있으니 아무 데나 올리지 마세요. ' +
          '붙여넣고 나면 사진은 블로그 쪽에 남으니 지워져도 괜찮습니다.</div>',
      foot: '<button class="btn primary" id="lkCopy">📋 링크 복사</button>' +
            '<button class="btn ghost" id="lkSend">보내기</button>'
    });
    ov.querySelector('#lkCopy').onclick = function () {
      showToast(copyText(res.url) ? '링크를 복사했습니다' : '복사 실패 — 주소를 길게 눌러 복사해주세요', 'ok');
    };
    ov.querySelector('#lkSend').onclick = function () {
      var S = _Share();
      if (!S) { showToast('공유를 쓸 수 없습니다 — 링크를 복사해 보내주세요', 'err'); return; }
      S.share({ title: '블로그에 붙여넣기', text: res.url, dialogTitle: '링크 보내기' }).catch(function () {});
    };
  }

  function openPc(chId, text, place) {
    var p = place || Place.current();
    if (!CFG.hasFirebase() || !CFG.hasHosting()) {
      overlay({
        title: 'PC 링크는 아직 켤 수 없어요',
        body: '<div class="mini">이 기능은 서버가 필요합니다. <b>js/config.js</b> 에서 아래를 채우면 켜집니다.</div>' +
              '<ul class="steps">' +
              (CFG.hasFirebase() ? '' : '<li><b>FIREBASE</b> — 새 Firebase 프로젝트 설정값</li>') +
              (CFG.hasHosting() ? '' : '<li><b>POST_BASE</b> — site/post.html 을 올린 주소</li>') +
              '</ul>' +
              '<div class="mini">그때까지는 <b>모바일 공유</b>로 사진을 넘기고 글은 붙여넣어 주세요.</div>'
      });
      return;
    }
    if (!loggedIn()) { showToast('PC 링크를 만들려면 먼저 로그인해주세요', 'err'); return; }
    /* ⚠️ PC 링크는 서버 저장·전송 비용이 나간다 — 구독 대신 글쓰기 횟수와 같은 풀을 쓴다
       (사용자 요청 2026-09-03). Subs.gateFeature('pclink', ...) 는 이제 PAID_ONLY 가 아니라
       기본 분기를 타서 Subs.can('post') 를 그대로 확인한다 — subscription.js 참고. */
    if (window.Subs && !Subs.gateFeature('pclink', 'PC 링크 만들기')) return;
    var tags = Place.tags(p);
    var all = collect(p);
    if (!all.length) { showToast('이 장소에 사진이 없어요 — 글만 복사해 쓰세요', 'err'); return; }
    (async function () {
      try {
        showOverlay('PC용 링크 만드는 중...');
        var res = await makeLink(chId, text, all, tags);
        hideOverlay();
        /* ☠️ 차감은 성공한 뒤에 한다 — 업로드가 실패했는데 횟수만 깎이면 사용자가 손해다
           (ui_posts.js 의 AI 글 생성과 같은 원칙). */
        if (window.Subs) Subs.use('post');
        showLink(res);
      } catch (e) {
        hideOverlay();
        showToast('링크 만들기 실패: ' + ((e && (e.message || e.code)) || ''), 'err');
      }
    })();
  }

  window.Share = {
    available: available, canPc: canPc,
    open: open, openPc: openPc,
    collect: collect, STEPS: STEPS
  };
  console.log('[Share] 로드됨, 공유시트:', available(), '| PC링크:', CFG.hasFirebase() && CFG.hasHosting());
})();
