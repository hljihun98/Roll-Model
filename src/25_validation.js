/* 입력 오류는 수식을 실행하기 전에 거부한다. JSON 불러오기에도 같은 규약 적용. */
function validateState(S){
  const errs=[];
  if(!S || typeof S!=='object' || Array.isArray(S)) return ['설정은 객체여야 합니다.'];
  for(const [k,v] of Object.entries(DEFAULTS)){
    if(typeof S[k]!==typeof v || (typeof v==='number' && !Number.isFinite(S[k])))
      errs.push(`${k}: ${typeof v==='number'?'유한한 숫자':'올바른 형식'}가 필요합니다.`);
  }
  if(errs.length) return errs;
  const choices={wPre:Object.keys(WHEELS),fPre:Object.keys(FLOORS),mode:['easy','pro'],
    tab:['chain','thermal','matrix','reverse','sources'],loadMode:['build','direct'],maneuver:['drive','spin','manual'],supportMode:['all','three']};
  for(const [k,vs] of Object.entries(choices)) if(!vs.includes(S[k])) errs.push(`${k}: 지원하지 않는 값입니다.`);
  const positive=['D','L','wE','wPa','wTen','fck','g','wb','tr','calF','calV','calD','calL',
    'alphaScale','rthScale','brW','brF','ttW','ttF','tbW','tbF','arW','arF','edgeDecay','impactMax','unconfWarn','unconfBad'];
  const nonnegative=['Wtare','Wload','Fdirect','hcg','hstep','etaImp','wT','edgeR','crown','wAlpha','wKt',
    'fT','fE','fComp','fRed','fTen','bond','EcMan','v','mu','muMan','hNat','hVel','UAhub','kGent','nuOv','bareBondFactor'];
  for(const k of positive) if(!(S[k]>0)) errs.push(`${k}: 0보다 커야 합니다.`);
  for(const k of nonnegative) if(S[k]<0) errs.push(`${k}: 음수는 사용할 수 없습니다.`);
  for(const k of ['SF','k3','kS','K0','edgeAllow','surfOver','edgeOver','stressOver','impactMax'])
    if(S[k]<1) errs.push(`${k}: 1 이상이어야 합니다.`);
  for(const k of ['wNu','fNu','nuOv']) if(S[k]<0||S[k]>=0.5) errs.push(`${k}: 0 이상 0.5 미만이어야 합니다.`);
  for(const k of ['duty','mUns','fRed','etaImp']) if(S[k]<0||S[k]>1) errs.push(`${k}: 0~1 범위여야 합니다.`);
  if(S.mUns===0) errs.push('mUns: 0보다 커야 합니다.');
  if(S.bareBondFactor===0) errs.push('bareBondFactor: 0보다 커야 합니다.');
  for(const k of ['nRow','nCol']) if(!Number.isInteger(S[k])||S[k]<1||S[k]>32) errs.push(`${k}: 1~32 정수여야 합니다.`);
  if(!Number.isInteger(S.liftedWheel)||S.liftedWheel<0||S.liftedWheel>3) errs.push('비접지 바퀴는 1~4번 중 선택하십시오.');
  if(S.loadMode==='build'&&S.supportMode==='three'&&(S.nRow!==2||S.nCol!==2)) errs.push('3점 접지는 2열 × 2행의 4바퀴 배치에서 사용할 수 있습니다.');
  if(S.wT>=S.D/2) errs.push('트레드 두께는 바퀴 반지름보다 작아야 합니다.');
  if(2*S.edgeR>=S.L) errs.push('에지 라운드의 두 배는 바퀴 폭보다 작아야 합니다.');
  if(S.hstep>=S.D/2 && S.kSauto && S.loadMode==='build' && S.v>0) errs.push('반지름 이상의 단차에는 충격 근사를 사용할 수 없습니다.');
  if(S.R2!==0 && 1/(S.D/2)+1/S.R2<=0) errs.push('바닥 오목 곡률은 바퀴 반지름보다 완만해야 합니다.');
  if(S.fT>0 && !(S.fE>0&&S.fComp>0&&S.fRed>0&&S.fTen>0&&S.bond>0)) errs.push('도막이 있으면 탄성계수·강도·저감계수를 양수로 입력하십시오.');
  if(S.Tamb<=-273.15||S.wTmax<=-273.15) errs.push('온도는 절대영도보다 높아야 합니다.');
  if(S.hNat+S.hVel*S.v+S.UAhub<=0) errs.push('방열 경로가 없어 정상상태 열해를 계산할 수 없습니다.');
  if(S.brW>S.brF||S.ttW<S.ttF||S.tbW<S.tbF||S.arW<S.arF||S.unconfWarn<S.unconfBad)
    errs.push('주의·불가 기준의 순서가 뒤집혔습니다.');
  if(S.bearingAreaRatio<1||S.bearingAreaRatio>4) errs.push('지압 면적비 A₂/A₁은 1~4 범위여야 합니다.');
  return errs;
}

function importState(value){
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('설정 파일 형식이 올바르지 않습니다.');
  if(value._app && value._app!=='ROLLMODEL') throw new Error('롤모델 설정 파일이 아닙니다.');
  const next={...DEFAULTS};
  for(const k of Object.keys(DEFAULTS)) if(Object.hasOwn(value,k)) next[k]=value[k];
  const errs=validateState(next);
  if(errs.length) throw new Error(errs[0]);
  const c=compute(next);
  if(!c.ok) throw new Error(c.error);
  return next;
}
