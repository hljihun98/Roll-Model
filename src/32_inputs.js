/* ============================================================================
   INPUTS — 입력 중요도 · 영향도 · 값 출처 · 입력 품질 · 민감도
   계산식은 바꾸지 않는다. DOM에 접근하지 않는 순수 함수만 둔다.
   영향도는 대표 조건(승용차·SUV·선회·AMR)에서 입력을 ±10% 바꿨을 때
   판정 이용률·p_max·온도 상승의 최대 변화율로 분류했다(docs/MODEL-NOTES.md).
   ========================================================================= */
const TIERS = {req:'필수', imp:'상세', exp:'전문가'};
const IMPACT = {
  vh:{n:'매우 큼', w:3, d:'±10% 변경 시 결과 10% 이상 변화'},
  h :{n:'큼',     w:2, d:'±10% 변경 시 결과 5~10% 변화'},
  m :{n:'보통',   w:1, d:'±10% 변경 시 결과 1~5% 변화'},
  l :{n:'낮음',   w:.3,d:'±10% 변경 시 결과 1% 미만 변화'},
  c :{n:'조건부', w:1, d:'특정 조건에서만 결과를 크게 바꿉니다'},
  j :{n:'판정 경계', w:0, d:'계산 수치는 그대로이며 가능·주의·불가의 경계만 바꿉니다'},
};
const VALUE_SOURCES = {user:'사용자 입력', default:'기본값', manufacturer:'제조사', measured:'실측', estimated:'추정'};
const SOURCE_TAG = {user:'입력', default:'기본', manufacturer:'제조사', measured:'실측', estimated:'추정'};
const SOURCE_QUALITY = {measured:1, manufacturer:1, user:.85, estimated:.6, default:.35};

const build = S=>S.loadMode==='build';
const grid4 = S=>build(S)&&S.supportMode!=='tri';   // 열×행 격자 배치(3점 삼각 접지가 아닐 때)
const line = S=>!(S.crown>0);
const moving = S=>S.v>0;
const coated = S=>S.fT>0;
const WHEEL_KEYS = ['wE','wNu','wT','wPa','wTen','wAlpha','wTmax','wKt'];
const FLOOR_KEYS = ['fT','fE','fNu','fComp','fRed','fTen','bond'];

/* l 라벨 · u 단위 · t 단계 · i 영향도 · h 도움말(꼭 알아야 하는지 중심) · when 적용 조건
   blank:'error' — 비워 두면 기본값으로 대체하지 않는 값(필수 입력·설계 기준) */
const INPUTS = {
  /* ── 하중 ── */
  loadMode:{l:'하중 입력 방식', t:'req', i:'vh', g:'Load', h:'중량·배치로 바퀴 하중을 산출하거나, 이미 아는 캐스터당 하중을 직접 입력합니다.'},
  Wtare:{l:'로봇 중량', u:'kg', t:'req', i:'vh', g:'Load', when:build, step:10, h:'로봇·대차 자체 무게입니다. 적재하중과 합한 총중량이 모든 접촉압·발열의 출발점이므로 실제 값을 입력하세요.'},
  Wload:{l:'적재하중 (차량)', u:'kg', t:'req', i:'vh', g:'Load', when:build, step:10, h:'싣는 차량·화물의 최대 무게입니다. 최악 조건인 최대 적재를 입력하세요.'},
  Fdirect:{l:'캐스터당 하중 F', u:'N', t:'req', i:'vh', g:'Load', when:S=>!build(S), step:10, h:'캐스터 하나가 받는 주행 하중을 이미 알고 있을 때만 사용합니다. 배치·편심·가감속 계산을 건너뜁니다.'},
  nRow:{l:'휠 열 수 (전후)', u:'열', t:'req', i:'vh', g:'Load', when:grid4, step:1, min:1, h:'하중을 나눠 받는 바퀴 수를 정합니다. 기본은 2열 × 2행 4점 접지입니다.'},
  nCol:{l:'휠 행 수 (좌우)', u:'행', t:'req', i:'vh', g:'Load', when:grid4, step:1, min:1, h:'하중을 나눠 받는 바퀴 수를 정합니다. 기본은 2열 × 2행 4점 접지입니다.'},
  wb:{l:'축거 (전후)', u:'mm', t:'req', i:'m', g:'Load', when:build, step:50, h:'편심·가감속 하중 이동의 지렛대 길이입니다. 3점 접지에서는 전후 구동부 사이 거리입니다. 편심이 작으면 영향이 작지만 도면에서 바로 알 수 있는 값입니다.'},
  tr:{l:'윤거 (좌우)', u:'mm', t:'req', i:'m', g:'Load', when:build, step:50, h:'좌우 편심과 선회 하중 이동의 지렛대 길이입니다. 3점 접지에서는 구동부 축선에서 캐스터까지의 좌우 거리입니다.'},
  ex:{l:'무게중심 편심 eₓ', u:'mm', t:'imp', i:'c', g:'Load', when:build, step:10, h:'무게중심이 배치 중심에서 전후로 벗어난 거리입니다. 모르면 기본값을 쓸 수 있지만 3점 접지·1열 배치에서는 판정을 좌우합니다.'},
  ey:{l:'무게중심 편심 e_y', u:'mm', t:'imp', i:'c', g:'Load', when:build, step:10, h:'무게중심이 좌우로 벗어난 거리입니다. 3점 접지(구동부 2 + 캐스터)에서는 원점이 접지 삼각형 도심이며 + 방향이 캐스터 쪽입니다. 캐스터 분담과 전도 여부를 좌우합니다.'},
  supportMode:{l:'접지 조건', t:'imp', i:'c', g:'Load', when:build, h:'4점 접지가 기본입니다. 틸팅 구동부 2개(전후)와 중앙 캐스터 1개로 서는 로봇은 3점 접지를, 4바퀴 중 하나가 뜨는 경우는 들림 검토를 선택합니다.'},
  liftedWheel:{l:'비접지 바퀴', t:'imp', i:'c', g:'Load', when:S=>build(S)&&S.supportMode==='three', h:'3점 접지에서 바닥에 닿지 않는 바퀴입니다.'},
  hcg:{l:'무게중심 높이 h_cg', u:'mm', t:'imp', i:'m', g:'Load', when:build, step:25, h:'가감속·선회 시 동적 하중 이동에만 사용됩니다. 정확한 값을 모르면 기본값 사용이 가능합니다.'},
  ax:{l:'가감속 aₓ', u:'m/s²', t:'imp', i:'h', g:'Load', when:S=>build(S)||S.maneuver==='drive', step:.1, h:'직진 가감속에 필요한 접선력(계면 전단·표면 인장)과 전후 하중 이동에 쓰입니다. 제어기의 최대 가감속을 알면 입력하세요.'},
  ay:{l:'횡가속 a_y', u:'m/s²', t:'imp', i:'l', g:'Load', when:build, step:.1, h:'선회 원심 가속에 의한 좌우 하중 이동입니다. 저속 로봇은 영향이 작습니다.'},
  kSauto:{l:'단차 충격계수 자동', t:'imp', i:'c', g:'Load', h:'켜면 단차 높이·속도로 충격 피크 하중을 추정합니다.'},
  hstep:{l:'단차 높이 h_step', u:'mm', t:'imp', i:'m', g:'Load', when:S=>S.kSauto&&build(S)&&moving(S), step:.5, h:'줄눈·턱 통과 시 충격 피크 하중을 추정합니다. 현장 최대 단차를 알면 입력하세요.'},
  mUns:{l:'언스프렁 질량비', t:'imp', i:'m', g:'Load', when:S=>S.kSauto&&build(S)&&moving(S), step:.05, h:'서스펜션이 없으면 1입니다. 서스펜션이 있을 때만 바퀴 쪽 질량 비율로 줄입니다.'},
  kS:{l:'충격계수 kS (수동)', u:'×', t:'imp', i:'c', g:'Load', when:S=>!S.kSauto, step:.05, h:'자동 계산을 끈 경우에만 쓰며 피크 하중에 그대로 곱해집니다.'},
  k3:{l:'바닥 평탄도 재분배 계수', u:'×', t:'exp', i:'h', g:'Load', when:S=>build(S)&&S.supportMode==='all', step:.05, h:'바닥 요철로 한 바퀴에 하중이 몰리는 설계 여유입니다. 하중에 직접 곱해지지만 근거 자료가 없으면 기본값을 유지하세요.'},
  etaImp:{l:'충격 감쇠 보정 η', t:'exp', i:'h', g:'Load', when:S=>S.kSauto&&build(S)&&moving(S)&&S.hstep>0, step:.05, h:'운동량 상한 대비 실제 충격 비율의 경험값입니다. 실측 없이는 기본값을 유지하세요.'},

  /* ── 바퀴 ── */
  wPre:{l:'바퀴 재질', t:'req', i:'vh', g:'Wheel', h:'접촉압·허용압·발열 물성이 함께 바뀌는 가장 큰 선택입니다.'},
  D:{l:'직경 D', u:'mm', t:'req', i:'vh', g:'Wheel', step:5, min:40, max:600, h:'접촉압과 발열에 직접 영향을 줍니다. 실제 적용할 휠 외경을 입력하세요.'},
  L:{l:'폭 L', u:'mm', t:'req', i:'h', g:'Wheel', step:5, min:15, max:300, h:'접촉 길이를 정해 접촉압·단부압에 직접 영향을 줍니다. 트레드 실제 폭을 입력하세요.'},
  wT:{l:'트레드 두께', u:'mm', t:'imp', i:'h', g:'Wheel', step:.5, h:'허브에 붙은 트레드가 얇을수록 겉보기 강성이 올라 접촉압이 커집니다. 제조사 도면 값을 권장합니다. 0 = 일체형.',
      warn:'트레드 두께가 기본값입니다. 도면 값을 입력하면 접촉압 결과의 신뢰도가 높아집니다.'},
  edgeR:{l:'에지 라운드 R_e', u:'mm', t:'imp', i:'m', g:'Wheel', when:line, step:.5, h:'바퀴 모서리 라운드로 단부 응력집중을 낮춥니다. 도면 값이 없으면 기본값 사용이 가능합니다.'},
  crown:{l:'크라운 반경', u:'mm', t:'imp', i:'c', g:'Wheel', step:25, h:'0이면 평면 트레드입니다. 값을 넣으면 타원 접촉으로 바뀌며 현재 모델은 종합 불가로 처리합니다.'},
  wE:{l:'탄성계수 E₁', u:'MPa', t:'imp', i:'m', g:'Wheel', step:1, mat:true, h:'접촉폭과 접촉압에 영향을 줍니다. 재질 선택 시 통상값이 들어가며 제조사 물성이 있으면 교체하세요.',
      warn:'바퀴 탄성계수가 기본값으로 계산되었습니다. 실제 제조사 물성을 입력하면 접촉압 결과의 신뢰도가 높아집니다.'},
  wNu:{l:'포아송비 ν₁', t:'imp', i:'h', g:'Wheel', step:.01, mat:true, h:'PU처럼 0.5에 가까운 재료는 0.01 차이로도 트레드 구속 강성이 크게 바뀝니다. 근거가 없으면 재질 기본값을 유지하세요.'},
  wPa:{l:'허용 접촉면압', u:'MPa', t:'imp', i:'h', g:'Wheel', step:1, mat:true, h:'표면압 판정의 기준입니다. 제조사 허용면압을 알면 입력하세요.',
      warn:'바퀴 허용 접촉면압이 기본값입니다. 제조사 허용면압을 입력하면 표면압 판정의 신뢰도가 높아집니다.'},
  wTen:{l:'인장강도', u:'MPa', t:'imp', i:'c', g:'Wheel', step:1, mat:true, h:'바퀴 인장강도가 도막·콘크리트보다 낮을 때만 판정을 바꿉니다.'},
  wTmax:{l:'허용 온도', u:'°C', t:'imp', i:'c', g:'Wheel', step:5, mat:true, h:'발열 판정 기준입니다. 발열이 판정을 지배할 때 영향이 큽니다.',
      warn:'바퀴 허용 온도가 기본값입니다. 제조사 연속 사용 온도를 입력하면 발열 판정의 신뢰도가 높아집니다.'},
  wAlpha:{l:'히스테리시스 손실률 α', t:'exp', i:'c', g:'Wheel', when:moving, step:.005, mat:true, h:'발열 크기에 비례합니다. 직접 바꾸기보다 열 · 듀티 탭의 제조사 정격점 캘리브레이션을 권장합니다.',
      warn:'발열 손실률이 기본값입니다. 제조사 정격점으로 캘리브레이션하면 온도 결과의 신뢰도가 높아집니다.'},
  wKt:{l:'면압 온도저감 계수', u:'/°C', t:'exp', i:'l', g:'Wheel', step:.001, mat:true, h:'고온에서 허용면압을 낮추는 보정값입니다. 일반 사용자는 변경하지 않아도 됩니다.'},

  /* ── 바닥 ── */
  fPre:{l:'바닥 마감', t:'req', i:'h', g:'Floor', h:'도막 여부와 종류가 기재 전달압·박리·인장 판정 기준을 정합니다.'},
  fT:{l:'도막 두께 t', u:'mm', t:'imp', i:'m', g:'Floor', when:S=>S.fT>0||S.fPre!=='bare', step:.1, mat:true, h:'콘크리트 전달압과 도막 분류에 쓰입니다. 시공 두께를 알면 입력하세요. 0 = 무도장.'},
  fck:{l:'콘크리트 f_ck', u:'MPa', t:'imp', i:'h', g:'Floor', step:1, h:'기재 전달압·표면 인장 허용치를 정합니다. 바닥 설계 강도를 입력하세요.',
      warn:'콘크리트 강도 f_ck가 기본값입니다. 설계 강도를 입력하면 기재 판정의 신뢰도가 높아집니다.'},
  bond:{l:'부착강도', u:'MPa', t:'imp', i:'h', g:'Floor', when:coated, step:.1, mat:true, h:'선회·가감속 시 도막 박리 판정 기준입니다. 도막 제조사·시험값을 입력하세요.',
      warn:'도막 부착강도가 기본값입니다. 시험값 또는 제조사 값을 입력하면 박리 판정의 신뢰도가 높아집니다.'},
  fComp:{l:'도막 압축강도', u:'MPa', t:'imp', i:'c', g:'Floor', when:coated, step:5, mat:true, h:'도막 허용면압을 정합니다. 바퀴보다 도막이 약할 때 판정을 지배합니다.'},
  fTen:{l:'도막 인장강도', u:'MPa', t:'imp', i:'c', g:'Floor', when:coated, step:1, mat:true, h:'도막이 두꺼워 스스로 하중을 받을 때 표면 인장 판정 기준이 됩니다.'},
  fE:{l:'도막 탄성계수 E₂', u:'MPa', t:'imp', i:'l', g:'Floor', when:coated, step:100, mat:true, h:'층상 비교를 켜면 더 단단한 기재가 선택되는 경우가 많아 영향이 작습니다.'},
  fNu:{l:'도막 포아송비 ν₂', t:'exp', i:'l', g:'Floor', when:coated, step:.01, mat:true, h:'영향이 작습니다. 일반 사용자는 변경하지 않아도 됩니다.'},
  fRed:{l:'전동접촉 저감계수', t:'exp', i:'c', g:'Floor', when:coated, step:.05, mat:true, h:'압축강도 대비 허용 접촉압 비율의 경험값입니다. 도막 면압이 지배할 때만 영향이 큽니다.'},
  R2:{l:'바닥 곡률 R₂', u:'mm', t:'exp', i:'c', g:'Floor', step:50, h:'레일 등 곡면 위를 구를 때만 사용합니다. 평면 바닥은 0, 오목은 음수입니다.'},
  EcMan:{l:'E_c 수동 지정', u:'MPa', t:'exp', i:'l', g:'Floor', step:1000, h:'0이면 ACI 식으로 자동 계산합니다. 실측 탄성계수가 있을 때만 입력하세요.'},
  bearingAreaRatio:{l:'지압 면적비 A₂/A₁', t:'exp', i:'c', g:'Floor', step:.1, min:1, max:4, h:'검증된 지지 면적비가 있을 때만 1보다 크게 둡니다. 기재 전달압이 지배할 때 영향이 큽니다.'},
  bareBondFactor:{l:'무도장 표면 부착 비', t:'exp', i:'c', g:'Floor', when:S=>!coated(S), step:.05, h:'콘크리트 인장강도 대비 표면 인발 허용 비의 경험값입니다. 무도장 선회에서만 영향이 큽니다.'},

  /* ── 주행 ── */
  v:{l:'주행 속도 v', u:'m/s', t:'req', i:'h', g:'Run', step:.05, min:0, max:3, h:'구름 발열과 단차 충격에 직접 영향을 줍니다. 연속 운전 최고 속도를 입력하세요.'},
  maneuver:{l:'기동 조건', t:'req', i:'vh', g:'Run', h:'제자리 선회는 완전 미끄럼이 되어 계면 전단·표면 인장이 크게 늘어납니다.'},
  duty:{l:'듀티 사이클', t:'imp', i:'c', g:'Run', when:moving, step:.05, min:0, max:1, h:'전체 시간 중 주행 비율로 발열에 비례합니다. 발열이 판정을 지배하지 않으면 기본값 사용이 가능합니다.'},
  Tamb:{l:'주위 온도', u:'°C', t:'imp', i:'m', g:'Run', step:1, h:'허용 온도까지의 여유를 정합니다. 일반 실내라면 기본값 사용이 가능합니다.'},
  mu:{l:'마찰계수 μ (가용)', t:'imp', i:'c', g:'Run', when:S=>S.maneuver!=='manual', step:.05, h:'제자리 선회에서는 계면 전단·표면 인장에 그대로 곱해집니다. 직진에서는 슬립 한계로만 쓰입니다.'},
  muMan:{l:'접선력비 (직접 지정)', t:'imp', i:'c', g:'Run', when:S=>S.maneuver==='manual', step:.01, h:'기동 조건을 직접 지정할 때만 사용합니다.'},
  grade:{l:'램프 경사', t:'imp', i:'c', g:'Run', when:S=>S.maneuver==='drive', step:.01, h:'경사로 주행 시 필요한 접선력에 더해집니다. 경사가 있으면 계면 전단 결과를 크게 바꿉니다.'},
  hNat:{l:'대류계수 (정지)', u:'W/m²K', t:'exp', i:'l', g:'Run', when:moving, step:1, h:'열 계산 보정값입니다. 일반 사용자는 변경하지 않아도 됩니다.'},
  hVel:{l:'속도 대류 기울기', t:'exp', i:'l', g:'Run', when:moving, step:1, h:'열 계산 보정값입니다. 일반 사용자는 변경하지 않아도 됩니다.'},
  UAhub:{l:'허브 전도 UA', u:'W/K', t:'exp', i:'l', g:'Run', when:moving, step:.05, h:'허브로 빠지는 열 경로입니다. 일반 사용자는 변경하지 않아도 됩니다.'},
  rthScale:{l:'열 보정계수 (α·R_th 곱)', t:'exp', i:'c', g:'Run', when:moving, step:.05, h:'제조사 정격점 캘리브레이션 결과입니다. 열 · 듀티 탭에서 계산해 적용하세요.'},

  /* ── 해석 옵션 · 경험계수 ── */
  confine:{l:'트레드 허브 구속 보정', t:'exp', i:'c', g:'Opt', h:'얇은 트레드의 겉보기 강성 상승을 반영합니다. 끄면 접촉압을 과소평가할 수 있습니다.'},
  layer:{l:'도막·기재 균질체 비교', t:'exp', i:'c', g:'Opt', h:'두 균질 반무한체 중 높은 면압을 사용합니다.'},
  kGent:{l:'Gent 계수 k', t:'exp', i:'m', g:'Opt', when:S=>S.confine&&S.wT>0, step:.05, h:'트레드 구속 보정의 경험계수로 재료 경도에 따라 0.5~1.0입니다. 일반 사용자는 변경하지 않아도 됩니다.'},
  nuOv:{l:'포아송비 일괄 지정', t:'exp', i:'c', g:'Opt', step:.01, h:'0이면 재질 값을 사용합니다. 비교 검토용이며 일반 사용자는 변경하지 않아도 됩니다.'},
  nuOvAll:{l:'바닥에도 적용', t:'exp', i:'l', g:'Opt', h:'포아송비 일괄 지정을 바닥에도 적용합니다.'},
  K0:{l:'단부 예리단부 K₀', t:'exp', i:'c', g:'Crit', when:line, step:.1, min:1, h:'유한 폭 롤러 단부 응력집중의 경험계수(실측·FEM 범위 2~3)입니다. 단부압이 판정을 지배할 때만 영향이 큽니다.'},
  edgeDecay:{l:'단부 완화 계수', t:'exp', i:'l', g:'Crit', when:line, step:.1, h:'에지 라운드가 단부 집중을 줄이는 정도의 경험계수입니다. 일반 사용자는 변경하지 않아도 됩니다.'},
  edgeAllow:{l:'단부 국부항복 허용배수', t:'exp', i:'c', g:'Crit', when:line, step:.05, h:'단부 국부 항복 재분배를 허용하는 정책값입니다. 단부압이 지배할 때 영향이 큽니다.'},

  /* ── 판정 기준 ── */
  SF:{l:'안전율 SF', t:'imp', i:'h', g:'Crit', step:.1, min:1, blank:'error', h:'모든 허용치를 나누는 설계 기준입니다. 사내 기준이 있으면 입력하세요. 비워 둘 수 없습니다.'},
  brW:{l:'b/R 주의', t:'exp', i:'j', g:'Crit', step:.01}, brF:{l:'b/R 불가', t:'exp', i:'j', g:'Crit', step:.01},
  ttW:{l:'t_tread/b 주의', t:'exp', i:'j', g:'Crit', step:.05}, ttF:{l:'t_tread/b 불가', t:'exp', i:'j', g:'Crit', step:.05},
  tbW:{l:'t_coat/b 주의', t:'exp', i:'j', g:'Crit', step:.1}, tbF:{l:'t_coat/b 불가', t:'exp', i:'j', g:'Crit', step:.1},
  arW:{l:'L/2b 주의', t:'exp', i:'j', g:'Crit', step:.5}, arF:{l:'L/2b 불가', t:'exp', i:'j', g:'Crit', step:.5},
  surfOver:{l:'면압 불가 비율', t:'exp', i:'j', g:'Crit', step:.05, min:1},
  edgeOver:{l:'단부압 불가 비율', t:'exp', i:'j', g:'Crit', step:.05, min:1},
  stressOver:{l:'인장·전단 불가 비율', t:'exp', i:'j', g:'Crit', step:.05, min:1},
  impactMax:{l:'충격계수 계산 상한', t:'exp', i:'j', g:'Crit', step:.5, min:1},
  unconfWarn:{l:'구속 OFF t/b 주의', t:'exp', i:'j', g:'Crit', step:.1},
  unconfBad:{l:'구속 OFF t/b 불가', t:'exp', i:'j', g:'Crit', step:.1},
};
for(const [k,m] of Object.entries(INPUTS)) if(m.i==='j'&&!m.h) m.h='판정 경계값입니다. 계산 수치는 바뀌지 않으며 일반 사용자는 변경하지 않아도 됩니다.';

const inputMeta = k=>INPUTS[k]||{l:k,t:'exp',i:'l'};
const inputRelevant = (k,S)=>{const m=INPUTS[k]; return !!m && (!m.when || !!m.when(S));};

/* 비워 둔 입력을 대신할 기본값. 재료 물성은 현재 선택한 재질·바닥 프리셋 값이다. */
function defaultValueFor(S,k){
  const T={...DEFAULTS, fck:S.fck, EcMan:S.EcMan};
  if(WHEEL_KEYS.includes(k)){ applyWheel(T,S.wPre); return T[k]; }
  if(FLOOR_KEYS.includes(k)){ applyFloor(T,S.fPre); return T[k]; }
  return DEFAULTS[k];
}
function initialSources(value='default'){ return Object.fromEntries(Object.keys(INPUTS).map(k=>[k,value])); }
/* 저장 파일의 출처 표시를 검증한다. 출처가 없던 이전 파일은 기본값과 다른 값만 사용자 입력으로 본다. */
function importSources(value, S){
  const out=initialSources();
  const saved=value&&typeof value._sources==='object'&&!Array.isArray(value._sources)?value._sources:null;
  for(const k of Object.keys(INPUTS)){
    if(saved) out[k]=Object.hasOwn(VALUE_SOURCES,saved[k])?saved[k]:'default';
    else out[k]=S[k]===defaultValueFor(S,k)?'default':'user';
  }
  return out;
}

/* 비어 있어 계산을 진행할 수 없는 입력(필수 또는 blank:'error') */
function missingInputs(S){
  return Object.entries(INPUTS).filter(([k,m])=>(m.t==='req'||m.blank==='error')&&typeof DEFAULTS[k]==='number'
    &&inputRelevant(k,S)&&!Number.isFinite(S[k])).map(([k])=>k);
}

/* 판정별 이용률. 1 이상이면 허용치를 넘는다. 온도는 섭씨 비율이 아니라 온도 상승 여유로 본다. */
function checkRatios(c){
  const S=c.S, room=c.W.Tmax-S.Tamb;
  const out={pSurf:c.r.pmax/c.allow.surf, pSub:c.pSub/c.allow.conc, bond:c.sf.tauInt/c.allow.bond,
    tens:c.sf.sigT/c.allow.tens, bR:c.bR/S.brW};
  if(c.line) out.pEdge=c.pEdge/(c.allow.surf*S.edgeAllow);
  if(room>0) out.therm=c.th.dT/room;
  return Object.fromEntries(Object.entries(out).filter(([,v])=>Number.isFinite(v)&&v>0));
}
const CHECK_NAMES={pSurf:'최대 접촉압 판정',pEdge:'단부 응력집중 판정',pSub:'기재 전달압 판정',bond:'계면 전단(박리) 판정',
  tens:'표면 인장 판정',therm:'트레드 온도 상승',bR:'b/R 미소변형 판정'};
function focusCheck(c){
  const R=checkRatios(c);
  if(c.driver&&R[c.driver.id]) return c.driver.id;
  return Object.keys(R).reduce((a,b)=>a&&R[a]>=R[b]?a:b, null);
}

/* 결과 민감도 — 입력 하나만 +10%/−10% 바꾼 재계산. 계산식은 그대로 쓴다.
   총중량은 로봇·적재를 같은 비율로 바꾼다. 포아송비는 0.5 한계 때문에 ±0.01로 본다. */
const SENS_KEYS=['W','Fdirect','D','L','wT','edgeR','v','duty','ax','hcg','ex','ey','wb','tr','hstep','mUns',
  'wE','wNu','wPa','wTen','wTmax','wAlpha','fT','fck','bond','fComp','fTen','mu','grade','Tamb','SF','k3','K0','etaImp'];
const SENS_LABEL={W:'총중량 (로봇 + 적재)'};
function perturb(S,k,dir){
  if(k==='W') return (S.Wtare+S.Wload)>0?{Wtare:S.Wtare*(1+.1*dir),Wload:S.Wload*(1+.1*dir)}:null;
  if(!(S[k]>0)) return null;
  if(k==='wNu') return {wNu:Math.min(S.wNu+.01*dir,.499)};
  const p={[k]:S[k]*(1+.1*dir)};
  if(k==='fck'&&!(S.fT>0)) p.fE=Math.round(concreteE({...S,...p}));
  return p;
}
function sensitivity(S,base){
  const c0=base||compute(S);
  if(!c0.ok) return null;
  const fid=focusCheck(c0), R0=checkRatios(c0);
  const items=[];
  for(const k of SENS_KEYS){
    if(k==='W'?!build(S):!inputRelevant(k,S)) continue;
    const row={k, label:SENS_LABEL[k]||inputMeta(k).l, step:k==='wNu'?'±0.01':'±10%', d:{}, p:{}, flip:null};
    for(const dir of [1,-1]){
      const patch=perturb(S,k,dir); if(!patch) continue;
      const c=compute({...S,...patch},{fast:true}); if(!c.ok) continue;
      const R=checkRatios(c);
      if(fid&&R[fid]>0) row.d[dir]=R[fid]/R0[fid]-1;
      row.p[dir]=c.r.pmax/c0.r.pmax-1;
      if(c.worst!==c0.worst&&!row.flip) row.flip={dir,to:c.worst};
    }
    row.mag=Math.max(0,...Object.values(row.d).map(Math.abs));
    row.pmag=Math.max(0,...Object.values(row.p).map(Math.abs));
    if(row.mag>0||row.pmag>0||row.flip) items.push(row);
  }
  items.sort((a,b)=>(b.mag-a.mag)||(b.pmag-a.pmag));
  return {focus:fid, focusName:CHECK_NAMES[fid]||'판정 이용률', items};
}

/* 입력 품질과 모델 적용성을 합친 결과 신뢰도(A~D). 판정(가능/불가)과는 별개다. */
const GRADE_TEXT={A:'입력 확인·모델 적용 범위 안',B:'일부 기본값 또는 근사 모델',C:'주요 값이 기본값이거나 모델 적용 한계',D:'필수 입력 미확인 — 예시값 계산'};
function inputQuality(S,src,c){
  const rows=Object.entries(INPUTS).filter(([k,m])=>m.t!=='exp'&&m.i!=='j'&&inputRelevant(k,S));
  let sw=0,sq=0;
  const defaults=[], reqDefault=[], confirmed=[];
  for(const [k,m] of rows){
    const s=src[k]||'default', w=Math.max(IMPACT[m.i].w,.3)*(m.t==='req'?1.5:1);
    const q=s==='default'&&m.t==='req'?.2:SOURCE_QUALITY[s];
    sw+=w; sq+=w*q;
    if(s==='default'){ defaults.push(k); if(m.t==='req') reqDefault.push(k); }
    else confirmed.push(k);
  }
  const score=sw?sq/sw:1;
  let inputGrade=score>=.85?'A':score>=.7?'B':score>=.5?'C':'D';
  if(reqDefault.length&&inputGrade<'C') inputGrade='C';
  const reqTotal=rows.filter(([,m])=>m.t==='req').length;
  if(reqDefault.length===reqTotal&&reqTotal) inputGrade='D';
  const expertDefaults=Object.entries(INPUTS).filter(([k,m])=>m.t==='exp'&&['h','c'].includes(m.i)
    &&typeof DEFAULTS[k]==='number'&&inputRelevant(k,S)&&(src[k]||'default')==='default').map(([k])=>k);
  let modelGrade='A'; const modelNotes=[];
  if(c&&c.ok){
    for(const id of ['model','bR','tread','ar']){
      const g=c.G[id]; if(!g||g.s==='ok') continue;
      modelNotes.push({id,s:g.s,title:g.title});
      const gr=g.s==='bad'?'C':'B'; if(gr>modelGrade) modelGrade=gr;
    }
  }
  const grade=[inputGrade,modelGrade].sort().pop();
  const important=defaults.filter(k=>['vh','h'].includes(INPUTS[k].i));
  return {grade, score, inputGrade, modelGrade, modelNotes, total:rows.length, defaults, reqDefault, reqTotal,
    confirmed, expertDefaults, important, text:GRADE_TEXT[grade]};
}

/* 결과에 영향이 큰 기본값만 경고한다. 민감도 결과가 있으면 현재 조건 기준(5% 이상 또는 판정 변경)으로 고른다. */
function defaultWarnings(S,src,sens,limit=3){
  const isDefault=k=>(src[k]||'default')==='default';
  const pool=Object.entries(INPUTS).filter(([k,m])=>m.warn&&inputRelevant(k,S)&&isDefault(k));
  if(!sens) return [];
  const byKey=Object.fromEntries(sens.items.map(r=>[r.k,r]));
  return pool.map(([k,m])=>({k,msg:m.warn,row:byKey[k]})).filter(x=>x.row&&(x.row.mag>=.05||x.row.pmag>=.05||x.row.flip))
    .sort((a,b)=>b.row.mag-a.row.mag).slice(0,limit);
}
