/* ═══════════════════════════════════════════════════════════
   functions/index.js — 찍고쓰다 서버 함수
   ----------------------------------------------------------------
   두 가지만 한다.
     ① cleanupSnsPosts   PC 링크(sns_posts)를 24시간 뒤 실제로 지운다.
                         만료 '검사'는 페이지가 하고, 실제 '삭제'는 여기가 한다.
     ② deleteUserData    계정 삭제 요청이 들어오면 그 사용자의 Storage 를 지운다.
                         ⚠️ Play 정책상 계정 삭제 경로가 실제로 동작해야 한다.
   ⚠️ 배포: firebase deploy --only functions
═══════════════════════════════════════════════════════════ */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

admin.initializeApp();
const db = admin.firestore();
const bucket = () => admin.storage().bucket();

/* ① 만료된 PC 링크 청소 — 1시간마다 */
exports.cleanupSnsPosts = onSchedule({ schedule: 'every 60 minutes', timeZone: 'Asia/Seoul' }, async () => {
  const now = admin.firestore.Timestamp.now();
  const snap = await db.collection('sns_posts').where('expiresAt', '<=', now).limit(300).get();
  if (snap.empty) { console.log('[cleanup] 만료 없음'); return; }

  let files = 0;
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    /* ☠️ paths 에 담긴 것만 지운다.
       재사용한(이미 서버에 있던) 사진은 paths 에 안 들어간다 — 지우면 원본이 사라진다. */
    for (const p of (d.paths || [])) {
      try { await bucket().file(p).delete(); files++; }
      catch (e) { if (e.code !== 404) console.warn('[cleanup] 삭제 실패', p, e.message); }
    }
    await doc.ref.delete();
  }
  console.log(`[cleanup] 링크 ${snap.size}건 · 사진 ${files}장 삭제`);
});

/* ② 계정 삭제 요청 처리 */
exports.deleteUserData = onDocumentCreated('deletion_requests/{uid}', async (event) => {
  const uid = event.params.uid;
  let n = 0;
  for (const prefix of [`userPhotos/${uid}/`, `snsPosts/${uid}/`]) {
    try {
      const [files] = await bucket().getFiles({ prefix });
      for (const f of files) { await f.delete().catch(() => {}); n++; }
    } catch (e) { console.warn('[delete] 목록 실패', prefix, e.message); }
  }
  /* 남아 있을 수 있는 PC 링크 문서도 정리 */
  const snap = await db.collection('sns_posts').where('uid', '==', uid).get();
  for (const d of snap.docs) await d.ref.delete().catch(() => {});

  await event.data.ref.delete().catch(() => {});
  console.log(`[delete] ${uid} — 파일 ${n}개, 링크 ${snap.size}건 삭제`);
});


/* ③ AI 글쓰기 프록시 (Cloudflare Workers 대신 여기로 이전 — Anthropic이 Cloudflare Workers 발 요청을
      지역차단(403 forbidden/Request not allowed)하는 문제 때문에, Google 인프라인 Cloud Functions로 옮김)
   역할: 로그인한 사용자(Firebase ID 토큰)만 통과시키고, Anthropic API로 그대로 전달한다.
   ANTHROPIC_API_KEY는 여기(서버, Secret Manager)에만 있고 앱에는 절대 노출되지 않는다. */
function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

exports.aiProxy = onRequest({ secrets: [ANTHROPIC_API_KEY], region: 'asia-northeast3' }, async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.path === '/health' && req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'travel-post-ai-proxy-firebase' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method-not-allowed' });
  }

  // 1) 로그인 확인 (Firebase Admin SDK로 검증 — Cloudflare Workers 버전보다 훨씬 단순해짐)
  const authHeader = req.headers.authorization || '';
  const m = authHeader.match(/^Bearer (.+)$/);
  if (!m) {
    return res.status(401).json({ error: 'unauthorized', reason: 'no-token' });
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(m[1]);
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized', reason: 'verify-failed', detail: String(err) });
  }
  if (!decoded || !decoded.uid) {
    return res.status(401).json({ error: 'unauthorized', reason: 'no-uid' });
  }

  // 2) 요청 바디 확인 (firebase-functions가 JSON 바디를 자동으로 파싱해줌)
  const body = req.body;
  if (!body || typeof body !== 'object' || !body.messages) {
    return res.status(400).json({ error: 'invalid-json-body' });
  }

  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) {
    return res.status(500).json({ error: 'server-missing-api-key' });
  }

  const anthropicBody = {
    model: body.model || 'claude-sonnet-5', // 2026-08 기준 최신 Sonnet 모델 ID
    max_tokens: body.max_tokens || 1024,
    messages: body.messages,
    system: body.system,
  };

  // 3) Anthropic API로 그대로 전달
  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicBody),
    });
  } catch (fetchErr) {
    console.error('[aiProxy] fetch() 자체가 실패:', fetchErr);
    return res.status(502).json({ error: 'upstream-fetch-threw', detail: String(fetchErr) });
  }

  const text = await upstream.text();

  if (upstream.status !== 200) {
    console.log('[aiProxy] upstream.status=' + upstream.status + ' body(first 1000)=' + text.slice(0, 1000));
  }

  return res.status(upstream.status).set('Content-Type', 'application/json').send(text);
});
