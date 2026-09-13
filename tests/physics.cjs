const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {source}=require('./load-engine.cjs');
const body=fs.readFileSync(path.join(__dirname,'physics-cases.js'),'utf8');
vm.runInNewContext(source+'\n'+body,{console,require,__dirname,process},{filename:'physics-cases.js'});
