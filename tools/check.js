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
  ['auto_backup.js', "have[name]", '자동 백업이 증분(이미 있는 사진은 건너뜀)'],
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
  ['viewer.js',   'Photos.url', '뷰어가 URL 캐시를 거침 (직접 createObjectURL 하면 샌다)']
];
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
