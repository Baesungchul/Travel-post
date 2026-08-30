/* ═══════════════════════════════════════════════════════════
   ai.js — AI 글 생성
   ----------------------------------------------------------------
   현장매니저 ai.js 의 CHANNELS 구조를 이식한다.
     채널별 라벨·색·sys·지침 placeholder + 토큰 치환 + 교정 학습.

   ☠️ 반드시 지킬 두 가지 (현장매니저에서 실제로 사고가 났던 지점)

   ① 채널 키는 **한 곳에서만** 정의한다.
      현장매니저는 sns_share.js 에 'fb' 로 적어 두고 ai.js 는 'facebook' 이었다.
      키가 안 맞으면 오류가 안 나고 **버튼만 조용히 사라진다.** 몇 달을 몰랐다.
      → 이 파일의 CHANNELS 가 유일한 원천이고, share.js 는 여기서 받아 쓴다.
        아래 assertChannelKeys() 가 로드 시 불일치를 콘솔에 크게 찍는다.

   ② 도메인 단어를 하드코딩하지 않는다.
      현장매니저의 sys 는 "당신은 **에어컨 전문가**의 카피라이터입니다" 였고,
      그래서 사용자가 조명 지침을 써도 글이 에어컨 쪽으로 끌렸다(v507).
      → 여기서는 {카테고리}·{장소호칭}·{사진태그} 토큰만 쓰고,
        **사용 시점**에 catFill() 로 치환한다 (tokens.js).

   ⚠️ 지침 키는 카테고리 프로필별로 갈린다(Profiles.key). 첫 프로필은 접미사 없음.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ClaudeAI = window.ClaudeAI || {};
  var AI = window.ClaudeAI;

  /* ═══ 채널 정의 — 유일한 원천 ═══════════════════════════ */
  var CHANNELS = {
    naver: {
      label: '네이버 블로그', icon: '📝', color: 'linear-gradient(135deg,#03c75a,#02a34a)',
      max: 30, ready: true,
      copyHint: '전체 복사 후 네이버 블로그에 붙여넣으세요. (#·** 같은 기호가 거슬리면 "서식 없이")',
      guidePh: '예) 친근한 존댓말, 1,200자 내외, 소제목 3개, 마지막에 해시태그 7개. 가격은 방문 시점 기준이라고 밝히기.',
      defGuide:
        '- 친근하고 솔직한 존댓말로 작성\n' +
        '- 전체 1,000~1,500자, 소제목 3~4개로 단락 구분\n' +
        '- 도입: 왜 이 {장소호칭}을 갔는지 한 문단\n' +
        '- 본문: {사진태그} 순서대로 보고 느낀 것을 구체적으로\n' +
        '- 검색 키워드(지역명+{카테고리태그})를 제목과 본문에 자연스럽게 2~3회\n' +
        '- 사진이 들어갈 자리를 (사진: 외관) 처럼 **태그 이름 그대로** 표시\n' +
        '- 좋았던 점과 아쉬웠던 점을 둘 다 쓰기 (광고처럼 보이지 않게)\n' +
        '- 가격·영업시간은 방문 시점 기준임을 한 줄로 밝히기\n' +
        '- 마지막 줄에 해시태그 5~7개\n' +
        '- 개인정보 보호: 같이 간 사람의 이름·얼굴 설명, 차량번호, 내 집 위치는 쓰지 않기',
      sys:
        '당신은 {카테고리} 방문 후기를 쓰는 한국어 블로거의 글쓰기 파트너입니다. ' +
        '제공된 {장소호칭} 정보와 사진을 바탕으로 네이버 블로그 글을 작성하세요. ' +
        '사진에 보이는 것을 근거로 구체적으로 쓰되, 보이지 않는 맛·가격·서비스를 지어내지 마세요 ' +
        '(모르면 쓰지 않거나 "메모 기준"이라고 밝힙니다). ' +
        '이 글은 {카테고리}에 대한 글입니다 — 다른 카테고리의 내용을 끌어오지 마세요. ' +
        '[중요] 사진 자리 표시는 (사진: 태그이름) 형식으로 넣으세요. 태그 이름은 제공된 목록({사진태그})에서만 고릅니다. ' +
        '[개인정보 보호] 동행자 이름, 차량번호, 작성자의 집·직장 위치는 절대 쓰지 마세요.'
    },
    insta: {
      label: '인스타그램', icon: '📸', color: 'linear-gradient(135deg,#f58529,#dd2a7b)',
      max: 20, ready: true,
      copyHint: '전체 복사 후 인스타그램 캡션에 붙여넣으세요.',
      guidePh: '예) 짧은 문장 + 줄바꿈 위주, 이모지 조금, 마지막에 해시태그 12개(#{카테고리태그} #지역{카테고리태그} 등).',
      defGuide:
        '- 첫 문장은 시선을 끄는 한 줄\n' +
        '- 짧은 문장 + 줄바꿈 위주, 문단 사이 빈 줄\n' +
        '- 이모지는 문장마다 1개 정도\n' +
        '- 본문 300자 내외로 간결하게\n' +
        '- 넘겨보기 유도 한 줄 (👉 옆으로 넘겨보세요)\n' +
        '- 마지막에 해시태그 10~15개 (#{카테고리태그} + 지역 태그 혼합)\n' +
        '- 사진 자리 표시는 넣지 않기 (캡션은 사진과 따로 붙습니다)\n' +
        '- 개인정보 보호: 동행자 이름, 차량번호, 내 집 위치는 쓰지 않기',
      sys:
        '당신은 인스타그램 캡션을 쓰는 한국어 카피라이터입니다. {카테고리} 방문 정보와 사진을 바탕으로 ' +
        '짧은 문장과 줄바꿈 위주의 캡션을 쓰세요. 이모지를 적절히 쓰고 마지막에 해시태그를 넣습니다. ' +
        '마크다운 기호(#제목, ** 등)는 쓰지 마세요(해시태그 제외). 사진 자리 표시 (사진: …) 는 넣지 마세요. ' +
        '이 글은 {카테고리}에 대한 글입니다 — 다른 카테고리의 내용을 끌어오지 마세요. ' +
        '[개인정보 보호] 동행자 이름, 차량번호, 작성자의 집·직장 위치는 절대 쓰지 마세요.'
    },

    /* ⬜ 미확인 — 실측 전까지 ready:false. 키는 지금 정해 둔다(나중에 이름이 갈리지 않게).
         · 티스토리/브런치: 웹 에디터가 붙여넣은 외부 이미지를 재업로드하는지 미확인
         · 스레드/X: 안드로이드 공유시트 다중 이미지 지원 여부 미확인 */
    tistory: {
      label: '티스토리 · 브런치', icon: '✍️', color: 'linear-gradient(135deg,#ff5544,#e0402f)',
      max: 30, ready: false, pendingWhy: '웹 에디터가 붙여넣은 외부 이미지를 자기 서버로 재업로드하는지 아직 실측하지 않았습니다.',
      copyHint: '전체 복사 후 에디터에 붙여넣으세요.',
      guidePh: '예) 담담한 문어체, 1,500자, 소제목 3개.',
      defGuide: '- 담담한 문어체, 1,200~2,000자\n- 소제목 3~4개\n- 사진 자리 표시는 (사진: 태그이름)\n- 마지막에 해시태그 5개',
      sys: '당신은 {카테고리} 방문기를 쓰는 한국어 에세이 작가입니다. 담담하고 담백한 문어체로 쓰세요. ' +
           '이 글은 {카테고리}에 대한 글입니다 — 다른 카테고리의 내용을 끌어오지 마세요.'
    },
    threads: {
      label: '스레드 · X', icon: '🧵', color: 'linear-gradient(135deg,#333,#000)',
      max: 4, ready: false, pendingWhy: '안드로이드 공유시트가 사진 여러 장을 넘기는지 아직 확인하지 않았습니다.',
      copyHint: '전체 복사 후 붙여넣으세요.',
      guidePh: '예) 3~4문장, 해시태그 2개.',
      defGuide: '- 3~4문장으로 아주 짧게\n- 해시태그 2개\n- 사진 자리 표시는 넣지 않기',
      sys: '당신은 짧은 소셜 게시글을 쓰는 한국어 카피라이터입니다. {카테고리} 방문을 3~4문장으로 압축하세요. ' +
           '이 글은 {카테고리}에 대한 글입니다 — 다른 카테고리의 내용을 끌어오지 마세요.'
    }
  };

  var CH_KEYS = Object.keys(CHANNELS);
  var READY_KEYS = CH_KEYS.filter(function (k) { return CHANNELS[k].ready; });

  AI.CHANNELS = CHANNELS;
  AI.CH_KEYS = CH_KEYS;
  AI.readyChannels = function () { return READY_KEYS.slice(); };
  AI.channel = function (id) { return CHANNELS[id] || CHANNELS.naver; };

  /* ☠️ 키 일치 자가검사 — 현장매니저의 'fb' vs 'facebook' 사고 재발 방지.
     다른 모듈이 자기 채널 표를 들고 있으면 여기에 등록해서 검사받게 한다. */
  var _registered = [];
  AI.registerChannelConsumer = function (name, keys) {
    _registered.push({ name: name, keys: keys });
    assertChannelKeys();
  };
  function assertChannelKeys() {
    _registered.forEach(function (c) {
      var extra = c.keys.filter(function (k) { return CH_KEYS.indexOf(k) < 0; });
      var missing = READY_KEYS.filter(function (k) { return c.keys.indexOf(k) < 0; });
      if (extra.length || missing.length) {
        console.error('%c[채널 키 불일치] ' + c.name,
          'background:#c00;color:#fff;padding:2px 6px;',
          extra.length ? ('ai.js 에 없는 키: ' + extra.join(', ')) : '',
          missing.length ? ('빠진 키: ' + missing.join(', ')) : '');
        try { showToast('개발 경고: 채널 키가 안 맞습니다 (' + c.name + ')', 'err'); } catch (e) {}
      }
    });
  }
  AI.assertChannelKeys = assertChannelKeys;

  /* ═══ 채널별 지침 (카테고리 프로필별로 갈린다) ═══════════ */
  function guideBase(id) { return CFG.k('guide_' + id); }
  function guideKey(id, pfId) { return Profiles.key(guideBase(id), pfId); }

  function hasGuide(id, pfId) {
    try { return localStorage.getItem(guideKey(id, pfId)) !== null; } catch (e) { return false; }
  }
  function getGuide(id, pfId) {
    try {
      var v = localStorage.getItem(guideKey(id, pfId));
      if (v === null) {
        /* 한 번도 저장 안 한 카테고리면 기본 지침 — **그 카테고리로 치환해서** 준다 */
        var pf = pfId ? Profiles.get(pfId) : null;
        return catFill((CHANNELS[id] && CHANNELS[id].defGuide) || '', pf);
      }
      return v || '';
    } catch (e) { return ''; }
  }
  function setGuide(id, v, pfId) { try { localStorage.setItem(guideKey(id, pfId), v || ''); } catch (e) {} }
  function resetGuide(id, pfId) { try { localStorage.removeItem(guideKey(id, pfId)); } catch (e) {} }

  AI.hasGuide = hasGuide; AI.getGuide = getGuide; AI.setGuide = setGuide; AI.resetGuide = resetGuide;

  /* ═══ 글 교정 학습 (현장매니저 견적 교정 학습과 같은 구조) ═══
     사용자가 생성된 글을 고쳐서 저장하면, 그 최종본을 few-shot 예시로 쌓는다.
     ⚠️ 카테고리별로 갈린다 — 맛집 교정이 관광지 글에 끼어들면 안 된다. */
  var CORR_MAX = 8, CORR_SHOTS = 2;
  function corrKey(chId, pfId) { return Profiles.key(CFG.k('corr_' + chId), pfId); }
  function learnOff() { try { return localStorage.getItem(CFG.k('learn_off')) === '1'; } catch (e) { return false; } }
  AI.learnOff = learnOff;
  AI.setLearnOff = function (off) {
    try { off ? localStorage.setItem(CFG.k('learn_off'), '1') : localStorage.removeItem(CFG.k('learn_off')); } catch (e) {}
  };
  function getCorrections(chId, pfId) {
    try { var a = JSON.parse(localStorage.getItem(corrKey(chId, pfId)) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function setCorrections(chId, a, pfId) {
    try { localStorage.setItem(corrKey(chId, pfId), JSON.stringify(a || [])); } catch (e) {}
  }
  AI.saveCorrection = function (chId, before, after) {
    if (learnOff()) return;
    before = String(before || '').trim(); after = String(after || '').trim();
    if (!before || !after || before === after) return;   // 고친 게 없으면 저장 안 함
    var list = getCorrections(chId).filter(function (c) { return c.in !== before; });
    list.push({ in: before.slice(0, 3000), out: after.slice(0, 3000), at: Date.now() });
    if (list.length > CORR_MAX) list = list.slice(list.length - CORR_MAX);
    setCorrections(chId, list);
  };
  AI.clearCorrections = function (chId) { setCorrections(chId, []); };
  AI.correctionCount = function (chId) { return getCorrections(chId).length; };

  function buildFewShot(chId) {
    if (learnOff()) return '';
    var list = getCorrections(chId);
    if (!list.length) return '';
    var recent = list.slice(-CORR_SHOTS);
    var lines = ['', '[과거 교정 예시 — 아래는 사용자가 최종 확정한 글이다. 말투·길이·문단 구성을 이 패턴에 맞춰라]'];
    recent.forEach(function (c) {
      lines.push('--- AI 초안 ---'); lines.push(c.in.slice(0, 1200));
      lines.push('--- 사용자 확정본 ---'); lines.push(c.out.slice(0, 1200));
    });
    return lines.join('\n');
  }

  /* ═══ 프록시 호출 ═══════════════════════════════════════
     ⚠️ 인증을 처음부터 붙인다(설계안 7장). 로그인 사용자의 ID 토큰을 같이 보낸다.
        서버가 이 헤더를 검사하지 않으면 프록시는 열려 있는 것이다. */
  async function authHeader() {
    if (!CFG.PROXY_AUTH) return {};
    try {
      if (window.firebase && firebase.auth && firebase.auth().currentUser) {
        var t = await firebase.auth().currentUser.getIdToken();
        return { Authorization: 'Bearer ' + t };
      }
    } catch (e) {}
    return {};
  }

  async function callClaude(opts) {
    if (!CFG.hasProxy()) {
      var err = new Error('AI 프록시가 아직 설정되지 않았습니다 (js/config.js 의 PROXY_URL)');
      err.code = 'NO_PROXY';
      throw err;
    }
    var body = {
      model: opts.model || CFG.MODEL,
      max_tokens: opts.max_tokens || 2000,
      messages: opts.messages
    };
    if (opts.system) body.system = opts.system;

    var headers = Object.assign({ 'content-type': 'application/json' }, await authHeader());
    if (CFG.PROXY_AUTH && !headers.Authorization) {
      var e2 = new Error('AI 글 생성은 로그인 후에 쓸 수 있어요');
      e2.code = 'NO_AUTH';
      throw e2;
    }
    var res;
    try {
      res = await fetch(CFG.PROXY_URL, { method: 'POST', headers: headers, body: JSON.stringify(body) });
    } catch (e) { throw new Error('네트워크 오류: ' + (e && e.message)); }

    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var msg = (data && data.error && (data.error.message || data.error)) || ('HTTP ' + res.status);
      throw new Error('AI 서버 오류: ' + String(msg).slice(0, 180));
    }
    return ((data && data.content) || []).filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; }).join('\n');
  }
  AI.callClaude = callClaude;

  /* ═══ 장소 → 글 재료 ═══════════════════════════════════ */
  function placeMeta(place) {
    var p = place || Place.current();
    if (!p) return { text: '', title: '' };
    var pf = Profiles.forCurrentPlace();
    var tags = Place.tags(p);
    var cnt = Photos.countByTag(p);
    var L = [];
    L.push('카테고리: ' + ((pf && pf.name) || '장소'));
    if (p.name) L.push(((pf && pf.placeLabel) || '장소') + ' 이름: ' + p.name);
    if (p.address) L.push('주소: ' + p.address);
    if (p.area) L.push('지역: ' + p.area);
    if (p.visitedAt) L.push('방문: ' + String(p.visitedAt).replace('T', ' '));
    if (p.rating) L.push('내 별점: ' + p.rating + '/5');
    L.push('사진 태그와 장수: ' + tags.map(function (t) { return t + ' ' + (cnt[t] || 0) + '장'; }).join(', '));
    if (p.memo) L.push('내 메모: ' + p.memo);
    var pm = (p.photos || []).filter(function (x) { return x.memo; });
    if (pm.length) {
      L.push('사진별 메모:');
      pm.forEach(function (x) { L.push('  - (' + x.tag + ') ' + x.memo); });
    }
    var title = Categories.fillPlace((pf && pf.titleFmt) || '', p);
    if (title) L.push('제목 형식 참고: ' + title);
    var tagsFmt = ((pf && pf.hashtags) || []).map(function (h) { return '#' + Categories.fillPlace(h, p); })
      .filter(function (h) { return h.length > 1; });
    if (tagsFmt.length) L.push('해시태그 후보: ' + tagsFmt.join(' '));
    if (pf && pf.fixedText) L.push('반드시 넣을 고정 문구: ' + pf.fixedText);
    return { text: L.join('\n'), title: title, tags: tagsFmt };
  }
  AI.placeMeta = placeMeta;

  /* 사진 몇 장을 AI 에게 보여준다 — 태그 순서대로 골고루 */
  async function collectImages(place, maxN) {
    maxN = maxN || 6;
    var list = Photos.ordered(place);
    var pick = [];
    var byTag = {};
    list.forEach(function (x) { (byTag[x.tag] = byTag[x.tag] || []).push(x); });
    var tags = Object.keys(byTag);
    var round = 0;
    while (pick.length < maxN && round < 10) {
      var added = false;
      for (var i = 0; i < tags.length && pick.length < maxN; i++) {
        var arr = byTag[tags[i]];
        if (arr[round]) { pick.push(arr[round]); added = true; }
      }
      if (!added) break;
      round++;
    }
    var out = [];
    for (var k = 0; k < pick.length; k++) {
      var r = await Photos.resolvePhoto(pick[k].id);
      if (!r) continue;
      var small = await Img.shrink(r.blob, 1024, 0.8);
      var b64 = await NativeFS.blobToBase64(small);
      out.push({ media_type: 'image/jpeg', data: b64, tag: pick[k].tag });
    }
    return out;
  }

  /* ═══ 글 생성 ═══════════════════════════════════════════ */
  async function generatePost(chId, extraMemo, place) {
    var ch = CHANNELS[chId] || CHANNELS.naver;
    var p = place || Place.current();
    if (!p) throw new Error('먼저 장소를 만들어 주세요');

    var pf = Profiles.forCurrentPlace();
    var meta = placeMeta(p);
    var images = await collectImages(p, 6);
    var guide = getGuide(chId);

    /* ★ 역할 문구도 지금 카테고리로 치환한다.
       (안 하면 관광지 글이 맛집 쪽으로 끌려간다 — 현장매니저 v507 과 같은 사고) */
    var sys = catFill(ch.sys, pf);
    Tokens.assertNoToken(sys, 'CHANNELS.' + chId + '.sys');
    if (guide) sys += '\n\n[반드시 반영할 지침]\n' + catFill(guide, pf);
    sys += buildFewShot(chId);

    var content = [];
    images.forEach(function (im) {
      content.push({ type: 'text', text: '[다음 사진의 태그: ' + im.tag + ']' });
      content.push({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } });
    });
    var ask = '아래 정보' + (images.length ? '와 사진' : '') + (extraMemo ? '와 추가 메모' : '') +
              '를 바탕으로 ' + ch.label + ' 글을 작성해줘.\n\n[방문 정보]\n' + meta.text;
    if (extraMemo) ask += '\n\n[추가 메모/강조점]\n' + extraMemo;
    content.push({ type: 'text', text: ask });

    return await callClaude({ max_tokens: 2400, system: sys, messages: [{ role: 'user', content: content }] });
  }
  AI.generatePost = generatePost;

  /* ═══ 여행 글 — 여러 장소를 한 편으로 ═══════════════════
     ☠️ 카테고리 함정이 새 얼굴로 나오는 지점이다(trips.js 주석 참고).
        여행은 맛집 + 관광지 + 카페가 섞인다. 프로필 하나로 토큰을 치환하면
        관광지 이야기가 맛집 글처럼 나온다 — 현장매니저 v507 과 같은 병이다.
        → 토큰은 **중립 프로필**('여행')로 치환하고,
          각 장소의 실제 카테고리는 프롬프트에 **데이터로** 넘긴다.
     ⚠️ 사진 마커는 '상호 - 태그' 다. 태그 이름만 쓰면 어느 가게 외관인지 알 수 없다. */
  function tripMeta(trip, places) {
    var L = [];
    L.push('여행 이름: ' + (trip.name || ''));
    if (trip.startAt) L.push('기간: ' + trip.startAt + (trip.endAt && trip.endAt !== trip.startAt ? ' ~ ' + trip.endAt : ''));
    L.push('장소 ' + places.length + '곳 — 아래 순서가 곧 글의 순서다');
    L.push('');
    places.forEach(function (p, i) {
      var snap = p.profileSnap || {};
      var cnt = Photos.countByTag(p);
      L.push((i + 1) + ') ' + (p.name || '(이름 없음)'));
      L.push('   카테고리: ' + (snap.name || '장소'));
      if (p.area) L.push('   지역: ' + p.area);
      if (p.visitedAt) L.push('   방문: ' + String(p.visitedAt).replace('T', ' '));
      if (p.rating) L.push('   내 별점: ' + p.rating + '/5');
      if (p.memo) L.push('   메모: ' + p.memo);
      var tags = Place.tags(p);
      L.push('   사진: ' + tags.map(function (t) { return t + ' ' + (cnt[t] || 0) + '장'; }).join(', '));
      (p.photos || []).filter(function (x) { return x.memo; }).forEach(function (x) {
        L.push('   - (' + x.tag + ') ' + x.memo);
      });
      L.push('   사진 자리 표시에 쓸 이름: ' + tags.map(function (t) {
        return '(사진: ' + (p.name || '장소') + ' - ' + t + ')';
      }).join(' '));
      L.push('');
    });
    return L.join('\n');
  }

  var TRIP_RULE =
    '\n\n[여행기 규칙 — 반드시 지킬 것]\n' +
    '- 이 글은 여러 장소를 한 편으로 묶은 **여행기**다. 장소를 준 순서대로 쓴다.\n' +
    '- 각 장소의 카테고리는 정보에 적혀 있다. 맛집은 맛집답게, 관광지는 관광지답게 쓴다 — 한 쪽으로 몰지 마라.\n' +
    '- 장소 사이를 이동·시간 흐름으로 자연스럽게 잇는다.\n' +
    '- 사진 자리 표시는 정보에 적힌 **(사진: 상호 - 태그)** 형식을 글자 그대로 쓴다. 태그만 쓰지 마라.\n' +
    '- 전체 길이는 장소 하나짜리 글의 1.5~2배를 넘기지 않는다. 장소마다 짧게 끊는 편이 읽기 좋다.';

  async function generateTripPost(chId, trip, places, extraMemo) {
    var ch = CHANNELS[chId] || CHANNELS.naver;
    if (!places || !places.length) throw new Error('여행에 담긴 장소가 없어요');

    var pf = Trips.tripProfile(places);          // ★ 중립 프로필로 치환한다
    var syn = Trips.asPlace(trip, places);
    var images = await collectImages(syn, 8);
    var guide = getGuide(chId);

    var sys = catFill(ch.sys, pf);
    Tokens.assertNoToken(sys, 'TRIP CHANNELS.' + chId + '.sys');
    if (guide) sys += '\n\n[반드시 반영할 지침]\n' + catFill(guide, pf);
    sys += TRIP_RULE;
    sys += buildFewShot(chId);

    var content = [];
    images.forEach(function (im) {
      content.push({ type: 'text', text: '[다음 사진의 태그: ' + im.tag + ']' });
      content.push({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } });
    });
    var ask = '아래 여행 정보' + (images.length ? '와 사진' : '') + (extraMemo ? '와 추가 메모' : '') +
              '를 바탕으로 ' + ch.label + ' 여행기를 한 편으로 써줘.\n\n[여행 정보]\n' + tripMeta(trip, places);
    if (extraMemo) ask += '\n\n[추가 메모/강조점]\n' + extraMemo;
    content.push({ type: 'text', text: ask });

    return await callClaude({ max_tokens: 3200, system: sys, messages: [{ role: 'user', content: content }] });
  }
  AI.generateTripPost = generateTripPost;
  AI.tripMeta = tripMeta;

  function localTripDraft(trip, places) {
    var L = [];
    L.push(trip.name || '여행 기록');
    if (trip.startAt) L.push(trip.startAt + (trip.endAt && trip.endAt !== trip.startAt ? ' ~ ' + trip.endAt : ''));
    L.push('');
    places.forEach(function (p, i) {
      var snap = p.profileSnap || {};
      L.push('■ ' + (i + 1) + '. ' + (p.name || '(이름 없음)') + ' (' + (snap.name || '장소') + ')');
      if (p.memo) L.push(p.memo);
      Place.tags(p).forEach(function (t) {
        var has = (p.photos || []).some(function (x) { return x.tag === t; });
        if (!has) return;
        var m = (p.photos || []).filter(function (x) { return x.tag === t && x.memo; })
          .map(function (x) { return x.memo; });
        if (m.length) L.push(m.join(' / '));
        L.push('(사진: ' + (p.name || '장소') + ' - ' + t + ')');
      });
      L.push('');
    });
    L.push('#여행기록');
    return L.join('\n');
  }
  AI.localTripDraft = localTripDraft;

  /* ═══ 프록시가 없을 때 — 로컬 초안 ═══════════════════════
     ⚠️ 이건 AI 가 아니다. 화면에 반드시 그렇게 적어야 한다.
        전체 흐름(촬영 → 태그 → 글 → 공유)을 프록시 없이도 끝까지 시험해 보기 위한 뼈대다. */
  function localDraft(chId, place) {
    var p = place || Place.current();
    var pf = Profiles.forCurrentPlace();
    var meta = placeMeta(p);
    var tags = Place.tags(p);
    var cnt = Photos.countByTag(p);
    var L = [];
    L.push(meta.title || ((p && p.name) || '방문 기록'));
    L.push('');
    if (p && p.memo) { L.push(p.memo); L.push(''); }
    tags.forEach(function (t) {
      if (!cnt[t]) return;
      L.push('■ ' + t);
      var m = (p.photos || []).filter(function (x) { return x.tag === t && x.memo; })
        .map(function (x) { return x.memo; });
      L.push(m.length ? m.join(' / ') : '(여기에 ' + t + ' 이야기를 적어주세요)');
      L.push('(사진: ' + t + ')');
      L.push('');
    });
    if (p && p.address) L.push('📍 ' + p.address);
    if (p && p.visitedAt) L.push('🗓 ' + String(p.visitedAt).replace('T', ' ') + ' 방문 기준');
    if (pf && pf.fixedText) { L.push(''); L.push(pf.fixedText); }
    if (meta.tags && meta.tags.length) { L.push(''); L.push(meta.tags.join(' ')); }
    return L.join('\n');
  }
  AI.localDraft = localDraft;

  /* ═══ 저장된 글 ═══════════════════════════════════════ */
  AI.savePost = function (placeId, chId, text, aiRaw) {
    var rec = {
      id: Store.newId('po_'),
      placeId: placeId, ch: chId,
      text: String(text || ''),
      aiRaw: String(aiRaw || ''),
      published: false,
      createdAt: Date.now(), updatedAt: Date.now()
    };
    return Store.postPut(rec).then(function () { return rec; });
  };

  console.log('[AI] 채널:', READY_KEYS.join(', '), '| 프록시:', CFG.hasProxy() ? '설정됨' : '미설정');
})();
