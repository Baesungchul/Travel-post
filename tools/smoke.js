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
     Subs&&'Subs',Backup&&'Backup',AutoBackup&&'AutoBackup',MapView&&'MapView',ClaudeAI&&'ClaudeAI',Share&&'Share',
     Viewer&&'Viewer',Undo&&'Undo'].length+'개 모듈'));
  await chk('Firebase 상태 — 설정 여부와 안내가 맞는가', async()=>{
    const r=await page.evaluate(()=>({set:CFG.hasFirebase(), ready:!!Cloud.ready, why:Cloud.why||''}));
    must(r.ready===r.set, r.set?'키가 있는데 ready=false':'키가 없는데 ready=true');
    if(!r.set) must(r.why.length>0,'왜 못 쓰는지 안 적힘');
    return r.set?'설정됨 → 로그인 사용 가능':'미설정 → '+r.why.slice(0,30)+'…';});
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
  /* ⚠️ 2026-09-05: 이 검사들은 config.js 가 **비어 있던 때**(2026-08-28)를 기준으로 쓰였다.
     그 뒤 Firebase·프록시·카카오 키가 채워지면서 전제가 뒤집혔는데, 같은 시기에 첫 화면
     로그인창이 생겨 검사가 여기까지 오지도 못해 아무도 몰랐다.
     → 이제는 **설정 상태를 보고 기대를 나눈다.** 어느 쪽이든 규칙 자체는 그대로 검사한다. */
  await chk('글 생성 게이트 — 프록시 유무에 맞게 동작', async()=>{
    const hasProxy=await page.evaluate(()=>CFG.hasProxy());
    await page.click('#btnWrite'); await page.waitForTimeout(300);
    await page.click('#wGen'); await page.waitForTimeout(500);
    const tis=await page.locator('.sheet-ti').allInnerTexts();
    if(!hasProxy){
      must(!tis.some(t=>/🔒/.test(t)),'뼈대 초안인데 요금제가 뜸');
      const txt=await page.inputValue('#wText');
      must(txt.length>20,'초안이 안 들어옴');
      await closeAll();
      return '프록시 없음 → 뼈대 초안, 요금제 안 뜸';
    }
    /* 프록시가 있으면 비용이 나가므로 잠겨야 한다(로그인 안 된 상태) */
    must(tis.some(t=>/🔒/.test(t)),'프록시가 있는데 게이트가 안 걸림: '+JSON.stringify(tis));
    await closeAll();
    return '프록시 있음 → 요금제로 막음';
  });
  await chk('게이트 UI — 잠기면 요금제가 뜨고, 못 쓰는 버튼은 안 뜬다', async()=>{
    const shown=await page.evaluate(()=>{
      const r=Subs.gateFeature('post','AI 글 생성');
      const tis=[].slice.call(document.querySelectorAll('.sheet-ti')).map(e=>e.textContent);
      return {allowed:r, tis:tis, hasLogin:!!document.getElementById('plLogin'), ready:!!Cloud.ready};
    });
    must(shown.allowed===false,'잠겨야 하는데 통과됨');
    must(shown.tis.some(t=>/🔒/.test(t)),'요금제 시트가 안 뜸: '+JSON.stringify(shown.tis));
    /* ☠️ 규칙: 켤 수 없는 버튼은 띄우지 않는다.
       Firebase 가 설정돼 있으면 로그인 버튼이 **있어야** 맞고(로그인하면 풀리니까),
       설정이 안 돼 있으면 **없어야** 맞다(눌러도 아무 일도 못 하니까). */
    must(shown.hasLogin===shown.ready,
      shown.ready?'로그인하면 풀리는데 로그인 버튼이 없음':'Firebase 미설정인데 로그인 버튼이 떠 있음(막다른 길)');
    await closeAll();
    return '잠김 + 요금제 + 로그인 버튼 '+(shown.ready?'있음(정상)':'없음(정상)');
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
  await chk('지도 — 카카오 키 유무에 맞게', async()=>{
    const hasMap=await page.evaluate(()=>CFG.hasKakaoMap());
    const t=await page.locator('#pnRecords').innerText();
    if(!hasMap){
      must(/KAKAO_JS_KEY/.test(t),'왜 안 되는지 안 적힘');
      must((await page.locator('.mapRow').count())>0,'폴백 목록이 비어 있음');
      return '키 없음 → 이유 표시 + 폴백 '+(await page.locator('.mapRow').count())+'행';
    }
    must(!/KAKAO_JS_KEY/.test(t),'키가 있는데 미설정 안내가 뜸');
    return '키 있음 → 지도 화면';
  });
  await page.screenshot({path:path.join(__dirname,'shot_map.png')});

  // 설정 — 계정/백업/구독 카드
  await page.click('.tab-item[data-tab="settings"]'); await page.waitForTimeout(600);
  await chk('설정 — 항목 구성 (2026-09-05 재구성: 계정이 맨 위 단독)', async()=>{
    const t=await page.locator('#pnSettings').innerText();
    /* 2026-09-06: '구독 · 광고 제거' 를 계정 바로 밑에 추가 (사용자 요청) */
    ['계정','구독 · 광고 제거','카테고리 · 글쓰기','백업 · 이용량','촬영 · 화면 · 정보']
      .forEach(k=>must(t.includes(k),k+' 없음'));
    /* 계정이 첫 항목이어야 한다 — 순서가 요구사항이다 */
    const first=await page.locator('#pnSettings .set-group-head').first().innerText();
    must(/계정/.test(first),'계정이 맨 위가 아님: '+first.replace(/\n/g,' '));
    /* 아직 안 채운 값은 이름 그대로 화면에 뜬다 */
    const miss=await page.evaluate(()=>CFG.missing().map(m=>m.k));
    miss.forEach(k=>must(t.includes(k),'미설정 값 '+k+' 이 화면에 안 뜸'));
    /* 맨 아래 줄: 로그인/로그아웃 + 앱명·버전 */
    const foot=await page.locator('.set-foot').innerText();
    must(/찍고쓰다 v/.test(foot),'맨 아래에 앱명·버전이 없음: '+foot);
    return '항목 5종 · 미설정 '+miss.length+'건 · 아래줄 "'+foot.replace(/\n/g,' ')+'"';
  });
  await page.screenshot({path:path.join(__dirname,'shot_settings.png')});
  await chk('로그인 — 설정 상태에 맞게 (막다른 길 금지)', async()=>{
    const ready=await page.evaluate(()=>!!Cloud.ready);
    if(ready){
      must((await page.locator('#acAuth').count())===1,'맨 아래 로그인 글자가 없음');
      const t2=await page.evaluate(()=>{UI.openLogin();
        const s=document.querySelector('.sheet-ov .sheet').innerText;
        document.querySelectorAll('.sheet-ov').forEach(e=>e.remove());return s;});
      must(!/아직 로그인을 켤 수 없어요/.test(t2),'설정돼 있는데 못 쓴다고 함');
    }
    /* ☠️ Firebase 가 없을 때의 규칙도 그 자리에서 확인한다 — 실제로 꺼 보고 되돌린다.
       (설정값이 채워진 뒤로는 이 경로를 아무도 안 밟아 보게 되므로) */
    const off=await page.evaluate(()=>{
      const keep=Cloud.ready; Cloud.ready=false; UI.renderSettings();
      const head=document.querySelector('.set-group-head[data-g="acct"]');
      if(head) head.click();
      const t=document.getElementById('pnSettings').innerText;
      const btn=document.querySelectorAll('#acAuth,#acIn').length;
      const s=(UI.openLogin(),document.querySelector('.sheet-ov .sheet').innerText);
      document.querySelectorAll('.sheet-ov').forEach(e=>e.remove());
      Cloud.ready=keep; UI.renderSettings();
      return {t:t, btn:btn, s:s};
    });
    must(/아직 로그인을 켤 수 없습니다/.test(off.t),'미설정일 때 이유가 안 적힘');
    must(off.btn===0,'미설정인데 로그인 버튼이 떠 있음(막다른 길)');
    must(/아직 로그인을 켤 수 없어요/.test(off.s),'openLogin 안내가 다름');
    return (ready?'설정됨 → 로그인 글자 있음':'미설정')+' · 미설정 경로도 규칙대로';
  });
  await chk('백업 시트 열림', async()=>{
    await page.waitForTimeout(200);
    /* 2026-09-05 재구성: 백업은 '백업 · 이용량' 묶음 안의 소타이틀 '백업' 에 있다.
       ⚠️ 아코디언은 한 번에 하나만 열리므로 큰 타이틀 → 소타이틀 순서로 눌러야 한다. */
    await page.click('.set-group-head[data-g="data"]'); await page.waitForTimeout(300);
    await page.click('.set-sub-head[data-s="백업"]'); await page.waitForTimeout(300);
    await page.click('#bkOpen'); await page.waitForTimeout(400);
    const t=await page.locator('.sheet').last().innerText();
    must(/백업 만들기/.test(t),'백업 시트 아님');
    await closeAll();
    return 'OK';
  });

  /* ═══ 2026-09-05 추가분 — 여기서 실제로 사고가 났던 것들 ═══ */
  await chk('글 유실 방지 — 바깥을 눌러 닫아도 임시 보관', async()=>{
    await page.click('.tab-item[data-tab="records"]'); await page.waitForTimeout(300);
    /* 앞 단계에서 현재 장소가 비어 있을 수 있다 — photos.js 와 같은 방식으로 하나 확보한다 */
    await page.evaluate(()=>UI.openWriter(Place.current()||Place.create())); await page.waitForTimeout(500);
    const TXT='임시보관 검사용 글. (사진: 외관) 국물이 좋았다.';
    await page.fill('#wText',TXT); await page.waitForTimeout(200);
    /* ☠️ 예전에는 여기서 글이 그대로 사라졌다 — 차감은 이미 끝난 뒤인데도. */
    await page.mouse.click(206,60); await page.waitForTimeout(400);
    must((await page.locator('#wText').count())===0,'바깥을 눌러도 안 닫힘');
    const kept=await page.evaluate(()=>{
      const k=Object.keys(localStorage).filter(x=>x.indexOf('draft_')>=0);
      return k.length?localStorage.getItem(k[0]):'';});
    must(kept.indexOf('국물이 좋았다')>=0,'닫으니 글이 사라짐(임시 보관 안 됨)');
    await page.evaluate(()=>UI.openWriter(Place.current())); await page.waitForTimeout(600);
    must((await page.inputValue('#wText'))===TXT,'다시 열었는데 안 살아남');
    await page.click('#wSave'); await page.waitForTimeout(600);
    const left=await page.evaluate(()=>Object.keys(localStorage).filter(x=>x.indexOf('draft_')>=0).length);
    must(left===0,'저장했는데 임시본이 안 지워짐');
    await closeAll();
    return '닫아도 보관 → 다시 열면 복원 → 저장하면 정리';
  });
  await chk('검색 — 완성글·기록', async()=>{
    await page.click('.tab-item[data-tab="posts"]'); await page.waitForTimeout(500);
    must((await page.locator('#poQ').count())===1,'완성글에 검색칸 없음');
    await page.fill('#poQ','국물'); await page.waitForTimeout(300);
    const hit=await page.locator('.postRow').count();
    must(hit>=1,'검색어에 걸려야 할 글이 안 나옴');
    await page.fill('#poQ','없는낱말zzz'); await page.waitForTimeout(300);
    must((await page.locator('.postRow').count())===0,'없는 낱말인데 결과가 나옴');
    await page.fill('#poQ',''); await page.waitForTimeout(200);
    await page.click('.tab-item[data-tab="records"]'); await page.waitForTimeout(400);
    /* 달력·여행 보기에는 일부러 안 넣는다 — 카테고리 필터를 감추는 것과 같은 이유.
       ⚠️ 앞 단계에서 보기가 바뀌어 있을 수 있으므로 직접 눌러서 맞춘다. */
    await page.click('[data-v="cal"]'); await page.waitForTimeout(400);
    must((await page.locator('#rcQ').count())===0,'달력 보기에 검색칸이 뜸');
    await page.click('[data-v="list"]'); await page.waitForTimeout(400);
    must((await page.locator('#rcQ').count())===1,'목록 보기에 검색칸이 없음');
    return '완성글 '+hit+'건 걸림 · 기록은 목록 보기에서만';
  });
  await chk('자동 백업 — 폰 저장소 · 브라우저에서는 못 한다고 말한다', async()=>{
    const r=await page.evaluate(async()=>{
      const out={on:AutoBackup.enabled(), avail:AutoBackup.available(), never:AutoBackup.staleInfo().never,
                 notice:AutoBackup.noticeHTML(), err:''};
      try { await AutoBackup.run('test'); } catch(e){ out.err=e.message||''; }
      return out;
    });
    must(r.on===true,'기본값이 꺼짐');
    /* ☠️ 브라우저에는 저장 폴더가 없다 — 조용히 실패하면 '백업된 줄 알고' 지내게 된다 */
    must(r.avail===false,'브라우저인데 된다고 함');
    must(/폰에서만/.test(r.err),'못 하는데 이유를 안 알려줌: '+r.err);
    must(r.never===true,'한 적도 없는데 백업 기록이 있음');
    /* 서버 백업을 걷어냈으므로 로그인·클라우드 이야기가 남아 있으면 안 된다 */
    must(r.notice.indexOf('클라우드')<0,'클라우드 백업 문구가 남아 있음');
    return '기본 켬 · 브라우저에서는 이유를 알림';
  });
  await chk('자동 백업 타이밍 — 현장매니저와 같은 시점에 걸려 있다', async()=>{
    const r=await page.evaluate(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      /* (1) 이벤트 배선 — 어떤 사유로 불리는지만 본다 */
      const seen=[]; const realDue=AutoBackup.runIfDue;
      AutoBackup.runIfDue=async(reason)=>{ seen.push(reason); return null; };
      Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
      await wait(120);
      AutoBackup.runIfDue=realDue;

      /* (2) 간격 — 복귀는 10분에 한 번. 중단 표시를 켜 두면 '바뀐 게 없어도' 도는 경로가 되므로
            간격만 순수하게 볼 수 있다. */
      localStorage.setItem(CFG.k('auto_backup_incomplete'),'1');
      const ran=[]; const realRun=AutoBackup.run, realAvail=AutoBackup.available;
      AutoBackup.available=()=>true;
      AutoBackup.run=async(reason)=>{ ran.push(reason); return realRun.call(AutoBackup,reason).catch(()=>null); };
      await AutoBackup.runIfDue('return-refresh');
      await AutoBackup.runIfDue('return-refresh');   /* 곧바로 또 — 걸러져야 한다 */
      AutoBackup.run=realRun; AutoBackup.available=realAvail;
      localStorage.removeItem(CFG.k('auto_backup_incomplete'));
      return {seen:seen, ran:ran};
    });
    must(r.seen.indexOf('hidden')>=0,'앱을 벗어날 때(hidden) 안 걸림: '+JSON.stringify(r.seen));
    must(r.seen.indexOf('pagehide')>=0,'pagehide 에 안 걸림: '+JSON.stringify(r.seen));
    must(r.seen.some(x=>x==='return-refresh'||x==='resume-catchup'),'복귀에 안 걸림: '+JSON.stringify(r.seen));
    must(r.ran.length===1,'복귀가 간격 없이 연달아 돎: '+JSON.stringify(r.ran));
    return '배선 '+JSON.stringify(r.seen)+' · 복귀 연타는 1회로 걸러짐';
  });
  await chk('서버 백업 흔적이 남아 있지 않다', async()=>{
    const r=await page.evaluate(()=>({cb:typeof window.CloudBackup, txt:document.body.innerText}));
    must(r.cb==='undefined','CloudBackup 이 아직 로드됨');
    return '클라우드 백업 코드 없음';
  });

  /* ═══ 2026-09-05 (2차) — 사진 뷰어 · 되돌리기 · 잘림 · 재시도 · 캐시 상한 ═══ */
  /* 앞 단계에서 장소를 지웠다 복구했으므로 '지금 열린 장소'가 비어 있다 —
     사진이 여러 장 있는 장소를 다시 열어 놓고 시작한다. */
  await page.evaluate(async()=>{
    const all=await Store.placeAll();
    const p=all.filter(x=>(x.photos||[]).length>=2)[0];
    if(p) await Place.open(p.id);
  });
  await page.waitForTimeout(300);

  await chk('사진 뷰어 — 눌러서 크게, 좌우로 넘기기', async()=>{
    await closeAll();
    await page.click('.tab-item[data-tab="now"]'); await page.waitForTimeout(600);
    const n=await page.locator('.grid img[data-ph]').count();
    must(n>=2,'검사할 사진이 2장 미만: '+n);
    await page.click('.grid img[data-ph]'); await page.waitForTimeout(400);
    must((await page.locator('.pv-full').count())===1,'뷰어가 안 열림');
    const first=await page.evaluate(()=>({
      open:getComputedStyle(document.querySelector('.pv-full')).display,
      cnt:document.querySelector('.pvf-cnt').textContent,
      next:getComputedStyle(document.querySelector('.pvf-nav.next')).display
    }));
    must(first.open==='flex','뷰어가 화면에 안 보임');
    must(/^1 \/ /.test(first.cnt),'장수 표시가 이상함: '+first.cnt);
    must(first.next!=='none','다음 사진 화살표가 없음(사진이 여러 장인데)');
    /* 넘기기 — 애니메이션(160+210ms)이 끝날 때까지 기다린다 */
    await page.click('.pvf-nav.next'); await page.waitForTimeout(700);
    const second=await page.evaluate(()=>document.querySelector('.pvf-cnt').textContent);
    must(/^2 \/ /.test(second),'다음 사진으로 안 넘어감: '+second);
    /* 안드로이드 뒤로가기와 같은 경로로 닫히나 — 뷰어가 팝업 스택에 올라와 있어야 한다 */
    const closed=await page.evaluate(()=>{
      const ok=window.closeTopOverlay();
      return {ok:ok, disp:getComputedStyle(document.querySelector('.pv-full')).display};
    });
    must(closed.ok===true,'뒤로가기가 뷰어를 못 찾음(팝업 스택에 안 올라감)');
    must(closed.disp==='none','뒤로가기를 눌러도 뷰어가 안 닫힘');
    return '사진 '+n+'장 · 넘기기 · 뒤로가기로 닫힘';
  });
  await chk('삭제 되돌리기 — 사진을 지워도 되살릴 수 있다', async()=>{
    const r=await page.evaluate(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const p=Place.current();
      const before=p.photos.length;
      const id=p.photos[0].id;
      const tag=p.photos[0].tag;
      await Undo.deletePhoto(id);
      await wait(200);
      const gone=Place.current().photos.length;
      const blobGone=!(await Store.photoGet(id));
      /* 되돌리기 막대가 실제로 떠 있어야 사용자가 누를 수 있다 */
      const bar=document.querySelector('.undo-bar');
      const shown=!!(bar&&bar.classList.contains('show'));
      if(bar) bar.querySelector('.undo-btn').click();
      await wait(400);
      const back=Place.current().photos;
      return {before, gone, blobGone, shown,
              after:back.length, sameTag:(back[0]||{}).tag===tag,
              blobBack:!!(await Store.photoGet(id))};
    });
    must(r.gone===r.before-1,'지웠는데 목록에서 안 빠짐');
    must(r.blobGone===true,'지웠는데 사진 자체가 남음');
    must(r.shown===true,'되돌리기 막대가 안 뜸(누를 방법이 없음)');
    must(r.after===r.before,'되돌렸는데 장수가 안 맞음: '+r.after+'/'+r.before);
    must(r.blobBack===true,'되돌렸는데 사진 Blob 이 안 살아남');
    must(r.sameTag===true,'되돌렸는데 원래 자리·태그가 아님');
    return r.before+'장 → 지움 → 되돌림 → '+r.after+'장 (Blob·자리·태그 그대로)';
  });
  await chk('글 길이 표시 — 채널 권장 길이를 알려준다', async()=>{
    await closeAll();
    await page.evaluate(()=>UI.openWriter(Place.current()||Place.create())); await page.waitForTimeout(500);
    await page.fill('#wText','짧은 글'); await page.waitForTimeout(250);
    /* X 는 280자가 넘으면 아예 안 올라간다 — '조금 길다'가 아니라 경고여야 한다 */
    const r=await page.evaluate(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const e=document.querySelector('#wLen');
      const short={tx:e.textContent, cls:e.className};
      document.querySelector('.ch[data-ch="x"]').click(); await wait(150);
      const ta=document.querySelector('#wText');
      ta.value='가'.repeat(400);
      ta.dispatchEvent(new Event('input'));
      await wait(200);
      return {short:short, over:{tx:e.textContent, cls:e.className}};
    });
    must(/자/.test(r.short.tx),'글자 수가 안 나옴: '+r.short.tx);
    must(/권장/.test(r.short.tx),'권장 길이가 안 나옴: '+r.short.tx);
    must(r.over.cls==='over-hard','X 에서 280자를 넘겼는데 경고가 아님: '+r.over.cls);
    must(/올라가지|올라갑니다/.test(r.over.tx),'못 올린다는 말이 없음: '+r.over.tx);
    await closeAll();
    return '짧을 때 "'+r.short.tx.slice(0,24)+'…" · X 초과는 경고';
  });
  await chk('AI — 잘린 글 감지 / 일시적 실패는 다시 시도', async()=>{
    const r=await page.evaluate(async()=>{
      const realFetch=window.fetch;
      const realAuth=CFG.PROXY_AUTH;
      CFG.PROXY_AUTH=false;   /* 이 검사는 재시도·잘림만 본다 — 로그인 게이트는 위에서 따로 본다 */
      const out={tries:0, truncated:null, retried:0, text:''};
      /* (1) 처음 두 번은 502, 세 번째에 성공 → 사용자가 다시 누르지 않아도 붙어야 한다.
             ☠️ 예전엔 502 하나에 그대로 실패로 끝났다(이 앱에서 가장 흔한 실패였다). */
      window.fetch=async()=>{
        out.tries++;
        if(out.tries<3) return new Response('{"error":{"message":"bad gateway"}}',{status:502});
        return new Response(JSON.stringify({content:[{type:'text',text:'이어지다 만 문장'}],
                                            stop_reason:'max_tokens'}),{status:200});
      };
      try{
        out.text=await ClaudeAI.callClaude({messages:[{role:'user',content:'x'}]});
        out.truncated=ClaudeAI.wasTruncated();
      }catch(e){ out.text='ERR:'+e.message; }
      out.retried=out.tries;
      /* (2) 4xx 는 다시 해도 같은 답이다 — 재시도하면 안 된다 */
      let n4=0;
      window.fetch=async()=>{ n4++; return new Response('{"error":{"message":"nope"}}',{status:400}); };
      try{ await ClaudeAI.callClaude({messages:[{role:'user',content:'x'}]}); }catch(e){}
      window.fetch=realFetch;
      CFG.PROXY_AUTH=realAuth;
      out.tries4xx=n4;
      return out;
    });
    must(r.retried===3,'502 를 만나고도 다시 시도하지 않음(시도 '+r.retried+'회)');
    must(r.text==='이어지다 만 문장','재시도 뒤 결과를 못 받음: '+r.text);
    must(r.truncated===true,'stop_reason=max_tokens 인데 잘린 걸 모름');
    must(r.tries4xx===1,'4xx 인데 쓸데없이 다시 시도함('+r.tries4xx+'회)');
    return '502 두 번 → 세 번째 성공 · 잘림 감지 · 4xx 는 재시도 안 함';
  });
  await chk('완성글 제목 — 따로 고칠 수 있고 본문은 안 건드린다', async()=>{
    await closeAll();
    const r=await page.evaluate(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const p=Place.current()||Place.create(); await Place.save();
      const body='# 연남동 골목 안 국밥집\n\n국물이 진했어요.';
      const rec=await ClaudeAI.savePost(p.id,'naver',body,body);
      await wait(200);
      /* ① 제목을 안 정했을 때 — 본문 첫 줄에서 만들되 마크다운 기호는 뗀다 */
      const auto=UI.postTitle(rec);
      /* ② 제목을 정하면 그 이름이 쓰인다 */
      rec.title='웨이팅 20분짜리 국밥';
      await Store.postPut(rec);
      const named=UI.postTitle(rec);
      const bodyAfter=(await Store.postGet(rec.id)).text;
      /* ③ 비우면 다시 본문에서 만들어 쓴다 */
      rec.title=''; await Store.postPut(rec);
      const back=UI.postTitle(rec);
      return {auto, named, bodyAfter, back, body, id:rec.id};
    });
    must(r.auto==='연남동 골목 안 국밥집', '자동 제목에서 # 가 안 떨어짐: '+JSON.stringify(r.auto));
    must(r.named==='웨이팅 20분짜리 국밥', '정한 제목이 안 쓰임: '+r.named);
    must(r.bodyAfter===r.body, '제목을 고쳤는데 본문이 바뀜 — 블로그에 붙여넣는 글이 달라진다');
    must(r.back===r.auto, '제목을 비웠는데 본문 첫 줄로 안 돌아감: '+r.back);
    /* ④ 목록 화면에 제목 칸이 실제로 있나 */
    await page.click('.tab-item[data-tab="posts"]'); await page.waitForTimeout(500);
    await page.evaluate((id)=>{ const row=document.querySelector('.postRow[data-id="'+id+'"]'); if(row) row.click(); }, r.id);
    await page.waitForTimeout(700);
    must((await page.locator('#poTitle').count())===1, '완성글 창에 제목 칸이 없음');
    await closeAll();
    return '자동 "'+r.auto+'" · 지정 "'+r.named+'" · 본문 그대로';
  });
  await chk('제목 후보 — AI 가 셋을 주고 고르게 한다 · 횟수는 안 깎는다', async()=>{
    await closeAll();
    const r=await page.evaluate(async()=>{
      const realFetch=window.fetch, realAuth=CFG.PROXY_AUTH;
      CFG.PROXY_AUTH=false;
      let body=null, model='';
      window.fetch=async(u,o)=>{ body=JSON.parse(o.body); model=body.model;
        return new Response(JSON.stringify({content:[{type:'text',
          text:'1. "연남동 국밥 맛집 웨이팅 후기"\n2. 연남 골목국밥 국물 진한 곳\n- 연남동 국밥 맛집 웨이팅 후기\n3. 연남동 점심 국밥 내돈내산'}],
          stop_reason:'end_turn'}),{status:200}); };
      const before=Subs.left?Subs.left('post'):null;
      let list=[], err='';
      try{ list=await ClaudeAI.generateTitles('naver', Place.current()||Place.create(), '국물이 진했어요. 웨이팅 20분.'); }
      catch(e){ err=e.message||String(e); }
      window.fetch=realFetch; CFG.PROXY_AUTH=realAuth;
      const after=Subs.left?Subs.left('post'):null;
      return {list, err, model, sys:(body&&body.system)||'', before, after};
    });
    must(!r.err, '제목 생성 실패: '+r.err);
    must(r.list.length===3, '후보가 3개가 아님: '+JSON.stringify(r.list));
    /* 모델이 번호·따옴표를 붙여도 벗겨내야 한다 */
    r.list.forEach(t=>{
      must(!/^\d+[.)]/.test(t), '번호가 안 벗겨짐: '+t);
      must(!/^["'\u201c\u2018]/.test(t), '따옴표가 안 벗겨짐: '+t);
    });
    must(new Set(r.list).size===3, '같은 제목이 중복으로 들어감: '+JSON.stringify(r.list));
    must(r.model && r.model.indexOf('haiku')>=0, '제목을 비싼 모델로 돌림: '+r.model);
    must(/검색/.test(r.sys), '검색을 노린 지침이 안 들어감');
    if(r.before!=null&&r.after!=null) must(r.before===r.after, '제목 짓기가 글쓰기 횟수를 깎음: '+r.before+'→'+r.after);
    return '후보 3개 · '+r.model+' · 횟수 안 깎임';
  });
  await chk('자동 백업 — 기록 한 건마다 폴더가 따로 생긴다', async()=>{
    const r=await page.evaluate(async()=>{
      /* 가짜 파일시스템을 끼워 넣어 '어디에 무슨 이름으로 쓰는지'만 본다.
         진짜 쓰기는 폰에서만 되므로(브라우저엔 DOCUMENTS 가 없다) 여기서 검증할 수 있는 건
         경로 규칙뿐이다 — 그런데 사고가 났던 곳이 바로 그 경로 규칙이었다. */
      const wrote=[], dirs=[];
      const fakeFS={
        mkdir: async(o)=>{ dirs.push(o.path); },
        readdir: async()=>({files:[]}),
        writeFile: async(o)=>{ wrote.push(o.path); },
        readFile: async()=>{ throw new Error('없음'); },
        rename: async()=>{ throw new Error('없음'); },
        stat: async()=>{ throw new Error('없음'); }
      };
      const CapP=window.Capacitor&&window.Capacitor.Plugins;
      const realFS=CapP&&CapP.Filesystem, realNative=window.Capacitor&&window.Capacitor.isNativePlatform;
      if(!CapP) window.Capacitor={Plugins:{}};
      window.Capacitor.Plugins.Filesystem=fakeFS;
      window.Capacitor.isNativePlatform=()=>true;
      const realB64=window.NativeFS.blobToBase64;
      window.NativeFS.blobToBase64=async()=>'AAAA';

      /* 기록 두 건 — 사진이 섞이면 안 된다 */
      const mk=(name,tag)=>{const c=document.createElement('canvas');c.width=c.height=8;
        const x=c.getContext('2d');x.fillStyle=tag;x.fillRect(0,0,8,8);return c.toDataURL('image/jpeg');};
      const made=[];
      for(const [nm,color] of [['가게하나','#111'],['가게둘','#222']]){
        const p=Place.create(); p.name=nm; p.visitedAt='2026-09-06T10:00';
        await Place.save();
        await Photos.addFromDataUrl(mk(nm,color), Place.tags(p)[0]);
        await Place.save();
        made.push({id:p.id,name:nm});
      }
      let err='';
      try { await AutoBackup.run('smoke'); } catch(e){ err=e.message||String(e); }

      window.Capacitor.Plugins.Filesystem=realFS;
      if(realNative) window.Capacitor.isNativePlatform=realNative;
      window.NativeFS.blobToBase64=realB64;
      return {wrote, dirs, err, made};
    });
    must(!r.err, '백업이 오류로 멈춤: '+r.err);
    const photoPaths=r.wrote.filter(p=>/\.jpg$/i.test(p));
    must(photoPaths.length>=2, '사진이 안 써짐: '+JSON.stringify(r.wrote));
    /* ☠️ 예전 구조: photos/ph_xxxx.jpg — 기록이 몇 건이든 한 폴더에 섞였다 */
    photoPaths.forEach(p=>{
      const rel=p.replace('jjikgo-backups/auto/photos/','');
      must(rel.indexOf('/')>0, '기록 폴더 없이 한 곳에 씀: '+p);
      must(/^\d{4}-\d{2}-\d{2}_/.test(rel), '폴더 이름이 날짜로 시작하지 않음: '+rel);
      must(/\/\d{2}_.+_ph_[a-z0-9]+\.jpg$/i.test(rel), '파일명이 순번_태그_사진id 가 아님: '+rel);
    });
    const folders=[...new Set(photoPaths.map(p=>p.split('/')[3]))];
    must(folders.length>=2, '기록 두 건인데 폴더가 '+folders.length+'개: '+JSON.stringify(folders));
    return '기록 '+folders.length+'건 → 폴더 '+folders.length+'개 · 예: '+folders[0];
  });
  /* ☠️ 2026-09-06 — 사용자 지적 "현장매니저는 사진이 움직이는데 찍고쓰다는 흐려지기만 해".
     연출이 망가져도 오류는 안 나므로, 새 사진이 실제로 화면 밖에서 들어오는지 좌표로 본다. */
  await chk('사진 넘기기 — 새 사진이 반대편에서 밀려 들어온다', async()=>{
    const r=await page.evaluate(async()=>{
      const svg=c=>'data:image/svg+xml;base64,'+btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="'+c+'"/></svg>');
      const U={s1:svg('#c0392b'),s2:svg('#2980b9'),s3:svg('#27ae60')};
      const real=Photos.url;
      Photos.url=id=>Promise.resolve(U[id]);
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const x=()=>{const im=document.querySelector('.pv-full .pvf-img');
        return im?Math.round(new DOMMatrix(getComputedStyle(im).transform).m41):null;};
      Viewer.open(['s1','s2','s3'],'s1');
      await wait(600);                        // 앞뒤 미리 읽기(warm)가 끝날 때까지
      document.querySelector('.pv-full .pvf-nav.next').click();
      await wait(120); const out=x();         // 나가는 중
      await wait(75);  const inn=x();         // 막 들어오기 시작
      await wait(280); const end=x();         // 자리 잡음
      Viewer.close();
      Photos.url=real;
      return {out,inn,end,W:window.innerWidth};
    });
    must(r.out<-40, '나가는 사진이 안 밀림 (x='+r.out+')');
    must(r.inn>r.W*0.3, '새 사진이 반대편에서 안 들어옴 — 옛날 페이드로 되돌아갔다 (x='+r.inn+')');
    must(Math.abs(r.end)<5, '제자리로 안 돌아옴 (x='+r.end+')');
    return '나감 '+r.out+'px → 들어옴 +'+r.inn+'px → 제자리 '+r.end+'px';
  });
  /* ☠️ 2026-09-06 사용자 신고: 「관리자 권한 관리」 입력칸이 시스템 버튼 뒤에 숨어 안 보였다.
     시트 하나가 아니라 '버튼줄 없는 시트' 전부의 문제였다 — 그래서 두 종류를 같이 재 본다. */
  await chk('시트 아래 여백 — 버튼줄이 없어도 시스템 버튼에 안 가린다', async()=>{
    const r=await page.evaluate(async()=>{
      document.documentElement.style.setProperty('--safe-area-inset-bottom','48px');
      const pad=ov=>{const b=ov.querySelector('.sheet-bd');
        return {bd:parseFloat(getComputedStyle(b).paddingBottom),
                ft:ov.querySelector('.sheet-ft')?parseFloat(getComputedStyle(ov.querySelector('.sheet-ft')).paddingBottom):null};};
      const a=overlay({title:'버튼줄 없음',body:'<div>x</div>'});
      const b=overlay({title:'버튼줄 있음',body:'<div>x</div>',foot:'<button class="btn">확인</button>'});
      const r={none:pad(a),withFt:pad(b)};
      a.close(); b.close();
      document.documentElement.style.removeProperty('--safe-area-inset-bottom');
      return r;
    });
    must(r.none.bd>=48, '버튼줄 없는 시트의 아래 여백이 '+r.none.bd+'px — 시스템 버튼(48px)에 가린다');
    must(r.withFt.ft>=48, '버튼줄의 아래 여백이 '+r.withFt.ft+'px');
    must(r.withFt.bd<48, '버튼줄이 있는데 본문까지 여백을 먹어 이중이 됐다 ('+r.withFt.bd+'px)');
    return '버튼줄 없음 '+r.none.bd+'px · 있음 본문'+r.withFt.bd+'px+버튼줄'+r.withFt.ft+'px';
  });
  /* ☠️ 2026-09-06 사용자 요청 "누르면 바로 구독화면" — 한 번 눌러서 열려야 한다.
     펼쳤다가 안에서 또 누르게 되돌아가면 여기서 걸린다. */
  await chk('설정 — 구독 항목을 한 번 누르면 바로 요금제 화면', async()=>{
    const r=await page.evaluate(async()=>{
      UI.switchTab('settings');
      const txt=document.getElementById('pnSettings').textContent;
      const head=[...document.querySelectorAll('#pnSettings .set-group-head')]
        .filter(e=>e.textContent.indexOf('구독 · 광고 제거')>=0)[0];
      if(!head) return {has:false};
      head.click();
      await new Promise(r=>setTimeout(r,250));
      const titles=[...document.querySelectorAll('.sheet-ti')].map(e=>e.textContent).join('|');
      const expanded=head.parentElement.classList.contains('open');
      document.querySelectorAll('.sheet-ov').forEach(e=>e.remove()); syncBodyLock();
      return {has:txt.indexOf('구독 · 광고 제거')>=0, titles, expanded};
    });
    must(r.has, '설정 첫 화면에 「구독 · 광고 제거」 항목이 없다');
    must(/구독/.test(r.titles), '한 번 눌렀는데 요금제 화면이 안 열렸다 (열린 창: "'+r.titles+'")');
    must(!r.expanded, '요금제 화면 대신 항목이 펼쳐졌다 — 두 번 눌러야 한다');
    return '한 번 눌러서 "'+r.titles+'" 열림';
  });
  await chk('광고 제거 칩 — 광고가 뜰 때만 보이고 누르면 요금제로 간다', async()=>{
    const r=await page.evaluate(async()=>{
      const realAvail=Ads.available, realShow=Ads.showBanner, realHide=Ads.hideBanner;
      let shown=0, tabs=[];
      Ads.available=()=>true;
      Ads.showBanner=()=>{shown++;return Promise.resolve();};
      Ads.hideBanner=()=>Promise.resolve();
      for(const t of ['records','now','posts','settings']){
        UI.switchTab(t);
        tabs.push(t+':'+(document.getElementById('adOff').style.display===''?'칩보임':'칩없음'));
      }
      /* 전체화면(사진 크게 보기) 동안에는 배너가 내려가야 한다 — 안 그러면 사진을 덮는다 */
      let hidden=0; Ads.hideBanner=()=>{hidden++;return Promise.resolve();};
      Viewer.open(['no-such-photo'],'no-such-photo');
      const pausedWhileOpen=hidden>0;
      Viewer.close();
      Ads.hideBanner=()=>Promise.resolve();
      document.getElementById('adOff').click();
      await new Promise(r=>setTimeout(r,200));
      const opened=[...document.querySelectorAll('.sheet-ti')].map(e=>e.textContent).join('|');
      document.querySelectorAll('.sheet-ov').forEach(e=>e.remove()); syncBodyLock();
      Ads.available=realAvail; Ads.showBanner=realShow; Ads.hideBanner=realHide;
      UI.switchTab('records');
      return {shown, tabs, opened, pausedWhileOpen};
    });
    must(r.shown>=4, '배너가 네 탭에서 다 안 떴다 ('+r.shown+'회): '+JSON.stringify(r.tabs));
    must(r.tabs.every(t=>t.endsWith('칩보임')), '광고 제거 칩이 안 보이는 탭이 있다: '+JSON.stringify(r.tabs));
    must(r.pausedWhileOpen, '사진을 크게 볼 때 배너가 안 내려간다 — 배너가 사진을 덮는다');
    must(/광고 제거/.test(r.opened), '칩을 눌렀는데 요금제 화면이 안 열렸다: '+r.opened);
    return '네 탭 모두 배너+칩 · 사진 볼 땐 내려감 · 눌러서 "'+r.opened+'" 열림';
  });
  /* ☠️ 2026-09-07 사용자 요청 — 현장매니저처럼 글 생성 진행 문구를 보여준다.
     "너무 빨리 지나가고 '거의 다 됐어요'에서 한참 기다린다"는 지적을 받은 자리다.
     검사는 runSec 을 6초로 줄여 돌린다 — 기본값 32초를 그대로 기다리면 스모크가 그만큼 길어진다.
     기본값이 32초인지는 check.js 가 따로 본다(둘을 같이 봐야 의미가 있다). */
  await chk('글 생성 진행 표시 — 문구가 앞으로만 가고 상한에서 멈춘다', async()=>{
    const r=await page.evaluate(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const msg=()=>document.querySelector('#busy .busy-msg').textContent;
      const wid=()=>parseFloat(document.querySelector('#busy .busy-bar i').style.width)||0;
      showOverlay('글 쓰는 중...');
      const stop=startBusyProgress(['하나...','둘...','셋...','거의 다 됐어요...'], {runSec:6});
      const seq=[]; const t0=performance.now();
      for(let i=0;i<60;i++){
        await wait(200);
        if(!seq.length || seq[seq.length-1]!==msg()) seq.push(msg());
        if(wid()>=92) break;
      }
      const sec=(performance.now()-t0)/1000;
      /* 상한 뒤에는 더 안 올라가고 문구도 그대로여야 한다 */
      await wait(1600);
      const after={w:wid(), m:msg()};
      stop();
      const beforeStop=wid();
      await wait(1600);
      const afterStop=wid();
      hideOverlay();
      return {seq, sec, after, beforeStop, afterStop};
    });
    must(r.seq.length===4, '문구가 '+r.seq.length+'개만 보임: '+JSON.stringify(r.seq));
    must(r.seq[0]==='하나...' && r.seq[3]==='거의 다 됐어요...', '문구 순서가 어긋남: '+JSON.stringify(r.seq));
    must(new Set(r.seq).size===4, '문구가 되돌아가 반복됨 — 가짜 진행바인 게 티가 난다: '+JSON.stringify(r.seq));
    /* runSec 이 실제로 속도를 정하는가 (6초를 줬으니 그 언저리여야 한다) */
    must(r.sec>=4 && r.sec<=11, 'runSec 6초를 줬는데 '+r.sec.toFixed(1)+'초 — 속도를 runSec 이 안 정한다');
    must(r.after.w<=92, '100%를 먼저 보여줌: '+r.after.w+'%');
    must(r.after.m==='거의 다 됐어요...', '상한 뒤에 문구가 또 바뀜: '+r.after.m);
    must(r.afterStop===r.beforeStop, 'stop() 뒤에도 타이머가 돈다: '+r.beforeStop+'% → '+r.afterStop+'%');
    return '문구 4개 · '+r.sec.toFixed(1)+'초(runSec 6) · '+r.after.w+'%에서 대기 · stop 후 멈춤';
  });
  /* ☠️ 2026-09-07 사용자 신고: "글 생성하고 나서 글 가장 아래쪽이 버튼에 가려서 일부 보이지 않음".
     시트(스크롤) 안에 스크롤 상자가 또 있어서, 시트를 끝까지 내려도 마지막 줄이 상자 높이에
     잘린 채 버튼 바로 위에서 끝났다. 실제로 긴 글을 넣고 끝까지 내려서 재 본다. */
  await chk('긴 글 — 마지막 줄이 버튼 위에서 잘리지 않는다', async()=>{
    const r=await page.evaluate(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      document.documentElement.style.setProperty('--safe-area-inset-bottom','48px');
      const LONG=Array.from({length:14},(_,i)=>'문단 '+(i+1)+'. 연남동 골목 안쪽 국밥집에 다녀왔습니다. 웨이팅은 20분쯤이었어요.').join('\n\n')
                 +'\n\n마지막 줄';
      const pl=Place.create(); pl.name='스모크 국밥'; pl.visitedAt='2026-09-07T12:00'; await Place.save();
      UI.openWriter(pl); await wait(400);
      const ta=document.querySelector('#wText');
      ta.value=LONG; ta.dispatchEvent(new Event('input'));
      document.querySelector('#wPvBtn').click();     // 생성 직후 = 사진으로 보기
      await wait(600);
      const bd=document.querySelector('.sheet-bd'), ft=document.querySelector('.sheet-ft');
      const meas=(el)=>{ bd.scrollTop=bd.scrollHeight;
        return {inner:el.scrollHeight-el.clientHeight, gap:Math.round(ft.getBoundingClientRect().top-el.getBoundingClientRect().bottom)}; };
      const pv=meas(document.querySelector('#wPv'));
      document.querySelector('#wPvBtn').click();     // 편집으로
      await wait(400);
      const te=meas(document.querySelector('#wText'));
      document.querySelectorAll('.sheet-ov').forEach(e=>e.remove()); syncBodyLock();
      document.documentElement.style.removeProperty('--safe-area-inset-bottom');
      return {pv,te};
    });
    must(r.pv.inner===0, '사진 미리보기 안에 스크롤이 또 있다 ('+r.pv.inner+'px) — 마지막 줄이 잘린다');
    must(r.te.inner===0, '편집 상자 안에 스크롤이 또 있다 ('+r.te.inner+'px) — 마지막 줄이 잘린다');
    must(r.pv.gap>=0 && r.te.gap>=0, '상자가 버튼줄 아래로 넘어갔다: 미리보기 '+r.pv.gap+'px · 편집 '+r.te.gap+'px');
    return '상자 안 스크롤 없음 · 버튼줄까지 여유 미리보기 '+r.pv.gap+'px · 편집 '+r.te.gap+'px';
  });
  /* ☠️ 2026-09-07 사용자 신고: "고치기 눌러서 수정했는데 저장이나 닫기 버튼이 없어".
     beforeClose 가 조용히 저장하고는 있었지만, 화면에 저장할 방법이 없으면 고친 게 남는지
     알 수가 없다. 버튼이 서 있고 실제로 저장되는지 둘 다 본다. */
  await chk('완성글 — 저장 버튼이 있고 눌러서 저장·닫힌다', async()=>{
    const r=await page.evaluate(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const pl=Place.create(); pl.name='스모크 국밥'; pl.visitedAt='2026-09-07T12:00'; await Place.save();
      const body='본문입니다.';
      const post={id:Store.newId('po_'), placeId:pl.id, ch:'naver', text:body, title:'',
                  createdAt:Date.now(), updatedAt:Date.now()};
      await Store.postPut(post);
      UI.switchTab('posts'); await wait(500);
      document.querySelector('.postRow').click(); await wait(700);
      const labels=[...document.querySelectorAll('.sheet-ft .btn')].map(b=>b.textContent.trim());
      const save=document.querySelector('#poSave');
      if(!save) return {labels, has:false};
      document.querySelector('#poPvBtn').click(); await wait(300);   // 글 고치기
      const ta=document.querySelector('#poText');
      ta.value=body+' 고침'; ta.dispatchEvent(new Event('input'));
      save.click(); await wait(600);
      const o=await Store.postGet(post.id);
      const closed=!document.querySelector('.sheet-ov');
      document.querySelectorAll('.sheet-ov').forEach(e=>e.remove()); syncBodyLock();
      UI.switchTab('records');
      return {labels, has:true, closed, saved:o.text};
    });
    must(r.has, '완성글 시트에 저장 버튼이 없다 — 버튼줄: '+JSON.stringify(r.labels));
    must(r.saved==='본문입니다. 고침', '저장이 안 됐다: "'+r.saved+'"');
    must(r.closed, '저장했는데 시트가 안 닫혔다 — 됐다는 표시가 없다');
    return '버튼줄 '+r.labels.join(' · ')+' · 저장 후 닫힘';
  });
  /* ★ 2026-09-07 사용자 요청: "앱 내 자체 카메라도 쓰고 설정에서 폰의 기본 카메라로도
     쓸 수 있게 선택할 수 있게" — 설정 값이 실제로 촬영 버튼의 행선지를 바꾸는지 본다.
     ☠️ 설정만 생기고 버튼이 늘 앱 카메라를 열면 조용히 무시되는 설정이 된다. */
  await chk('촬영 방식 — 설정대로 앱 카메라 / 폰 카메라가 열린다', async()=>{
    const r=await page.evaluate(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const out={def:CamMode.get()};
      const ci=document.getElementById('camPick');
      out.capture = ci ? ci.getAttribute('capture') : null;
      const pl=Place.current()||Place.create(); await Place.save();
      UI.switchTab('now'); await wait(400);
      let opened=null;
      const realOpen=window.openInAppCamera; window.openInAppCamera=()=>{opened='inapp';};
      const realClick=HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click=function(){ if(this.id==='camPick') opened='system'; else realClick.call(this); };
      /* ① 아직 안 골랐으면 처음 한 번 물어보고, 고르면 곧바로 그 카메라가 열린다 */
      try { localStorage.removeItem(CFG.k('cam_mode_v1')); } catch(e) {}
      out.askedBefore = CamMode.chosen();
      document.querySelector('#btnCam').click(); await wait(350);
      out.askOpened = !!document.querySelector('.sheet-ov');
      out.askTellsSettings = /설정 → 촬영/.test((document.querySelector('.sheet-bd')||{}).textContent||'');
      opened=null;
      const pickBtn=document.querySelector('#cmInapp');
      if(pickBtn){ pickBtn.click(); await wait(300); }
      out.askThenOpened = opened;
      out.askedAfter = CamMode.chosen();
      opened=null;
      document.querySelector('#btnCam').click(); await wait(250);
      out.askedTwice = !!document.querySelector('.sheet-ov');
      document.querySelectorAll('.sheet-ov').forEach(e=>e.remove()); syncBodyLock();
      /* ② 고른 값대로 갈라지는가 */
      CamMode.set('system'); opened=null;
      document.querySelector('#btnCam').click(); await wait(150); out.system=opened;
      CamMode.set('inapp'); opened=null;
      document.querySelector('#btnCam').click(); await wait(150); out.inapp=opened;
      HTMLInputElement.prototype.click=realClick; window.openInAppCamera=realOpen;
      if(window.closeInAppCamera) closeInAppCamera();
      return out;
    });
    must(r.def==='inapp', '기본값이 앱 카메라가 아니다: '+r.def);
    must(r.capture==='environment', '폰 카메라용 입력에 capture 가 없다 — 갤러리가 열린다');
    must(r.askedBefore===false, '아무것도 안 골랐는데 이미 고른 것으로 본다');
    must(r.askOpened, '처음 촬영인데 안 물어봤다');
    must(r.askTellsSettings, '물어보는 창에 "설정에서 바꿀 수 있다"는 안내가 없다');
    must(r.askThenOpened==='inapp', '골랐는데 그 카메라가 바로 안 열렸다 (두 번 눌러야 한다)');
    must(r.askedAfter===true, '골랐는데 저장이 안 됐다');
    must(!r.askedTwice, '두 번째 촬영에서도 또 물어본다');
    must(r.system==='system', '폰 카메라로 골랐는데 앱 카메라가 열린다');
    must(r.inapp==='inapp', '앱 카메라로 골랐는데 다른 게 열린다');
    return '처음 한 번만 물어봄 · 고른 즉시 열림 · 설정대로 갈라짐';
  });
  await chk('사진 URL 캐시에 상한이 있다', async()=>{
    const r=await page.evaluate(()=>({max:Photos.CACHE_MAX, now:Photos.cacheSize()}));
    must(typeof r.max==='number'&&r.max>0,'상한이 없음 — 사진 Blob 이 계속 쌓인다');
    must(r.now<=r.max,'이미 상한을 넘음: '+r.now+'/'+r.max);
    return '상한 '+r.max+'장 · 지금 '+r.now+'장';
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
