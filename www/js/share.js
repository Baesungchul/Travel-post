/* ═══════════════════════════════════════════════════════════
   share.js — 글 + 사진을 블로그/SNS 로 내보내기
   ----------------------------------------------------------------
   현장매니저 sns_share.js 이식. **태그 축만 교체**했다.
     before/after/special  →  카테고리 사진 태그 세트 (외관/내부/음식/메뉴판 …)

   🧠 코드가 아니라 '이미 알아낸 사실'로 물려받은 것 — 새로 조사하지 말 것 (설계안 5장)
     · 네이버 블로그 글쓰기 API 는 2020년 종료 → 자동 발행 경로 없음
     · 캡션 자동 채움은 어느 앱도 불가(인스타·페북·네이버 전부) → 글은 **항상 클립보드**
     · ☠️ 2026-09-08 **이 항목은 틀렸다** — 예전엔 "네이버 스마트에디터가 붙여넣은 HTML 의
       외부 이미지를 자기 서버로 재업로드한다(2026-08-27 실측)" 고 적혀 있었다.
       현장매니저에서 실제로 깨졌다: 네이버가 안 가져가고 링크만 걸어 둬서, 링크가 만료되자
       발행된 글의 사진이 전부 "존재하지 않는 이미지입니다"로 바뀌었다(24시간 뒤).
       → PC 링크는 여전히 쓰되, **붙여넣은 사진을 [교체] 로 내 사진으로 바꾸라**고 안내한다.
       (base64 가 차단되는 것은 그대로 사실이다 — 링크 모드가 필요한 이유는 유효하다)
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
    /* ☠️ 2026-09-08 (사용자 결정) 네이버는 **사진을 공유 시트로 안 보낸다.**
         공유로 넘기면 사진이 글쓰기 화면 맨 위에 다 몰려서, 결국 하나씩 끌어
         내려야 했다 — 그게 제일 번거로운 단계였다.
         이제 갤러리에 저장해 두고, 글의 사진 표시 자리에서 [사진] 으로 꺼내 넣는다.
       ⚠️ 인스타·스레드·X 는 그대로 공유 시트를 쓴다. 거기선 사진이 게시물 자체라
          '자리' 라는 개념이 없어 몰려도 문제가 안 된다. */
    naver: ['<b>1️⃣ 갤러리에 저장</b>을 누르세요 — 사진이 찍고쓰다 앨범에 담겨요',
            '<b>2️⃣ 글 복사 + 공유</b>를 누르고, 공유 목록에서 <b>네이버 블로그</b>를 고르세요',
            '본문 칸을 길게 눌러 <b>붙여넣기</b> 하세요 (글은 이미 복사해 뒀어요)',
            '글 속 <b>(사진: 외관)</b> 같은 표시를 <b>지우고</b>, 그 자리에 <b>[사진]</b> 으로 갤러리의 같은 번호 사진을 넣으세요',
            '어느 사진인지 헷갈리면 <b>최근앱 버튼</b>으로 돌아오세요 — 찍고쓰다에 <b>참고 화면</b>이 떠 있어요',
            '사진을 다 넣은 뒤 발행하세요'],
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

  /* 사진을 공유 시트가 아니라 **갤러리에 저장**하는 채널 (2026-09-08).
     ☠️ 위 STEPS.naver 주석 참고 — 여기에만 넣고 인스타·스레드·X 는 건드리지 않는다. */
  var GALLERY_CH = { naver: true };

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

  /* ── 참고 화면 ─────────────────────────────────────────────────────────────
     ☠️ 2026-09-08 (현장매니저와 같은 처방) — 모바일에서 사진을 고를 때, 갤러리·공유
        화면은 **썸네일만** 보여 준다. 글에 (사진: 외관) 이라고 적혀 있어도 그게 어느
        사진인지 알 방법이 없다(파일명은 안 보인다 — 사장님 지적).
     → 공유 시트를 열기 **직전에** 이 화면을 깔아 둔다. 블로그 앱에서 사진을 고르다
        최근앱으로 돌아오면 앱에 이 화면이 그대로 떠 있다. 사진마다 글에 박힌 마커가
        **글자 그대로** 붙어 있어 짝을 맞출 수 있다(태그 이름만 적던 것을 사용자 요청으로
        마커 원문 (사진: 외관) 으로 바꿨다 — 2026-09-08).
     ⚠️ 마커 하나가 그 태그의 사진을 여러 장 받는다 — 그래서 같은 마커가 두 장 이상이면
        몇 번째인지도 옆에 붙는다(preview.js 의 .pv-no).
     ⚠️ 스스로 닫히면 안 된다 — 사용자가 [닫기] 를 누를 때까지 남는다. */
  function openRefScreen(text, place) {
    if (!(window.Preview && Preview.renderRef)) return;
    var old = document.getElementById('shRefOv');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var ov = document.createElement('div');
    ov.id = 'shRefOv';
    ov.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:2600;display:flex;flex-direction:column;';
    /* ☠️ 2026-09-08 사용자 신고: "참고용 화면에 닫기가 없어"
         버튼은 있었는데 **네이티브 광고 배너 뒤에 깔려** 안 보였다. 배너는 웹뷰 위에 따로
         떠 있어서 웹 화면은 그 높이를 모른다 — 그래서 --ad-h 를 여백에 더해야 한다
         (.hdr 은 이미 그렇게 하고 있다: styles.css 'calc(10px + var(--sa-top) + var(--ad-h))').
       ⚠️ 이 화면은 공유 시트 뒤에 깔려 있다가 사용자가 최근앱으로 돌아왔을 때 보인다.
          그때도 배너는 떠 있으므로 배너 높이를 빼면 안 된다. */
    ov.innerHTML =
      '<div style="flex:none;padding:calc(10px + var(--sa-top,0px) + var(--ad-h,0px)) 14px 10px;border-bottom:1px solid var(--bd);background:var(--sf);">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<div style="flex:1;font-size:15px;font-weight:800;">🖼 참고용 — 사진 자리 미리보기</div>' +
          '<button class="btn ghost sm" id="shRefClose">닫기</button>' +
        '</div>' +
        '<div style="font-size:11.5px;color:var(--mu);line-height:1.6;margin-top:6px;">' +
          '블로그에 올라가는 화면이 아니에요. 사진을 고르다 헷갈리면 <b>최근앱 버튼</b>으로 돌아와 이 화면을 보세요.<br>' +
          '사진 밑 <b>(사진: …)</b> 는 붙여넣은 글에 그대로 적혀 있는 표시예요 — 같은 표시를 찾아 그 자리에 넣으세요.' +
        '</div>' +
      '</div>' +
      '<div id="shRefBody" class="post-pv" style="flex:1;min-height:0;overflow-y:auto;border:0;border-radius:0;">' +
        '<div class="pv-empty">사진 불러오는 중…</div>' +
      '</div>';
    document.body.appendChild(ov);
    /* ☠️ 2026-09-08 사용자 신고: "뒤로가기해도 안 닫히고 앱이 닫혀"
         이 화면은 overlay() 로 만들지 않아서 뒤로가기 스택(state.js _ovStack)에 없었다.
         그래서 뒤로가기가 이 화면을 못 보고 그대로 탭 이동·종료 흐름으로 내려갔다.
         → registerSheet 로 스택에 올린다. 스스로 만든 전체화면 팝업은 **반드시** 올릴 것.
       ⚠️ 닫을 때 스택에서 빼지 않으면, 이미 사라진 화면을 닫으려다 뒤로가기가 한 번 먹힌다. */
    var _unreg = null;
    var closeRef = function () {
      if (_unreg) { try { _unreg(); } catch (e) {} _unreg = null; }
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    };
    if (window.registerSheet) _unreg = registerSheet({ close: closeRef });
    ov.querySelector('#shRefClose').onclick = closeRef;
    Preview.renderRef(text || '', place).then(function (html) {
      var b = document.getElementById('shRefBody');
      if (b) b.innerHTML = html;
    }).catch(function () {
      var b = document.getElementById('shRefBody');
      if (b) b.innerHTML = '<div class="pv-empty">미리보기를 만들지 못했어요.</div>';
    });
  }

  /* ② 글 복사 + 공유 — 사진은 ① 에서 이미 갤러리로 갔다. 여기서는 글만 넘긴다.
     앱이 텍스트를 받아 주면 본문에 바로 들어가고, 안 받아도 클립보드에 남아 있다. */
  /* 글의 첫 줄 = 제목 (2026-09-08 사용자 요청, 현장매니저와 같은 처방) ─────────
     ☠️ 제목을 안 넘기면 블로그 앱이 본문 앞부분을 잘라 제목을 만든다. 현장매니저에서
        실제로 이렇게 나왔다:
          "[공유] 삼원빌딩 에어컨 청소 — 곰팡이가 이 정도면 … 필요가 있습니다. 삼원"
        문장이 중간에서 끊기고 앞에 [공유] 가 붙는다.
     → 첫 줄을 뽑아 title 로 넘긴다. 안드로이드에서 title 은 EXTRA_SUBJECT 로 가고
       블로그 앱이 그걸 제목 칸에 넣는다.
     ⚠️ 본문(text)에서는 첫 줄을 빼지 않는다 — 붙여넣은 글의 제목 줄까지 사라지면
        사장님이 지운 줄 알고 다시 적게 된다. 제목 칸이 채워질 뿐이다. */
  var TITLE_MAX = 100;                     // 블로그 제목 칸 상한
  function firstLine(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t) continue;
      t = t.replace(/^#{1,6}\s*/, '')
           .replace(/^\[공유\]\s*/, '')
           .replace(/\*\*(.+?)\*\*/g, '$1')
           .trim();
      if (!t) continue;
      if (/^[\(（]\s*(?:사진|이미지)/.test(t)) continue;   // 사진 마커 줄은 제목이 아니다
      return t.length > TITLE_MAX ? t.slice(0, TITLE_MAX).trim() : t;
    }
    return '';
  }

  async function shareTextOnly(chId, text, place) {
    var ch = ClaudeAI.channel(chId);
    var okCopy = copyText(text || '');
    /* ☠️ 공유 시트를 열기 전에 깐다 — 시트가 닫힌 뒤 앱에 남아 있어야 참고가 된다 */
    openRefScreen(text, place);
    try {
      var _ti = firstLine(text);
      var _payload = { text: text || '', dialogTitle: ch.label + '에 올리기' };
      if (_ti) _payload.title = _ti;
      await _Share().share(_payload);
      if (!okCopy) showToast('글 복사가 안 됐어요 — 결과 화면에서 다시 복사해주세요', 'err');
    } catch (e) {
      var m = (e && (e.message || e.code)) || '';
      if (/cancel|abort|Share canceled/i.test(m)) return;   // 그냥 닫은 것은 오류가 아니다
      showToast('공유 실패: ' + m, 'err');
    }
  }

  async function run(chId, text, list, tags, place) {
    var ch = ClaudeAI.channel(chId);
    var okCopy = copyText(text || '');
    try {
      showOverlay('사진 준비 중...');
      var uris = await stage(list, tags);
      hideOverlay();
      if (!uris.length) { showToast('공유할 사진을 준비하지 못했습니다', 'err'); return; }
      /* ☠️ 공유 시트를 열기 전에 깐다 — 시트가 닫힌 뒤 앱에 남아 있어야 참고가 된다 */
      openRefScreen(text, place);
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

    var useGallery = !!GALLERY_CH[chId];
    var body =
      '<div class="mini">' +
        (useGallery
          ? '사진과 글은 <b>따로 들어가요</b> — 사진은 <b>갤러리에 저장</b>하고, 글은 <b>클립보드에 복사</b>해 뒀다가 붙여넣어요.<br>' +
            '글 사이사이에 사진을 자동으로 끼워 넣는 건 모바일 앱에서 안 돼요. 글에 남긴 <b>사진 표시</b>가 어느 사진을 어디에 넣을지 알려 줘요.'
          : '글은 <b>클립보드에 복사</b>되고, 사진은 <b>공유 시트</b>로 넘어갑니다.') +
      '</div>' +
      /* ☠️ 갤러리 방식은 이 장소 사진을 전부 내보낸다 — 고르게 해 놓고 다 저장하면
           화면이 거짓말이 된다. 그래서 태그 고르기를 띄우지 않는다. */
      (useGallery ? '' :
        '<div class="box">' + tags.map(function (t) {
          if (!cnt[t]) return '';
          return '<label class="chk"><input type="checkbox" class="shChk" data-t="' + esc(t) + '" checked>' +
                 '<span>' + esc(t) + ' <b>' + cnt[t] + '장</b></span></label>';
        }).join('') + '</div>') +
      '<div id="shCnt" class="accent"></div>' +
      '<ol class="steps">' + (STEPS[chId] || STEPS.naver).map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
      '<div class="mini">캡션 자동 입력은 어느 앱도 지원하지 않아서, 글은 붙여넣기로 넣어야 합니다.</div>';

    /* ☠️ 갤러리 방식은 버튼을 둘로 나누고 번호를 붙인다 — 한 버튼이 저장과 공유를 같이 하면,
         블로그로 넘어간 뒤에야 사진이 갤러리에 들어갔는지 알게 된다.
         ① 저장 → 눈으로 확인 → ② 공유 순서로 끊어 준다(현장매니저와 같은 처방). */
    var ov = overlay({
      title: '📤 ' + esc(ch.label) + '에 올리기',
      body: body,
      foot: useGallery
        ? '<button class="btn primary wide" id="shSave">1️⃣ 갤러리에 저장 (' + all.length + '장)</button>' +
          '<button class="btn ghost" id="shGo">2️⃣ 글 복사 + 공유</button>' +
          '<button class="btn ghost" id="shCancel">닫기</button>'
        : '<button class="btn primary" id="shGo">글 복사 + 사진 공유</button>' +
          '<button class="btn ghost" id="shCancel">취소</button>'
    });

    function refresh() {
      if (useGallery) {
        ov.querySelector('#shCnt').innerHTML = '갤러리에 저장할 사진 ' + all.length + '장';
        ov.querySelector('#shGo').disabled = (all.length === 0);
        return;
      }
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

    /* ① 갤러리에 저장 — 창을 닫지 않는다. 저장이 끝난 걸 보고 ② 로 넘어가야 한다. */
    var saveBtn = ov.querySelector('#shSave');
    if (saveBtn) saveBtn.onclick = function () {
      var old = saveBtn.textContent;
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중…';
      Gallery.exportPlace(p).then(function (r) {
        if (r.ok) {
          saveBtn.textContent = '✅ 갤러리에 저장했어요' + (r.fail ? ' (' + r.fail + '장 실패)' : '');
          var g = ov.querySelector('#shGo');
          if (g) g.className = 'btn primary';   /* 다음 차례를 눈에 보이게 */
        } else {
          saveBtn.textContent = old;
          saveBtn.disabled = false;
        }
      }).catch(function () {
        saveBtn.textContent = old;
        saveBtn.disabled = false;
      });
    };

    ov.querySelector('#shGo').onclick = function () {
      var l = picked();
      ov.close();
      /* ② 는 글만 넘긴다 — 사진은 ① 에서 이미 갤러리로 갔다 */
      if (useGallery) shareTextOnly(chId, text, p);
      else run(chId, text, l, tags, p);
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
    /* ★ 2026-09-03: PAID_ONLY 에 묶여 있던 동안은 아무도 이 코드를 실제로 못 돌려봤다
       (Subs.isPaid() 는 늘 false 라 여기까지 온 적이 없다 — share.js 참고).
       그래서 "링크 만들기 실패"만 뜨고 왜인지는 안 보였다 — 사진 업로드 실패를 조용히
       콘솔에만 warn 하고 넘어갔기 때문. 이제 첫 번째 진짜 원인(Storage 오류 코드 등)을
       붙잡아 뒀다가 사용자에게 그대로 보여준다. */
    var firstErr = null;

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
      } catch (e) {
        var why = (e && (e.code || e.message)) || String(e);
        if (!firstErr) firstErr = why;
        console.warn('[Share] 업로드 실패', path, why);
      }
      await new Promise(function (res) { setTimeout(res, 0); });
    }
    if (!urls.length) {
      throw new Error('사진을 하나도 올리지 못했습니다' + (firstErr ? ' — ' + firstErr : ' (사진에 접근하지 못했어요)'));
    }

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
          /* ☠️ 2026-09-08 '한 번에 들어갑니다' 는 사실이 아니었다 — 위 머리말 정정 참고.
               붙여넣기는 자리만 잡아 준다. 사진은 [교체] 로 내 것으로 바꿔야 남는다. */
          '<li>이 링크를 <b>PC에서</b> 여세요 (카톡으로 나에게 보내면 편해요)</li>' +
          '<li>페이지에서 <b>사진을 내려받고</b>, <b>글+사진 전체 복사</b>로 블로그에 붙여넣으세요</li>' +
          /* ⚠️ 2026-09-08 사용자 확인 — 블로그 PC 편집기에서 [교체]는
               **사진 위에 뜨는 도구막대가 아니라 화면 맨 위 도구모음**에 있다.
               자리를 잘못 알려 주면 찾다가 그냥 발행하게 되고, 그러면 하루 뒤 사진이 깨진다. */
          '<li>붙여넣은 <b>사진을 클릭</b>한 뒤 <b>화면 맨 위 도구모음의 [교체]</b>로 내려받은 같은 사진으로 바꾸세요</li>' +
          '<li>사진을 다 바꾼 뒤 발행하세요</li>' +
        '</ol>' +
        '<div class="notice">⚠️ <b>사진을 교체하지 않으면</b> 링크가 사라질 때 블로그 글의 사진이 ' +
          '<b>“존재하지 않는 이미지입니다”</b> 로 바뀌고, 외부 링크 사진은 <b>저품질의 원인</b>이 됩니다.<br>' +
          '⏳ 링크는 <b>24시간 뒤 자동으로 사라집니다</b> (' +
          new Date(res.exp).toLocaleString('ko-KR') + ').<br>' +
          '주소를 아는 사람은 누구나 볼 수 있으니 아무 데나 올리지 마세요.</div>',
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
        /* ★ 2026-09-03: 토스트는 몇 초면 사라져서 정확한 원인 문구를 놓치기 쉽다
           ("링크 만들기 실패"라고만 남기 쉬움). 창으로 띄워서 끝까지 읽고, 필요하면
           그대로 옮겨 적을 수 있게 한다. */
        var why = (e && (e.message || e.code)) || '알 수 없는 오류';
        overlay({
          title: '링크 만들기 실패',
          body: '<div class="notice">' + esc(why) + '</div>' +
                '<div class="mini">화면을 캡처해서 알려주시면 원인을 더 빨리 찾을 수 있어요.</div>'
        });
      }
    })();
  }

  window.Share = {
    available: available, canPc: canPc,
    open: open, openPc: openPc,
    collect: collect, STEPS: STEPS,
    firstLine: firstLine          /* 제목으로 넘기는 첫 줄 — 화면검사가 여기로 확인한다 */
  };
  console.log('[Share] 로드됨, 공유시트:', available(), '| PC링크:', CFG.hasFirebase() && CFG.hasHosting());
})();
