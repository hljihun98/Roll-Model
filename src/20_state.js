/* ============================================================================
   STATE — 기본값은 주차로봇 대차 조건(승용차 적재)에 맞춰 잡았다.
   ========================================================================= */
const DEFAULTS = {
  mode:'easy', tab:'chain',

  /* 하중 */
  loadMode:'build', Fdirect:6343.83,
  Wtare:900, Wload:1600, g:9.81,
  nRow:2, nCol:2, wb:2600, tr:1400, ex:150, ey:50,
  supportMode:'all', liftedWheel:0,
  k3:1.15, ax:1.0, ay:1.0, hcg:400,
  kSauto:true, kS:1.5, hstep:3, etaImp:0.40, mUns:1.0,
  maneuver:'drive', muMan:0.15, grade:0,

  /* 바퀴 */
  wPre:'pu95', D:200, L:80, wE:15, wNu:.48, wT:15,
  wPa:12, wTen:35, wAlpha:.075, wTmax:70, wKt:.0060,
  edgeR:2.0, crown:0, R2:0, K0:2.0, edgeAllow:1.4,

  /* 바닥 */
  fPre:'lin3', fT:3,  fE:12000, fNu:.30, fComp:75, fRed:.35, fTen:30, bond:2.5,
  fck:30, EcMan:0,

  /* 주행 · 열 */
  v:1.0, duty:0.5, Tamb:25, hNat:8, hVel:6, UAhub:0.3,
  alphaScale:1, rthScale:1,
  calF:2943, calV:1.111, calD:80, calL:35,

  /* 해석 옵션 */
  confine:true, layer:true, kGent:1.0, nuOv:0, nuOvAll:false,

  /* 판정 기준 */
  SF:1.5, mu:0.6,
  brW:.10, brF:.20, ttW:0.5, ttF:0.25, tbW:1, tbF:0.2, arW:3, arF:1.5,
  surfOver:1.15, edgeOver:1.2, stressOver:1.5,
  edgeDecay:3, impactMax:6, unconfWarn:3, unconfBad:1,
  bearingAreaRatio:1, bareBondFactor:0.5,
};

const SCENARIOS = {
  park_sedan:{n:'주차로봇 · 승용차', d:'1.6 t 차량 + 0.9 t 대차 · 4휠 · 에폭시 라이닝',
    p:{loadMode:'build',Wtare:900,Wload:1600,nRow:2,nCol:2,wb:2600,tr:1400,ex:150,ey:50,hcg:400,
       wPre:'pu95',D:200,L:80,edgeR:2,crown:0,fPre:'lin3',v:1.0,duty:.5,maneuver:'drive'}},
  park_suv:{n:'주차로봇 · SUV', d:'2.4 t 차량 + 1.1 t 대차 · 8휠 · Vulkollan급',
    p:{loadMode:'build',Wtare:1100,Wload:2400,nRow:4,nCol:2,wb:2800,tr:1500,ex:200,ey:80,hcg:450,
       wPre:'puv',D:250,L:90,edgeR:2.5,crown:0,fPre:'lin6',v:0.8,duty:.5,maneuver:'drive'}},
  spin:{n:'제자리 선회 검토', d:'승용차 조건에서 스핀 턴 — 도막 박리 지배 케이스',
    p:{loadMode:'build',Wtare:900,Wload:1600,nRow:2,nCol:2,wb:2600,tr:1400,ex:150,ey:50,hcg:400,
       wPre:'pu95',D:200,L:80,edgeR:2,crown:0,fPre:'coat',v:0.3,duty:.2,maneuver:'spin',ax:0}},
  agv:{n:'소형 물류 AGV', d:'1 t급 · 4휠 · 박막 에폭시 코팅',
    p:{loadMode:'build',Wtare:300,Wload:1000,nRow:2,nCol:2,wb:900,tr:700,ex:60,ey:40,hcg:300,
       wPre:'pu95',D:125,L:50,edgeR:1.5,crown:0,fPre:'coat',v:1.5,duty:.7,maneuver:'drive'}},
  legacy:{n:'원본 프로그램 검증', d:'D80×L40 · 646.67 kg/캐스터 · 무도장 · 모든 신규 보정 OFF',
    p:{loadMode:'direct',Fdirect:6343.83,D:80,L:40,edgeR:0,crown:0,R2:0,wPre:'pu95',nuOv:0,
       fPre:'bare',fck:30,EcMan:30000,v:0,duty:0,confine:false,layer:false,K0:1,edgeAllow:1,
       kSauto:false,kS:1,k3:1,maneuver:'spin'}},
};
