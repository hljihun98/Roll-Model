const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {outputs,root}=require('../scripts/build.cjs');
const {createServer}=require('../scripts/serve.cjs');
test('build is deterministic and committed entry matches source',()=>{
  const a=outputs(),b=outputs();assert.deepEqual(a,b);
  assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n/g,'\n'),a['index.html']);
  assert.match(a['index.html'],/^<!DOCTYPE html>/);
  assert.ok(!/<script[^>]+src=/.test(a['index.html']));
  cp.execFileSync(process.execPath,[path.join(root,'scripts/build.cjs'),'--check'],{cwd:os.tmpdir()});
});
test('site works under a GitHub repository subpath and excludes source files',async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const base=`http://127.0.0.1:${server.address().port}`;
    for(const url of ['/','/rollmodel/','/rollmodel/index.html']){
      const res=await fetch(base+url);assert.equal(res.status,200);assert.match(await res.text(),/ROLLMODEL/);
    }
    assert.equal((await fetch(base+'/src/20_state.js')).status,404);
    assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
