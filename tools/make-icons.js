/* tools/make-icons.js — 앱 아이콘·시작 화면 한 번에 뽑기
   실행: node tools/make-icons.js   (playwright 필요 — npm run smoke 와 같은 것)
   ----------------------------------------------------------------
   찍고쓰다 아이콘 생성기 — 사용자가 고른 01번(렌즈 자리가 반짝임인 카메라)
   ----------------------------------------------------------------
   ☠️ 도형은 후보 페이지에서 사장님이 보고 고르신 그림 **그대로**다.
      (흰 몸체 / 진초록 렌즈 #2F6B4F / 흰 반짝임 / 연초록 플래시 #9BD7B2)
      2026-09-05 1차 생성 때 렌즈·플래시를 '뚫린 구멍'으로 바꿔서 뽑았다가
      플래시 점 색이 배경 초록으로 나와 고른 것과 달라졌다 — 다시 이렇게 바꾸지 말 것.

   한 도형을 정의해 두고 쓰임새별로 배경·크기만 바꿔 뽑는다. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const WWW = path.join(ROOT, 'www');

const SPK = 'M0 -22 C1.5 -6 6 -1.5 22 0 C6 1.5 1.5 6 0 22 C-1.5 6 -6 1.5 -22 0 C-6 -1.5 -1.5 -6 0 -22 Z';

const GRAD = '<linearGradient id="g" x1="0" y1="0" x2=".55" y2="1">' +
             '<stop offset="0" stop-color="#5FA46F"/><stop offset="1" stop-color="#2F6B4F"/></linearGradient>';

/* 고르신 그림. s 를 주면 가운데를 기준으로 줄인다 (그림의 실제 중심은 y=55) */
function art(s) {
  const t = s ? ` transform="translate(54,54) scale(${s}) translate(-54,-55)"` : '';
  return `<g${t}>` +
    `<path d="M42 28 h24 l5 8 H37 Z" fill="#fff"/>` +
    `<rect x="18" y="36" width="72" height="46" rx="10" fill="#fff"/>` +
    `<circle cx="54" cy="59" r="17" fill="#2F6B4F"/>` +
    `<path d="${SPK}" transform="translate(54,59) scale(.58)" fill="#fff"/>` +
    `<circle cx="79" cy="45" r="3.5" fill="#9BD7B2"/>` +
  `</g>`;
}

/* 안드로이드 13+ '테마 아이콘'용 단색 실루엣.
   여긴 색을 못 쓰고 **모양(알파)만** 쓰이므로, 렌즈·플래시를 뚫어야 카메라로 보인다.
   (통짜로 칠하면 흰 덩어리 하나가 된다) */
function mono(s) {
  const t = s ? ` transform="translate(54,54) scale(${s}) translate(-54,-55)"` : '';
  return `<g fill="#fff"${t}>` +
    `<path fill-rule="evenodd" d="M42 28 H66 L71 36 H80 A10 10 0 0 1 90 46 V72 A10 10 0 0 1 80 82 H28 ` +
      `A10 10 0 0 1 18 72 V46 A10 10 0 0 1 28 36 H37 Z ` +
      `M54 42 A17 17 0 1 1 54 76 A17 17 0 1 1 54 42 Z ` +
      `M79 41.5 A3.5 3.5 0 1 1 79 48.5 A3.5 3.5 0 1 1 79 41.5 Z"/>` +
    `<path d="${SPK}" transform="translate(54,59) scale(.58)"/>` +
  `</g>`;
}

/* ⚠️ 적응형 아이콘 전경은 108dp 판 위에 그리지만, 런처 모양(원·둥근네모·물방울)에 따라
   가장자리가 잘린다. 가운데 지름 66dp 안에 들어와야 어떤 모양에서도 안 잘린다.
   0.66 으로 줄이면 그림 대각선이 약 59dp — 안전하다. */
const FG = 0.66;

const SVG = {
  full:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><defs>${GRAD}</defs><rect width="108" height="108" rx="24" fill="url(#g)"/>${art()}</svg>`,
  round:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><defs>${GRAD}</defs><circle cx="54" cy="54" r="54" fill="url(#g)"/>${art(0.86)}</svg>`,
  fg:       `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${art(FG)}</svg>`,
  mono:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${mono(FG)}</svg>`,
  maskable: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><defs>${GRAD}</defs><rect width="108" height="108" fill="url(#g)"/>${art(FG)}</svg>`,
  mark:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${art()}</svg>`
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

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
  let n = 0;

  async function shot(svg, w, h, out) {
    const html = `<style>html,body{margin:0;padding:0;background:transparent;}#x{display:block;}</style>` +
      svg.replace('<svg ', `<svg id="x" width="${w}" height="${h}" `);
    await page.setContent(html);
    await page.waitForTimeout(60);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.locator('#x').screenshot({ path: out, omitBackground: true });
    n++;
  }

  for (const [d, px] of Object.entries(LAUNCHER)) {
    await shot(SVG.full,  px, px, `${RES}/mipmap-${d}/ic_launcher.png`);
    await shot(SVG.round, px, px, `${RES}/mipmap-${d}/ic_launcher_round.png`);
  }
  for (const [d, px] of Object.entries(FOREGROUND)) {
    await shot(SVG.fg,   px, px, `${RES}/mipmap-${d}/ic_launcher_foreground.png`);
    await shot(SVG.mono, px, px, `${RES}/mipmap-${d}/ic_launcher_monochrome.png`);
  }

  /* 시작 화면 — 초록 바탕에 그림. 그림은 짧은 변의 26% */
  for (const [d, [w, h]] of Object.entries(SPLASH)) {
    const m = Math.round(Math.min(w, h) * 0.26);
    await page.setContent(`<style>html,body{margin:0;padding:0;}
      #s{width:${w}px;height:${h}px;background:#2F6B4F;display:flex;align-items:center;justify-content:center;}
      #s svg{width:${m}px;height:${m}px;display:block;}</style><div id="s">${SVG.mark}</div>`);
    await page.waitForTimeout(60);
    await page.locator('#s').screenshot({ path: `${RES}/${d}/splash.png` });
    n++;
  }

  await browser.close();

  const head = '<!-- 찍고쓰다 앱 아이콘 — 렌즈 자리가 반짝임인 카메라 (사장님 확정 2026-09-05)\n' +
               '     ☠️ 이 도형은 android/app/src/main/res/mipmap-* 의 런처 아이콘,\n' +
               '        www/index.html 헤더, www/js/ui_settings.js 의 APP_MARK 와 **같아야 한다.**\n' +
               '        한 곳만 고치면 홈 화면과 앱 안이 서로 다른 아이콘이 된다.\n' +
               '        (tools/check.js 가 어긋나면 잡아 준다) -->\n';
  fs.writeFileSync(`${WWW}/icon.svg`, head + SVG.full + '\n');
  fs.writeFileSync(`${WWW}/icon-maskable.svg`,
    head + '<!-- maskable: 배경이 모서리까지 꽉 차야 하고, 그림은 가운데 66% 안에 있어야 한다 -->\n' +
    SVG.maskable + '\n');

  console.log('만든 파일 ' + (n + 2) + '개');
})();
