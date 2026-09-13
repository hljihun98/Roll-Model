const {withBrowser,preparePage,assert}=require('./browser-helper.cjs');
const fs=require('node:fs'),path=require('node:path');
withBrowser(async(browser,url)=>{
  const out=path.resolve(__dirname,'../test-results');fs.mkdirSync(out,{recursive:true});
  for(const width of [1440,430,360]){
    const {page:p,errors}=await preparePage(browser,{viewport:{width,height:900}});
    await p.goto(url);
    const position=()=>p.evaluate(()=>Object.fromEntries(['scenarioPanel','strip','verdict','heroCard','ladder','planCard'].map(id=>[id,document.getElementById(id).getBoundingClientRect().top+scrollY])));
    const initial=await position();
    assert.ok(initial.scenarioPanel<initial.strip&&initial.strip<initial.verdict);
    const split=await p.locator('.workspace-grid').evaluate(e=>getComputedStyle(e).display==='grid');
    if(split)assert.ok(Math.abs(initial.strip-initial.heroCard)<2);
    else assert.ok(initial.verdict<initial.heroCard&&initial.heroCard<initial.planCard&&initial.planCard<initial.ladder);
    assert.deepEqual(await p.locator('#strip>.cellin').evaluateAll(es=>es.map(e=>e.id)),['inputLoad','inputWheel','inputFloor','inputRun']);
    await p.click('[data-settings="Load"]');
    assert.equal(await p.locator('#settingsLoad').getAttribute('open'),'');
    assert.equal(await p.evaluate(()=>document.activeElement.parentElement.id),'settingsLoad');
    await p.click('[data-set="loadMode"] [data-v="direct"]');await p.fill('#Fdirect','6000');
    assert.equal(await p.evaluate(()=>C.Fop),6000);
    await p.click('#settingsDone');assert.equal(await p.evaluate(()=>document.activeElement.id),'verdict');
    if(width<=960){
      assert.equal(await p.locator('#rail').isVisible(),false);
      assert.ok((await position()).verdict<1100,'mobile verdict must follow compact inputs');
      await p.click('#jumpInputs');assert.equal(await p.evaluate(()=>document.activeElement.dataset.settings),'Load');
      await p.click('[data-settings="Floor"]');
      assert.equal(await p.locator('#settingsFloor').getAttribute('open'),'');
      assert.equal(await p.locator('#rail details[open]').count(),1);
      await p.click('#settingsWheel>summary');await p.waitForTimeout(50);
      assert.equal(await p.locator('#rail details[open]').count(),1);
      assert.equal(await p.locator('#settingsWheel').getAttribute('open'),'');
      await p.click('#jumpResults');
      assert.equal(await p.locator('#rail').isVisible(),false);
      assert.equal(await p.locator('.verdict-details').getAttribute('open'),null);
      await p.click('.verdict-details>summary');
      await p.fill('#sL','120');assert.equal(await p.locator('.verdict-details').getAttribute('open'),'');
    }
    // Every guide step can hand off to the real UI and resume that step.
    const design=await p.evaluate(()=>JSON.stringify({...S,mode:null,tab:null}));
    await p.click('#btnGuide');
    for(let step=0;step<6;step++){
      await p.click('#guideLocate');assert.equal(await p.locator('#startGuide').isVisible(),false);
      const target=await p.locator('.input-highlight').boundingBox();
      const header=await p.locator('.top').boundingBox();
      assert.ok(target.y>=header.height-2&&target.y<900,`guide target outside viewport at step ${step+1}: ${JSON.stringify(target)}`);
      await p.click('#btnGuide');assert.equal(await p.locator('#guideCount').textContent(),`${step+1} / 6`);
      await p.click('#guideNext');
    }
    assert.equal(await p.evaluate(()=>JSON.stringify({...S,mode:null,tab:null})),design);
    // Mode switches and viewport changes cannot leave the rail in a broken state.
    await p.click('#mEasy');assert.equal(await p.locator('#rail').isVisible(),false);
    await p.click('#mPro');assert.equal(await p.locator('#rail').isVisible(),width>960);
    await p.click('#railToggle');assert.equal(await p.locator('#rail').isVisible(),width<=960);
    await p.click('#mEasy');await p.evaluate(()=>scrollTo(0,0));
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await p.screenshot({path:path.join(out,`flow-${width}.png`),fullPage:false});
    console.log(`PASS ${width}px input/result order, load editing, guide handoff/resume, state preservation, navigation; verdict y=${Math.round(initial.verdict)}`);
    assert.equal(errors.length,0,errors.join('\n'));await p.close();
  }
}).catch(e=>{console.error(e);process.exitCode=1;});
