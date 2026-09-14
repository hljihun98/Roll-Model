/* ═════════════ 독립 검증 하네스 ═════════════ */
let PASS=0, FAIL=0;
const F=(v,d=6)=>Number(v).toPrecision(d);
function chk(name, got, want, tol=1e-9, rel=true){
  const err = rel && Math.abs(want)>1e-12 ? Math.abs(got-want)/Math.abs(want) : Math.abs(got-want);
  if(err<=tol){PASS++;} else {FAIL++; console.log(`  ✗ ${name}: got ${F(got)} want ${F(want)} err ${err.toExponential(2)}`);}
}
function ok(name,cond){ if(cond)PASS++; else {FAIL++; console.log(`  ✗ ${name}`);} }
function mk(sc){const S={...DEFAULTS};if(sc){if(sc.wPre)applyWheel(S,sc.wPre);if(sc.fPre)applyFloor(S,sc.fPre);Object.assign(S,sc);}return S;}

console.log('\n─── A. 헤르츠 선접촉 닫힌해 대조 (구속·층상 보정 OFF) ───');
{
  const St=mk({loadMode:'direct',Fdirect:6343.83,D:80,L:40,edgeR:0,crown:0,R2:0,
    wPre:'pu95',fPre:'bare',fck:30,EcMan:30000,confine:false,layer:false,kSauto:false,kS:1,v:0});
  const c=computeCore(St);
  const R=40, L=40, Fq=6343.83, E1=15, n1=0.48, E2=30000, n2=0.20;
  const Es = 1/((1-n1**2)/E1 + (1-n2**2)/E2);
  const b  = Math.sqrt(4*Fq*R/(Math.PI*L*Es));
  const pm = 2*Fq/(Math.PI*b*L);
  const pm2= Math.sqrt(Fq*Es/(Math.PI*L*R));          // 독립 유도식
  chk('E*',      c.r.Es,   Es,   1e-12);
  chk('b',       c.r.b,    b,    1e-12);
  chk('p_max',   c.r.pmax, pm,   1e-12);
  chk('p_max (독립식)', c.r.pmax, pm2, 1e-10);
  chk('p_max/p_avg = 4/π', c.r.pmax/c.r.pavg, 4/Math.PI, 1e-12);
  chk('A = 2bL', c.r.A, 2*b*L, 1e-12);
  chk('δ = R−√(R²−b²)', c.r.delta, R-Math.sqrt(R*R-b*b), 1e-12);
  console.log(`  기준값 b=${F(b)} mm, p_max=${F(pm)} MPa  (원본 프로그램과 동일 조건)`);
}

console.log('\n─── B. 응력장 계수 ───');
{
  let best=0,zb=0;
  for(let z=0;z<=4;z+=1e-5){const t=tauProfile(z); if(t>best){best=t;zb=z;}}
  chk('τ_max/p₀ = 0.3003', best, 0.30028, 1e-4);
  chk('z/b = 0.7861',      zb,   0.78615, 1e-3);
  chk('σ_z(0)=p₀',  subPressure(10,0,5), 10, 1e-12);
  chk('σ_z(t=b)=p₀/√2', subPressure(10,5,5), 10/Math.SQRT2, 1e-12);
  chk('σ_z(t=3b)',  subPressure(10,15,5), 10/Math.sqrt(10), 1e-12);
}

console.log('\n─── C. 구속 탄성계수 극한 ───');
{
  const E=15,nu=0.48, M=oedometricE(E,nu);
  chk('M = E(1−ν)/((1+ν)(1−2ν))', M, E*(1-nu)/((1+nu)*(1-2*nu)), 1e-12);
  chk('S→0 이면 E_app→E', confinedE(E,nu,1e9,1,1).E, E, 1e-6);
  ok ('S→∞ 이면 E_app→M', Math.abs(confinedE(E,nu,1e-7,1,1).E - M)/M < 1e-3);
  const small=confinedE(E,nu,1000,1,1);           // S=0.001 → Gent 근사와 일치해야
  chk('소변형에서 Gent E(1+2kS²)', small.E, E*(1+2*(1/1000)**2), 1e-5);
  ok ('E_app 는 항상 E 이상', [0.1,0.5,1,2,5,20].every(t=>confinedE(E,nu,t,10,1).E>=E-1e-9));
  ok ('E_app 는 M 을 넘지 않음', [0.01,0.1,1,10].every(t=>confinedE(E,nu,t,10,1).E<=M+1e-9));
  ok ('ν=0.30 이면 구속 효과 작음', confinedE(2800,0.30,12,10,1).ratio < 1.5);
}

console.log('\n─── D. 타원 접촉 — 구(球) 대칭에서 점접촉 해와 대조 ───');
{
  const Rq=100, Fq=5000, E1=210000,n1=.3,E2=210000,n2=.3;
  const Es=1/((1-n1**2)/E1+(1-n2**2)/E2);
  const r=solveEllipse({D:2*Rq,L:1e6,F:Fq,E1,nu1:n1,tread:0,E2,nu2:n2,t2:0,
    Esub:E2,nuSub:n2,R2:0,crown:Rq,confine:false,layer:false,kGent:1});
  const aEx=Math.pow(3*Fq*Rq/(4*Es),1/3);   // 평면 위 구: 상대곡률반경 = Rq (Hamrock R = Rq/2)
  const pEx=3*Fq/(2*Math.PI*aEx*aEx);
  ok ('타원비 k ≈ 1 (원형 접촉)', Math.abs(r.ellipK-1)<0.05);
  chk('접촉 반경 a (Hertz 점접촉)', (r.a+r.b)/2, aEx, 0.03);
  chk('p_max (Hertz 점접촉)',       r.pmax,      pEx, 0.06);
  console.log(`  Hamrock–Brewe 근사 오차: a ${F(((r.a+r.b)/2/aEx-1)*100,3)}%, p_max ${F((r.pmax/pEx-1)*100,3)}%`);
}

console.log('\n─── E. 하중 분배 ───');
{
  const St=mk({loadMode:'build',Wtare:1000,Wload:1000,nRow:4,nCol:2,wb:2400,tr:1200,
    ex:0,ey:0,ax:0,ay:0,k3:1});
  const G=wheelGrid(St);
  const fr=G.xs.map((x,i)=>1/G.n + 0 + 0);
  chk('편심 0 이면 균등 1/n', loadChain(St).fracMax, 1/8, 1e-12);
  chk('분담률 총합 = 1', fr.reduce((a,v)=>a+v,0), 1, 1e-12);
  const St2={...St,ex:200,ey:100};
  const G2=wheelGrid(St2);
  const fr2=G2.xs.map((x,i)=>1/G2.n + 200*x/G2.sx + 100*G2.ys[i]/G2.sy);
  chk('편심 시 총합 여전히 1', fr2.reduce((a,v)=>a+v,0), 1, 1e-12);
  chk('편심 최대 분담률', loadChain(St2).fracMax, Math.max(...fr2), 1e-12);
  // 4점 특수해와 대조: 1/4 + ex/2B + ey/2T
  const St4={...St,nRow:2,nCol:2,wb:2000,tr:1000,ex:100,ey:50};
  chk('4점 고전식 1/4+eₓ/2B+e_y/2T', loadChain(St4).fracMax, 0.25+100/(2*2000)+50/(2*1000), 1e-12);
  // 동하중 = 등가편심
  const Sa={...St,ax:2,hcg:500};
  const Sb={...St,ex:(2/9.81)*500};
  chk('가감속 = 등가편심 (a/g)·h_cg', loadChain(Sa).fracMax, loadChain(Sb).fracMax, 1e-12);
  const Sl={...St,ex:5000};
  ok ('과대편심에서 휠 들림 검출', loadChain(Sl).lift===true);
}

console.log('\n─── F. 단조성 · 물리 방향 ───');
{
  const base=mk();
  const p=o=>{const c=compute({...base,...o}); return c.ok?c.r.pmax:NaN;};
  const Ds=[80,120,200,320,480], Ls=[30,50,80,120,200];
  ok('D↑ → p_max↓', Ds.every((d,i)=>i===0||p({D:d})<p({D:Ds[i-1]})));
  ok('L↑ → p_max↓', Ls.every((l,i)=>i===0||p({L:l})<p({L:Ls[i-1]})));
  ok('하중↑ → p_max↑', [500,1000,2000,4000].every((w,i,a)=>i===0||p({Wload:w})>p({Wload:a[i-1]})));
  ok('E₁↑ → p_max↑', [5,15,50,200].every((e,i,a)=>i===0||p({wE:e})>p({wE:a[i-1]})));
  ok('구속 보정 ON 이면 p_max 증가', p({confine:true})>p({confine:false}));
  const bb=o=>{const c=compute({...base,...o}); return c.r.b;};
  ok('D↑ → b↑ (접촉폭은 커짐)', Ds.every((d,i)=>i===0||bb({D:d})>bb({D:Ds[i-1]})));
  const th=o=>{const c=compute({...base,...o}); return c.th.T;};
  ok('v↑ → 온도↑', [0.2,0.6,1.2,2.4].every((v,i,a)=>i===0||th({v})>th({v:a[i-1]})));
  ok('듀티↑ → 온도↑', [0.2,0.5,0.8,1].every((d,i,a)=>i===0||th({duty:d})>th({duty:a[i-1]})));
  const sg=o=>{const c=compute({...base,...o}); return c.sf.sigT;};
  ok('선회가 직진보다 표면인장 큼', sg({maneuver:'spin'})>sg({maneuver:'drive'}));
  const ke=o=>{const c=compute({...base,...o}); return c.Kedge;};
  ok('에지 R↑ → 단부계수↓', [0,1,3,8,20].every((r,i,a)=>i===0||ke({edgeR:r})<ke({edgeR:a[i-1]})));
  chk('에지 R=0 이면 K=K₀', ke({edgeR:0}), DEFAULTS.K0, 1e-12);
}

console.log('\n─── G. 열 모델 ───');
{
  const St=mk({v:1,duty:1});
  const c=compute(St);
  chk('f = (4/3π)·α·(b/R)', c.th.f, (4/(3*Math.PI))*St.wAlpha*(c.rop.b/c.rop.R1), 1e-12);
  chk('P = f·F·v·duty',     c.th.P, c.th.f*c.Fop*St.v*St.duty, 1e-12);
  chk('ΔT = P·R_th',        c.th.dT, c.th.P*c.th.Rth, 1e-12);
  chk('T = T_amb + ΔT',     c.th.T, St.Tamb+c.th.dT, 1e-12);
  const A=Math.PI*(St.D/1000)*(St.L/1000)+2*(Math.PI/4)*(St.D/1000)**2;
  chk('방열면적',           c.th.Aw, A, 1e-12);
  // F_allow 역검증: 그 하중으로 다시 풀면 ΔT 가 허용에 도달해야
  const Fa=c.Fth;
  const c2=computeCore({...St,loadMode:'direct',Fdirect:Fa,kSauto:false,kS:1});
  const err=Math.abs(c2.th.T-St.wTmax)/St.wTmax;
  console.log(`  F_allow 역검증: 그 하중에서 T = ${F(c2.th.T,4)}°C (허용 ${St.wTmax}) — 오차 ${(err*100).toFixed(2)}%`);
  ok('F_allow 역검증 오차 < 5%', err<0.05);
  // 캘리브레이션
  const cal=calibrate(mk());
  const c3=computeCore({...cal.T, rthScale:cal.scale});
  chk('캘리브레이션 후 정격점 = 허용온도', c3.th.T, DEFAULTS.wTmax, 1e-6);
}

console.log('\n─── H. 허용치 · 기준식 ───');
{
  const St=mk({fck:30});
  chk('E_c = 4700√f_ck', concreteE({...St,EcMan:0}), 4700*Math.sqrt(30), 1e-12);
  chk('지압 면적비 1: 0.85 f_ck', concreteBearing(St), 0.85*30, 1e-12);
  chk('f_ctm = 0.30 f_ck^⅔', concreteTens(St), 0.30*Math.pow(30,2/3), 1e-12);
  const c=compute(St);
  chk('σ_t = 2μ p_max', c.sf.sigT, 2*c.MU.mu*c.r.pmax, 1e-12);
  chk('τ_int = μ p_max', c.sf.tauInt, c.MU.mu*c.r.pmax, 1e-12);
  chk('p_edge = K·p_max', c.pEdge, c.Kedge*c.r.pmax, 1e-12);
}

console.log('\n─── I. 상태·배선 정합성 ───');
{
  const RP=__dirname+'/../src';
  const ui=require('fs').readFileSync(RP+'/50_ui.js','utf8');
  const body=require('fs').readFileSync(RP+'/40_body.html','utf8');
  // 입력 필드는 INPUTS 메타데이터로 생성한다. 숫자 입력은 fl/qf/slideFld 호출로 배치된다.
  const nums=Object.keys(INPUTS).filter(k=>typeof DEFAULTS[k]==='number'&&k!=='liftedWheel');
  const placed=new Set();
  for(const m of ui.matchAll(/\b(?:fl|qf|slideFld)\(([^)]*)\)/g)) for(const x of m[1].matchAll(/'([A-Za-z0-9_]+)'/g)) placed.add(x[1]);
  for(const m of ui.matchAll(/\[((?:'[A-Za-z0-9_]+',?)+)\]\.map\(qf\)/g)) for(const x of m[1].matchAll(/'([A-Za-z0-9_]+)'/g)) placed.add(x[1]);
  const staticIds=[...ui.matchAll(/type="number" id="([A-Za-z0-9_]+)"/g)].map(m=>m[1]);
  const missing = Object.keys(INPUTS).filter(k=>!(k in DEFAULTS));
  const unclassified = Object.keys(DEFAULTS).filter(k=>!(k in INPUTS)&&!['mode','tab','g','alphaScale','calF','calV','calD','calL'].includes(k));
  const noInput = nums.filter(k=>!placed.has(k) && k!=='rthScale');
  const orphanInputs = staticIds.filter(i=>!['calF','calV','calD','calL','rthScale'].includes(i));
  ok('INPUTS 의 모든 키가 상태에 존재', missing.length===0); if(missing.length) console.log('    누락:',missing);
  ok('상태의 모든 사용자 입력이 중요도 분류됨', unclassified.length===0); if(unclassified.length) console.log('    미분류:',unclassified);
  ok('숫자 입력마다 입력 필드 존재', noInput.length===0); if(noInput.length) console.log('    입력없음:',noInput);
  ok('배선 안 된 입력 필드 없음', orphanInputs.length===0); if(orphanInputs.length) console.log('    미배선:',orphanInputs);
  ok('모든 입력에 영향도·단계·도움말', Object.values(INPUTS).every(m=>IMPACT[m.i]&&TIERS[m.t]&&m.h));
  const unusedState=Object.keys(DEFAULTS).filter(k=>{
    const re=new RegExp(`[S.]${k}\\b|'${k}'|"${k}"|\\b${k}:`);
    const src=require('fs').readFileSync(RP+'/30_engine.js','utf8')
            +require('fs').readFileSync(RP+'/31_compute.js','utf8')+ui;
    return (src.match(new RegExp(`S\\.${k}\\b`,'g'))||[]).length===0;});
  if(unusedState.length) console.log('    계산/UI 에서 S. 로 안 쓰이는 키:',unusedState.join(', '));
}

console.log('\n─── J. 전수 스윕 (NaN · 발산 · 예외) ───');
{
  let n=0,bad=0,err=0,noconv=0;
  for(const w of Object.keys(WHEELS)) for(const fl of Object.keys(FLOORS))
  for(const D of [40,80,150,300,600]) for(const L of [15,40,80,160,300])
  for(const cr of [0,80,400,2000]) for(const mv of ['drive','spin','manual'])
  for(const lm of ['direct','build']) for(const cf of [true,false]){
    n++;
    const St=mk({wPre:w,fPre:fl,D,L,crown:cr,maneuver:mv,loadMode:lm,confine:cf});
    try{ const c=compute(St); if(!c.ok){err++;continue;}
      const vals=[c.r.b,c.r.pmax,c.pEdge,c.pSub,c.sf.sigT,c.sf.tauMax,c.th.T,c.bR,c.ar,c.Kedge,
                  c.allow.surf,c.allow.conc,c.allow.tens,c.allow.bond,c.Fop,c.Fpk,c.kTd];
      if(vals.some(v=>typeof v!=='number'||Number.isNaN(v))) {bad++; if(bad<3)console.log('   NaN',w,fl,D,L,cr,mv,lm,cf);}
      if(c.r.b<=0||c.r.pmax<=0) {bad++; if(bad<5)console.log('   비물리',w,fl,D,L,cr,mv,lm);}
      if(!c.r.converged) noconv++;
      c.gates.forEach(g=>{if(!['ok','warn','bad'].includes(g.s))bad++;});
    }catch(e){bad++; if(bad<3)console.log('   THROW',w,fl,D,L,cr,mv,lm,e.message);}
  }
  console.log(`  조합 ${n}개 · 입력오류(정상처리) ${err} · 미수렴 ${noconv} · 결함 ${bad}`);
  ok('전수 스윕 결함 0', bad===0);
  ok('전수 스윕 미수렴 0', noconv===0);
}

const f=(v,d=3)=>(!isFinite(v)?'∞':Number(v).toFixed(d));
console.log('\n─── K. 적대적 입력 ───');
{
  const cases=[
    ['D 음수',{D:-100}],['D 0',{D:0}],['L 0',{L:0}],
    ['적재 음수',{Wload:-9999}],['공차+적재 = 0',{Wtare:0,Wload:0}],
    ['도막 두께 음수',{fT:-3}],['f_ck 0',{fck:0}],['f_ck 극대',{fck:200}],
    ['ν=0.5',{wNu:0.5}],['ν=0.499999',{wNu:0.499999}],['ν 음수',{wNu:-0.1}],
    ['E₁ 극소',{wE:1e-6}],['E₁ 극대',{wE:1e9}],
    ['듀티 2',{duty:2}],['듀티 음수',{duty:-1}],['속도 음수',{v:-5}],['속도 극대',{v:100}],
    ['에지 R > L/2',{edgeR:999}],['크라운 극소',{crown:0.5}],['크라운 극대',{crown:1e6}],
    ['R₂ 오목 급함',{R2:-10}],['R₂ 오목 완만',{R2:-100000}],
    ['SF 0',{SF:0}],['SF 음수',{SF:-2}],['K₀ 0.5',{K0:0.5}],['kGent 0',{kGent:0}],
    ['휠 0열',{nRow:0}],['휠 1열 1행',{nRow:1,nCol:1}],['휠 20×20',{nRow:20,nCol:20}],
    ['편심 극대',{ex:1e6}],['h_cg 극대',{hcg:1e5}],['단차 > 반지름',{hstep:1e4}],
    ['Tamb > Tmax',{Tamb:200}],['α 0',{wAlpha:0}],['UAhub 0',{UAhub:0,hNat:0,hVel:0}],
    ['트레드 > 반지름',{wT:9999}],['nuOv 0.5',{nuOv:0.5}],
  ];
  for(const [n,o] of cases){
    let r;
    try{ r=compute(mk(o)); }catch(e){ console.log(`  ✗ THROW ${n}: ${e.message}`); FAIL++; continue; }
    if(!r.ok){ PASS++; continue; }                                  // 입력오류로 정상 거부
    const vals=[r.r.b,r.r.pmax,r.pEdge,r.pSub,r.sf.sigT,r.sf.tauMax,r.th.T,r.bR,r.ar,
                r.Kedge,r.allow.surf,r.allow.conc,r.allow.tens,r.allow.bond,r.Fop,r.Fpk,r.kTd,r.Fth];
    const bad = vals.some(v=>typeof v!=='number'||Number.isNaN(v)) || r.r.b<=0 || r.r.pmax<=0
             || r.Kedge<1 || r.kTd<=0 || r.Fop<=0;
    if(bad){ FAIL++; console.log(`  ✗ ${n}: b=${f(r.r.b)} p=${f(r.r.pmax)} K=${f(r.Kedge)} kTd=${f(r.kTd)} T=${f(r.th.T,1)}`); }
    else PASS++;
  }
  console.log(`  ${cases.length}개 케이스 검사 완료`);
}

console.log('\n─── L. 개선 제안이 실제로 판정을 바꾸는가 ───');
{
  for(const key of ['agv','spin']){
    const St=mk(SCENARIOS[key].p), sg=suggest(St);
    for(const it of sg.items){
      const after=compute({...St,[it.key]:it.to});
      ok(`${key} · ${it.label} ${f(it.from,1)}→${f(it.to,1)} 적용 후 불가 해소`,
         after.ok && after.worst!=='bad');
    }
    if(sg.scale){ const {k,worst,...geom}=sg.scale;
      ok(`${key} · 치수 ×${f(k,2)} 적용 후 불가 해소`, (c=>c.ok&&c.worst!=='bad')(compute({...St,...geom})));
      ok(`${key} · scaledGeom 재현성 (스캔=적용)`,
         JSON.stringify(scaledGeom(St,k))===JSON.stringify(geom)); }
    // 제안 직전 스캔점은 여전히 불가여야 (최소치가 맞는지). 스캔 간격은 suggest()의 키별 범위·분할과 같다.
    const scanOf={D:[Math.min(St.D*8,1200),70],L:[Math.min(St.L*6,500),60],Wload:[0,50],Fdirect:[St.Fdirect*0.05,50],
      v:[0.05,45],duty:[0.05,30],fT:[15,45],edgeR:[Math.max(St.L*0.25,10),40]};
    for(const it of sg.items){
      const [end,n]=scanOf[it.key], step=(end-it.from)/n;
      const prev=it.to-step, just=compute({...St,[it.key]:prev});
      if(Math.abs(prev-it.from)<Math.abs(step)*1e-9) continue;
      ok(`${key} · ${it.label} 최소치 근방에서는 아직 불가`, !just.ok || just.worst==='bad');
    }
  }
}

console.log('\n─── M. 설정 왕복 정합성 ───');
{
  for(const k of Object.keys(SCENARIOS)){
    const A=mk(SCENARIOS[k].p);
    const json=JSON.parse(JSON.stringify({_app:'ROLLMODEL',...A}));
    const B={...DEFAULTS}; for(const key in json) if(key in DEFAULTS) B[key]=json[key];
    const ca=compute(A), cb=compute(B);
    ok(`${k} 저장→불러오기 후 p_max 동일`, Math.abs(ca.r.pmax-cb.r.pmax)<1e-12);
    ok(`${k} 저장→불러오기 후 판정 동일`, ca.worst===cb.worst);
  }
}

console.log('\n─── N. 매트릭스 · CSV 일치 ───');
{
  const St=mk();
  for(const w of Object.keys(WHEELS)) for(const fl of Object.keys(FLOORS)){
    const T={...St}; applyWheel(T,w); applyFloor(T,fl);
    const c1=compute(T), c2=compute(T);
    ok(`${w}/${fl} 재계산 결정성`, c1.ok===c2.ok && (!c1.ok || (c1.r.pmax===c2.r.pmax && c1.worst===c2.worst)));
  }
}

console.log('\n─── O. 물리 보존·극한 ───');
{
  const St=mk();
  // 하중 → 0 이면 접촉 → 0
  const tiny=compute({...St,loadMode:'direct',Fdirect:1e-6,kSauto:false,kS:1});
  ok('하중→0 이면 b→0', tiny.ok && tiny.r.b<1e-2);
  ok('하중→0 이면 p_max→0', tiny.ok && tiny.r.pmax<1);
  // 강성 무한대면 접촉 → 0
  const rigid=compute({...St,wE:1e8,wT:0,confine:false,fPre:'plate',fE:2e8,fT:20,layer:false});
  ok('두 물체 모두 강체에 가까우면 b 매우 작음', rigid.ok && rigid.r.b<0.5);
  // 도막 두께 → ∞ 이면 전달압 → 0
  const thick=compute({...St,fT:500});
  ok('도막 두꺼우면 기재 전달압 급감', thick.ok && thick.pSub < thick.r.pmax*0.15);
  // μ → 0 이면 인장·전단 → 0
  const nofr=compute({...St,maneuver:'manual',muMan:0});
  ok('μ=0 이면 σ_t=0', nofr.ok && nofr.sf.sigT===0);
  ok('μ=0 이면 최대전단은 표면 아래', nofr.ok && !nofr.sf.surfGoverns);
  // 접촉면적 × 평균압 = 하중
  const c=compute(St);
  ok('A·p_avg = F (하중 보존)', Math.abs(c.r.A*c.r.pavg - c.Fpk)/c.Fpk < 1e-12);
  // 타원에서도
  const e=compute({...St,wPre:'pa6',wE:2800,wNu:.39,wT:0,D:150,L:60,crown:120});
  if(e.ok&&e.r.kind==='ellipse') ok('타원: A·p_avg = F', Math.abs(e.r.A*e.r.pavg-e.Fpk)/e.Fpk<1e-12);
}

console.log(`\n═══ 통과 ${PASS} / 실패 ${FAIL} ═══`);

process.exitCode=FAIL>0?1:0;
