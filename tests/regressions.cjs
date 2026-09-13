const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {loadEngine,source}=require('./load-engine.cjs');
const e=loadEngine();
const mk=(p={})=>Object.assign({...e.DEFAULTS},p);
const run=p=>e.compute(mk(p));
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);

test('invalid input is rejected, including imported JSON types and enums',()=>{
  for(const p of [{SF:0},{SF:-2},{SF:0.9},{D:0},{L:0},{v:-1},{duty:2},{duty:-1},{wT:999},
    {edgeR:40},{nRow:0},{nCol:1.5},{nRow:1e6},{wE:Infinity},{wE:NaN},{wE:'15'},
    {wPre:'unknown'},{fPre:'__proto__'},{mode:'unknown'},{tab:'wrong'},{R2:-10},
    {Tamb:-274},{hNat:0,hVel:0,UAhub:0},{bearingAreaRatio:5},{brW:0.5,brF:0.2}]){
    assert.ok(!run(p).ok,JSON.stringify(p));
    assert.throws(()=>e.importState({...mk(),...p}));
  }
  for(const value of [null,[],42])assert.throws(()=>e.importState(value));
  assert.ok(!e.compute(null).ok);
});
const support={Wtare:50,Wload:50,nRow:2,nCol:2,ex:2000,ey:0,ax:0,ay:0,D:400,L:200,wT:30,fT:0,v:0,maneuver:'manual',muMan:0};
test('lift and unsupported moments cannot pass or generate false fixes',()=>{
  for(const p of [support,{...support,nRow:1,ex:300},{...support,nCol:1,ex:0,ey:300}]){
    const c=run(p); assert.equal(c.worst,'bad');assert.equal(c.G.load.s,'bad');assert.equal(c.driver.id,'load');
  }
  assert.notEqual(run({...support,ex:0}).G.load.s,'bad');
  const sg=e.suggest(mk(support));assert.equal(sg.items.length,0);assert.equal(sg.scale,null);
});
const crown={wPre:'pa6',wE:2800,wNu:.39,wT:0,D:150,L:60,crown:120};
test('crown uses longitudinal floor curvature and correct displayed equation',()=>{
  const flat=run(crown),convex=run({...crown,R2:100}),concave=run({...crown,R2:-1000});
  for(const c of [flat,convex,concave]){
    assert.equal(c.r.kind,'ellipse');near(c.r.pmax,3*c.Fpk/(2*Math.PI*c.r.a*c.r.b));
    assert.match(c.G.pSurf.rat.expr,/3F/);near(c.r.pmax/c.r.pavg,1.5);
    assert.equal(c.G.model.s,'bad');assert.equal(c.worst,'bad');
  }
  assert.ok(convex.r.pmax>flat.r.pmax);assert.ok(concave.r.pmax<flat.r.pmax);
});
test('swapping principal curvature directions swaps ellipse axes',()=>{
  const I={D:200,crown:20,L:1000,F:1000,E1:210000,nu1:.3,tread:0,E2:210000,nu2:.3,t2:0,Esub:210000,nuSub:.3,R2:0,confine:false,layer:false,kGent:1};
  const a=e.solveEllipse(I),b=e.solveEllipse({...I,D:40,crown:100});
  near(a.a,b.b);near(a.b,b.a);near(a.pmax,b.pmax);assert.ok(a.b>a.a);
});
test('layer comparison selects higher reduced modulus without a thickness fit',()=>{
  const coated=run({layer:false}),compare=run({layer:true});
  assert.ok(compare.r.pmax>=coated.r.pmax);assert.equal(compare.G.model.s,'warn');
  near(run({layer:true,fT:0.01}).r.pmax,run({layer:true,fT:50}).r.pmax);
  assert.equal(run({fT:0}).G.model.s,'ok');
  assert.ok(!source.includes('Math.exp(-1.2'));
});
test('ambient above limit fails at rest and offers no thermal capacity',()=>{
  for(const v of [0,1]){
    const c=run({Tamb:100,v});assert.equal(c.G.therm.s,'bad');assert.equal(c.Fth,0);
    assert.equal(e.calibrate(mk({Tamb:100,v})),null);
  }
  assert.equal(run({Tamb:70,v:0}).G.therm.s,'ok');
  assert.equal(run({Tamb:70,v:1}).Fth,0);
  assert.equal(e.calibrate(mk({wAlpha:0})),null);
});
test('thermal calibration is absolute and reaches rating temperature',()=>{
  const a=e.calibrate(mk()),b=e.calibrate(mk({rthScale:4}));near(a.scale,b.scale);
  near(e.computeCore({...a.T,rthScale:a.scale}).th.T,mk().wTmax,1e-6);
});
test('impact upper clamp cannot hide an out-of-range impact',()=>{
  const c=run({v:3,etaImp:1,impactMax:1});assert.ok(c.imp.phi>1);assert.equal(c.G.load.s,'bad');assert.equal(c.worst,'bad');
});
test('concrete bearing uses the declared bearing area ratio',()=>{
  near(e.concreteBearing(mk()),.85*30);
  near(e.concreteBearing(mk({bearingAreaRatio:4})),1.7*30);
});
test('engine preserves input state and exports/imports preserve outcomes',()=>{
  for(const sc of Object.values(e.SCENARIOS)){
    const s=mk();e.applyWheel(s,sc.p.wPre);e.applyFloor(s,sc.p.fPre);Object.assign(s,sc.p);
    const before=JSON.stringify(s),a=e.compute(s),b=e.compute(e.importState(JSON.parse(before)));
    assert.equal(JSON.stringify(s),before);assert.equal(a.worst,b.worst);near(a.r.pmax,b.r.pmax);
    assert.ok(a.gates.every(g=>g.why&&g.rat.expr&&g.rat.subs&&g.rat.src&&g.rat.note));
  }
});
test('a failing legacy assertion sets a failing process exit code',()=>{
  const body=fs.readFileSync(path.join(__dirname,'physics-cases.js'),'utf8');
  const header=body.slice(0,body.indexOf("console.log('\\n"));
  const footer=body.slice(body.lastIndexOf('process.exitCode='));
  const mock={exitCode:0};vm.runInNewContext(header+"\nok('forced failure',false);\n"+footer,{process:mock,console:{log(){}}});
  assert.equal(mock.exitCode,1);
});
