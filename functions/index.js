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
const admin = require('firebase-admin');

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
