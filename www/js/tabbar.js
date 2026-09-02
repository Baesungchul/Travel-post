/* ═══════════════════════════════════════════════════════════
   tabbar.js — 하단 탭 + UI 네임스페이스
   ----------------------------------------------------------------
   탭 4개: 지금 / 기록 / 글 / 설정  (설계안 4장)
   현장매니저의 달력·일정·팀·채팅·월매출은 전부 없다.

   ⚠️ 현장매니저는 탭이 '모달을 여는 버튼'이라 탭 상태와 모달 상태를 MutationObserver 로
      맞춰야 했다. 여기서는 처음부터 **패널 전환**이라 그 동기화가 필요 없다.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var UI = window.UI = window.UI || {};
  var _tab = 'records';   /* 2026-09-02: 기록 탭을 메인(기본) 탭으로 */
  var PANEL = { now: 'pnNow', records: 'pnRecords', posts: 'pnPosts', settings: 'pnSettings' };

  UI.tab = function () { return _tab; };

  UI.switchTab = function (name) {
    if (!PANEL[name]) name = 'now';
    /* 달력을 펼친 채로 탭을 옮기면 body 잠금이 남아 다음 화면이 안 움직인다.
       탭 전환은 모든 화면이 지나는 길목이라, 여기서 한 번 풀어 주는 게 가장 확실하다. */
    if (window.Cal && Cal.unlock) Cal.unlock();
    _tab = name;
    Object.keys(PANEL).forEach(function (k) {
      var el = document.getElementById(PANEL[k]);
      if (el) el.classList.toggle('active', k === name);
    });
    document.querySelectorAll('.tab-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    var fab = document.getElementById('fabNew');
    if (fab) fab.classList.toggle('visible', name === 'records' || name === 'now');
    UI.refresh();
    window.scrollTo(0, 0);
  };

  /* 현재 탭만 다시 그린다 */
  UI.refresh = function () {
    try {
      if (_tab === 'now' && UI.renderNow) UI.renderNow();
      else if (_tab === 'records' && UI.renderRecords) UI.renderRecords();
      else if (_tab === 'posts' && UI.renderPosts) UI.renderPosts();
      else if (_tab === 'settings' && UI.renderSettings) UI.renderSettings();
    } catch (e) { console.error('[UI]', e); }
    UI.syncCatChip();
  };

  UI.syncCatChip = function () {
    var el = document.getElementById('catChip');
    if (!el) return;
    var pf = Profiles.forCurrentPlace();
    el.innerHTML = (pf ? catIconHTML(pf, 15) + ' ' + esc(pf.name || '카테고리') : '📍 카테고리');
  };

  UI.onProfileChanged = function () { UI.refresh(); };

  function bind() {
    document.querySelectorAll('.tab-item').forEach(function (b) {
      b.addEventListener('click', function () { UI.switchTab(b.dataset.tab); });
    });
    var fab = document.getElementById('fabNew');
    if (fab) fab.addEventListener('click', function () {
      if (UI.startNewPlace) UI.startNewPlace();
    });
    var chip = document.getElementById('catChip');
    if (chip) chip.addEventListener('click', function () {
      if (UI.openCategoryPicker) UI.openCategoryPicker();
    });
    /* 뒤로가기 — 카메라가 열려 있으면 카메라만 닫는다 */
    window.addEventListener('popstate', function () {
      if (window.isInAppCameraOpen && isInAppCameraOpen()) { closeInAppCamera(); history.pushState(null, '', location.href); }
    });
    try { history.pushState(null, '', location.href); } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
