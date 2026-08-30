/* tools/inject-keys.js — 빌드/배포 직전에 비밀 키를 config.js 에 끼워 넣는다.
 *
 * 왜 필요한가:
 *   이 저장소는 공개라, 도메인 제한이 없는 키(카카오 REST 키)를 커밋하면
 *   깃허브를 훑는 수집 봇에게 바로 털린다. 그래서 저장소에는 TODO_ 자리표시자만 두고,
 *   실제 값은 깃허브 시크릿에 보관했다가 CI 에서 이 스크립트로 주입한다.
 *
 * 쓰는 법 (환경변수로 넘긴다):
 *   KAKAO_REST_KEY=xxxx node tools/inject-keys.js
 *
 * 값이 없으면 아무것도 바꾸지 않고 정상 종료한다(=그 기능만 꺼진 채로 빌드됨).
 * ⚠️ 주입된 config.js 는 절대 커밋하지 말 것. CI 의 임시 작업공간에서만 쓴다.
 */
const fs = require('fs');
const path = require('path');

const CONFIG = path.join(__dirname, '..', 'www', 'js', 'config.js');

/* 자리표시자 -> 환경변수 이름 */
const MAP = {
  TODO_KAKAO_REST_KEY: 'KAKAO_REST_KEY',
};

let src = fs.readFileSync(CONFIG, 'utf8');
let changed = 0;

for (const [placeholder, envName] of Object.entries(MAP)) {
  const value = process.env[envName];
  if (!value) {
    console.log(`- ${envName}: 값 없음 -> 건너뜀 (해당 기능은 꺼진 채로 빌드됩니다)`);
    continue;
  }
  if (!src.includes(placeholder)) {
    console.log(`- ${envName}: 자리표시자 ${placeholder} 가 config.js 에 없음 -> 건너뜀`);
    continue;
  }
  /* 값에 따옴표/역슬래시가 섞여도 깨지지 않게 JSON 으로 안전하게 감싼다.
     (config.js 는 작은따옴표를 쓰지만 JS 문법상 큰따옴표도 동일하다) */
  const safe = JSON.stringify(String(value)).slice(1, -1);
  src = src.split(placeholder).join(safe);
  changed++;
  console.log(`- ${envName}: 주입 완료 (${value.length}자)`);
}

if (changed) {
  fs.writeFileSync(CONFIG, src, 'utf8');
  console.log(`config.js 에 ${changed}개 값 주입.`);
} else {
  console.log('주입할 값이 없어 config.js 를 그대로 둡니다.');
}
