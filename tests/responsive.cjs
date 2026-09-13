const {withBrowser,preparePage,assert}=require('./browser-helper.cjs');
const fs=require('node:fs'),path=require('node:path');
withBrowser(async(browser,url)=>{
  const {page,errors}=await preparePage(browser);
  await page.goto(url);
  const out=path.resolve(__dirname,'../test-results');fs.mkdirSync(out,{recursive:true});
  for(const width of [1440,1180,960,900,760,720,520,430,400]){
    await page.setViewportSize({width,height:1000});await page.waitForTimeout(220);
    const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:document.documentElement.clientWidth}));
    assert.ok(size.scroll<=size.width+2,`horizontal overflow at ${width}: ${JSON.stringify(size)}`);
    if([1440,900,430].includes(width))await page.screenshot({path:path.join(out,`layout-${width}.png`),fullPage:true});
    console.log(`PASS ${width}px: ${size.scroll}/${size.width}`);
  }
  await page.click('#mPro');
  for(const tab of ['chain','thermal','matrix','reverse','sources']){
    await page.click(`#tabs button[data-tab="${tab}"]`);
    const size=await page.evaluate(()=>({s:document.documentElement.scrollWidth,c:document.documentElement.clientWidth}));
    assert.ok(size.s<=size.c+2,`mobile ${tab} overflow: ${JSON.stringify(size)}`);
  }
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS mobile detailed tabs; zero browser errors');
}).catch(e=>{console.error(e);process.exitCode=1;});
