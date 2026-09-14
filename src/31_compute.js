/* ============================================================================
   COMPUTE — 계산 체인을 단계(stage)와 게이트(gate)로 조립하고
   모든 값에 근거 레코드(수식 · 대입 · 출처 · 신뢰도)를 붙인다.
   두 하중 케이스를 병렬로 푼다:  F_op 주행(연속) / F_pk 단차 통과(피크)
   ========================================================================= */
const ST = {ok:0, warn:1, bad:2};
const worstOf = a => a.reduce((x,s)=> ST[s]>ST[x]?s:x, 'ok');
const band   = (v,o,w)=> v>=o?'ok':(v>=w?'warn':'bad');
const bandLo = (v,o,w)=> v<=o?'ok':(v<=w?'warn':'bad');
const effLen = S => S.L - 2*S.edgeR;

/* 프리셋 → 상태 (프리셋은 씨앗일 뿐, 이후 모든 값은 상태가 진실) */
function applyWheel(S,k){ const w=WHEELS[k]; Object.assign(S,{wPre:k,
  wE:w.E,wNu:w.nu,wT:w.tread,wPa:w.pa,wTen:w.ten,wAlpha:w.alpha,wTmax:w.Tmax,wKt:w.kT}); return S; }
function applyFloor(S,k){ const f=FLOORS[k]; const Ec=concreteE(S); Object.assign(S,{fPre:k,
  fT:f.t, fE:f.t>0?f.E:Math.round(Ec), fNu:f.t>0?f.nu:0.20, fComp:f.t>0?f.comp:0, fRed:f.red,
  fTen:f.t>0?f.ten:0, bond:f.t>0?f.bond:0}); return S; }

/* 기동 조건 → 실제 동원 마찰계수 μ_util */
function utilMu(S, froll){
  if(S.maneuver==='spin')   return {mu:S.mu,  n:'제자리 선회 (완전 미끄럼)', full:true};
  if(S.maneuver==='manual') return {mu:S.muMan, n:'사용자 지정 접선력비', full:false};
  const need = Math.abs(S.ax)/S.g + froll + Math.abs(S.grade||0);
  return {mu:Math.min(need, S.mu), n:'직진 가감속 (부분 슬립)', full:false, need};
}

function computeCore(S, opts={}){
  const inputErrors=validateState(S);
  if(inputErrors.length) return {error:inputErrors[0],errs:inputErrors,S};
  const WN = WHEELS[S.wPre], FN = FLOORS[S.fPre];
  const W = {n:WN.n, c:WN.c, pa:S.wPa, ten:S.wTen, alpha:S.wAlpha, Tmax:S.wTmax, kT:S.wKt};
  const bare = !(S.fT>0), Ec = concreteE(S);
  const nu1 = S.nuOv>0 ? S.nuOv : S.wNu;
  const nu2 = bare ? 0.20 : (S.nuOv>0 && S.nuOvAll ? S.nuOv : S.fNu);

  const errs=[];
  if(!(S.D>0))                  errs.push('바퀴 직경 D가 0 이하입니다.');
  if(!(effLen(S)>0))            errs.push('유효 접촉길이가 0 이하입니다. 폭 L과 에지 라운드 R_e를 확인하십시오.');
  if(!(S.wE>0))                 errs.push('바퀴 탄성계수 E₁이 0 이하입니다.');
  if(!((bare?Ec:S.fE)>0))       errs.push('바닥 탄성계수 E₂가 0 이하입니다.');
  if(!(S.fck>0))                errs.push('콘크리트 강도 f_ck가 0 이하입니다.');
  if(!(nu1>=0&&nu1<0.5))        errs.push(`바퀴 포아송비 ν₁ = ${nu1} 가 유효범위(0 ≤ ν < 0.5)를 벗어났습니다.`);
  if(!(nu2>=0&&nu2<0.5))        errs.push(`바닥 포아송비 ν₂ = ${nu2} 가 유효범위(0 ≤ ν < 0.5)를 벗어났습니다.`);
  if(S.R2 && (1/(S.D/2)+1/S.R2)<=0) errs.push(`바닥 오목 곡률 R₂ = ${S.R2} mm 가 바퀴 반지름보다 완만하지 않습니다.`);

  // 자동 충격 계산의 두 번째 단계만 동일 주행 케이스를 재사용한다.
  const operating=opts.operating;
  const LC = operating?.LC || loadChain(S);
  const kSeff = (S.loadMode==='direct' && S.kSauto) ? 1 : Math.max(S.kS,1);
  const Fop = LC.Fop, Fpk = Fop*kSeff;
  if(!(Fop>0)) errs.push('캐스터당 설계하중이 0 이하입니다.');
  if(errs.length) return {error:errs[0], errs, S};

  const I0 = {D:S.D, L:effLen(S), E1:S.wE, nu1, tread:S.wT,
    E2: bare?Ec:S.fE, nu2, t2:S.fT, Esub:Ec, nuSub:0.20,
    R2:S.R2, crown:S.crown, confine:S.confine, layer:S.layer, kGent:S.kGent};

  const solveAt = F=>{
    const I = {...I0, F};
    let rr = (S.crown>0) ? solveEllipse(I) : solveLine(I);
    let ovf = false;
    if(rr && rr.kind==='ellipse' && 2*rr.a >= I.L){ ovf=true; rr = solveLine(I); }
    if(rr) rr.overflow = ovf;
    return rr;
  };
  const rop = operating?.rop || solveAt(Fop), rpk = Fop===Fpk?rop:solveAt(Fpk);
  if(!rop||!rpk) return {error:'입력 조합에서 접촉해가 성립하지 않습니다.', errs:['등가 곡률 또는 재료 물성이 유효하지 않습니다.'], S};
  if(!rop.converged||!rpk.converged || [rop,rpk].some(r=>![r.b,r.a,r.pmax,r.Es,r.delta].every(Number.isFinite)))
    return {error:'유한한 접촉해로 수렴하지 않았습니다. 입력 범위와 모델 적용성을 확인하십시오.',errs:['접촉해 미수렴'],S};

  const Le = I0.L, line = rpk.kind==='line';
  const ar  = line ? Le/(2*rpk.b) : rpk.a/rpk.b;
  const SFv = S.SF;

  /* 단부 응력집중 (선접촉만) */
  const Kedge = line ? edgeFactor(S.edgeR, rpk.b, S.K0, S.edgeDecay) : 1.0;
  const pEdge = rpk.pmax*Kedge;

  /* 열 — 주행(연속) 케이스에서 산정 */
  const th   = operating?.th || thermal(S, {alpha:W.alpha, Tmax:W.Tmax}, rop, Fop);
  if(![th.T,th.P,th.Prr,th.Rth,th.f].every(Number.isFinite))
    return {error:'입력 범위에서 유한한 정상상태 열해를 계산할 수 없습니다.',errs:['열해 범위 초과'],S};
  const Fth  = operating ? operating.Fth : thermalAllow(S, W, rop, Fop, th, solveAt);
  if(!(Fth>=0)||(!Number.isFinite(Fth)&&th.dT>0)) return {error:'열 허용하중을 수렴 범위에서 찾지 못했습니다.',errs:['열 역산 미수렴'],S};
  const Tdes = Math.min(th.T, W.Tmax);                       // 허용온도까지만 저감
  const kTd  = clamp(1 - W.kT*(Tdes-23), 0.4, 1);

  /* 접선력 — 기동 조건에 따라 */
  const MU  = utilMu(S, th.f);
  const sfp = stressField(rpk, MU.mu);                       // 피크 케이스
  const sfo = stressField(rop, MU.mu);
  const pSub = subPressure(rpk.pmax, S.fT, rpk.b);

  /* 허용치 */
  const fctm    = concreteTens(S);
  const paWheel = W.pa*kTd/SFv;
  const paCoat  = bare ? Infinity : (S.fComp*S.fRed)/SFv;
  const paConc  = concreteBearing(S)/SFv;
  const cTb     = bare ? Infinity : S.fT/rpk.b;
  const tenFloor= (!bare && cTb>1 ? S.fTen : fctm);
  const tenLim  = Math.min(tenFloor, S.wTen>0?S.wTen:Infinity)/SFv;
  const tenGov  = (S.wTen>0 && S.wTen<tenFloor) ? '바퀴' : ((!bare&&cTb>1)?'도막':'콘크리트');
  const bondLim = (bare ? S.bareBondFactor*fctm : S.bond)/SFv;
  const surfLim = Math.min(paWheel, bare?paConc:paCoat);
  const surfGov = paWheel <= (bare?paConc:paCoat) ? '바퀴' : (bare?'콘크리트':'도막');

  /* ------------------------------------------------------------- 게이트 */
  const G={}, bR = line?rpk.b/rpk.R:Math.max(rpk.b/rpk.Rx,rpk.a/rpk.Ry), tTb = S.wT>0 ? S.wT/rpk.b : Infinity;
  const unsupported=LC.grid && ((LC.grid.nr===1&&Math.abs(LC.exq)>1e-9)||(LC.grid.nc===1&&Math.abs(LC.eyq)>1e-9));
  G.load={stage:1,sym:'R_min',title:'하중 분배 성립 여부',v:LC.fracMin,lim:'≥ 0 · 모멘트 지지 가능',
    s:LC.lift||unsupported?'bad':LC.marginal?'warn':'ok',
    why:LC.lift?'음의 휠 반력이 발생했습니다. 접촉 지지점을 다시 결정하는 해석이 필요하며 현재 하중을 설계에 사용할 수 없습니다.'
      :unsupported?'한 줄 지지점으로 편심 모멘트를 받을 수 없습니다. 지지 배치를 수정하십시오.'
      :LC.marginal?'합력 작용점이 지지 삼각형 경계에 있어 추가 바퀴 반력이 0입니다. 전도 여유가 없는 한계 상태입니다.'
      :S.loadMode==='direct'?'직접 입력 — 하중 분배 검토는 입력값 산정 과정에서 별도로 확인하십시오.'
      :S.supportMode==='three'?'선택한 비접지 바퀴를 제외한 3점의 반력이 양수이며 힘·모멘트 평형을 만족합니다.':'모든 휠 반력이 음수가 아니며 편심 모멘트를 지지할 배치입니다.',
    rat:{expr:LC.expr||'직접 입력 F_op',subs:`최소 분담률 = ${LC.fracMin.toFixed(6)}`,src:LC.source||'rigid',
      note:'휠 들림 또는 지지 불가능한 모멘트는 종합 판정·조합 비교·개선안에 모두 불가로 반영합니다.'}};
  G.model={stage:2,sym:'모델 적용',title:'접촉·층상 모델 적용성',v:0,lim:'검증된 적용 범위',
    s:!line||rpk.overflow||rop.overflow?'bad':!bare?'warn':'ok',
    why:!line?'타원 Hertz 접촉압은 계산했으나, 후속 전단·인장·기재 전달·열 모델은 선접촉 근사입니다. 3D 해석 전에는 종합 통과할 수 없습니다.'
      :rpk.overflow||rop.overflow?'접촉 타원이 휠 폭을 넘었습니다. 표시값은 선접촉 참고값이며 유한 폭 3D 해석이 필요합니다.'
      :!bare?(S.layer?'도막·기재 각각의 균질 반무한체 중 높은 면압을 사용합니다. 실제 층상체의 상한은 보장하지 않으며 층상 해석 또는 실측으로 확인하십시오.'
        :'도막만 균질 반무한체로 계산합니다. 기재의 강성 효과를 반영하지 않으므로 층상 해석 또는 실측 확인이 필요합니다.'):'무도장 선접촉 — 추가 층상 근사 없음.',
    rat:{expr:'E_reduced = E/(1−ν²); 층상 비교 ON: max(E_coat,reduced, E_sub,reduced)',
      subs:`계산 바닥 E = ${rpk.E2e.toFixed(1)} MPa, ν = ${rpk.nu2e.toFixed(3)}, 접촉형 = ${rpk.kind}`,src:'layerScreen',
      note:'미확인 두께 보간 상수는 사용하지 않습니다. 재료별 반무한체 비교는 층상 탄성해가 아닙니다. 타원에서 표시하는 후속 선접촉 응력과 열 수치는 참고용입니다.'}};

  G.bR={stage:2, sym:'b / R', title:'헤르츠 미소변형 가정', v:bR, lim:`≤ ${S.brW}`,
    s:bandLo(bR,S.brW,S.brF),
    why: bR<=S.brW ? `접촉 반폭이 곡률반경의 ${(bR*100).toFixed(0)}%. 미소변형 가정 성립.`
       : bR<=S.brF ? `접촉 반폭이 곡률반경의 ${(bR*100).toFixed(0)}%. 선형해가 접촉폭을 과대·면압을 과소평가하는 쪽으로 기웁니다.`
       : `접촉 반폭이 곡률반경의 ${(bR*100).toFixed(0)}%. 선형 헤르츠 적용 불가 — 초탄성 FEM 영역입니다.`,
    rat:{expr:line?'b / R':'max(b/Rx, a/Ry)',
         subs:line?`${rpk.b.toFixed(3)} / ${rpk.R.toFixed(2)} = ${bR.toFixed(4)}`:`max(${(rpk.b/rpk.Rx).toFixed(4)}, ${(rpk.a/rpk.Ry).toFixed(4)}) = ${bR.toFixed(4)}`, src:'hertz',
         note:'헤르츠 해는 접촉면을 평면으로 근사합니다. 이 비가 커지면 그 근사 자체가 무너집니다.'}};

  const trS = S.wT<=0 ? 'ok'
            : !S.confine ? band(tTb,S.unconfWarn,S.unconfBad)
            : band(tTb, S.ttW, S.ttF);                        // 보정 적용 → 보정식의 유효범위를 본다
  G.tread={stage:2, sym:'t_tread / b', title: S.confine?'트레드 구속 보정 유효범위':'트레드 반무한체 가정',
    v:tTb, lim: S.confine?`≥ ${S.ttW}`:`≥ ${S.unconfWarn}`, s:trS,
    why: S.wT<=0 ? '일체형 솔리드 휠 — 층 구속 없음.'
       : !S.confine ? (tTb>=S.unconfWarn ? '트레드가 두꺼워 반무한체로 볼 수 있습니다.'
                     : `트레드가 접촉 반폭의 ${(tTb*100).toFixed(0)}%인데 구속 보정이 꺼져 있습니다. 허브 구속을 무시하므로 p_max가 과소평가됩니다 — 보정을 켜십시오.`)
       : tTb>=S.ttW ? `형상계수 S = ${rpk.conf.S.toFixed(2)}. Gent 보정의 검증 범위 안이며 겉보기 강성 ×${rpk.conf.ratio.toFixed(2)} 를 반영했습니다.`
       : tTb>=S.ttF ? `형상계수 S = ${rpk.conf.S.toFixed(2)}. 강한 구속으로 보정량이 커집니다 (×${rpk.conf.ratio.toFixed(2)}). 결과의 불확실성이 큽니다.`
       : `형상계수 S = ${rpk.conf.S.toFixed(2)}. 박막 구속 영역으로 형상계수 근사가 성립하지 않습니다 — FEM 필요.`,
    rat:{expr:'S = b/t,   x = 2k·S²,   E_app = E + (M−E)·x/(x + (M−E)/E),   M = E(1−ν)/((1+ν)(1−2ν))',
         subs: S.wT>0 ? `S = ${rpk.conf.S.toFixed(3)},  x = ${rpk.conf.x.toFixed(2)},  M = ${rpk.conf.M.toFixed(0)} MPa  →  E_app = ${rpk.E1e.toFixed(1)} MPa  (E₁ ${S.wE} MPa 의 ${rpk.conf.ratio.toFixed(2)}배)` : '해당 없음',
         src:'gent',
         note:'허브에 접착된 트레드는 옆으로 부풀지 못해 겉보기 강성이 올라갑니다. x→0 에서 Gent–Lindley E(1+2kS²), x→∞ 에서 구속탄성계수 M 으로 수렴하도록 보간했습니다. Gent 형상계수의 검증 범위는 대략 S ≤ 2 (= t/b ≥ 0.5) 입니다. 원본 계산기에는 이 효과가 없어 p_max 를 과소평가했습니다.'}};

  G.ar={stage:2, sym: line?'L / 2b':'a / b', title: line?'평면변형(2D) 가정':'접촉 타원 종횡비',
    v:ar, lim: line?`≥ ${S.arW}`:'—', s: line ? band(ar,S.arW,S.arF) : 'ok',
    why: !line ? `타원 접촉이므로 2D 가정이 필요 없습니다. 접촉 타원 ${(2*rpk.a).toFixed(1)} × ${(2*rpk.b).toFixed(2)} mm, 타원비 ${rpk.ellipK.toFixed(2)}.`
       : ar>=S.arW ? `접촉 자국 ${Le.toFixed(1)} × ${(2*rpk.b).toFixed(2)} mm — 2D 가정 성립.`
       : ar>=S.arF ? '접촉 띠가 짧습니다. 단부 응력집중이 결과를 지배합니다.'
       : (2*rpk.b>=Le ? `접촉 전폭 ${(2*rpk.b).toFixed(1)} mm 가 유효 접촉길이 ${Le.toFixed(1)} mm 를 넘습니다.`
                      : '접촉이 정사각형에 가까워 선접촉 해를 쓸 수 없습니다.'),
    rat:{expr:line?'L_eff / 2b,   L_eff = L − 2·R_e':'a / b',
         subs:line?`(${S.L} − 2×${S.edgeR}) / ${(2*rpk.b).toFixed(3)} = ${ar.toFixed(2)}`:`${rpk.a.toFixed(3)} / ${rpk.b.toFixed(3)} = ${ar.toFixed(2)}`, src:line?'hertz':'hb',
         note:'선접촉 해는 길이 무한대 띠를 가정합니다.'}};

  G.coat={stage:4, sym:'t_coat / b', title:'도막 반무한체 가정', v:cTb, lim:`≥ ${S.tbW}`,
    s: bare?'ok':(band(cTb,S.tbW,S.tbF)==='bad'?'warn':band(cTb,S.tbW,S.tbF)),
    why: bare ? '무도장 — 해당 없음.'
       : cTb>=S.tbW ? '도막이 접촉폭 대비 두꺼워 스스로 하중을 받습니다.'
       : cTb>=S.tbF ? '도막과 콘크리트가 함께 부담합니다.'
       : `도막이 접촉 반폭의 ${(cTb*100).toFixed(1)}%. 하중을 퍼뜨릴 여지가 없어 사실상 그대로 콘크리트로 갑니다.`,
    rat:{expr:'t_coat / b', subs: bare?'무도장':`${S.fT} / ${rpk.b.toFixed(3)} = ${cTb.toFixed(3)}`,
         src:'hertz', note:'이 값이 1보다 작으면 도막은 구조적으로 존재하지 않는 마모층입니다. 그 결과(콘크리트가 그대로 받는 압력)는 아래 p_sub 항목에서 정량으로 판정하므로, 이 항목 자체는 분류일 뿐 불가 판정을 내지 않습니다.'}};

  const pRat = rpk.pmax/surfLim;
  G.pSurf={stage:3, sym:'p_max', title:'표면 최대 접촉압 (공칭)', v:rpk.pmax, u:'MPa',
    lim:`≤ ${surfLim.toFixed(1)}`, s:bandLo(pRat,1,S.surfOver),
    why:`허용 ${surfLim.toFixed(1)} MPa — ${surfGov} 지배, 안전율 ${S.SF}${kTd<1?`, ${Tdes.toFixed(0)}°C 온도저감 ×${kTd.toFixed(2)}`:''} · 여유 ${(1/pRat).toFixed(2)}배`,
    rat:{expr:line?'p_max = 2F/(πbL_eff), p_avg = F/(2bL_eff), p_max/p_avg = 4/π':'p_max = 3F/(2πab), p_avg = F/(πab), p_max/p_avg = 3/2',
         subs:line?`2 × ${Fpk.toFixed(0)} / (π × ${rpk.b.toFixed(3)} × ${Le.toFixed(1)}) = ${rpk.pmax.toFixed(2)} MPa   (p_avg ${rpk.pavg.toFixed(2)} MPa)`
           :`3 × ${Fpk.toFixed(0)} / (2π × ${rpk.a.toFixed(3)} × ${rpk.b.toFixed(3)}) = ${rpk.pmax.toFixed(2)} MPa   (p_avg ${rpk.pavg.toFixed(2)} MPa)`,
         src:line?'hertz':'hb',
         note:'판정은 평균압이 아니라 최대압으로 합니다. 하중은 단차 통과 피크 F_pk 를 씁니다.'}};

  const eLim = surfLim*S.edgeAllow, eRat = pEdge/eLim;
  G.pEdge={stage:3, sym:'p_edge', title:'단부 응력집중', v:pEdge, u:'MPa',
    lim:`≤ ${eLim.toFixed(1)}`, s: line ? bandLo(eRat,1,S.edgeOver) : 'ok',
    why: !line ? `크라운 접촉이라 단부 특이점이 없습니다 (K_edge = 1).`
       : `공칭 대비 ×${Kedge.toFixed(2)} · 국부 항복 재분배 허용 ×${S.edgeAllow} 반영한 허용 ${eLim.toFixed(1)} MPa · 여유 ${(1/eRat).toFixed(2)}배`,
    rat:{expr:`K_edge = 1 + (K₀ − 1)/(1 + c_edge·R_e/b), c_edge = ${S.edgeDecay}, p_edge = K_edge · p_max`,
         subs: line ? `K₀ = ${S.K0}, R_e = ${S.edgeR} mm, b = ${rpk.b.toFixed(2)} mm → K_edge = ${Kedge.toFixed(2)}, p_edge = ${pEdge.toFixed(2)} MPa` : '크라운 접촉 — 해당 없음',
         src:'edge',
         note:'유한 길이 원통의 양 끝에서 압력이 치솟습니다. 예리한 단부는 이론상 특이점이며 실측·FEM 범위 K₀ = 2~3 을 씁니다. 실제 도막 파손은 바퀴 폭 양 끝 두 줄에서 먼저 시작합니다. 크라운을 주면 이 항목이 사라지는 대신 접촉이 타원이 됩니다.'}};

  const sRat = pSub/paConc;
  G.pSub={stage:4, sym:'p_sub', title:'기재(콘크리트) 전달압', v:pSub, u:'MPa',
    lim:`≤ ${paConc.toFixed(1)}`, s:bandLo(sRat,1,S.surfOver),
    why:`콘크리트 지압 허용 ${paConc.toFixed(1)} MPa (0.85·f_ck·√${S.bearingAreaRatio} / 안전율 ${S.SF}) · 여유 ${(1/sRat).toFixed(2)}배`
       + (bare?' · 무도장이므로 표면압이 그대로 전달됩니다.'
              :` · 도막 ${S.fT} mm 가 ${((1-pSub/rpk.pmax)*100).toFixed(0)}% 감쇠`),
    rat:{expr:'σ_z(t) = p_max / √(1 + (t/b)²)',
         subs:`${rpk.pmax.toFixed(2)} / √(1 + (${S.fT}/${rpk.b.toFixed(3)})²) = ${pSub.toFixed(2)} MPa`,
         src:'hertzF',
         note:'선접촉 축상 수직응력의 깊이 감쇠식. 도막이 두꺼울수록 기재가 받는 압력이 줄어듭니다. 허용치는 ACI 지압식으로, 국부 구속을 반영한 상한(√(A₂/A₁) ≤ 2)입니다.'}};

  const tRat = sfp.tauInt/bondLim;
  G.bond={stage:5, sym:'μ·p_max', title:'계면 전단 — 도막 박리 / 스커핑', v:sfp.tauInt, u:'MPa',
    lim:`≤ ${bondLim.toFixed(2)}`, s:bandLo(tRat,1,S.stressOver),
    why:`${bare?'콘크리트 표면 인발':'도막 부착'} 허용 ${bondLim.toFixed(2)} MPa 대비 ${tRat.toFixed(2)}배 · 기동조건 ${MU.n}, μ_util = ${MU.mu.toFixed(3)}`,
    rat:{expr:'τ_int = μ_util · p_max',
         subs:`${MU.mu.toFixed(3)} × ${rpk.pmax.toFixed(2)} = ${sfp.tauInt.toFixed(2)} MPa`,
         src:'fric',
         note:'직진 구동 중에는 필요 접선력만 동원되므로 μ_util = a/g + f_roll 입니다. 제자리 선회에서만 완전 미끄럼이 되어 μ_util = μ 로 뛰고, 이때가 도막 박리의 지배 조건입니다.'}};

  const gRat = sfp.sigT/tenLim;
  G.tens={stage:6, sym:'σ_t', title:'표면 인장 — 균열 개시', v:sfp.sigT, u:'MPa',
    lim:`≤ ${tenLim.toFixed(2)}`, s:bandLo(gRat,1,S.stressOver),
    why:`${tenGov} 인장 허용 ${tenLim.toFixed(2)} MPa 대비 ${gRat.toFixed(2)}배 · 접촉 후단 표면`,
    rat:{expr:`σ_x(후단) = 2·μ_util·p_max     f_ctm = ${concreteTensExpr(S)}`,
         subs:`2 × ${MU.mu.toFixed(3)} × ${rpk.pmax.toFixed(2)} = ${sfp.sigT.toFixed(2)} MPa   (콘크리트 f_ctm ${fctm.toFixed(2)} · 도막 ${bare?'—':S.fTen} · 바퀴 ${S.wTen} MPa → ${tenGov} 지배)`,
         src:'fric',
         note:'마찰이 실리면 접촉 후단 표면에 인장이 생깁니다. 에폭시 균열과 콘크리트 표층 박리가 실제로 시작되는 응력이며, 원본 계산기에는 이 항목 자체가 없었습니다.'}};

  G.therm={stage:7, sym:'T_tread', title:'트레드 정상상태 온도', v:th.T, u:'°C',
    lim:`≤ ${W.Tmax}`, s: th.T>W.Tmax?'bad':'ok',
    why: S.Tamb>W.Tmax ? `주변온도 ${S.Tamb}°C가 재료 허용온도 ${W.Tmax}°C를 넘습니다. 주행 여부와 무관하게 사용 불가입니다.`
       : S.v<=0 ? `주행 발열 없음 — 주변온도 ${S.Tamb}°C와 재료 허용온도를 비교했습니다.`
       : `허용 ${W.Tmax}°C · 소산 ${th.P.toFixed(1)} W · 열 기준 연속 허용하중 ${(Fth/S.g).toFixed(0)} kg (현재 ${(Fop/S.g).toFixed(0)} kg)`,
    rat:{expr:'f = (4/3π)·α·(b/R),   P = f·F·v·duty,   R_th = 1/(h·A + UA_hub),   ΔT = P·R_th',
         subs:`f = ${th.f.toFixed(4)},  P = ${th.P.toFixed(1)} W,  h = ${th.h.toFixed(1)} W/m²K,  A = ${(th.Aw*1e4).toFixed(0)} cm²,  R_th = ${th.Rth.toFixed(2)} K/W  →  ΔT = ${th.dT.toFixed(1)} K,  T = ${th.T.toFixed(1)} °C`,
         src:'visco',
         note:'PU 휠의 실제 카탈로그 정격은 면압이 아니라 히스테리시스 발열이 결정합니다. 손실계수 α 와 열저항은 제조사 정격점으로 보정할 수 있습니다(캘리브레이션 패널).'}};

  const order=['load','model','bR','tread','ar','pSurf','pEdge','coat','pSub','bond','tens','therm'];
  const gates = order.map(k=>({id:k,...G[k]}));
  const worst = worstOf(gates.map(g=>g.s));
  const failing = gates.filter(g=>g.s!=='ok').sort((a,b)=>ST[b.s]-ST[a.s]);

  return {ok:true, S, W, WN, FN, bare, Ec, fctm, nu1, nu2, LC, Fop, Fpk,
    r:rpk, rop, line, Le, ar, Kedge, pEdge, pSub, sf:sfp, sfo, th, Fth, kTd, Tdes, MU, kSeff,
    overflow:rpk.overflow, cTb, tTb, bR,
    allow:{wheel:paWheel, coat:paCoat, conc:paConc, surf:surfLim, surfGov, tens:tenLim, tenGov, bond:bondLim, fctm},
    gates, G, worst, driver:failing[0]||null, failing};
}

/* 단차 충격계수 자동 산정 — 1차 해에서 접촉강성을 얻어 2차 해에 반영 */
function compute(S){
  const errs=validateState(S);
  if(errs.length) return {error:errs[0],errs,S};
  if(!S.kSauto || S.loadMode==='direct') return computeCore(S);
  const p1 = computeCore({...S, kS:1});
  if(!p1.ok) return p1;
  const imp = stepImpact(S, p1.Fop, p1.rop.delta);
  const phi = clamp(imp.phi, 1, S.impactMax);
  const p2  = phi===1?p1:computeCore({...S, kS:phi},{operating:p1});
  if(p2.ok){ p2.imp = imp; p2.kSused = phi;
    if(imp.phi>S.impactMax){
      const gate=p2.G.load; gate.s='bad'; gate.why=`충격계수 ${imp.phi.toFixed(2)}가 설정 상한 ${S.impactMax}를 넘습니다. 상한으로 자른 참고값을 설계에 사용할 수 없습니다.`;
      Object.assign(p2.gates.find(g=>g.id==='load'),gate);
      p2.failing=p2.gates.filter(g=>g.s!=='ok').sort((a,b)=>ST[b.s]-ST[a.s]);
      p2.worst='bad'; p2.driver=p2.failing[0];
    }
  }
  return p2;
}

/* 치수 동시 확대 — suggest() 의 스캔과 UI 의 적용이 같은 값을 쓰도록 한 곳에 둔다 */
function scaledGeom(S,k){
  return { D: Math.round(S.D*k), L: Math.round(S.L*k),
           wT: S.wT>0 ? Math.round(S.wT*Math.min(k,2)*10)/10 : 0,
           edgeR: Math.round(S.edgeR*Math.min(k,2)*10)/10 };
}

/* ============================================================ 개선 제안 */
function suggest(S){
  const base = compute(S);
  if(!base.ok || base.worst!=='bad') return {items:[], scale:null, none:true};
  // None of the scanned dimensions, mass, speed or duty values can move the
  // equivalent load point or restore a missing moment support.
  const grid=base.LC.grid;
  if(base.LC.lift || (grid&&((grid.nr===1&&Math.abs(base.LC.exq)>1e-9)||(grid.nc===1&&Math.abs(base.LC.eyq)>1e-9))))
    return {items:[],scale:null,none:true};
  const items=[];
  const scan=(key, seq, label, unit, dec)=>{
    for(const v of seq){
      const c = compute({...S,[key]:v});
      if(c.ok && c.worst!=='bad'){ items.push({key,label,from:S[key],to:v,unit,dec}); return; }
    }
  };
  const up   =(f,t,n)=>Array.from({length:n},(_,i)=>f+(t-f)*(i+1)/n);
  scan('D', up(S.D, Math.min(S.D*8,1200), 70), '바퀴 직경 D', 'mm', 0);
  scan('L', up(S.L, Math.min(S.L*6,500), 60), '바퀴 폭 L', 'mm', 0);
  if(S.loadMode==='direct') scan('Fdirect', up(S.Fdirect, S.Fdirect*0.05, 50), '캐스터당 하중', 'N', 0);
  else                      scan('Wload',   up(S.Wload,   0,               50), '적재하중', 'kg', 0);
  if(S.v>0)      scan('v',    up(S.v, 0.05, 45), '주행 속도', 'm/s', 2);
  if(S.duty>0.1) scan('duty', up(S.duty, 0.05, 30), '듀티 사이클', '', 2);
  if(S.fT>0)     scan('fT',   up(S.fT, 15, 45), '도막 두께', 'mm', 1);
  scan('edgeR',  up(S.edgeR, Math.max(S.L*0.25,10), 40), '에지 라운드 R_e', 'mm', 1);

  /* D·L 동시 확대 — 실제 카탈로그는 이렇게 움직인다.
     스캔에 쓴 값과 버튼이 적용할 값이 반드시 같아야 하므로 한 함수로 만든다. */
  let scale=null;
  for(let i=1;i<=80;i++){
    const k = 1 + i*0.05, g = scaledGeom(S,k);
    const c = compute({...S, ...g});
    if(c.ok && c.worst!=='bad'){ scale={k, ...g, worst:c.worst}; break; }
  }
  return {items, scale};
}

/* 게이트는 직경에 대해 단조롭지 않다. 실제 통과 구간을 먼저 찾는다.
   반환값은 검증된 후보이며 스캔 사이의 좁은 구간이나 전역 최소값은 보장하지 않는다. */
function diameterCandidate(S,L){
  const loD=Math.max(10,2*S.wT+1e-6), hiD=2500;
  if(loD>hiD)return NaN;
  const samples=Array.from({length:49},(_,i)=>loD*Math.pow(hiD/loD,i/48));
  if(S.D>=loD&&S.D<=hiD)samples.push(S.D);
  samples.sort((a,b)=>a-b);
  const passes=D=>{const c=compute({...S,D,L});return c.ok&&c.worst!=='bad';};
  let previous=loD;
  for(const D of samples){
    if(passes(D)){
      let lo=previous,hi=D;
      for(let j=0;j<18&&hi-lo>1e-5;j++){const mid=(lo+hi)/2;if(passes(mid))hi=mid;else lo=mid;}
      return hi;
    }
    previous=D;
  }
  return NaN;
}

/* ============================== 제조사 정격으로 열모델 캘리브레이션 */
function calibrate(S){
  if(!(S.calF>0 && S.calV>0 && S.calD>0 && S.calL>0)) return null;
  const T = {...S, D:S.calD, L:S.calL, edgeR:0, crown:0, R2:0,
             loadMode:'direct', Fdirect:S.calF, kSauto:false, kS:1,
             v:S.calV, duty:1, rthScale:1};
  const c = computeCore(T);
  if(!c.ok) return null;
  const need = S.wTmax - S.Tamb;
  if(!(need>0&&c.th.dT>0)) return null;
  return {scale: need/c.th.dT, dT0:c.th.dT, b:c.rop.b, f:c.th.f, P:c.th.P, T};
}
