/* tools/make-icons.js — 앱 아이콘·시작 화면 한 번에 뽑기
   실행: npm run icons   (playwright 필요 — npm run smoke 와 같은 것)
   ----------------------------------------------------------------
   찍고쓰다 아이콘 — 뷰파인더(초점 프레임) 안의 반짝임. 사장님 확정 2026-09-06.
     · 프레임 네 갈고리 = 카메라. 몸체를 그리는 것보다 "지금 찍는 중"이 읽히고,
       사진첩·카메라 앱과 덜 섞인다.
     · 가운데 반짝임 = AI 가 글을 쓴다.

   ☠️ 도형을 바꿀 거면 아래 art() 한 곳만 고치고 다시 돌린다.
      런처 아이콘 20장 + 시작 화면 11장 + www 아이콘 2개가 여기서 한 번에 나온다.
      손으로 한 장씩 고치면 반드시 어딘가 어긋난다(tools/check.js 가 잡아 주긴 한다).

   ⚠️ 적응형 아이콘 전경은 108dp 판에 그리지만 런처 모양(원·둥근네모·물방울)대로 잘린다.
      네모난 프레임은 **모서리부터 잘린다** — 대각선이 66dp 를 넘으면 안 된다.
      프레임 원본이 한 변 62 라 0.76 으로 줄여야 대각선이 66.6 이 된다(아래 FG).
      가로로 납작한 카메라 몸체일 때보다 더 줄여야 하는 이유가 이것이다. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const WWW = path.join(ROOT, 'www');

const SPK = 'M0 -22 C1.5 -6 6 -1.5 22 0 C6 1.5 1.5 6 0 22 C-1.5 6 -6 1.5 -22 0 C-6 -1.5 -1.5 -6 0 -22 Z';

/* 배경 그라데이션. 이 두 색이 곧 android 의 drawable/ic_launcher_background.xml 과
   www/styles.css 브랜드 상자 색이다 — 세 곳을 같이 맞출 것. */
const C0 = '#3F8560', C1 = '#1C4D35';
const GRAD = '<linearGradient id="g" x1="0" y1="0" x2=".6" y2="1">' +
             '<stop offset="0" stop-color="' + C0 + '"/><stop offset="1" stop-color="' + C1 + '"/></linearGradient>';

/* 그림. 프레임도 반짝임도 (54,54) 가 중심이라 가운데 기준으로 그냥 줄이면 된다 */
function art(s) {
  var t = (s && s !== 1) ? ' transform="translate(54,54) scale(' + s + ') translate(-54,-54)"' : '';
  return '<g' + t + '>' +
    '<g fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M26 41 V26 H41"/><path d="M67 26 H82 V41"/>' +
      '<path d="M26 67 V82 H41"/><path d="M67 82 H82 V67"/>' +
    '</g>' +
    '<path d="' + SPK + '" transform="translate(54,54) scale(.84)" fill="#fff"/>' +
  '</g>';
}

const FG = 0.76;    /* 적응형 전경 — 위 주석의 대각선 계산 */
const MSK = 0.82;   /* PWA maskable — 안전 영역이 아이콘 지름의 80% 원 */

const SVG = {
  full:     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><defs>' + GRAD + '</defs><rect width="108" height="108" rx="24" fill="url(#g)"/>' + art(1) + '</svg>',
  round:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><defs>' + GRAD + '</defs><circle cx="54" cy="54" r="54" fill="url(#g)"/>' + art(0.92) + '</svg>',
  fg:       '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">' + art(FG) + '</svg>',
  /* 안드로이드 13+ 테마 아이콘. 색은 안 쓰이고 모양(알파)만 쓰인다 —
     이 그림은 원래 흰 선과 흰 반짝임뿐이라 그대로 실루엣이 된다. */
  mono:     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">' + art(FG) + '</svg>',
  maskable: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><defs>' + GRAD + '</defs><rect width="108" height="108" fill="url(#g)"/>' + art(MSK) + '</svg>',
  mark:     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">' + art(1) + '</svg>'
};

const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const SPLASH = {
  'drawable': [480, 320],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280], 'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
  'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720], 'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280]
};
const SPLASH_BG = '#255C42';   /* 두 색의 가운데 — 시작 화면은 단색이 깔끔하다 */

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
  let n = 0;

  async function shot(svg, w, h, out) {
    const html = '<style>html,body{margin:0;padding:0;background:transparent;}#x{display:block;}</style>' +
      svg.replace('<svg ', '<svg id="x" width="' + w + '" height="' + h + '" ');
    await page.setContent(html);
    await page.waitForTimeout(60);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.locator('#x').screenshot({ path: out, omitBackground: true });
    n++;
  }

  for (const [d, px] of Object.entries(LAUNCHER)) {
    await shot(SVG.full,  px, px, RES + '/mipmap-' + d + '/ic_launcher.png');
    await shot(SVG.round, px, px, RES + '/mipmap-' + d + '/ic_launcher_round.png');
  }
  for (const [d, px] of Object.entries(FOREGROUND)) {
    await shot(SVG.fg,   px, px, RES + '/mipmap-' + d + '/ic_launcher_foreground.png');
    await shot(SVG.mono, px, px, RES + '/mipmap-' + d + '/ic_launcher_monochrome.png');
  }

  /* 시작 화면 — 단색 바탕에 그림. 그림은 짧은 변의 26% */
  for (const [d, wh] of Object.entries(SPLASH)) {
    const w = wh[0], h = wh[1];
    const m = Math.round(Math.min(w, h) * 0.26);
    await page.setContent('<style>html,body{margin:0;padding:0;}' +
      '#s{width:' + w + 'px;height:' + h + 'px;background:' + SPLASH_BG + ';' +
      'display:flex;align-items:center;justify-content:center;}' +
      '#s svg{width:' + m + 'px;height:' + m + 'px;display:block;}</style><div id="s">' + SVG.mark + '</div>');
    await page.waitForTimeout(60);
    await page.locator('#s').screenshot({ path: RES + '/' + d + '/splash.png' });
    n++;
  }

  await browser.close();

  const head = '<!-- 찍고쓰다 앱 아이콘 — 뷰파인더 안의 반짝임 (사장님 확정 2026-09-06)\n' +
               '     ☠️ 이 도형은 android/app/src/main/res/mipmap-* 의 런처 아이콘,\n' +
               '        www/index.html 헤더, www/js/ui_settings.js 의 APP_MARK 와 **같아야 한다.**\n' +
               '        한 곳만 고치면 홈 화면과 앱 안이 서로 다른 아이콘이 된다.\n' +
               '        손으로 만지지 말고 tools/make-icons.js 를 고쳐서 npm run icons.\n' +
               '        (tools/check.js 가 어긋나면 잡아 준다) -->\n';
  fs.writeFileSync(WWW + '/icon.svg', head + SVG.full + '\n');
  fs.writeFileSync(WWW + '/icon-maskable.svg',
    head + '<!-- maskable: 배경이 모서리까지 꽉 차야 하고, 그림은 가운데 안전 원 안에 있어야 한다 -->\n' +
    SVG.maskable + '\n');

  console.log('만든 파일 ' + (n + 2) + '개');
})();
