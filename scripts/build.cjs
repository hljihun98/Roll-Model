const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const sourceNames=['20_state.js','30_engine.js','25_validation.js','31_compute.js','50_ui.js'];
const read=name=>fs.readFileSync(path.join(root,'src',name),'utf8').replace(/\r\n/g,'\n');
function outputs(){
  const style=read('10_style.html'), body=read('40_body.html');
  const js=sourceNames.map(read).join('\n');
  new vm.Script(js,{filename:'rollmodel.js'});
  const script=`<script>\n${js}\n</script>\n`;
  const html='<!DOCTYPE html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n'+
    '<meta name="description" content="주차로봇·AGV 캐스터 접촉압, 도막 손상, 발열 설계 스크리닝">\n'+
    '<style>html,body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n'+
    style+'</head>\n<body>\n'+body+script+'</body>\n</html>\n';
  return {'index.html':html,'dist/index.html':html,'dist/standalone.html':html,
    'dist/artifact.html':style+body+script,'dist/.nojekyll':''};
}
function build(check=false){
  const files=outputs();
  if(check){
    const current=fs.existsSync(path.join(root,'index.html'))?fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n/g,'\n'):'';
    if(current!==files['index.html']) throw new Error('index.html이 소스와 다릅니다. npm run build 후 함께 커밋하십시오.');
    console.log('index.html matches src/');
  }else{
    for(const [file,data] of Object.entries(files)){
      const target=path.join(root,file); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,data,'utf8');
    }
    console.log('Built index.html and dist/ (offline standalone + artifact)');
  }
}
if(require.main===module){try{build(process.argv.includes('--check'));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={root,sourceNames,outputs,build};
