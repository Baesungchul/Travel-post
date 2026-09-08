/* ═══════════════════════════════════════════════════════════
   tools/check.js — 배포 전 자가검사
   ----------------------------------------------------------------
   현장매니저에서 "오류가 안 나고 조용히 망가지던" 종류를 잡는다.
     ① 채널 키 불일치 (ai.js CHANNELS ↔ share.js STEPS)
        → 'fb' vs 'facebook' 때문에 버튼만 사라진 채 몇 달을 갔다
     ② index.html 에 없는 파일 / sw.js SHELL 에 빠진 파일
     ③ 카테고리 하드코딩 (에어컨·작업 전/후·호수 같은 남은 도메인 단어)
     ④ JS 구문 오류
   실행: node tools/check.js
═══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const JS = path.join(WWW, 'js');
let fails = 0, warns = 0;
const bad = (m) => { console.log('  ❌ ' + m); fails++; };
const warn = (m) => { console.log('  ⚠️  ' + m); warns++; };
const ok = (m) => console.log('  ✅ ' + m);

const read = (p) => fs.readFileSync(p, 'utf8');

/* ── ① 구문 검사 ── */
console.log('\n[1] JS 구문');
/* 눌렀을 때 받는 파일 — index.html 에 없는 게 정상이다 */
const LAZY = ['jszip.min.js'];
const jsFiles = fs.readdirSync(JS).filter(f => f.endsWith('.js') && f !== 'jszip.min.js');
jsFiles.forEach(f => {
  try { new vm.Script(read(path.join(JS, f)), { filename: f }); }
  catch (e) { bad(f + ' — ' + e.message); }
});
if (!fails) ok(jsFiles.length + '개 파일 이상 없음');

/* ── ② 로드 목록 ── */
console.log('\n[2] index.html · sw.js 로드 목록');
const html = read(path.join(WWW, 'index.html'));
const sw = read(path.join(WWW, 'sw.js'));
const inHtml = [...html.matchAll(/<script src="\.\/js\/([^"]+)"/g)].map(m => m[1]);
inHtml.forEach(f => {
  if (!fs.existsSync(path.join(JS, f))) bad('index.html 이 부르는 js/' + f + ' 가 없음');
  if (sw.indexOf('./js/' + f) < 0) bad('sw.js SHELL 에 js/' + f + ' 가 빠짐 (오프라인에서 깨짐)');
});
jsFiles.forEach(f => {
  if (inHtml.indexOf(f) < 0) warn('js/' + f + ' 가 index.html 에서 로드되지 않음');
});
/* 지연 로드 파일도 SHELL 에는 있어야 한다 — 없으면 오프라인에서 백업·ZIP 이 죽는다 */
LAZY.forEach(f => {
  if (sw.indexOf('./js/' + f) < 0) bad('sw.js SHELL 에 지연 로드 파일 js/' + f + ' 가 빠짐');
});
/* 벤더(Firebase SDK) */
const VDIR = path.join(JS, 'vendor');
if (fs.existsSync(VDIR)) {
  fs.readdirSync(VDIR).filter(f => f.endsWith('.js')).forEach(f => {
    if (html.indexOf('./js/vendor/' + f) < 0) warn('js/vendor/' + f + ' 가 index.html 에서 로드되지 않음');
    else if (sw.indexOf('./js/vendor/' + f) < 0) bad('sw.js SHELL 에 js/vendor/' + f + ' 가 빠짐');
  });
}
ok('index.html 이 ' + inHtml.length + '개 로드');

/* ── ③ 채널 키 일치 (☠️ 가장 중요) ── */
console.log('\n[3] 채널 키 일치');
const ai = read(path.join(JS, 'ai.js'));
const share = read(path.join(JS, 'share.js'));
const chBlock = ai.slice(ai.indexOf('var CHANNELS = {'), ai.indexOf('var CH_KEYS'));
const chKeys = [...chBlock.matchAll(/^\s{4}([a-z][a-zA-Z0-9_]*):\s*\{/gm)].map(m => m[1]);
const stBlock = share.slice(share.indexOf('var STEPS = {'), share.indexOf('try { ClaudeAI.registerChannelConsumer'));
const stKeys = [...stBlock.matchAll(/^\s{4}([a-z][a-zA-Z0-9_]*):\s*\[/gm)].map(m => m[1]);
if (!chKeys.length) bad('ai.js 에서 CHANNELS 키를 읽지 못했습니다 (검사기 수정 필요)');
if (!stKeys.length) bad('share.js 에서 STEPS 키를 읽지 못했습니다 (검사기 수정 필요)');
chKeys.forEach(k => { if (stKeys.indexOf(k) < 0) bad('share.js STEPS 에 "' + k + '" 없음 → 버튼이 조용히 사라집니다'); });
stKeys.forEach(k => { if (chKeys.indexOf(k) < 0) bad('ai.js CHANNELS 에 없는 키가 share.js 에 있음: "' + k + '"'); });
if (chKeys.length && stKeys.length) ok('채널 ' + chKeys.length + '개 일치: ' + chKeys.join(', '));

/* ── ④ 도메인 하드코딩 ── */
console.log('\n[4] 남은 도메인 단어 (현장매니저 v507 사고 방지)');
const LEAK = ['에어컨', '작업 전', '작업 후', '호수', '보고서', '견적'];
let leaked = 0;
jsFiles.concat(['../index.html', '../styles.css']).forEach(f => {
  const p = f.startsWith('..') ? path.join(JS, f) : path.join(JS, f);
  const src = read(p);
  /* 주석은 '왜 이렇게 했는지'를 적은 것이라 통과시킨다 — 블록 주석 안까지 추적한다 */
  let inBlock = false;
  src.split('\n').forEach((ln, i) => {
    const t = ln.trim();
    const wasBlock = inBlock;
    if (!inBlock && (t.indexOf('/*') >= 0)) inBlock = (t.lastIndexOf('*/') < t.indexOf('/*'));
    else if (inBlock && t.indexOf('*/') >= 0) inBlock = false;
    if (wasBlock || inBlock || t.startsWith('//')) return;
    LEAK.forEach(w => {
      if (ln.indexOf(w) >= 0) { warn(path.basename(p) + ':' + (i + 1) + ' "' + w + '" — 토큰이어야 하지 않나?'); leaked++; }
    });
  });
});
if (!leaked) ok('코드에 남은 도메인 단어 없음');

/* ── ⑤ 안전장치가 자리에 있는지 ── */
console.log('\n[5] 안전장치');
const gates = [
  ['ui_posts.js', "Subs.gateFeature('post'", 'AI 글 생성 게이트'],
  ['share.js',    "Subs.gateFeature('pclink'", 'PC 링크 게이트'],
  ['ui_posts.js', "Subs.use('post')", '성공 후 차감'],
  ['backup.js',   "mode === 'merge'", '비파괴 복구(합치기)'],
  ['auto_backup.js', 'have[ph[j].id]', '자동 백업이 증분(이미 있는 사진은 건너뜀)'],
  ['auto_backup.js', 'placeFolder', '자동 백업이 기록 한 건마다 폴더를 따로 만든다'],
  ['auto_backup.js', 'idFromFileName', '파일명에서 사진 id 를 되찾음(없으면 복구가 사진을 못 잇는다)'],
  ['auto_backup.js', "'DOCUMENTS'", '자동 백업이 앱 삭제에도 남는 폴더에 쓴다'],
  ['share.js',    "padStart(2, '0')", '공유 파일명 순번'],
  ['state.js',    "'ov-lock'", '오버레이 스크롤 잠금'],
  ['plans.js',    'pl.placeId', '계획 → 기록 연결'],
  ['trips.js',    "' - '", "여행 사진 태그가 '상호 - 태그' 합성"],
  /* ★ 2026-09-05 추가 — 전부 '사라져도 오류가 안 나고 조용히 나빠지는' 종류다 */
  ['photos.js',   'URL_CACHE_MAX', '사진 URL 캐시 상한 (없으면 사진 Blob 이 메모리에 계속 쌓인다)'],
  ['photos.js',   'inUse(u)', '화면에 걸린 URL 은 해제하지 않음 (깨진 사진 방지)'],
  ['ai.js',       'stop_reason', '글이 잘렸는지 확인 (안 보면 끊긴 글을 그대로 내보낸다)'],
  ['ai.js',       'RETRY_MAX', '일시적 실패 재시도'],
  ['undo.js',     'Store.photoGet', '되돌리기가 지우기 **전에** 사진 Blob 을 떠 둠'],
  ['viewer.js',   'Photos.url', '뷰어가 URL 캐시를 거침 (직접 createObjectURL 하면 샌다)'],
  ['../styles.css', 'rgba(0,0,0,.94)', '사진 뷰어 배경 농도가 현장매니저와 같음'],
  ['../styles.css', 'max-width:95vw; max-height:92vh', '사진 뷰어 사진 여백이 현장매니저와 같음'],
  ['ui_posts.js', 'deriveTitle', '완성글 제목 폴백 (제목을 안 정한 옛 글도 목록에 보여야 한다)'],
  ['ai.js',       'TITLE_MODEL', '제목 짓기는 값싼 모델로 (본문과 같은 모델을 쓸 이유가 없다)'],
  ['ui_posts.js', '순위를 보장하지는', '제목 후보에 "검색 순위는 보장 못 한다" 고지 (AI 가 정답을 준 것처럼 보이면 안 된다)'],
  /* ★ 2026-09-06 추가 — 사진 넘기기 연출. 빠져도 오류가 안 나고 조용히 옛날 페이드로 되돌아간다 */
  ['viewer.js',   'warmNeighbors', '앞뒤 사진 미리 읽기 (없으면 넘길 때 빈 사각형이 따라 들어온다)'],
  ['viewer.js',   'pre.decode', '미리 읽기를 디코딩까지 (URL 만 받아 두면 여전히 늦다)'],
  ['viewer.js',   'void im.offsetWidth', '슬라이드 인 시작 위치를 스타일에 강제 반영 (빼면 새 사진이 나간 쪽에서 되돌아온다)'],
  /* ★ 2026-09-06 — 화면이 시스템 버튼 뒤로 숨던 문제 · 광고/구독 자리 */
  ['../styles.css', 'calc(14px + var(--sa-bottom))', '버튼줄 없는 시트의 아래 여백 (없으면 마지막 줄이 시스템 버튼 뒤에 숨는다)'],
  ['state.js',    "opts.foot ? ' has-ft'", '버튼줄 유무를 시트 껍데기에 표시 (위 CSS 가 이걸 보고 여백을 정한다)'],
  ['../styles.css', 'var(--sa-top) + var(--ad-h)', '설정 탭 위 여백에 배너 높이 포함 (.hdr 이 없는 탭이라 여기서 받아야 한다)'],
  ['ui_settings.js', "name: '구독 · 광고 제거'", '설정 첫 화면의 구독 항목 (안쪽에 묻으면 없는 것과 같다)'],
  ['ui_settings.js', 'if (def && def.go)', '구독 항목은 펼치지 않고 바로 요금제 화면을 연다'],
  ['tabbar.js',   "getElementById('adOff')", '광고 제거 칩 (광고가 뜰 때만 보이고 누르면 구독으로)'],
  ['tabbar.js',   'UI.pauseAds', '전체화면 동안 배너 내리기 (배너는 웹뷰 위에 떠서 카메라·사진을 덮는다)'],
  ['camera.js',   'UI.pauseAds(true)', '카메라를 열면 상단 배너를 내린다'],
  ['viewer.js',   'UI.pauseAds(true)', '사진 크게 보기에서 상단 배너를 내린다'],
  /* ★ 2026-09-07 추가 — AI 글 생성 진행 표시 (현장매니저에서 옮겨 옴) */
  ['state.js',    'startBusyProgress', 'AI 글 생성 진행 표시 (없으면 스피너만 돌아 멈춘 것처럼 보인다)'],
  ['state.js',    'opts.runSec || 32', '진행 속도를 눈금이 아니라 시간(초)으로 정한다'],
  ['ui_posts.js', 'stopBusy()', '글 생성이 끝나면 진행 표시를 멈춘다 (안 멈추면 타이머가 계속 돈다)'],
  ['ui_posts.js', 'stopTitle()', '제목 짓기가 끝나면 진행 표시를 멈춘다'],
  ['ui_posts.js', 'autoGrow', '편집 상자를 글 길이에 맞춰 늘림 (상자 안에 또 스크롤이 생기면 마지막 줄이 잘린다)'],
  ['ui_posts.js', "id=\"poSave\"", '완성글 시트의 저장 버튼 (조용히 저장되기만 하면 고친 게 남는지 알 수 없다)'],
  /* ★ 2026-09-07 — 촬영 방식 고르기 (앱 카메라 / 폰 기본 카메라) */
  ['camera.js',   'window.CamMode', '촬영 방식 설정 (없으면 늘 앱 카메라만 열린다)'],
  ['ui_now.js',   'CamMode.isSystem()', '촬영 버튼이 설정을 본다 (안 보면 설정이 조용히 무시된다)'],
  ['ui_settings.js', "id=\"stCam\"", '설정에 촬영 방식 고르는 칸'],
  ['../index.html', 'id="camPick"', '폰 기본 카메라를 여는 입력 (capture 가 있어야 갤러리가 아니라 카메라가 열린다)'],
  ['camera.js',   'chosen:', '한 번이라도 직접 골랐는지 구분 (없으면 처음 물어볼 시점을 못 잡는다)'],
  ['ui_now.js',   'UI.askCameraMode', '처음 촬영할 때 한 번 물어보기'],
  ['ui_now.js',   '설정 → 촬영', '물어보는 창에서 "설정에서 바꿀 수 있다"고 알려 준다'],
  /* ★ 2026-09-07 — 달력 달 넘기기 (사용자: "버벅인다, 프레임이 적은 것 같다")
       빠져도 오류가 안 난다. 조용히 예전의 '툭 갈아 끼우기'로 돌아갈 뿐이라 눈으로 봐야 안다. */
  ['../styles.css', '.cal-grid.cal-anim', '달 넘기는 동안만 레이어 승격 (없으면 매 프레임 칸 42개를 다시 그린다)'],
  ['calendar.js', "grid.classList.add('cal-anim')", '가로 드래그가 확정될 때 승격 (트랜지션 뒤에 붙이면 늦다)'],
  ['calendar.js', 'void g2.offsetWidth', '들여오기 시작 위치를 스타일에 강제 반영 (빼면 들어오는 연출이 통째로 사라진다)'],
  ['calendar.js', 'return collect(_y, _m)', 'render 가 프로미스를 돌려준다 (안 그러면 옛 달이 붙은 격자를 밀어 넣는다)'],
  ['calendar.js', 'move(dir2, true)', '끌다 놓으면 그 자리에서 이어서 나간다 (가운데로 되돌리면 한 번 튕긴다)'],
  /* ☠️ 2026-09-08 사용자 신고(현장매니저와 같은 증상) — "달력을 옆으로 밀거나 아래로
       내리는데 중간에 멈추는 경우가 있어". 드래그 중 화면은 transition:none 에 인라인
       transform 이 박혀 있어서, 손 뗌 신호가 안 오면 그 중간값 그대로 굳는다.
       빠져도 오류가 안 나고 아주 가끔만 재현돼 눈으로는 못 잡는다 — 여기서 지킨다. */
  ['calendar.js', 'function restoreDrag()', '끊긴 드래그를 한 곳에서 되돌린다 (갈래마다 적으면 하나를 빠뜨린다)'],
  ['calendar.js', 'restoreDrag(); mode = 3;', '밀던 중 두 번째 손가락이 닿아도 되돌린다 (예전엔 그대로 굳었다)'],
  ['calendar.js', 'function onCancel() { restoreDrag(); }', 'touchcancel → 되돌리기'],
  ['calendar.js', 'function _armWd()', '손 뗌 신호가 아예 안 와도 스스로 풀리는 워치독'],
  ['calendar.js', 'function sweepStuck()', '남아 있던 드래그 흔적 정리'],
  ['calendar.js', '__calDragGuardBound', '창 리스너를 한 번만 건다 (달력을 열 때마다 쌓이면 누수)'],
  /* ☠️ 2026-09-08 — 현장매니저에서 발행 24시간 뒤 블로그 글의 사진이 전부
       "존재하지 않는 이미지입니다" 로 바뀐 사고가 있었다. 원인은 코드가 아니라
       **문구가 한 약속**이었다("붙여넣으면 네이버가 사진을 자동으로 가져갑니다").
       찍고쓰다도 같은 문구를 물려받고 있어 같이 고쳤다 — 되살아나면 여기서 잡는다. */
  ['../site/post.html', '사진만 내 것으로 교체', 'PC 링크가 사진을 직접 교체하라고 앞에서 말한다'],
  ['../site/post.html', '저품질의 원인', '외부 링크 사진이 저품질의 원인이 된다는 경고'],
  ['../site/post.html', 'function saveOne', '사진 낱장 내려받기 (ZIP 은 또 풀어야 한다)'],
  ['../site/post.html', 'id="photoCard"', '사진 목록 카드 (☠️ #post 밖이라야 전체 복사에 안 섞인다)'],
  ['share.js',    'function openRefScreen', '공유 직전에 뜨는 참고 화면 (갤러리는 썸네일만 보여 준다)'],
  /* ☠️ 2026-09-08 사용자 신고 — "참고용 화면에 닫기가 없고, 뒤로가기해도 안 닫히고 앱이 닫혀.
       이건 이전에도 자주 있던 문제인데 팝업에서 뒤로가기했는데 포커스가 뒤편에 있는 증상이야"
     원인 둘: ① 손으로 만든 팝업을 뒤로가기 스택에 안 올렸다 ② 닫기 버튼이 광고 배너 뒤에 깔렸다.
     둘 다 오류가 안 나고 조용히 사람을 가둔다 — 되살아나면 여기서 잡는다. */
  ['share.js',    'registerSheet({ close: closeRef })', '참고 화면이 뒤로가기 스택에 올라간다 (안 올리면 뒤로가기가 앱을 닫는다)'],
  ['share.js',    'var(--ad-h,0px)', '참고 화면 머리글이 광고 배너 높이를 피한다 (닫기 버튼이 배너 뒤에 깔렸었다)'],
  ['state.js',    'window.closeStrayPopup', '스택에 안 올라간 전체화면 팝업도 뒤로가기가 닫는다 (마지막 그물)'],
  /* ☠️ 2026-09-08 사용자 신고(현장매니저) — 제목을 안 넘기면 블로그 앱이 본문 앞부분을
       잘라 "[공유] …" 형태의 제목을 만든다. 첫 줄을 제목으로 넘긴다. */
  ['share.js',    'function firstLine(text)', '글의 첫 줄을 제목으로 뽑는다'],
  ['share.js',    '_payload.title = _ti', '공유에 제목을 넘긴다 (네이버는 무시하지만 티스토리 등은 쓴다)'],
  /* ☠️ 2026-09-08 3차 (사용자 결정) — 본문은 그대로 넘긴다.
       한때 제목을 깨끗이 하려고 본문을 안 넘겨 봤는데, 제목은 "[공유]" 만 남고 본문이
       통째로 비었다. "[공유]" 말머리는 네이버가 붙이는 거라 어차피 못 없애므로,
       제목은 손을 대되 본문이라도 자동으로 채워지는 쪽이 낫다. */
  ['share.js',    "text: text || ''", '본문을 그대로 넘긴다 (안 넘기면 블로그 본문이 텅 빈다)'],
  ['share.js',    '제목 칸의 글자를 모두 지우고</b> 거기에 <b>붙여넣기', '제목을 옮겨 담는 법 안내'],
  ['share.js',    '네이버가 붙인 것이라 지우면 돼요', '"[공유]" 가 네이버가 붙인 말이라는 설명'],
  ['share.js',    '본문에 남은 <b>추천 제목 줄</b>을 지우세요', '본문에 남는 추천 제목을 지우라는 안내'],
  /* ☠️ 2026-09-08 사용자 요청 — 네이버가 공유 제목을 안 읽어서 제목 칸은 손으로 채워야 한다.
       글을 만들 때 추천 제목 3개를 같이 지어 맨 위에 붙인다(추가 요금 없음). */
  ['ai.js',       'var TITLE_BLOCK_GUIDE = [', '추천 제목 3개를 글 맨 위에 붙이는 지침'],
  ['ai.js',       "if (chId === 'naver' || chId === 'tistory') sys +=", '지침이 실제로 걸려 있다 (블로그 채널만)'],
  ['share.js',    '추천\\s*제목', '공유 제목이 추천 제목 블록을 건너뛴다 ("추천 제목"이 제목이 되면 안 된다)'],
  ['state.js',    'closeStrayPopup()) return', '뒤로가기 순서에 그물이 실제로 걸려 있다'],
  /* ☠️ 2026-09-08 사용자 확인 — 블로그 PC 편집기에서 [교체]는 사진 위에 뜨는 도구막대가
       아니라 **화면 맨 위 도구모음**에 있다. 자리를 잘못 알려 주면 찾다가 그냥 발행하고,
       하루 뒤 사진이 깨진다. 문구가 되돌아가면 여기서 잡는다. */
  ['share.js',    '화면 맨 위 도구모음의 [교체]', 'PC 링크 안내가 교체 버튼 자리를 정확히 알려 준다'],
  ['../site/post.html', '화면 맨 위 도구모음', 'PC 링크 페이지도 같은 자리를 알려 준다'],
  ['preview.js',  'P.renderRef = function', '참고 화면용 렌더 (사진 밑에 글에 박힌 마커)'],
  ['preview.js',  '<figcaption><span class="pv-mk">', '참고 화면에서 사진 밑에 마커를 적는다'],
  /* ☠️ 2026-09-08 사용자 요청 — 태그 이름만 적지 말고 마커 원문 그대로.
       글에 (사진: 외관) 이라고 박혀 있는데 화면이 '외관 1' 이면 눈으로 대조가 안 된다.
       ai.js 의 '(사진: ' + t + ')' 와 같은 형식이라야 한다. */
  /* ☠️ 2026-09-08 (현장매니저에서 사용자가 겪은 일) — 캡션을 사진 목록에서 계산해 붙이면
       AI 가 (사진: 외관) 처럼 줄여 쓴 글과 글자가 달라진다. 글에서 만난 마커를 그대로 적는다. */
  ['preview.js',  'function imgs(list, markTx)', '캡션이 글에서 만난 마커 원문 (계산한 이름이 아니다)'],
  ['preview.js',  "cap = '글에 표시 없음'", '마커에 안 걸린 사진에 없는 표시를 지어내지 않는다'],
  ['ai.js',       'function normalizeMarkers(text, place)', 'AI 가 줄여 쓴 마커를 실제 태그 이름으로 바로잡는다'],
  ['ai.js',       'normalizeMarkers(_out, p)', '바로잡기가 생성 경로에 실제로 걸려 있다'],
  ['../styles.css', '.post-pv .pv-fig figcaption', '참고 화면 캡션 스타일'],
  ['../styles.css', '.post-pv .pv-fig .pv-mk', '마커 상자 스타일 (글에 있는 그 표시라는 걸 보이게)'],
  ['ai.js',       '마크다운 구분선(---, ***, ___)을 쓰지 마세요', 'AI 에게 구분선 금지 (본문에 "---" 로 남는다)'],
  /* ★ 2026-09-08 — 모바일 네이버는 사진을 공유가 아니라 갤러리로 내보낸다.
       ☠️ 네이티브 플러그인이 필요한 기능이라, 등록이 빠지면 오류 없이 "쓸 수 없습니다" 만 뜬다. */
  ['gallery.js',  'Capacitor.Plugins.GallerySaver', '갤러리 저장 플러그인 연결'],
  ['gallery.js',  'G.exportPlace', '장소 사진을 통째로 갤러리에 저장'],
  ['gallery.js',  'Photos.ordered', '갤러리 저장 순서가 글의 사진 표시와 같은 축'],
  ['share.js',    'GALLERY_CH = { naver: true }', '네이버만 갤러리 방식 (인스타·스레드·X 는 공유 시트 그대로)'],
  ['share.js',    'id="shSave"', '1️⃣ 갤러리에 저장 버튼'],
  ['share.js',    'shareTextOnly(chId, text, p)', '2️⃣ 는 글만 넘긴다 (사진은 ① 에서 이미 갤러리로 갔다)'],
  ['../index.html', 'js/gallery.js', 'gallery.js 로드 (빠지면 저장 버튼이 조용히 죽는다)']
];
/* ☠️ 안드로이드 쪽 등록 — JS 만 있고 registerPlugin 이 없으면 오류 없이 조용히 죽는다.
     "갤러리 저장을 쓸 수 없습니다" 토스트만 뜨고 원인을 알 길이 없다(재빌드가 필요한 변경). */
{
  const AJ = path.join(ROOT, 'android/app/src/main/java/com/baesungchul/travelpost');
  const plug = path.join(AJ, 'GallerySaverPlugin.java');
  const main = path.join(AJ, 'MainActivity.java');
  if (!fs.existsSync(plug)) bad('GallerySaverPlugin.java 가 없습니다 — 갤러리 저장이 동작하지 않습니다');
  else if (read(main).indexOf('registerPlugin(GallerySaverPlugin.class)') < 0)
    bad('MainActivity 가 GallerySaverPlugin 을 등록하지 않습니다 — 오류 없이 조용히 죽습니다');
  else ok('갤러리 저장 플러그인 등록됨 (안드로이드)');
}

gates.forEach(([f, needle, label]) => {
  const src = read(path.join(JS, f));
  if (src.indexOf(needle) < 0) bad(label + ' 이 ' + f + ' 에서 사라졌습니다');
});
if (!fails) ok(gates.length + '개 안전장치 확인');

/* ⚠️ 스토어를 새로 만들고 백업에 안 넣으면 백업이 **조용히** 그것만 빠뜨린다 */
const storeSrc = read(path.join(JS, 'store.js'));
const backupSrc = read(path.join(JS, 'backup.js'));
/* ★ 2026-09-05: 서버 백업을 걷어내고 폰 저장소 자동 백업으로 바꿨다(cloud_backup.js 삭제).
   같은 규칙을 auto_backup.js 에 그대로 건다 — 스토어를 새로 만들면 여기에도 넣어야 한다. */
const autoSrc = read(path.join(JS, 'auto_backup.js'));
const stores = [...storeSrc.matchAll(/S_[A-Z]+\s*=\s*'(\w+)'/g)].map(m => m[1])
  .filter(n => n !== 'settings');
stores.forEach(n => {
  if (backupSrc.indexOf(n + ':') < 0 && backupSrc.indexOf('Store.' + n.replace(/s$/, '') + 'All') < 0)
    bad('backup.js 가 스토어 "' + n + '" 를 담지 않습니다 — 백업에서 조용히 빠집니다');
  if (autoSrc.indexOf(n + ':') < 0 && autoSrc.indexOf('Store.' + n.replace(/s$/, '') + 'All') < 0)
    bad('auto_backup.js 가 스토어 "' + n + '" 를 담지 않습니다 — 자동 백업에서 조용히 빠집니다');
});
ok('백업이 스토어 ' + stores.length + '종을 모두 담음: ' + stores.join(', '));

/* ⚠️ 2026-09-05: 앱 아이콘 그림이 네 곳에 흩어져 있다 —
   www/icon.svg(웹·탭), www/icon-maskable.svg(홈 화면에 담을 때),
   www/index.html(헤더), www/js/ui_settings.js(설정 맨 위).
   안드로이드 런처 아이콘(mipmap PNG)은 이 도형으로 뽑은 것이라 여기서 어긋나면
   **홈 화면 아이콘과 앱 안 아이콘이 다른 그림**이 된다 — 오류는 안 나고 조용히 어긋난다. */
const MARK_BODY = 'M26 41 V26 H41';   /* 뷰파인더 왼쪽 위 갈고리 — 모든 판본에 똑같이 들어간다 */
[['icon.svg', WWW], ['icon-maskable.svg', WWW], ['index.html', WWW]].forEach(([f, dir]) => {
  if (read(path.join(dir, f)).indexOf(MARK_BODY) < 0)
    bad(f + ' 의 앱 아이콘 도형이 다른 곳과 다릅니다 (홈 화면 아이콘과 앱 안 그림이 어긋납니다)');
});
if (read(path.join(JS, 'ui_settings.js')).indexOf(MARK_BODY) < 0)
  bad('ui_settings.js 의 APP_MARK 도형이 다른 곳과 다릅니다');
/* 런처 아이콘이 Capacitor 기본값으로 되돌아갔는지 — 기본 전경은 벡터 xml 이라 그 파일이 살아나면 신호다 */
const AND = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
if (fs.existsSync(path.join(AND, 'drawable-v24', 'ic_launcher_foreground.xml')))
  bad('android drawable-v24/ic_launcher_foreground.xml 이 되살아났습니다 — Capacitor 기본 아이콘으로 되돌아간 상태입니다');
['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].forEach(d => {
  ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png', 'ic_launcher_monochrome.png'].forEach(f => {
    if (!fs.existsSync(path.join(AND, 'mipmap-' + d, f))) bad('런처 아이콘 mipmap-' + d + '/' + f + ' 가 없습니다');
  });
});
if (!fails) ok('앱 아이콘이 웹·앱 안·런처 다섯 해상도까지 같은 그림');

/* ⚠️ 2026-09-06: 한 줄 설명(APP_TAGLINE)도 아이콘과 같은 병을 앓았다 —
   config.js 에 값이 있는데 아무도 안 쓰고, 헤더·설정·빈 화면이 각자 같은 문장을 박아 뒀다.
   한 곳만 고치면 나머지가 옛 문장으로 남는다(오류는 안 난다).
   → 이제 셋 다 CFG.APP_TAGLINE 을 읽는다. 문장을 다시 박아 넣으면 여기서 잡는다. */
const tagline = (read(path.join(JS, 'config.js')).match(/APP_TAGLINE:\s*'([^']+)'/) || [])[1];
if (!tagline) bad('config.js 에서 APP_TAGLINE 을 읽지 못했습니다');
else {
  [['index.html', path.join(WWW, 'index.html')],
   ['ui_settings.js', path.join(JS, 'ui_settings.js')],
   ['ui_now.js', path.join(JS, 'ui_now.js')]].forEach(([label, f]) => {
    if (read(f).indexOf(tagline) >= 0)
      bad(label + ' 에 한 줄 설명이 그대로 박혀 있습니다 — CFG.APP_TAGLINE 을 읽어야 합니다');
  });
  if (read(path.join(JS, 'version.js')).indexOf('APP_TAGLINE') < 0)
    bad('version.js 가 헤더의 한 줄 설명을 채우지 않습니다 (#appTagline 이 빈칸으로 남습니다)');
  ok('한 줄 설명이 config.js 한 곳에서만 나온다: "' + tagline + '"');
}

/* ⚠️ 2026-09-07 사용자 신고: "글 생성하고 나서 글 가장 아래쪽이 버튼에 가려서 일부 보이지 않음".
   원인은 시트(스크롤) 안에 스크롤 상자가 또 있던 것 — 시트를 끝까지 내려도 마지막 줄이
   상자 높이에 잘린 채 버튼 바로 위에서 끝난다. 스크롤은 시트 본문 하나만 한다.
   여기서 잡지 않으면 나중에 "미리보기가 너무 길다"는 이유로 다시 들어가기 쉽다. */
{
  const css = read(path.join(WWW, 'styles.css'));
  const nested = [];
  ['.post-pv', '.post-ta'].forEach(sel => {
    const i = css.indexOf(sel + '{');
    if (i < 0) { bad('styles.css 에서 ' + sel + ' 를 찾지 못했습니다 (검사기 수정 필요)'); return; }
    const block = css.slice(i, css.indexOf('}', i));
    if (/max-height/.test(block)) nested.push(sel + ' 에 max-height');
    if (/overflow-y\s*:\s*auto|overflow\s*:\s*auto/.test(block)) nested.push(sel + ' 에 overflow auto');
  });
  if (nested.length) bad('글 상자 안에 스크롤이 다시 생겼습니다 (' + nested.join(', ') + ') — 마지막 줄이 잘립니다');
  else ok('글 상자가 시트 스크롤 하나만 쓴다 (마지막 줄이 버튼 위에서 잘리지 않음)');
}

/* ── ⑥ 자리표시자 ── */
console.log('\n[6] 아직 안 채운 설정값 (배포 전 확인)');
const cfg = read(path.join(JS, 'config.js'));
const todos = [...cfg.matchAll(/'(TODO[A-Z_]*)'/g)].map(m => m[1]);
const post = read(path.join(WWW, 'site', 'post.html'));
if (todos.length) warn('config.js 미설정 ' + [...new Set(todos)].length + '종: ' + [...new Set(todos)].join(', '));
if (post.indexOf('TODO_PROJECT_ID') >= 0) warn('site/post.html 의 PROJECT / API_KEY 도 아직 비어 있음');
if (!todos.length) ok('자리표시자 없음');
/* ⭐ 2026-09-03: 광고 테스트 모드를 켠 채로 실서비스에 나가면, 사용자가 '테스트 광고'를 보고도
   진짜 사용권을 받아가 버린다(수익 없이 공짜로 풀리는 구조) — TODO 스캔과 같은 취지로 미리 알려준다. */
if (/AD_TEST_MODE\s*:\s*true/.test(cfg)) warn('config.js 의 AD_TEST_MODE 가 아직 true 입니다 — 실제 배포 전에 false 로 바꾸세요(테스트 광고로 진짜 사용권이 풀림)');

console.log('\n' + (fails ? '❌ 실패 ' + fails + '건' : '✅ 통과') + (warns ? ' / 경고 ' + warns + '건' : ''));
process.exit(fails ? 1 : 0);
