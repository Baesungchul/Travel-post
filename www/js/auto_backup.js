/* ═══════════════════════════════════════════════════════════
   auto_backup.js — 자동 클라우드 백업 + 저장공간 경고 (사용자 요청 2026-09-05)
   ----------------------------------------------------------------
   왜 필요한가:
     ☠️ 현장매니저에서 사진 1,059장을 잃은 적이 있다. 이 앱은 그때보다 더 위험했다 —
        ZIP 백업도 클라우드 백업도 **전부 손으로 눌러야** 했고, 안 누르면 아무 일도 안 일어났다.
        기기가 고장 나거나 앱을 지우면 그걸로 끝이다.
     → 로그인해 있으면 하루 한 번, 앱을 켠 뒤 조용히 올린다. 끄고 싶으면 설정에서 끈다.

   ⚠️ 데이터 요금: 이건 사진을 인터넷으로 올린다. 와이파이인지 아닌지는 안드로이드 WebView 에서
      확실히 알 수 없다(navigator.connection 이 기기마다 다르다). 그래서
        · '데이터 절약 모드'(saveData)면 건너뛴다
        · 화면에 "자동 백업 중" 을 띄워 지금 올라가는 중임을 알린다
        · 설정에서 한 번에 끌 수 있다
      로 타협했다. 요금이 걱정되면 끄면 된다.

   ⚠️ 실패는 조용히 넘긴다 — 자동 백업이 안 됐다고 앱을 못 쓰게 만들 이유가 없다.
      대신 마지막 백업이 오래되면 기록 탭 위에 그 사실을 적는다(모르는 채로 두지 않는다).
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var A = window.AutoBackup = {};

  var DAY = 24 * 60 * 60 * 1000;
  var STALE_MS = 7 * DAY;      /* 이만큼 지나면 "백업한 지 오래됐다" 고 알린다 */
  var DELAY_MS = 20 * 1000;    /* 앱을 켜자마자 올리면 첫 화면이 버벅인다 — 조금 뒤에 */

  function key() { return CFG.k('auto_backup_off'); }

  A.enabled = function () {
    try { return localStorage.getItem(key()) !== '1'; } catch (e) { return true; }   /* 기본 켬 */
  };
  A.setEnabled = function (on) {
    try { on ? localStorage.removeItem(key()) : localStorage.setItem(key(), '1'); } catch (e) {}
  };

  /* 마지막 백업이 얼마나 됐나 — 화면에서 그대로 쓴다 */
  A.staleInfo = function () {
    var last = (window.CloudBackup && CloudBackup.lastAt && CloudBackup.lastAt()) || 0;
    if (!last) return { never: true, stale: true, days: 0 };
    var days = Math.floor((Date.now() - last) / DAY);
    return { never: false, stale: (Date.now() - last) > STALE_MS, days: days, at: last };
  };

  function canRun() {
    if (!A.enabled()) return false;
    if (!window.CloudBackup || !window.Cloud || !Cloud.loggedIn()) return false;
    if (navigator && navigator.onLine === false) return false;
    try { if (navigator.connection && navigator.connection.saveData) return false; } catch (e) {}
    var last = (CloudBackup.lastAt && CloudBackup.lastAt()) || 0;
    return (Date.now() - last) > DAY;
  }

  var _ran = false;
  A.runIfDue = function () {
    if (_ran || !canRun()) return Promise.resolve(null);
    _ran = true;
    if (window.showToast) showToast('자동 백업 중이에요…');
    return CloudBackup.push().then(function (r) {
      if (window.showToast) {
        showToast('자동 백업 완료 — 장소 ' + r.places + ' · 사진 ' + r.photos, 'ok');
      }
      try { if (window.UI && UI.refresh) UI.refresh(); } catch (e) {}
      return r;
    }).catch(function (e) {
      /* 조용히 넘긴다. 오래되면 기록 탭 위에 어차피 표시된다. */
      console.warn('[자동백업] 실패', e && e.message);
      return null;
    });
  };

  /* ═══ 저장공간 ═══════════════════════════════════════════
     ☠️ 기기가 꽉 차면 사진 저장이 실패하는데, 그걸 아는 시점은 이미 식당에 앉아 있을 때다.
        미리 알려 줘야 백업하고 정리할 시간이 있다. */
  var LOW_FREE_MB = 300;
  var _space = null;

  A.checkSpace = function () {
    if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
    return navigator.storage.estimate().then(function (e) {
      if (!e || !e.quota) return null;
      var freeMB = Math.max(0, (e.quota - (e.usage || 0)) / 1048576);
      _space = {
        freeMB: freeMB,
        pct: Math.round(((e.usage || 0) / e.quota) * 100),
        low: freeMB < LOW_FREE_MB
      };
      return _space;
    }).catch(function () { return null; });
  };
  A.space = function () { return _space; };

  /* 기록 탭 위에 붙일 알림 한 줄 — 없으면 빈 문자열 */
  A.noticeHTML = function () {
    var out = '';
    var sp = _space;
    if (sp && sp.low) {
      out += '<div class="todo" style="margin-bottom:10px;"><b>저장공간이 얼마 안 남았어요 (' +
        Math.round(sp.freeMB) + 'MB)</b><div class="mini">사진이 저장되지 않을 수 있습니다. ' +
        '설정 → 백업에서 백업한 뒤, 오래된 기록을 정리해 주세요.</div></div>';
    }
    if (window.Cloud && Cloud.loggedIn && Cloud.loggedIn()) {
      var s = A.staleInfo();
      if (s.stale) {
        out += '<div class="todo" style="margin-bottom:10px;"><b>' +
          (s.never ? '아직 클라우드에 백업한 적이 없어요' : '백업한 지 ' + s.days + '일 됐어요') +
          '</b><div class="mini">기기가 고장 나면 사진·기록이 함께 사라집니다. ' +
          '설정 → 백업 → 「올리기」로 올려두세요.</div></div>';
      }
    }
    return out;
  };

  /* 앱이 뜨고 조금 지난 뒤에 한 번 — 첫 화면이 버벅이지 않게 */
  function start() {
    A.checkSpace();
    setTimeout(function () { A.runIfDue(); }, DELAY_MS);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  console.log('[AutoBackup] 로드됨 (자동 백업 ' + (A.enabled() ? '켬' : '끔') + ')');
})();
