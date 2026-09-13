const {withBrowser,preparePage,assert}=require('./browser-helper.cjs');
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
withBrowser(async(browser,url)=>{
  const {page:p,errors}=await preparePage(browser);
  await p.goto(url);await p.click('#mPro');
  await p.evaluate(()=>document.querySelectorAll('.grp').forEach(d=>d.open=true));
  await p.click('[data-set="loadMode"] button[data-v="direct"]');await p.fill('#Fdirect','6000');
  assert.deepEqual(await p.evaluate(()=>[C.kSeff,C.Fop,C.Fpk]),[1,6000,6000]);
  console.log('PASS direct load / automatic impact');

  const pressureArrow=()=>p.evaluate(()=>{
    const line=document.querySelector('[data-pressure-arrows] [data-position="0"]');
    return {length:+line.getAttribute('y2')-+line.getAttribute('y1'),pressure:+line.dataset.pressure,
      scale:+line.parentNode.dataset.scale,F:C.Fpk,p:C.r.pmax,depth:+document.querySelector('[data-detail-floor]').getAttribute('height')};
  });
  await p.fill('#Lr','40');const narrow=await pressureArrow();
  await p.fill('#Lr','120');const wide=await pressureArrow();
  assert.equal(wide.F,narrow.F);assert.equal(wide.scale,narrow.scale);
  assert.ok(wide.pressure<narrow.pressure);assert.ok(wide.length<narrow.length);
  assert.ok(Math.abs(wide.length/narrow.length-wide.pressure/narrow.pressure)<1e-8);
  assert.equal(wide.depth,114);assert.equal(wide.pressure,wide.p);
  console.log('PASS width changes pressure arrows at fixed load and scale; substrate height halved');

  await p.selectOption('#sWPre','pa6');await p.fill('#sD','150');await p.fill('#sL','60');await p.fill('#crown','120');
  const flat=await p.evaluate(()=>({p:C.r.pmax,kind:C.r.kind,expr:C.G.pSurf.rat.expr,model:C.G.model.s}));
  assert.equal(flat.kind,'ellipse');assert.equal(flat.model,'bad');assert.match(flat.expr,/3F/);
  assert.equal(await p.locator('#figPlan ellipse').count(),1);
  assert.match(await p.locator('#planTag').textContent(),/a\/b/);
  assert.match(await p.locator('#figPlan').textContent(),/2a =/);
  await p.fill('#R2','100');assert.ok(await p.evaluate(()=>C.r.pmax)>flat.p);
  await p.fill('#R2','0');await p.fill('#crown','0');
  console.log('PASS crown curvature and rationale');

  await p.selectOption('#sFPre','bare');await p.fill('#fck','50');
  assert.equal(Number(await p.inputValue('#fE')),Math.round(4700*Math.sqrt(50)));
  await p.fill('#fck','30');
  await p.fill('#SF','0');
  assert.equal(await p.evaluate(()=>C),null);assert.equal(await p.locator('#results').textContent(),'');
  assert.equal(await p.locator('#figPlan svg').count(),0);assert.equal(await p.locator('#btnSvg').isDisabled(),true);
  await p.fill('#SF','1.5');assert.equal(await p.locator('#btnSvg').isDisabled(),false);
  await p.fill('#SF','');assert.equal(await p.evaluate(()=>C),null);await p.fill('#SF','1.5');
  console.log('PASS invalid/empty input clears stale output and recovers');

  await p.click('#tabs button[data-tab="thermal"]');await p.selectOption('#scen','park_suv');
  assert.deepEqual(await p.evaluate(()=>[S.mode,S.tab,document.body.dataset.mode]),['pro','thermal','pro']);
  await p.fill('#calF','4415');assert.equal(await p.evaluate(()=>document.activeElement.id),'calF');
  await p.click('#btnCal');const scale=await p.evaluate(()=>S.rthScale);
  await p.click('#btnCal');assert.equal(await p.evaluate(()=>S.rthScale),scale);
  await p.fill('#calF','0');assert.equal(await p.evaluate(()=>C),null);
  await p.fill('#calF','4415');assert.ok(await p.evaluate(()=>C.ok));
  console.log('PASS scenario keeps mode/tab; calibration is repeatable with focus preserved');

  await p.click('#tabs button[data-tab="matrix"]');
  const downloadPromise=p.waitForEvent('download');await p.click('#btnJson');
  const download=await downloadPromise,stream=await download.createReadStream();let json='';for await(const chunk of stream)json+=chunk;
  const saved=JSON.parse(json);assert.equal(saved.mode,'pro');assert.equal(saved.tab,'matrix');
  await p.click('#mEasy');
  await p.setInputFiles('#fileImp',{name:'settings.json',mimeType:'application/json',buffer:Buffer.from(json)});
  await p.waitForFunction(()=>S.mode==='pro'&&S.tab==='matrix');
  assert.equal(await p.locator('#viewMatrix').isVisible(),true);
  let before=await p.evaluate(()=>JSON.stringify(S));
  const dialogPromise=p.waitForEvent('dialog').then(async d=>{assert.match(d.message(),/SF/);await d.accept();});
  await p.setInputFiles('#fileImp',{name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...saved,SF:0}))});
  await dialogPromise;assert.equal(await p.evaluate(()=>JSON.stringify(S)),before);
  console.log('PASS actual JSON download/import and atomic rejection');

  const csvPromise=p.waitForEvent('download');await p.click('#btnCsv');
  const csvDownload=await csvPromise,csvStream=await csvDownload.createReadStream();let csv='';for await(const chunk of csvStream)csv+=chunk;
  assert.equal(csv.trim().split('\n').length,32);
  console.log('PASS 30-combination CSV download');

  await p.click('#tabs button[data-tab="chain"]');
  await p.evaluate(()=>{
    S={...DEFAULTS,Wtare:50,Wload:50,nRow:2,nCol:2,ex:2000,ey:0,ax:0,ay:0,D:400,L:200,wT:30,fT:0,v:0,maneuver:'manual',muMan:0,mode:'pro'};
    syncInputs();render();
  });
  assert.equal(await p.locator('#verdict').getAttribute('data-s'),'bad');
  assert.equal(await p.evaluate(()=>C.G.load.s),'bad');
  await p.evaluate(()=>{S.ex=0;S.Tamb=100;syncInputs();render();});
  assert.equal(await p.evaluate(()=>C.G.therm.s),'bad');assert.equal(await p.evaluate(()=>C.Fth),0);
  console.log('PASS lift and hot stationary condition fail in visible verdict');

  await p.selectOption('#scen','park_sedan');
  const svgPromise=p.waitForEvent('download');await p.click('#btnSvg');
  const svgDownload=await svgPromise,svgStream=await svgDownload.createReadStream();let svg='';for await(const chunk of svgStream)svg+=chunk;
  assert.ok(svg.includes('<svg'));assert.ok(!svg.includes('var(--'));
  const local=await preparePage(browser);
  await local.page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  assert.ok(await local.page.evaluate(()=>C&&C.ok));
  assert.equal(local.errors.length,0,local.errors.join('\n'));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS standalone file and SVG export; zero browser errors');
}).catch(e=>{console.error(e);process.exitCode=1;});
