/**
 * 찍고쓰다(travel-post) AI 프록시 서버 (Cloudflare Workers)
 *
 * 역할:
 *  1) 요청 헤더의 Firebase ID 토큰(Authorization: Bearer <token>)을 검증한다.
 *     -> 로그인한 사용자만 AI를 쓸 수 있게 막는다.
 *  2) 검증 통과하면 Anthropic API(Claude)로 요청을 그대로 전달한다.
 *     -> ANTHROPIC_API_KEY는 여기(서버)에만 있고, 앱(www)에는 절대 노출되지 않는다.
 *
 * 주의: 이 파일은 Cloudflare Workers 문법(ESM export default { fetch })을 사용한다.
 *      wrangler.toml, package.json과 함께 배포한다. (README_배포방법.md 참고)
 */

import { jwtVerify, createRemoteJWKSet } from 'jose';

// Firebase가 ID 토큰 서명에 쓰는 공개키 목록 (구글이 공식 제공, 프로젝트 공통)
const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));

// 앱에서 오는 요청만 허용하고 싶으면 여기에 실제 도메인을 적는다.
// 지금은 우선 전부 허용(*)으로 열어두고, 나중에 POST_BASE 도메인이 정해지면 좁혀도 된다.
const ALLOWED_ORIGIN = '*';

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extra,
  };
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(extraHeaders) },
  });
}

/**
 * Authorization: Bearer <Firebase ID Token> 을 검증한다.
 * Firebase Admin SDK 없이(Workers 환경에서 못 씀) 표준 JWT 검증 방식으로 확인.
 * 참고: Firebase 공식 문서의 "서드파티 JWT 라이브러리로 ID 토큰 검증" 방식.
 */
async function verifyFirebaseToken(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return { ok: false, reason: 'no-token' };

  const token = m[1];
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) return { ok: false, reason: 'server-misconfigured' };

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });

    // 추가 검증: auth_time이 과거여야 하고, sub(uid)가 있어야 함
    const now = Math.floor(Date.now() / 1000);
    if (!payload.sub) return { ok: false, reason: 'no-sub' };
    if (typeof payload.auth_time === 'number' && payload.auth_time > now) {
      return { ok: false, reason: 'auth_time-future' };
    }

    return { ok: true, uid: payload.sub, email: payload.email };
  } catch (err) {
    return { ok: false, reason: 'verify-failed', detail: String(err) };
  }
}

export default {
  async fetch(request, env) {
    // 브라우저 preflight 요청 처리
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // 헬스체크용: 배포 후 이 주소를 브라우저 주소창에 그대로 붙여넣어서 열어보면
    // {"ok":true,...} 가 나오는지로 배포 성공 여부를 확인할 수 있다. (GET 허용, 로그인 불필요)
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, service: 'travel-post-ai-proxy' });
    }

    if (request.method !== 'POST') {
      return json({ error: 'method-not-allowed' }, 405);
    }

    // 1) 로그인 확인
    const auth = await verifyFirebaseToken(request, env);
    if (!auth.ok) {
      return json({ error: 'unauthorized', reason: auth.reason }, 401);
    }

    // 2) 요청 바디를 그대로 Anthropic API로 전달
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid-json-body' }, 400);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'server-missing-api-key' }, 500);
    }

    // 기본값 보정 (앱에서 model을 안 보내는 경우 대비)
    const anthropicBody = {
      model: body.model || 'claude-sonnet-5', // 2026-08 기준 최신 Sonnet 모델 ID
      max_tokens: body.max_tokens || 1024,
      messages: body.messages,
      system: body.system,
    };

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicBody),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
};
