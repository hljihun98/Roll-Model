/* ============================================================================
   CASTER CONTACT LAB — 해석 엔진
   모든 함수는 순수 함수이며, 결과와 함께 근거(rationale) 레코드를 반환한다.
   ========================================================================= */
"use strict";
const PI = Math.PI;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const isNum = v=>typeof v==='number' && isFinite(v);

/* ---------------------------------------------------------------- 출처 대장 */
const SRC = {
  hertz  :{t:'Hertz 선접촉 이론해',        c:'theory',   r:'Hertz (1882) · Johnson, Contact Mechanics §4.2'},
  hertzF :{t:'접촉 응력장 (선접촉)',        c:'theory',   r:'Johnson, Contact Mechanics §4.2 식 4.44'},
  fric   :{t:'마찰 하 표면 응력',           c:'theory',   r:'Johnson, Contact Mechanics §7.1 식 7.7'},
  shear  :{t:'마찰 하 최대전단 위치',       c:'theory',   r:'Smith & Liu (1953) · Johnson §7.1'},
  gent   :{t:'접착 탄성층 형상계수',        c:'approx',   r:'Gent & Lindley (1959), 구속탄성계수 보간형'},
  oed    :{t:'구속(오이도미터) 탄성계수',   c:'theory',   r:'등방 선형탄성, 1차원 구속 조건'},
  hb     :{t:'타원 접촉 근사해',            c:'approx',   r:'Hamrock & Brewe (1983)'},
  visco  :{t:'점탄성 구름저항',             c:'theory',   r:'Johnson, Contact Mechanics §9.4 식 9.30'},
  lump   :{t:'1절점 정상상태 열모델',       c:'approx',   r:'대류 + 허브 전도 병렬 열저항'},
  cal    :{t:'제조사 정격 캘리브레이션',    c:'cal',      r:'사용자가 입력한 카탈로그 정격점에 모델을 앵커'},
  aciE   :{t:'콘크리트 탄성계수',           c:'code',     r:'ACI 318-19 §19.2.2.1  Ec = 4700·√f_ck'},
  aciB   :{t:'콘크리트 지압강도',           c:'code',     r:'ACI 318-19 §22.8.3  0.85·f_ck·√(A2/A1), √비 ≤ 2'},
  fibT   :{t:'콘크리트 인장강도',           c:'code',     r:'fib Model Code 2010 식 5.1-3a/b: f_ck≤50 → 0.30·f_ck^(2/3), f_ck>50 → 2.12·ln(1+(f_ck+8)/10). fib StructuralCodes 공식 구현과 대조.'},
  rigid  :{t:'강체 프레임 탄성 반력 분배',  c:'theory',   r:'등강성 지지점 위 강체, 1축 굽힘 중첩'},
  three  :{t:'3점 지지 강체 평형', c:'theory', r:'ΣR = W·g, ΣR·x = W·g·eₓ, ΣR·y = W·g·e_y. Engineering Statics §5.5 https://engineeringstatics.org/Chapter_05-3d-rigid-body-equilibrium.html'},
  edge   :{t:'유한길이 단부 응력집중',      c:'empirical',r:'유한길이 롤러 실측/FEM 통상 범위 K = 2~3 (예리단부)'},
  step   :{t:'단차 충격 상한',              c:'approx',   r:'운동량–접촉강성 상한 + 감쇠 보정계수'},
  mat    :{t:'재료 물성 통상값',            c:'ref',      r:'제조사 데이터시트 통상 범위 — 실제 값으로 교체 권장'},
  layerScreen:{t:'도막·기재 균질체 비교', c:'approx', r:'각 재료의 Hertz 반무한체 해 중 높은 면압 선택. 층상 탄성해가 아니며 실제 층상체의 상한 보장은 없음.'},
  policy :{t:'스크리닝 판정 정책', c:'ref', r:'ROLLMODEL 사용자 설정 — 경고 구간·충격 상한·단부 완화·표면 부착 비는 실측 검증이 필요한 정책값'},
};
const CONF = {
  theory   :{n:'이론해',   d:'닫힌 해. 가정만 충족되면 정확합니다.'},
  code     :{n:'설계기준', d:'설계코드 규정식. 코드의 적용범위 안에서만 유효합니다.'},
  approx   :{n:'근사',     d:'물리 기반 근사식. 극한에서 올바르나 중간영역은 오차가 있습니다.'},
  empirical:{n:'경험식',   d:'실측 범위에서 잡은 값. 사용자 조정 대상입니다.'},
  cal      :{n:'보정',     d:'실측/카탈로그 데이터에 앵커된 값.'},
  ref      :{n:'참고값',   d:'통상 범위의 대푯값. 실제 데이터로 교체하십시오.'},
};

/* ------------------------------------------------------------------ 프리셋 */
const WHEELS = {
  pu95 :{n:'PU 폴리우레탄 A95', E:15,     nu:.48, tread:12, pa:12,  ten:35,  alpha:.075, Tmax:70,  kT:.0060,  c:'#C2703A',
         cal:{F:2943, v:1.111, D:80, L:35, note:'D80×L35, 300 kg @ 4 km/h 연속'}},
  puv  :{n:'PU 주조형 (Vulkollan급)', E:40, nu:.48, tread:15, pa:25, ten:45, alpha:.045, Tmax:80,  kT:.0050,  c:'#A85A2A',
         cal:{F:4415, v:1.111, D:80, L:35, note:'D80×L35, 450 kg @ 4 km/h 연속'}},
  pa6  :{n:'나일론 PA6',        E:2800,   nu:.39, tread:0,  pa:60,  ten:80,  alpha:.015, Tmax:80,  kT:.0040,  c:'#5B7A99'},
  rub  :{n:'고무 Shore A70',    E:8,      nu:.49, tread:15, pa:5,   ten:15,  alpha:.20,  Tmax:70,  kT:.0080,  c:'#4A4A48'},
  stl  :{n:'스틸',              E:210000, nu:.30, tread:0,  pa:600, ten:400, alpha:.003, Tmax:200, kT:.0003, c:'#7C8894'},
};
const FLOORS = {
  bare :{n:'무도장 콘크리트',       E:0,      nu:.20, t:0,   comp:0,   red:1,   ten:0,   bond:0,   c:'#9A9A92'},
  coat :{n:'에폭시 코팅 0.3 mm',    E:3000,   nu:.35, t:0.3, comp:55,  red:.35, ten:25,  bond:2.0, c:'#2E8B84'},
  lin3 :{n:'에폭시 라이닝 3 mm',    E:12000,  nu:.30, t:3,   comp:75,  red:.35, ten:30,  bond:2.5, c:'#2E8B84'},
  lin6 :{n:'에폭시 라이닝 6 mm',    E:12000,  nu:.30, t:6,   comp:75,  red:.35, ten:30,  bond:2.5, c:'#26746E'},
  puc6 :{n:'폴리우레탄 시멘트 6 mm',E:9000,   nu:.30, t:6,   comp:50,  red:.40, ten:12,  bond:2.0, c:'#6C7F5A'},
  plate:{n:'스틸 플레이트 6 mm',    E:210000, nu:.30, t:6,   comp:250, red:1.0, ten:400, bond:9.0, c:'#7C8894'},
};

/* ============================================================ 재료 · 기하 */
function oedometricE(E,nu){                 // 완전 구속 시 상한 탄성계수
  const n = nu; // 유효범위 검증 후 입력값을 그대로 사용한다.
  return E*(1-n)/((1+n)*(1-2*n));
}
/* 접착 탄성층 겉보기 탄성계수.
   S = 하중면적/자유면적 (폭 2b 스트립, 두께 t → S ≈ b/t)
   E_app = E + (M−E)·x/(x + (M−E)/E),  x = 2·k·S²
   x→0 : E,  x→∞ : M(구속 상한).  소변형에서 Gent-Lindley E(1+2kS²)와 일치. */
function confinedE(E,nu,t,b,k){
  if(!(t>0)||!(b>0)) return {E, S:0, ratio:1, M:oedometricE(E,nu), x:0};
  const S = b/t, x = 2*k*S*S, M = oedometricE(E,nu);
  if(M<=E) return {E, S, ratio:1, M, x};
  const Ea = E + (M-E)*x/(x + (M-E)/E);
  return {E:Ea, S, ratio:Ea/E, M, x};
}
const eStar = (E1,n1,E2,n2)=> 1/((1-n1*n1)/E1 + (1-n2*n2)/E2);
// R-sqrt(R²-b²)의 작은 접촉폭에서 발생하는 상쇄 오차를 피한다.
const contactSag = (R,b)=>b>=R?R:(b/R)*b/(1+Math.sqrt(1-(b/R)**2));

/* 근거 없는 두께 보간을 하지 않는다. 두 균질 반무한체 중 더 높은 면압을
   주는 환산강성을 선택한다. 실제 층상 탄성해에 대한 엄밀한 상한은 아니다. */
function floorHalfspace(I){
  const useSub=I.layer && I.t2>0 && I.Esub/(1-I.nuSub**2)>I.E2/(1-I.nu2**2);
  return {E:useSub?I.Esub:I.E2, nu:useSub?I.nuSub:I.nu2, mix:useSub?1:0};
}

/* ================================================== 접촉 해석 (핵심 솔버) */
/* 선접촉: b = √(4FR/(πLE*)),  p_max = 2F/(πbL)
   b가 트레드 구속(E1)에 되먹임되므로 감쇠 고정점 반복. 바닥은 균질체 비교. */
function solveLine(I){
  const R1 = I.D/2;
  const invR = 1/R1 + (I.R2 ? 1/I.R2 : 0);
  if(!(invR>0)) return null;
  const R = 1/invR;
  const floor=floorHalfspace(I);
  const relax = 0.35;
  let b = Math.sqrt(4*I.F*R/(PI*I.L*Math.max(eStar(I.E1,I.nu1,I.E2,I.nu2),1e-9)));
  let st={}, mix=0, E1e=I.E1, E2e=I.E2, nu2e=I.nu2, it=0, conv=false;
  for(it=1; it<=400; it++){
    st = (I.confine && I.tread>0) ? confinedE(I.E1,I.nu1,I.tread,b,I.kGent) : {E:I.E1,S:0,ratio:1,M:oedometricE(I.E1,I.nu1),x:0};
    E1e = st.E;
    mix=floor.mix; E2e=floor.E; nu2e=floor.nu;
    const Es = eStar(E1e,I.nu1,E2e,nu2e);
    const bt = Math.sqrt(4*I.F*R/(PI*I.L*Es));
    const nb = b + relax*(bt-b);
    if(Math.abs(nb-b) < 1e-12*Math.max(b,1e-9)){ b=nb; conv=true; break; }
    b = nb;
  }
  const Es = eStar(E1e,I.nu1,E2e,nu2e);
  const pmax = 2*I.F/(PI*b*I.L), pavg = I.F/(2*b*I.L);
  return {kind:'line', R, R1, b, a:b, halfLen:I.L/2, Es, E1e, E2e, nu2e, mix, conf:st,
          A:2*b*I.L, pmax, pavg, iter:it, converged:conv,
          delta:contactSag(R,b)};
}

/* 크라운(횡방향 곡률) 있을 때: Hamrock–Brewe 타원접촉 근사 */
function solveEllipse(I){
  const R1=I.D/2, invRx=1/R1+(I.R2?1/I.R2:0);
  const Rx = 1/invRx, Ry = I.crown;
  if(!(Rx>0&&Ry>0)) return null;
  const invR = 1/Rx + 1/Ry, R = 1/invR;
  const swapped=Ry<Rx, ar = Math.max(Ry/Rx,Rx/Ry);
  const k  = 1.0339*Math.pow(ar,0.636);
  const Ee = 1.0003 + 0.5968/ar;
  const floor=floorHalfspace(I);
  const relax = 0.4;
  let bx = Math.pow(6*Ee*I.F*R/(PI*k*2*eStar(I.E1,I.nu1,I.E2,I.nu2)),1/3);
  let ay = k*bx, st={}, E1e=I.E1, E2e=I.E2, nu2e=I.nu2, mix=0, it=0, conv=false;
  for(it=1; it<=400; it++){
    // 타원 접촉의 형상계수: S = ab / ((a+b)·t)
    const Seq = (I.confine && I.tread>0) ? (ay*bx)/((ay+bx)*I.tread) : 0;
    st = (I.confine && I.tread>0)
       ? (()=>{ const x=2*I.kGent*Seq*Seq, M=oedometricE(I.E1,I.nu1);
                const Ea = M<=I.E1 ? I.E1 : I.E1+(M-I.E1)*x/(x+(M-I.E1)/I.E1);
                return {E:Ea,S:Seq,ratio:Ea/I.E1,M,x}; })()
       : {E:I.E1,S:0,ratio:1,M:oedometricE(I.E1,I.nu1),x:0};
    E1e = st.E;
    mix=floor.mix; E2e=floor.E; nu2e=floor.nu;
    const Ep = 2*eStar(E1e,I.nu1,E2e,nu2e);           // E' = 2E*
    const bt = Math.pow(6*Ee*I.F*R/(PI*k*Ep),1/3);
    const nb = bx + relax*(bt-bx);
    if(Math.abs(nb-bx) < 1e-12*Math.max(bx,1e-9)){ bx=nb; ay=k*bx; conv=true; break; }
    bx = nb; ay = k*bx;
  }
  const Es = eStar(E1e,I.nu1,E2e,nu2e);
  if(swapped){ const tmp=bx; bx=ay; ay=tmp; }
  const pmax = 3*I.F/(2*PI*ay*bx), A = PI*ay*bx;
  return {kind:'ellipse', R, R1, Rx, Ry, b:bx, a:ay, ellipK:ay/bx, Es, E1e, E2e, nu2e, mix, conf:st,
          A, pmax, pavg:I.F/A, iter:it, converged:conv,
          delta:contactSag(Rx,bx)};
}

/* ============================================== 단부 응력집중 (선접촉만) */
/* 예리한 단부는 이론상 특이점. 라운드 반경 Re가 접촉 반폭 b 대비 클수록 완화.
   K = 1 + (K0−1)/(1 + decay·Re/b), K0와 decay는 사용자 경험계수. */
function edgeFactor(Re,b,K0,decay=3){
  if(!(b>0)) return 1;
  const k0 = Math.max(K0,1);            // 단부는 완화될 수는 있어도 1 미만이 될 수 없다
  return 1 + (k0-1)/(1 + decay*Math.max(Re,0)/b);
}

/* ==================================================== 하중 체인 (N 일반화) */
/* 등강성 지지점 위 강체: R_i = W[1/n + e_x·x_i/Σx² + e_y·y_i/Σy²]
   가감속·선회 하중이동은 등가편심 e_dyn = (a/g)·h_cg 로 정확히 환산되므로
   기하편심과 같은 식에 합산한다. */
function wheelGrid(S){
  const nr=Math.max(Math.round(S.nRow),1), nc=Math.max(Math.round(S.nCol),1);
  const xs=[], ys=[];
  for(let i=0;i<nr;i++) for(let j=0;j<nc;j++){
    xs.push(nr===1?0:(-S.wb/2 + S.wb*i/(nr-1)));
    ys.push(nc===1?0:(-S.tr/2 + S.tr*j/(nc-1)));
  }
  return {nr,nc,n:nr*nc,xs,ys,
          sx:xs.reduce((a,v)=>a+v*v,0), sy:ys.reduce((a,v)=>a+v*v,0)};
}
function loadChain(S){
  const rows=[];
  if(S.loadMode==='direct'){
    rows.push({k:'직접 입력 하중', v:S.Fdirect, u:'N', total:true});
    return {Fop:S.Fdirect, Fpk:S.Fdirect*(S.kSauto?1:S.kS), rows, lift:false,
            fracMax:1, fracMin:1, W:S.Fdirect/S.g, n:1, exq:0, eyq:0, grid:null};
  }
  const W = S.Wtare + S.Wload;
  const G = wheelGrid(S);
  rows.push({k:'총 질량 (공차 + 적재)', v:W, u:'kg'});
  rows.push({k:`휠 배치  ${G.nr}열(전후) × ${G.nc}행(좌우)`, v:G.n, u:'EA'});

  const exd = (S.ax/S.g)*S.hcg, eyd = (S.ay/S.g)*S.hcg;   // 동적 등가편심
  const exq = S.ex + exd, eyq = S.ey + eyd;
  if(exd||eyd) rows.push({k:`동하중 등가편심  eₓ +${exd.toFixed(0)} / e_y +${eyd.toFixed(0)}`,
                          v:Math.hypot(exd,eyd), u:'mm', src:'rigid',
                          sub:`e_dyn = (a/g)·h_cg — 가감속·선회 하중이동은 편심과 수학적으로 동일`});
  const three=S.supportMode==='three';
  const active=G.xs.map((_,i)=>i).filter(i=>!three||i!==S.liftedWheel);
  let fr;
  if(three){
    // Normalize coordinates before barycentric evaluation; the rectangle's
    // three remaining corners always form a nondegenerate triangle.
    const [a,b,c]=active, x=G.xs.map(v=>v/S.wb), y=G.ys.map(v=>v/S.tr);
    const px=exq/S.wb, py=eyq/S.tr;
    const det=(y[b]-y[c])*(x[a]-x[c])+(x[c]-x[b])*(y[a]-y[c]);
    fr=Array(G.n).fill(0);
    fr[a]=((y[b]-y[c])*(px-x[c])+(x[c]-x[b])*(py-y[c]))/det;
    fr[b]=((y[c]-y[a])*(px-x[c])+(x[a]-x[c])*(py-y[c]))/det;
    fr[c]=1-fr[a]-fr[b];
    rows.push({k:`3점 접지 · ${S.liftedWheel+1}번 비접지`,v:active.length,u:'EA',src:'three'});
  }else fr=G.xs.map((x,i)=> 1/G.n + (G.sx>0? exq*x/G.sx:0) + (G.sy>0? eyq*G.ys[i]/G.sy:0));
  const fracMax = Math.max(...active.map(i=>fr[i])), fracMin = Math.min(...active.map(i=>fr[i]));
  const lift=fracMin < -1e-10, marginal=three&&!lift&&fracMin<=1e-10;
  const source=three?'three':'rigid';
  const expr=three?'Σr_i = 1; Σr_i·x_i = eₓ; Σr_i·y_i = e_y; 비접지 r = 0'
    :`1/${G.n} + e_x·x_i/Σx² + e_y·y_i/Σy²  (Σx²=${G.sx.toFixed(0)}, Σy²=${G.sy.toFixed(0)} mm²)`;
  rows.push({k:'최대 휠 분담률', v:fracMax, u:'×', src:source, sub:expr});
  if(lift) rows.push({k:'최소 휠 분담률 — 음수, 지지 불가', v:fracMin, u:'×', bad:true});
  const flatFactor=three?1:S.k3;
  rows.push({k:three?'3점 정정 지지 — 평탄도 재분배 중복 적용 안 함':'바닥 평탄도 재분배 계수', v:flatFactor, u:'×'});
  const Fop = W*S.g*fracMax*flatFactor;
  rows.push({k:'주행 하중  F_op', v:Fop, u:'N', total:true});
  return {Fop, Fpk:Fop, rows, lift, marginal, fracMax, fracMin, W, n:G.n, exq, eyq, grid:G,
    fractions:fr, active, supportCount:active.length, flatFactor, source, expr};
}

/* 단차 통과 충격계수 — 운동량·접촉강성 상한에 감쇠 보정 η */
function stepImpact(S, F, delta){
  const R = S.D/2;
  if(!(S.hstep>0 && S.v>0 && delta>0 && F>0)) return {phi:1, vz:0, k:0, Fdyn:0, m:0};
  const hr = clamp(S.hstep/R,0,1);
  const vz = S.v*Math.sqrt(Math.max(2*hr-hr*hr,0));
  const k  = F/(delta/1000);
  const m  = (F/S.g)*S.mUns;
  const Fd = vz*Math.sqrt(m*k)*S.etaImp;
  return {phi:1+Fd/F, vz, k, Fdyn:Fd, m};
}

/* ============================================ 응력장 · 마찰 · 열 · 판정 */
const tauProfile = z => { const c=Math.abs(z),h=Math.hypot(1,c),q=c/h; return q/(1+q)/h; }; // ζ = z/b, 상쇄 없는 동치식

function stressField(r, mu){
  const p0 = r.pmax;
  const tauSub = 0.3003*p0, zSub = 0.7861*r.b;   // 무마찰 최대전단
  const tauSurf = mu*p0;                          // 표면 접촉중앙 (σx=σz=−p, τxz=μp)
  const surfGoverns = tauSurf > tauSub;
  return {
    p0,
    tauSub, zSub, tauSurf, surfGoverns,
    tauMax: surfGoverns ? tauSurf : tauSub,
    zTau  : surfGoverns ? 0 : zSub,
    sigT  : 2*mu*p0,                              // 후단 표면 인장
    tauInt: mu*p0                                 // 계면 전단 (완전 미끄럼)
  };
}
/* 도막 하부 기재에 전달되는 압력: 선접촉 축상 σz(z) = p0/√(1+(z/b)²) */
const subPressure = (p0,t,b)=> (t>0&&b>0) ? p0/Math.hypot(1,t/b) : p0;

/* 점탄성 구름저항 f = (4/3π)·α·(b/R) */
const rollF = (alpha,b,R)=> (4/(3*PI))*alpha*(b/R);

function thermal(S, W, r, F){
  const R = r.R1;
  const f  = rollF(W.alpha*S.alphaScale, r.b, R);
  const Prr = f*F*S.v;                                  // W, 순간 구름손실
  const P   = Prr*clamp(S.duty,0,1);                    // 평균 소산
  const Aw  = PI*(S.D/1000)*(S.L/1000) + 2*(PI/4)*Math.pow(S.D/1000,2);
  const h   = S.hNat + S.hVel*S.v;
  const UA  = h*Aw + S.UAhub;
  const Rth = 1/UA;
  const dT  = P*Rth*S.rthScale;
  return {f, Prr, P, Aw, h, UA, Rth:Rth*S.rthScale, dT, T:S.Tamb+dT,
          torque: f*F*(R/1000)};
}
/* 열 기준 허용하중.
   1차 추정은 닫힌해 F·(ΔT_a/ΔT)^(2/3) (P ∝ F^1.5) — 구속 보정이 걸리면 b∝√F 가
   깨지므로 그 값을 씨앗으로 이분법 정밀화한다. solveAt 은 하중→접촉해 함수. */
function thermalAllow(S, W, r, F, th, solveAt){
  const dTa = W.Tmax - S.Tamb;
  if(dTa<0 || (dTa===0 && th.dT>0)) return 0;
  if(!(th.dT>0)) return Infinity;
  const F0 = F*Math.pow(dTa/th.dT, 2/3);
  if(!solveAt || !(F0>0) || !isFinite(F0)) return F0;
  const dTof = Fq => { const rr=solveAt(Fq); if(!rr||!rr.converged||!Number.isFinite(rr.b)) return Infinity;
    return thermal(S,{alpha:W.alpha,Tmax:W.Tmax},rr,Fq).dT; };
  let lo=F0/3, hi=F0*3, k=0;
  while(dTof(lo)>dTa && k++<8){ hi=lo; lo/=3; }
  k=0; while(dTof(hi)<dTa && k++<8){ lo=hi; hi*=3; }
  if(!(dTof(lo)<=dTa && dTof(hi)>=dTa)) return NaN;
  for(let i=0;i<16;i++){ const m=Math.sqrt(lo*hi); (dTof(m)<=dTa ? lo=m : hi=m); }
  return Math.sqrt(lo*hi);
}

/* 콘크리트 */
const concreteE = S => S.EcMan>0 ? S.EcMan : 4700*Math.sqrt(S.fck);
const concreteBearing = S => 0.85*S.fck*Math.sqrt(S.bearingAreaRatio); // ACI: 면적비를 명시, 기본 1
const concreteTens = S => S.fck<=50 ? 0.30*Math.pow(S.fck,2/3) : 2.12*Math.log1p((S.fck+8)/10);
const concreteTensExpr = S => S.fck<=50?'0.30·f_ck^(2/3)':'2.12·ln(1+(f_ck+8)/10)';
