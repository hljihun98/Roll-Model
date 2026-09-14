const {withBrowser,preparePage,assert}=require('./browser-helper.cjs');
const fs=require('node:fs');
withBrowser(async(browser,url)=>{
  const {page:p,errors}=await preparePage(browser);
  await p.goto(url);
  // 기본 모드: 필수 입력만 바로 보이고 상세·전문가 입력은 숨긴다.
  for(const id of ['#Wtare','#Wload','#nRow','#nCol','#wb','#tr','#sWPre','#D','#L','#sFPre','#v']) assert.equal(await p.locator(id).isVisible(),true,id);
  for(const id of ['#hcg','#ax','#K0','#hNat']) assert.equal(await p.locator(id).isVisible(),false,id);
  assert.equal(await p.locator('#strip [data-k="D"] .imp').textContent(),'매우 큼');
  assert.equal(await p.locator('#strip [data-srctag="D"]').textContent(),'기본');
  assert.equal(await p.locator('#quality .grade').textContent(),'D');
  await p.fill('#D','250');
  assert.deepEqual(await p.evaluate(()=>[S.D,VSRC.D]),[250,'user']);
  assert.equal(await p.locator('#strip [data-srctag="D"]').textContent(),'입력');
  assert.equal(await p.evaluate(()=>+document.querySelector('#sD').value),250);
  console.log('PASS basic mode shows only required inputs with impact and source tags');

  // 필수 입력 누락은 계산 중단, 상세 입력 누락은 기본값 사용 안내, 전문가 입력 누락은 조용히 기본값
  await p.fill('#Wload','');
  assert.equal(await p.evaluate(()=>C),null);
  assert.match(await p.locator('#verdict').textContent(),/필수 입력[\s\S]*"적재하중 \(차량\)" 값을 입력하세요/);
  assert.equal(await p.locator('#quality').isHidden(),true);
  await p.fill('#Wload','1600');assert.ok(await p.evaluate(()=>C.ok));
  await p.click('#mPro');
  assert.equal(await p.locator('#rail details.expert[open]').count(),0);
  await p.fill('#hcg','');
  assert.deepEqual(await p.evaluate(()=>[S.hcg,VSRC.hcg,!!C]),[400,'default',true]);
  assert.match(await p.locator('#quality').textContent(),/무게중심 높이 h_cg 값이 입력되지 않아 기본값\(400 mm\)을 사용했습니다/);
  await p.evaluate(()=>document.querySelector('#expertThermal').open=true);
  await p.fill('#hNat','');assert.deepEqual(await p.evaluate(()=>[S.hNat,VSRC.hNat]),[8,'default']);
  assert.doesNotMatch(await p.locator('#quality').textContent(),/대류계수/);
  console.log('PASS missing required stops calculation; blank detail uses a noted default; blank expert is silent');

  // 도움말에서 값 출처 지정 · 기본값 복귀
  await p.click('#rail [data-help="wE"]');
  assert.equal(await p.locator('#help-wE').isVisible(),true);
  assert.match(await p.locator('#help-wE').textContent(),/제조사 물성/);
  await p.selectOption('#help-wE [data-srcsel]','manufacturer');
  assert.equal(await p.locator('#rail [data-srctag="wE"]').textContent(),'제조사');
  await p.fill('#wE','22');assert.equal(await p.evaluate(()=>VSRC.wE),'manufacturer');
  await p.click('#help-wE [data-reset]');assert.deepEqual(await p.evaluate(()=>[S.wE,VSRC.wE]),[15,'default']);
  console.log('PASS help sets value source and resets to the preset default');

  // 신뢰도 · 민감도
  await p.waitForSelector('#quality .sens li',{state:'attached'});
  await p.locator('.quality-details>summary').click();
  assert.ok(await p.locator('#quality .sens li').count()>=3);
  assert.match(await p.locator('#quality .sens').textContent(),/10% → [\s\S]*p_max/);
  await p.evaluate(()=>{for(const k of Object.keys(INPUTS)) if(INPUTS[k].t==='req') VSRC[k]='user'; render();});
  assert.notEqual(await p.locator('#quality .grade').textContent(),'D');
  await p.locator('#quality [data-goto]').first().click();
  assert.equal(await p.locator('.input-highlight').count(),1);
  // 신뢰도 카드의 모든 입력 칩은 실제 입력 위치로 이동할 수 있어야 한다
  const unreachable=await p.evaluate(()=>Object.keys(INPUTS).filter(k=>!document.querySelector('#strip [data-k="'+k+'"],#rail [data-k="'+k+'"]')));
  assert.deepEqual(unreachable,['liftedWheel','rthScale']); // 비접지 바퀴는 접지 조건 아래, 열 보정계수는 열 탭에 있다
  console.log('PASS confidence grade reacts to sources; top sensitivities and input navigation');

  // 저장 파일에 값 출처 포함 · 불러오기 복원
  const download=p.waitForEvent('download');await p.click('#btnJson');
  const saved=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
  assert.equal(saved._sources.D,'user');assert.equal(saved._sources.wE,'default');
  await p.selectOption('#scen','agv');assert.equal(await p.evaluate(()=>VSRC.D),'default');
  await p.setInputFiles('#fileImp',{name:'s.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
  await p.waitForFunction(()=>VSRC.D==='user'&&S.D===250);
  console.log('PASS value sources round-trip through settings files; scenarios reset to defaults');

  // 개선안: 주요 경로 3개 우선, 나머지는 접힘
  await p.selectOption('#scen','agv');await p.waitForSelector('#fixes .fix');
  const main=await p.locator('#fixes > .fix-main > .fix').count();assert.ok(main>=1&&main<=3);
  const keys=await p.locator('#fixes .fix').evaluateAll(b=>b.map(x=>x.dataset.k||'scale'));
  const primary=['L','D','Wload','Fdirect','scale'];
  const firstSecondary=keys.findIndex(k=>!primary.includes(k));
  if(firstSecondary>=0) assert.ok(keys.slice(firstSecondary).every(k=>!primary.includes(k)),keys.join());
  if(keys.length>3) assert.equal(await p.locator('#fixes .fix-more').count(),1);
  console.log(`PASS fixes ordered by design priority: ${keys.join(' → ')}`);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.equal(errors.length,0,errors.join('\n'));
}).catch(e=>{console.error(e);process.exitCode=1;});
