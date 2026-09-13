const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function createServer(){
  return http.createServer((req,res)=>{
    let pathname;
    try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const name=pathname.endsWith('/')||pathname.endsWith('/index.html')?'index.html':pathname==='/standalone.html'?'dist/standalone.html':null;
    if(!name){res.writeHead(404);res.end('Not found');return;}
    fs.readFile(path.join(root,name),(err,data)=>{
      if(err){res.writeHead(404);res.end('Run npm run build first');return;}
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
      res.end(req.method==='HEAD'?undefined:data);
    });
  });
}
if(require.main===module){
  const server=createServer(); const port=Number(process.env.PORT||4173);
  server.on('error',e=>{console.error(e.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`ROLLMODEL http://127.0.0.1:${server.address().port}`));
}
module.exports={createServer};
