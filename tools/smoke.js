/* ═══════════════════════════════════════════════════════════
   tools/smoke.js — 실제 브라우저로 전체 흐름을 돌려보는 검사
   ----------------------------------------------------------------
   tools/check.js 가 '코드가 어긋나지 않았나'를 본다면,
   이 파일은 '사람이 쓰는 순서대로 눌렀을 때 실제로 되나'를 본다.
   여기서 실제로 버그를 두 건 잡았다(2026-08-28):
     · 서비스워커가 첫 설치에도 새로고침을 걸어 앱이 두 번 뜨던 것
     · Firebase 미설정인데 요금제 창에 '로그인하기'가 떠 있던 막다른 길

   준비:  npm i -D playwright && npx playwright install chromium
   실행:  node tools/smoke.js
   ⚠️ 브라우저가 필요하다. CI 가 아니라 손으로 돌리는 검사다.
   ⚠️ 구글 폰트를 못 받는 환경에서는 콘솔 오류 1건이 정상이다.
═══════════════════════════════════════════════════════════ */
function makeExifJpegB64(){
  /* EXIF(APP1)를 실제 JPEG 앞에 끼워 넣어 테스트용 사진을 만든다 */
  function u16(n){return [n>>8&255,n&255];}
  function u32le(n){return [n&255,n>>8&255,n>>16&255,n>>>24&255];}
  function u16le(n){return [n&255,n>>8&255];}
  function rat(num,den){return u32le(num).concat(u32le(den));}
  
  function buildExif(){
    const dt = '2026:08:20 12:34:56\0';           // 20 bytes
    // 레이아웃(TIFF 기준 오프셋)
    // 0: II 2A 00, ifd0 = 8
    // 8: IFD0 (2 entries) => 2 + 24 + 4 = 30 bytes -> ends 38
    // 38: ExifIFD (1 entry) => 2 + 12 + 4 = 18 -> ends 56
    // 56: GPSIFD (4 entries) => 2 + 48 + 4 = 54 -> ends 110
    // 110: DateTimeOriginal string (20)
    // 130: GPS lat rational x3 (24)
    // 154: GPS lng rational x3 (24) -> 178
    const EXIF_IFD=38, GPS_IFD=56, DT_OFF=110, LAT_OFF=130, LNG_OFF=154;
    let t=[];
    t.push(0x49,0x49); t=t.concat(u16le(0x002A)); t=t.concat(u32le(8));
    // IFD0
    t=t.concat(u16le(2));
    t=t.concat(u16le(0x8769), u16le(4), u32le(1), u32le(EXIF_IFD));
    t=t.concat(u16le(0x8825), u16le(4), u32le(1), u32le(GPS_IFD));
    t=t.concat(u32le(0));
    // ExifIFD
    t=t.concat(u16le(1));
    t=t.concat(u16le(0x9003), u16le(2), u32le(dt.length), u32le(DT_OFF));
    t=t.concat(u32le(0));
    // GPSIFD  (37.5665, 126.9780 — 서울시청)
    t=t.concat(u16le(4));
    t=t.concat(u16le(0x0001), u16le(2), u32le(2), [0x4E,0,0,0]);        // 'N'
    t=t.concat(u16le(0x0002), u16le(5), u32le(3), u32le(LAT_OFF));
    t=t.concat(u16le(0x0003), u16le(2), u32le(2), [0x45,0,0,0]);        // 'E'
    t=t.concat(u16le(0x0004), u16le(5), u32le(3), u32le(LNG_OFF));
    t=t.concat(u32le(0));
    for(const c of dt) t.push(c.charCodeAt(0));
    t=t.concat(rat(37,1), rat(33,1), rat(5940,100));   // 37° 33' 59.40"
    t=t.concat(rat(126,1), rat(58,1), rat(4080,100));  // 126° 58' 40.80"
    return Buffer.from(t);
  }
  
  const JPEG_B64='/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAKAAoBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/AKpgA//Z';
  const jpeg = Buffer.from(JPEG_B64,'base64');
  const tiff = buildExif();
  const payload = Buffer.concat([Buffer.from('Exif\0\0','binary'), tiff]);
  const seg = Buffer.concat([Buffer.from([0xFF,0xE1]), Buffer.from(u16(payload.length+2)), payload]);
  const out = Buffer.concat([jpeg.slice(0,2), seg, jpeg.slice(2)]);
  return out.toString('base64');
  
}

const http=require('http'),fs=require('fs'),path=require('path');
const { chromium } = require('playwright');
const ROOT=path.join(__dirname,'..','www');
const MIME={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
 const f=path.join(ROOT,p);
 if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end('nf');return;}
 r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f));});

const PLAIN='/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAKAAoBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/AKpgA//Z';
const EXIFB64=makeExifJpegB64();

(async()=>{
  await new Promise(r=>server.listen(5620,r));
  const browser=await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx=await browser.newContext({viewport:{width:400,height:860},deviceScaleFactor:2});
  const page=await ctx.newPage();
  const errors=[],logs=[];
  page.on('console',m=>{logs.push(m.type()+': '+m.text()); if(m.type()==='error')errors.push(m.text());});
  page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
  await page.goto('http://127.0.0.1:5620/index.html',{waitUntil:'networkidle'});
  await page.waitForTimeout(800);

  const step=[];
  const chk=async(n,f)=>{try{const r=await f();step.push('✅ '+n+(r?' — '+r:''));}catch(e){step.push('❌ '+n+' — '+e.message);}};
  const must=(c,m)=>{if(!c)throw new Error(m);};
  const closeAll=async()=>{await page.evaluate(()=>{document.querySelectorAll('.sheet-ov').forEach(e=>e.remove());syncBodyLock();});await page.waitForTimeout(150);};

  await chk('앱 로드 (모듈 전부)', async()=>await page.evaluate(()=>
    [CFG&&'CFG',Profiles&&'Profiles',Store&&'Store',Photos&&'Photos',Exif&&'Exif',Cloud&&'Cloud',
     Subs&&'Subs',Backup&&'Backup',CloudBackup&&'CloudBackup',MapView&&'MapView',ClaudeAI&&'ClaudeAI',Share&&'Share'].length+'개 모듈'));
  await chk('Firebase 미설정 안내', async()=>{const w=await page.evaluate(()=>Cloud.ready+'|'+Cloud.why);
    must(w.startsWith('false'),'키가 없는데 ready=true'); return w.split('|')[1].slice(0,34)+'…';});
  await chk('이용량 초기값', async()=>await page.evaluate(()=>Subs.label('post')));

  // 새 장소 + EXIF 사진 불러오기
  await page.click('#fabNew'); await page.waitForTimeout(300);
  await page.evaluate(async(b64)=>{
    const bin=atob(b64); const a=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
    const f=new File([a],'exif.jpg',{type:'image/jpeg'});
    window.__exifRaw = await Exif.read(f);
    await Photos.addFromFiles([f],'외관');
  }, EXIFB64);
  await page.waitForTimeout(700);
  await chk('EXIF 파싱 (촬영시각·GPS)', async()=>{
    const r=await page.evaluate(()=>window.__exifRaw);
    must(r && r.at==='2026-08-20T12:34','촬영시각 파싱 실패: '+JSON.stringify(r));
    must(r.geo && Math.abs(r.geo.lat-37.5665)<0.01 && Math.abs(r.geo.lng-126.978)<0.01,'GPS 파싱 실패: '+JSON.stringify(r.geo));
    return r.at+' / '+r.geo.lat.toFixed(4)+','+r.geo.lng.toFixed(4);
  });
  await chk('EXIF 값이 장소에 채워짐', async()=>{
    const p=await page.evaluate(()=>({at:Place.current().visitedAt, geo:Place.current().geo}));
    must(p.at==='2026-08-20T12:34','방문시각 미반영: '+p.at);
    must(p.geo&&p.geo.src==='exif','좌표 미반영');
    return p.at+' · 좌표 있음';
  });

  // 일반 사진 여러 장 + 일괄 태그
  await page.evaluate(async(u)=>{
    for(const t of ['외관','외관','외관','외관']) await Photos.addFromDataUrl('data:image/jpeg;base64,'+u,t);
    UI.renderNow();
  },PLAIN);
  await page.waitForTimeout(400);
  await page.click('#btnBulk'); await page.waitForTimeout(300);
  await chk('일괄 정리 시트', async()=>(await page.locator('.bkCell').count())+'칸');
  await page.click('#bkAll');
  await page.click('#bkTags .tag[data-t="음식"]');
  await page.waitForTimeout(150);
  await page.click('#bkApply'); await page.waitForTimeout(500); await closeAll();
  await chk('일괄 태그 변경', async()=>await page.evaluate(()=>Photos.ordered().map(x=>x.tag).join(',')));

  // 게이트 — 맛보기 3회 소진
  await chk('게이트: 맛보기 소진 후 잠김', async()=>{
    const r=await page.evaluate(()=>{
      const before=Subs.can('post').ok;
      Subs.use('post');Subs.use('post');Subs.use('post');
      const after=Subs.can('post');
      return {before, ok:after.ok, msg:after.msg};
    });
    must(r.before===true,'처음부터 잠김');
    must(r.ok===false,'3회 써도 안 잠김');
    must(/로그인/.test(r.msg),'안내에 로그인 유도 없음: '+r.msg);
    return r.msg.slice(0,40)+'…';
  });
  await chk('프록시 없을 땐 게이트가 안 걸림 (비용이 안 나가므로)', async()=>{
    await page.click('#btnWrite'); await page.waitForTimeout(300);
    await page.click('#wGen'); await page.waitForTimeout(400);
    const tis=await page.locator('.sheet-ti').allInnerTexts();
    must(!tis.some(t=>/🔒/.test(t)),'뼈대 초안인데 요금제가 뜸');
    const txt=await page.inputValue('#wText');
    must(txt.length>20,'초안이 안 들어옴');
    await closeAll();
    return '뼈대 초안 '+txt.split('\n').length+'줄, 요금제 안 뜸';
  });
  await chk('게이트 UI — 잠기면 요금제가 뜬다', async()=>{
    const shown=await page.evaluate(()=>{
      const r=Subs.gateFeature('post','AI 글 생성');
      const tis=[].slice.call(document.querySelectorAll('.sheet-ti')).map(e=>e.textContent);
      return {allowed:r, tis:tis, hasLogin:!!document.getElementById('plLogin')};
    });
    must(shown.allowed===false,'잠겨야 하는데 통과됨');
    must(shown.tis.some(t=>/🔒/.test(t)),'요금제 시트가 안 뜸: '+JSON.stringify(shown.tis));
    must(shown.hasLogin===false,'Firebase 미설정인데 로그인 버튼이 떠 있음(막다른 길)');
    await closeAll();
    return '잠김 + 요금제 표시 + 막다른 로그인 버튼 없음';
  });

  // 백업 → 삭제 → 복구 왕복
  await chk('백업 ZIP 만들기', async()=>{
    const r=await page.evaluate(async()=>{
      const res=await Backup.exportZip();
      window.__bk=res.blob;
      return {name:res.name, places:res.places, photos:res.photos, bytes:res.blob.size};
    });
    must(/^travelpost_backup_\d{8}_\d{4}\.zip$/.test(r.name),'ASCII 파일명 규칙 위반: '+r.name);
    must(r.photos===5,'사진 수 이상: '+r.photos);
    return r.name+' · '+r.places+'곳 '+r.photos+'장 · '+Math.round(r.bytes/1024)+'KB';
  });
  await chk('장소 삭제 후 복구(합치기) 왕복', async()=>{
    const r=await page.evaluate(async()=>{
      const id=Place.current().id;
      await Store.placeDelete(id);
      Place.clear();
      const gone=(await Store.placeAll()).length;
      const ins=await Backup.inspect(window.__bk);
      const added=await Backup.restore(ins.zip, ins.meta, 'merge');
      const back=await Store.placeAll();
      const ph=await Store.photosOf(id);
      return {gone, added, places:back.length, photosLinked:ph.length, name:(back[0]||{}).name};
    });
    must(r.gone===0,'삭제가 안 됨');
    must(r.places===1,'복구 후 장소 수 이상: '+r.places);
    must(r.photosLinked===5,'사진↔장소 연결 복구 실패: '+r.photosLinked);
    return '사진 '+r.added.photos+'장·장소 '+r.added.places+'곳 복구, 연결 '+r.photosLinked+'건';
  });
  await chk('복구는 비파괴 — 두 번 돌려도 안 늘어남', async()=>{
    const r=await page.evaluate(async()=>{
      const ins=await Backup.inspect(window.__bk);
      const a=await Backup.restore(ins.zip, ins.meta, 'merge');
      return {added:a, places:(await Store.placeAll()).length};
    });
    must(r.places===1,'중복 생성됨: '+r.places);
    must(r.added.places===0,'합치기인데 덮어씀');
    return r.added.skipped+'건 건너뜀';
  });

  // 지도 폴백
  await closeAll();
  await page.click('.tab-item[data-tab="records"]'); await page.waitForTimeout(400);
  await page.click('[data-v="map"]'); await page.waitForTimeout(500);
  await chk('지도 — 키 없을 때 지역 목록 폴백', async()=>{
    const t=await page.locator('#pnRecords').innerText();
    must(/KAKAO_JS_KEY/.test(t),'왜 안 되는지 안 적힘');
    must((await page.locator('.mapRow').count())>0,'폴백 목록이 비어 있음');
    return (await page.locator('.mapRow').count())+'행';
  });
  await page.screenshot({path:path.join(__dirname,'shot_map.png')});

  // 설정 — 계정/백업/구독 카드
  await page.click('.tab-item[data-tab="settings"]'); await page.waitForTimeout(600);
  await chk('설정 — 계정·백업·이용량 카드', async()=>{
    const t=await page.locator('#pnSettings').innerText();
    ['👤 계정','💾 백업','🎫 이용량','KAKAO_JS_KEY'].forEach(k=>must(t.includes(k),k+' 없음'));
    return (await page.locator('#pnSettings .todo').count())+'건 미설정 표시';
  });
  await page.screenshot({path:path.join(__dirname,'shot_settings.png')});
  await chk('로그인 — 키 없을 땐 버튼 대신 이유', async()=>{
    const t=await page.locator('#pnSettings').innerText();
    must(/아직 로그인을 켤 수 없습니다/.test(t),'이유가 안 적힘');
    must((await page.locator('#acIn').count())===0,'못 쓰는 로그인 버튼이 떠 있음');
    const t2=await page.evaluate(()=>{UI.openLogin();
      const s=document.querySelector('.sheet-ov .sheet').innerText;
      document.querySelectorAll('.sheet-ov').forEach(e=>e.remove());return s;});
    must(/아직 로그인을 켤 수 없어요/.test(t2),'openLogin 안내가 다름');
    return '버튼 없음 + 이유 표시';
  });
  await chk('백업 시트 열림', async()=>{
    await page.waitForTimeout(200);
    await page.click('#bkOpen'); await page.waitForTimeout(400);
    const t=await page.locator('.sheet').last().innerText();
    must(/백업 만들기/.test(t),'백업 시트 아님');
    await closeAll();
    return 'OK';
  });

  console.log('\n=== 2·3단계 스모크 ===');
  step.forEach(s=>console.log('  '+s));
  console.log('\n=== 콘솔 오류 '+errors.length+'건 ===');
  errors.slice(0,12).forEach(e=>console.log('  '+e));
  console.log('\n=== 로드 로그 ===');
  logs.filter(l=>/\[(CFG|Cloud|Subs|AI|Share|Profiles|찍고쓰다)/.test(l)).forEach(l=>console.log('  '+l));
  await browser.close(); server.close();
  process.exit(step.some(s=>s.startsWith('❌'))?1:0);
})();
