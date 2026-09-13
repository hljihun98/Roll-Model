const {withBrowser,preparePage,assert}=require('./browser-helper.cjs');
const path=require('node:path'),fs=require('node:fs');
withBrowser(async(browser,url)=>{
  const {page:p,errors}=await preparePage(browser,{showGuide:true});
  await p.goto(url);
  assert.equal(await p.locator('#startGuide').isVisible(),true);
  assert.equal(await p.locator('#guidePrev').isDisabled(),true);
  assert.equal(await p.locator('#startGuide').evaluate(d=>d.classList.contains('guide-paused')),true);
  await p.click('#guideMotion');assert.equal(await p.locator('#guideMotion').getAttribute('aria-pressed'),'true');
  await p.click('#guideMotion');assert.equal(await p.locator('#guideMotion').getAttribute('aria-pressed'),'false');
  for(let i=0;i<12;i++){await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.querySelector('#startGuide').contains(document.activeElement)),true);}
  const state=await p.evaluate(()=>JSON.stringify(S));
  await p.click('#guideNext');await p.click('#guideNext');
  const before=await p.locator('#guideResults b').first().textContent();
  await p.locator('#guideChoices button').nth(1).click();
  const after=await p.locator('#guideResults b').first().textContent();assert.notEqual(before,after);
  assert.equal(await p.evaluate(()=>JSON.stringify(S)),state);
  await p.click('#guidePrev');assert.equal(await p.locator('#guideCount').textContent(),'2 / 6');
  await p.click('#guideSkip');assert.equal(await p.locator('#startGuide').isVisible(),false);
  await p.reload();assert.equal(await p.locator('#startGuide').isVisible(),false);
  await p.click('#btnGuide');assert.equal(await p.locator('#guideCount').textContent(),'1 / 6');
  for(let i=0;i<5;i++)await p.click('#guideNext');
  await p.click('#guideNext');assert.equal(await p.locator('#startGuide').isVisible(),false);
  assert.equal(await p.evaluate(()=>document.activeElement.id),'btnGuide');
  await p.click('#btnGuide');await p.keyboard.press('Escape');assert.equal(await p.locator('#startGuide').isVisible(),false);
  console.log('PASS first visit, skip persistence, replay, back/next, finish, Escape, reduced motion, state isolation');
  const out=path.resolve(__dirname,'../test-results');fs.mkdirSync(out,{recursive:true});
  for(const width of [1440,900,430,360]){
    await p.setViewportSize({width,height:800});await p.click('#btnGuide');
    const box=await p.locator('#startGuide').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=801);
    const noOverflow=await p.locator('#startGuide').evaluate(d=>d.scrollWidth<=d.clientWidth+1);assert.ok(noOverflow);
    await p.screenshot({path:path.join(out,`guide-${width}.png`)});
    await p.keyboard.press('Escape');
  }
  const blocked=await preparePage(browser,{showGuide:true});
  await blocked.page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage blocked');}});});
  await blocked.page.goto(url);await blocked.page.click('#guideSkip');await blocked.page.click('#btnGuide');await blocked.page.keyboard.press('Escape');
  assert.ok(await blocked.page.evaluate(()=>C.ok));assert.equal(blocked.errors.length,0);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS responsive guide and unavailable storage fallback; zero browser errors');
}).catch(e=>{console.error(e);process.exitCode=1;});
