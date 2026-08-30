/* ═══════════════════════════════════════════════════════════
   tools/setkeys.js — 발급받은 키를 제자리에 넣어준다
   ----------------------------------------------------------------
   왜 만들었나:
     Firebase 설정값은 **두 곳에 같은 값**을 넣어야 한다
       · www/js/config.js  의 FIREBASE
       · www/site/post.html 위쪽 PROJECT / API_KEY
     손으로 두 번 옮기면 한쪽만 바뀌기 쉽고, 그러면 앱은 되는데
     PC 링크 페이지만 조용히 안 열린다 — 원인을 찾기 어려운 종류의 사고다.

   쓰는 법:
     1) Firebase 콘솔에서 복사한 firebaseConfig 를 아무 파일에 붙여 넣는다 (예: keys.txt)
     2) node tools/setkeys.js keys.txt
     그 밖의 키는 옵션으로:
        node tools/setkeys.js keys.txt --proxy=https://... --post-base=https://xxx.web.app/post.html
        node tools/setkeys.js --kakao-rest=abc --kakao-js=def

   ⚠️ 이 값들은 공개돼도 되는 식별자다(보안은 firestore.rules / storage.rules 가 한다).
      다만 keys.txt 는 다 쓰면 지우는 편이 깔끔하다.
   ⚠️ 넣기 전 원본을 .bak 으로 남긴다. 잘못 들어가면 되돌릴 수 있게.
═══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CFG = path.join(ROOT, 'www', 'js', 'config.js');
const POST = path.join(ROOT, 'www', 'site', 'post.html');

const args = process.argv.slice(2);
const opts = {};
const files = [];
args.forEach(a => {
  const m = a.match(/^--([\w-]+)=([\s\S]*)$/);
  if (m) opts[m[1]] = m[2]; else files.push(a);
});

function read(p) { return fs.readFileSync(p, 'utf8'); }
function backup(p) {
  const b = p + '.bak';
  if (!fs.existsSync(b)) fs.copyFileSync(p, b);
  return b;
}
function write(p, s) { backup(p); fs.writeFileSync(p, s, 'utf8'); }

/* ── firebaseConfig 파싱 ── 붙여넣은 형태가 어떻든 키:값만 뽑는다 ── */
const FB_KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
function parseFirebase(src) {
  const out = {};
  FB_KEYS.forEach(k => {
    const m = src.match(new RegExp(k + '\\s*:\\s*["\'`]([^"\'`]+)["\'`]'));
    if (m) out[k] = m[1];
  });
  return out;
}

let fb = {};
if (files.length) {
  if (!fs.existsSync(files[0])) {
    console.error('❌ 파일을 찾을 수 없습니다: ' + files[0]);
    process.exit(1);
  }
  fb = parseFirebase(read(files[0]));
}

let changed = [];

/* ── config.js ── */
let cfg = read(CFG);

if (Object.keys(fb).length) {
  const missing = FB_KEYS.filter(k => !fb[k]);
  if (missing.length) {
    console.error('❌ firebaseConfig 에서 못 찾은 값: ' + missing.join(', '));
    console.error('   Firebase 콘솔 → 프로젝트 설정 → 내 앱 → 웹 앱의 firebaseConfig 를 통째로 붙여 넣어주세요.');
    process.exit(1);
  }
  const block =
    "FIREBASE: {\n" +
    "      apiKey:            '" + fb.apiKey + "',\n" +
    "      authDomain:        '" + fb.authDomain + "',\n" +
    "      projectId:         '" + fb.projectId + "',\n" +
    "      storageBucket:     '" + fb.storageBucket + "',\n" +
    "      messagingSenderId: '" + fb.messagingSenderId + "',\n" +
    "      appId:             '" + fb.appId + "'\n" +
    "    }";
  const before = cfg;
  cfg = cfg.replace(/FIREBASE:\s*\{[\s\S]*?\n    \}/, () => block);
  if (cfg === before) {
    console.error('❌ config.js 에서 FIREBASE 블록을 찾지 못했습니다. 파일이 바뀌었는지 확인해주세요.');
    process.exit(1);
  }
  changed.push('FIREBASE (' + fb.projectId + ')');
}

function setSimple(key, val, label) {
  if (!val) return;
  const re = new RegExp("(" + key + ":\\s*)'[^']*'");
  const before = cfg;
  cfg = cfg.replace(re, (m, a) => a + "'" + val + "'");
  if (cfg === before) console.error('⚠️  config.js 에서 ' + key + ' 를 찾지 못했습니다');
  else changed.push(label || key);
}
setSimple('PROXY_URL', opts.proxy, 'PROXY_URL');
setSimple('POST_BASE', opts['post-base'], 'POST_BASE');
setSimple('KAKAO_REST_KEY', opts['kakao-rest'], 'KAKAO_REST_KEY');
setSimple('KAKAO_JS_KEY', opts['kakao-js'], 'KAKAO_JS_KEY');

if (changed.length) write(CFG, cfg);

/* ── site/post.html ── 같은 값을 두 번째 자리에도 ── */
if (fb.projectId) {
  let post = read(POST);
  post = post.replace(/(var PROJECT = )'[^']*'/, (m, a) => a + "'" + fb.projectId + "'");
  post = post.replace(/(var API_KEY = )'[^']*'/, (m, a) => a + "'" + fb.apiKey + "'");
  write(POST, post);
  changed.push('post.html 의 PROJECT / API_KEY');
}

/* ── 결과 ── */
if (!changed.length) {
  console.log('바꾼 것이 없습니다. 사용법:\n' +
    '  node tools/setkeys.js keys.txt\n' +
    '  node tools/setkeys.js keys.txt --proxy=https://... --post-base=https://xxx.web.app/post.html\n' +
    '  node tools/setkeys.js --kakao-rest=... --kakao-js=...');
  process.exit(0);
}

console.log('\n✅ 넣었습니다');
changed.forEach(c => console.log('   · ' + c));
console.log('   (원본은 .bak 으로 남겨뒀습니다)');

/* 아직 안 채운 값이 뭔지 바로 알려준다 */
const left = [...read(CFG).matchAll(/'(TODO[A-Z_]*)'/g)].map(m => m[1]);
const uniq = [...new Set(left)];
console.log('\n' + (uniq.length ? '아직 안 채운 값: ' + uniq.join(', ') : '🎉 config.js 에 남은 자리표시자가 없습니다'));
console.log('\n다음: node tools/check.js\n');
