const {withBrowser,preparePage,assert}=require('./browser-helper.cjs');
const path=require('node:path');
withBrowser(async(browser,url)=>{
  const {page:p,errors}=await preparePage(browser);
  await p.goto(url);
  for(const width of [2560,1920,1440,1180,1000,900,430,360]){
    await p.setViewportSize({width,height:900});await p.waitForTimeout(220);
    for(const mode of ['easy','pro']){
      await p.click(mode==='easy'?'#mEasy':'#mPro');await p.evaluate(()=>scrollTo(0,0));
      const boxes=await p.evaluate(()=>{
        const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
        return {main:rect('.workspace-grid'),input:rect('#strip'),section:rect('#heroCard'),plan:rect('#planCard'),sectionSvg:rect('#figSection svg'),planSvg:rect('#figPlan svg'),overflow:document.documentElement.scrollWidth>innerWidth+1};
      });
      assert.equal(boxes.overflow,false,`${width}/${mode} overflow`);
      if(boxes.main.width>=960){
        assert.ok(boxes.section.x>=boxes.input.x+boxes.input.width);
        assert.ok(Math.abs(boxes.section.y-boxes.input.y)<2);
        assert.ok(boxes.plan.y>boxes.section.y&&Math.abs(boxes.plan.x-boxes.section.x)<2);
      }else assert.ok(boxes.section.y>boxes.input.y+boxes.input.height);
      assert.ok(boxes.sectionSvg.height<=341&&boxes.planSvg.height<=231);
      assert.equal(await p.locator('.stress-figures').isVisible(),mode==='pro');
      if(mode==='pro'){
        for(const id of ['figDepth','figSurf']){
          assert.equal(await p.locator(`.visual-column #${id} svg`).count(),1);
          const stress=await p.locator(`#${id} svg`).boundingBox();assert.ok(stress.height<=261);
          if(boxes.main.width>=960)assert.ok(stress.x>=boxes.input.x+boxes.input.width);
        }
      }
    }
    console.log(`PASS ${width}px split/stack layout, bounded drawings, both modes, no overflow`);
  }
  for(const width of [1440,430]){
    await p.setViewportSize({width,height:900});await p.click('#mEasy');
    for(const id of ['figSection','figPlan','figDepth','figSurf']){
      if(id==='figDepth')await p.click('#mPro');
      const trigger=p.locator(`[data-enlarge="${id}"]`);await trigger.click();
      assert.equal(await p.locator('#figureDialog').isVisible(),true);
      const large=await p.locator('#largeFigure svg').boundingBox();assert.ok(large.width>=800);
      assert.ok(await p.locator('#largeFigure svg').getAttribute('aria-label'));
      assert.equal(await p.locator('#figureDialogTitle').textContent(),await trigger.getAttribute('aria-label'));
      assert.equal(await p.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.length===new Set(ids).size;}),true,'zoom must not duplicate SVG IDs');
      for(let i=0;i<4;i++){await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.querySelector('#figureDialog').contains(document.activeElement)),true);}
      if(id==='figSection')await p.keyboard.press('Escape');else await p.click('#closeFigure');
      assert.equal(await p.locator('#figureDialog').isVisible(),false);
      assert.equal(await trigger.evaluate(e=>e===document.activeElement),true);
    }
    await p.locator('#heroCard .figure-notes>summary').click();assert.equal(await p.locator('#figLegend').isVisible(),true);
    await p.locator('#heroCard .figure-notes>summary').click();
    await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.resolve(__dirname,`../test-results/visual-final-${width}.png`)});
  }
  await p.click('[data-settings="Load"]');await p.click('[data-set="loadMode"] [data-v="direct"]');await p.fill('#Fdirect','');
  assert.equal(await p.locator('[data-enlarge="figSection"]').isDisabled(),true);
  await p.fill('#Fdirect','6000');assert.equal(await p.locator('[data-enlarge="figSection"]').isDisabled(),false);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS enlarged diagrams, unique gradient IDs, keyboard/close/focus, notes, invalid input recovery');
}).catch(e=>{console.error(e);process.exitCode=1;});
