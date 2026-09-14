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

test('default layout is four wheels and old imports retain their layout',()=>{
  assert.equal(e.DEFAULTS.nRow,2);assert.equal(e.DEFAULTS.nCol,2);
  const old=mk({nRow:4});delete old.supportMode;delete old.liftedWheel;
  const imported=e.importState(old);
  assert.equal(imported.nRow,4);assert.equal(imported.supportMode,'all');
});
test('three-point reactions satisfy force and both moments for every missing corner',()=>{
  for(let missing=0;missing<4;missing++)for(const [wb,tr] of [[2600,1400],[1e-3,1e6]]){
    const coords=[[-wb/2,-tr/2],[-wb/2,tr/2],[wb/2,-tr/2],[wb/2,tr/2]];
    const active=coords.map((_,i)=>i).filter(i=>i!==missing);
    for(const weights of [[.2,.3,.5],[1/3,1/3,1/3],[.01,.89,.1]]){
      const ex=active.reduce((v,i,j)=>v+coords[i][0]*weights[j],0);
      const ey=active.reduce((v,i,j)=>v+coords[i][1]*weights[j],0);
      const s=mk({supportMode:'three',liftedWheel:missing,wb,tr,ex,ey,ax:0,ay:0,kSauto:false,kS:1});
      const c=e.compute(s),lc=c.LC;assert.ok(c.ok);
      assert.equal(lc.fractions[missing],0);assert.equal(lc.supportCount,3);
      active.forEach((i,j)=>near(lc.fractions[i],weights[j]));
      near(lc.fractions.reduce((a,r)=>a+r,0),1);
      near(lc.fractions.reduce((a,r,i)=>a+r*coords[i][0]/wb,0),ex/wb);
      near(lc.fractions.reduce((a,r,i)=>a+r*coords[i][1]/tr,0),ey/tr);
      near(lc.Fop,(s.Wtare+s.Wload)*s.g*Math.max(...weights));
      near(e.compute({...s,k3:3}).Fop,lc.Fop);
      assert.equal(c.G.load.s,'ok');
      near(e.compute(e.importState(JSON.parse(JSON.stringify(s)))).Fop,c.Fop);
    }
  }
});
test('three-point center is a two-reaction boundary, outside is rejected, acceleration moves reactions',()=>{
  const s={supportMode:'three',liftedWheel:0,ex:0,ey:0,ax:0,ay:0,kSauto:false,kS:1};
  const center=run(s);near(center.LC.fracMax,.5);assert.equal(center.G.load.s,'warn');
  const outside=run({...s,ex:-500,ey:-300});assert.equal(outside.G.load.s,'bad');assert.equal(outside.worst,'bad');
  assert.ok(outside.LC.fracMin<0);assert.equal(e.suggest(mk({...s,ex:-500,ey:-300})).items.length,0);
  const dynamic=run({...s,ex:100,ey:100,ax:1,ay:.5});
  const equivalent=run({...s,ex:100+400/9.81,ey:100+200/9.81});
  dynamic.LC.fractions.forEach((r,i)=>near(r,equivalent.LC.fractions[i]));
  assert.equal(dynamic.G.load.s,'ok');
});
test('invalid support selections cannot enter the engine or imported settings',()=>{
  for(const p of [{supportMode:'invalid'},{liftedWheel:4},{liftedWheel:-1},{liftedWheel:1.5},{liftedWheel:'0'},
    {supportMode:'three',nRow:4},{supportMode:'three',nCol:1}]){
    assert.ok(!run(p).ok);assert.throws(()=>e.importState(mk(p)));
  }
  near(run({loadMode:'direct',supportMode:'three',nRow:4,Fdirect:6000}).Fop,6000);
});

/* 3점 접지 로봇: 전후 틸팅 구동부 2개 + 전후 중앙의 캐스터 1개(구동부 축선에서 좌우 tr) */
test('drive-unit/caster triangle satisfies statics with the centroid as origin',()=>{
  const base={supportMode:'tri',nRow:3,nCol:1,wb:1800,tr:900,ax:0,ay:0,kSauto:false,kS:1};
  const center=run({...base,ex:0,ey:0});assert.ok(center.ok);
  assert.equal(center.LC.supportCount,3);assert.equal(center.LC.grid.tri,true);
  center.LC.fractions.forEach(r=>near(r,1/3));near(center.Fop,(center.LC.W*9.81)/3);
  assert.equal(center.G.load.s,'ok');assert.equal(center.LC.flatFactor,1);
  near(run({...base,ex:0,ey:0,k3:3}).Fop,center.Fop);
  const xs=[-900,900,0],ys=[-300,-300,600];
  for(const [ex,ey] of [[200,100],[-400,-150],[0,500],[850,-290]]){
    const c=run({...base,ex,ey}),fr=c.LC.fractions;
    near(fr.reduce((a,r)=>a+r,0),1);near(fr.reduce((a,r,i)=>a+r*xs[i],0),ex);near(fr.reduce((a,r,i)=>a+r*ys[i],0),ey);
  }
  const edge=run({...base,ex:0,ey:-300});assert.equal(edge.G.load.s,'warn');near(edge.LC.fractions[2],0,1e-9);
  const out=run({...base,ex:0,ey:-400});assert.equal(out.G.load.s,'bad');assert.ok(out.LC.fracMin<0);
  const dyn=run({...base,ex:0,ey:100,ay:1,hcg:500}),eq=run({...base,ex:0,ey:100+500/9.81});
  dyn.LC.fractions.forEach((r,i)=>near(r,eq.LC.fractions[i]));
  const s=mk({...base,ex:120,ey:60});near(e.compute(e.importState(JSON.parse(JSON.stringify(s)))).Fop,e.compute(s).Fop);
  assert.ok(!e.inputRelevant('nRow',s)&&!e.inputRelevant('k3',s)&&e.inputRelevant('wb',s));
});

/* 입력 중요도 · 값 출처 · 결과 신뢰도 — 계산식은 바꾸지 않는 UI 보조 계층 */
const scen=k=>{const s=mk();const p=e.SCENARIOS[k].p;e.applyWheel(s,p.wPre);e.applyFloor(s,p.fPre);return Object.assign(s,p);};
test('scenarios are robot weight plus vehicle load on a four-wheel layout',()=>{
  for(const [k,sc] of Object.entries(e.SCENARIOS)){
    if(sc.p.loadMode==='direct') continue;
    assert.equal(sc.p.nRow*sc.p.nCol,4,k);assert.match(sc.d,/로봇 [\d,]+ kg \+ (차량|적재) [\d,]+ kg/);
    assert.ok(e.compute(scen(k)).ok,k);
  }
});
test('every user input is classified with impact, tier and help',()=>{
  const internal=['mode','tab','g','alphaScale','calF','calV','calD','calL'];
  for(const k of Object.keys(e.DEFAULTS)) if(!internal.includes(k)) assert.ok(e.INPUTS[k],`unclassified ${k}`);
  for(const [k,m] of Object.entries(e.INPUTS)){assert.ok(k in e.DEFAULTS,k);assert.ok(e.IMPACT[m.i]&&['req','imp','exp'].includes(m.t)&&m.h,k);}
  const req=Object.keys(e.INPUTS).filter(k=>e.INPUTS[k].t==='req');
  for(const k of ['Wtare','Wload','nRow','nCol','wb','tr','wPre','D','L','fPre','v','maneuver']) assert.ok(req.includes(k),k);
  for(const k of ['hcg','ax','duty','Tamb','edgeR','wE','fT']) assert.equal(e.INPUTS[k].t,'imp',k);
  for(const k of ['k3','K0','etaImp','hNat','kGent','brW']) assert.equal(e.INPUTS[k].t,'exp',k);
});
test('blank required inputs stop the calculation; defaults come from the selected preset',()=>{
  assert.deepEqual([...e.missingInputs(mk({D:NaN}))],['D']);
  assert.deepEqual([...e.missingInputs(mk({SF:NaN}))],['SF']);
  assert.deepEqual([...e.missingInputs(mk({hcg:NaN}))],[]);
  assert.deepEqual([...e.missingInputs(mk({loadMode:'direct',Wload:NaN}))],[]);
  const s=mk();e.applyWheel(s,'pa6');assert.equal(e.defaultValueFor(s,'wE'),2800);assert.equal(e.defaultValueFor(s,'hcg'),400);
  const f=mk();e.applyFloor(f,'lin6');assert.equal(e.defaultValueFor(f,'fT'),6);
});
test('sensitivity reruns the unchanged model one input at a time without mutating state',()=>{
  const s=scen('park_sedan'),before=JSON.stringify(s),base=e.compute(s),sens=e.sensitivity(s,base);
  assert.equal(JSON.stringify(s),before);assert.ok(sens.items.length>=5);
  for(let i=1;i<sens.items.length;i++) assert.ok(sens.items[i-1].mag>=sens.items[i].mag);
  const D=sens.items.find(r=>r.k==='D'),up=e.compute({...s,D:s.D*1.1});
  near(D.p[1],up.r.pmax/base.r.pmax-1);
  const ratio=c=>e.checkRatios(c)[sens.focus];near(D.d[1],ratio(up)/ratio(base)-1);
  assert.ok(sens.items.slice(0,5).some(r=>['D','L','W','wE','wT','wNu'].includes(r.k)));
});
test('result confidence combines input sources with model applicability',()=>{
  const s=scen('park_sedan'),c=e.compute(s);
  const all=v=>e.initialSources(v);
  assert.equal(e.inputQuality(s,all('default'),c).grade,'D');
  const user=e.inputQuality(s,all('user'),c),maker=e.inputQuality(s,all('manufacturer'),c);
  assert.ok(user.score>e.inputQuality(s,all('default'),c).score);assert.ok(maker.score>=user.score);
  assert.equal(maker.inputGrade,'A');assert.equal(maker.grade,maker.modelGrade);
  const onlyReq=all('default');for(const k of Object.keys(e.INPUTS)) if(e.INPUTS[k].t==='req') onlyReq[k]='user';
  const q=e.inputQuality(s,onlyReq,c);assert.notEqual(q.inputGrade,'D');assert.equal(q.reqDefault.length,0);assert.ok(q.important.includes('wT'));
  const ell={...s,wPre:'pa6',wE:2800,wNu:.39,wT:0,crown:120,D:150,L:60};
  assert.ok(['C','D'].includes(e.inputQuality(ell,all('measured'),e.compute(ell)).grade));
  const imported=e.importSources({_sources:{D:'measured',wE:'bogus'}},s);
  assert.equal(imported.D,'measured');assert.equal(imported.wE,'default');
  const legacy=e.importSources({},{...s,D:321});assert.equal(legacy.D,'user');assert.equal(legacy.hcg,'default');
});
