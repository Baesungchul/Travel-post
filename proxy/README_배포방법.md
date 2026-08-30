# AI 프록시 배포 방법 (컴퓨터 켜지면 이것부터)

이 폴더는 "찍고쓰다" 앱이 AI(Claude)를 이용해 글을 써주는 기능을 담당하는 작은 서버입니다.
사용자의 API 키(비밀값)를 앱이 아니라 이 서버에만 저장해서, 앱을 뜯어봐도 키가 안 보이게 해줍니다.

무료로 배포 가능합니다 (Cloudflare Workers 무료 플랜: 하루 10만 건까지 무료).

---

## 0. 미리 준비할 것

1. **Anthropic API 키**
   - https://console.anthropic.com 접속 → 회원가입/로그인
   - 왼쪽 메뉴에서 "API Keys" → "Create Key"
   - 결제 수단 등록 필요 (Anthropic API는 종량제 과금, Firebase와 별개 계정/카드)
   - 만들어진 키 (sk-ant-... 로 시작) 를 메모장 등에 복사해두기 — **한 번만 보여주므로 꼭 저장**

2. **Cloudflare 계정** (무료)
   - https://dash.cloudflare.com/sign-up 에서 이메일로 가입

이 두 가지만 있으면 아래 명령어들은 제가 컴퓨터 연결됐을 때 대신 실행해드릴 수도 있어요.
직접 하셔도 되고, "컴퓨터 켰어, 프록시 배포해줘" 라고 말씀하셔도 됩니다.

---

## 1. 폴더 옮기기

이 `travel-post-proxy` 폴더를 컴퓨터의 `C:\travel-post\proxy` 위치로 옮깁니다.
(travel-post 앱 폴더 안에 proxy 라는 하위 폴더로 둡니다)

## 2. 터미널에서 실행

```
cd C:\travel-post\proxy
npm install
npx wrangler login
```

`wrangler login`을 실행하면 브라우저가 열리고 Cloudflare 로그인 화면이 나옵니다. 로그인하고 "Allow"를 누르면 됩니다.

## 3. API 키를 비밀값으로 등록

```
npx wrangler secret put ANTHROPIC_API_KEY
```

실행하면 터미널에 값을 붙여넣으라고 나옵니다. 0번에서 복사해둔 `sk-ant-...` 키를 붙여넣고 엔터.

(이 값은 파일에 저장되지 않고 Cloudflare 서버에만 암호화되어 저장됩니다.)

## 4. 배포

```
npx wrangler deploy
```

성공하면 이런 형태의 주소가 출력됩니다:

```
https://travel-post-ai-proxy.<본인계정이름>.workers.dev
```

이 주소를 복사해둡니다.

## 5. 배포 확인

브라우저 주소창에 아래처럼 입력해서 열어봅니다 (끝에 /health 붙이기):

```
https://travel-post-ai-proxy.<본인계정이름>.workers.dev/health
```

화면에 `{"ok":true,"service":"travel-post-ai-proxy"}` 가 보이면 성공입니다.

## 6. 앱에 연결

`C:\travel-post\www\js\config.js` 파일의 `PROXY_URL` 값을 4번에서 복사한 주소로 바꿉니다.
(제가 컴퓨터 연결되면 `tools/setkeys.js --proxy=<주소>` 로 자동으로 넣어드릴게요.)

---

## 나중에 API 키를 바꾸고 싶으면

```
npx wrangler secret put ANTHROPIC_API_KEY
```
다시 실행해서 새 값을 붙여넣으면 덮어씌워집니다.

## 비용 관련 참고

- Cloudflare Workers: 무료 플랜으로 충분 (하루 10만 요청)
- Anthropic API: 실제 사용한 만큼만 과금 (글 하나 생성에 대략 몇 원~수십 원 수준, 모델/글자수에 따라 다름)
- Anthropic 콘솔(console.anthropic.com)에서 사용량/한도(budget limit) 설정 가능 — 예상치 못한 과금 막고 싶으면 월 한도를 낮게 걸어두는 것을 추천

## 확인 안 된 부분 (컴퓨터 연결되면 같이 확인할 것)

- `www/js/ai.js`가 이 프록시로 보내는 요청의 정확한 형식(요청 바디 구조)을 아직 실제 코드로 대조 확인하지 못했습니다.
  이 프록시는 `{ model, messages, system, max_tokens }` 형태를 Anthropic Messages API 그대로 전달하는
  일반적인 형태로 만들어뒀는데, 실제 ai.js 호출부와 형식이 다르면 조정이 필요할 수 있습니다.
  → 컴퓨터 연결되면 ai.js를 직접 읽어서 맞는지 확인하고, 필요하면 프록시 코드를 수정하겠습니다.
