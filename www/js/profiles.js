/* ═══════════════════════════════════════════════════════════
   profiles.js — 카테고리 프로필
   ----------------------------------------------------------------
   현장매니저 profiles.js 의 '업종 프로필'을 그대로 전용한다.
     업종 이름·아이콘        → 카테고리 이름·아이콘
     보고서 제목             → 글 제목 형식
     현장 단위 호칭(호수)    → 장소 호칭(가게/숙소/코스)
     작업 단계 호칭(전/후)   → ⭐ 사진 태그 세트
     채널별 글쓰기 지침      → 그대로
     견적 가격표·양식        → 해시태그 세트 · 고정 문구(협찬 고지 등)
     견적 교정 학습          → 글 교정 학습

   ⭐ 마이그레이션을 '하지 않는' 설계 (현장매니저의 함정 ① 회피)
      첫 프로필(pf_1)은 **접미사 없는 기존 키를 그대로 쓴다**(key() 참고).
      두 번째 프로필부터 '__pf_2' 꼬리표가 붙는다.
      지침을 새 키로 옮기는 과정이 없으므로 이동 중 유실 위험이 원천적으로 없다.

   ⚠️ 사업자(biz) 2계층은 가져오지 않는다 — 개인 블로거에겐 사업자 개념이 없다.
      대신 '고정 문구'(협찬 고지·필명·블로그 주소)를 프로필에 직접 둔다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.Profiles = window.Profiles || {};
  var P = window.Profiles;

  var PF_KEY  = CFG.k('profiles');
  var CUR_KEY = CFG.k('profile_current');
  var SEED_KEY = CFG.k('pf_seed_v1');   // ensure() 가 스스로 만든 빈 껍데기 표시
  var FIRST_PF = 'pf_1';

  function _read(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function _write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  P.list = function () {
    var a = _read(PF_KEY, []);
    return Array.isArray(a) ? a.filter(function (p) { return p && p.id && !p.hidden; }) : [];
  };
  P.get = function (id) {
    if (!id) return null;
    var l = _read(PF_KEY, []);
    for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === id) return l[i];
    return null;
  };
  P.currentId = function () { try { return localStorage.getItem(CUR_KEY) || ''; } catch (e) { return ''; } };
  P.current = function () { return P.get(P.currentId()) || P.list()[0] || null; };

  P.setCurrent = function (id) {
    try { localStorage.setItem(CUR_KEY, id || ''); localStorage.removeItem(SEED_KEY); } catch (e) {}
    try { if (window.UI && UI.onProfileChanged) UI.onProfileChanged(); } catch (e) {}
  };

  /* 저장 — 부분 갱신(넘긴 키만 덮어쓴다). 없으면 새로 만든다. */
  P.save = function (pf) {
    if (!pf) return null;
    var l = _read(PF_KEY, []);
    var idx = -1;
    for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === pf.id) { idx = i; break; }
    if (idx < 0) {
      pf.id = pf.id || P.nextId();
      l.push(pf);
    } else {
      var cur = l[idx];
      Object.keys(pf).forEach(function (k) { cur[k] = pf[k]; });
      l[idx] = cur;
    }
    _write(PF_KEY, l);
    try { localStorage.removeItem(SEED_KEY); } catch (e) {}
    return P.get(pf.id);
  };

  P.remove = function (id) {
    if (!id) return;
    var l = _read(PF_KEY, []).filter(function (p) { return p && p.id !== id; });
    _write(PF_KEY, l);
    if (P.currentId() === id) P.setCurrent((l[0] && l[0].id) || '');
  };

  P.nextId = function () {
    var l = _read(PF_KEY, []);
    if (!l.length) return FIRST_PF;
    var max = 1;
    l.forEach(function (p) {
      var m = String(p && p.id || '').match(/^pf_(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'pf_' + (max + 1);
  };

  /* ⭐ 키 접미사 — 첫 프로필은 접미사가 없다. 절대 바꾸지 말 것.
     (기존 값이 그대로 살아 있어야 마이그레이션이 필요 없다) */
  P.key = function (base, pfId) {
    var id = pfId || (P.current() && P.current().id) || FIRST_PF;
    return (id === FIRST_PF) ? base : (base + '__' + id);
  };

  /* 카탈로그 항목으로 프로필 만들기 */
  P.createFromCatalog = function (catId) {
    var c = window.Categories && Categories.get(catId);
    if (!c) return null;
    var pf = {
      id: P.nextId(),
      catId: c.id,
      name: c.name,
      icon: c.icon,
      placeLabel: c.placeLabel,
      tags: (c.tags || []).slice(),
      titleFmt: c.titleFmt,
      hashtags: (c.hashtags || []).slice(),
      fixedText: '',        // 협찬 고지·필명·블로그 주소 등 매 글에 들어갈 고정 문구
      createdAt: Date.now()
    };
    return P.save(pf);
  };

  /* 직접 입력 카테고리 (카탈로그에 없는 것) */
  P.createCustom = function (name, icon) {
    return P.save({
      id: P.nextId(), catId: '', name: name || '새 카테고리', icon: icon || '📍',
      placeLabel: '장소', tags: ['사진'], titleFmt: '{지역} {상호}',
      hashtags: ['{지역}', '{상호}'], fixedText: '', createdAt: Date.now()
    });
  };

  /* 첫 실행 보장 — MVP 카테고리 2종을 씨앗으로 깐다.
     ⚠️ 이 씨앗 표시(SEED_KEY)는 나중에 서버 복구(pull)가 "이건 사용자 데이터가 아니라
        내가 방금 만든 빈 껍데기" 임을 알아보기 위한 것이다. 지우지 말 것. */
  P.ensure = function () {
    if (P.list().length) return;
    var made = [];
    (window.Categories ? Categories.mvp() : []).forEach(function (c) {
      var pf = P.createFromCatalog(c.id);
      if (pf) made.push(pf);
    });
    if (made.length) {
      try { localStorage.setItem(SEED_KEY, '1'); } catch (e) {}
      if (!P.currentId()) { try { localStorage.setItem(CUR_KEY, made[0].id); } catch (e) {} }
    }
  };
  P.isSeed = function () { try { return localStorage.getItem(SEED_KEY) === '1'; } catch (e) { return false; } };

  /* ── 스냅샷 ──
     ⭐ 왜 두는가: 프로필을 나중에 고치거나 지워도 **그때 쓴 글의 맥락이 안 깨지게** 하기 위해서다
        (현장매니저 profileSnap 과 같은 이유). */
  P.snapOf = function (pfId) {
    var pf = pfId ? P.get(pfId) : P.current();
    if (!pf) return null;
    return {
      name: pf.name || '', icon: pf.icon || '📍',
      placeLabel: pf.placeLabel || '장소',
      tags: (pf.tags || []).slice(),
      titleFmt: pf.titleFmt || '',
      hashtags: (pf.hashtags || []).slice(),
      fixedText: pf.fixedText || ''
    };
  };

  /* 지금 열린 장소의 프로필 — 스냅샷이라도 있으면 그것을 쓴다.
     tokens.js / ai.js 가 '사용 시점 치환'에 부르는 지점이다. */
  P.forCurrentPlace = function () {
    var pl = (window.Place && Place.current && Place.current()) || null;
    if (pl) {
      var own = pl.profileId ? P.get(pl.profileId) : null;
      if (own) return own;
      if (pl.profileSnap) return pl.profileSnap;
    }
    return P.current();
  };

  /* 새 장소에 새겨 넣을 값 */
  P.stampForNewPlace = function (pfId) {
    var id = pfId || P.currentId() || (P.list()[0] && P.list()[0].id) || '';
    return { profileId: id, profileSnap: P.snapOf(id) };
  };

  P.ensure();
  console.log('[Profiles] 카테고리', P.list().length, '개, 현재:', (P.current() || {}).name || '(없음)');
})();
