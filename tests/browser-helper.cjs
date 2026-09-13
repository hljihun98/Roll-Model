const {chromium}=require('playwright');
const {createServer}=require('../scripts/serve.cjs');
const assert=require('node:assert/strict');
async function withBrowser(run){
  const server=createServer(); let browser;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{});
    await run(browser,`http://127.0.0.1:${server.address().port}/rollmodel/`);
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
async function preparePage(browser,options={}){
  const page=await browser.newPage({viewport:{width:1400,height:1000},reducedMotion:'reduce',...options});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1'||url.protocol==='file:')return route.continue();
    return route.fulfill({status:200,body:'',contentType:'text/css'});
  });
  return {page,errors};
}
module.exports={withBrowser,preparePage,assert};
