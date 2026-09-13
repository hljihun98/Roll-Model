/* ============================================================================
   UI — 렌더링 · 도면 · 배선
   ========================================================================= */
const $  = s=>document.querySelector(s);
const $$ = s=>[...document.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';
const fmt=(v,d=2)=>(v==null||!isFinite(v))?(v===Infinity?'∞':'—'):
  Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const STATUS={ok:'가능',warn:'주의',bad:'불가'};

let S = {...DEFAULTS};
let C = null;                    // 최근 계산 결과
let openRungs = new Set();

/* ─────────────────────────────────────────────── SVG 헬퍼 */
const sv=(t,a={})=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e;};
function txt(g,x,y,s,{cls='svg-num',anchor='start',fill=null,weight=null}={}){
  const t=sv('text',{x,y,class:cls,'text-anchor':anchor});
  if(fill)t.setAttribute('fill',fill); if(weight)t.setAttribute('font-weight',weight);
  t.textContent=s; g.append(t); return t;
}
function arrow(x,y,dx,dy,c='var(--ink3)'){
  const n=Math.hypot(dx,dy)||1,ux=dx/n,uy=dy/n,px=-uy,py=ux,l=6,w=2.2;
  return sv('path',{d:`M${x} ${y}L${x-ux*l+px*w} ${y-uy*l+py*w}L${x-ux*l-px*w} ${y-uy*l-py*w}Z`,fill:c,stroke:'none'});
}
function hdim(g,x1,x2,y,label,opt={}){
  const {ext=0,color='var(--ink3)'}=opt;
  const out=Math.abs(x2-x1)<44;
  if(ext){g.append(sv('line',{x1,y1:y-ext,x2:x1,y2:y,class:'svg-dim'}),sv('line',{x1:x2,y1:y-ext,x2:x2,y2:y,class:'svg-dim'}));}
  if(out){g.append(sv('line',{x1:x1-20,y1:y,x2:x2+20,y2:y,class:'svg-dim'}),arrow(x1,y,-1,0,color),arrow(x2,y,1,0,color));}
  else    {g.append(sv('line',{x1,y1:y,x2,y2:y,class:'svg-dim'}),arrow(x1,y,1,0,color),arrow(x2,y,-1,0,color));}
  if(opt.bg){ const w=label.length*6.6+12;
    g.append(sv('rect',{x:(x1+x2)/2-w/2,y:y-17,width:w,height:15,rx:3,
      fill:'var(--surface)',opacity:.88})); }
  txt(g,(x1+x2)/2,y-5,label,{anchor:'middle'});
}
function vdim(g,y1,y2,x,label){
  g.append(sv('line',{x1:x,y1,x2:x,y2,class:'svg-dim'}),arrow(x,y1,0,-1),arrow(x,y2,0,1));
  txt(g,x+5,(y1+y2)/2+4,label);
}
function axis(g,x0,y0,x1,y1){ g.append(sv('line',{x1:x0,y1:y0,x2:x1,y2:y1,stroke:'var(--ink)','stroke-width':1.2})); }
function niceStep(range,target){const raw=range/target,m=Math.pow(10,Math.floor(Math.log10(raw||1))),n=(raw||1)/m;
  return m*(n>=5?5:n>=2?2:n>=1?1:.5);}
const SC=s=>({ok:'var(--ok)',warn:'var(--warn)',bad:'var(--bad)'}[s]);

/* ════════════════════════════════════════════ 파라미터 레일 */
const RAIL_HTML = `
<details class="grp" open><summary><i class="caret"></i>하중<span class="tag" id="tgLoad">—</span></summary><div class="grp-b">
  <div class="seg" data-set="loadMode"><button data-v="build">중량에서 산출</button><button data-v="direct">직접 입력</button></div>
  <div class="field" data-show="direct"><label>캐스터당 하중 F</label><div class="inp"><input type="number" id="Fdirect" step="10"><span class="unit">N</span></div></div>
  <div data-show="build" style="display:flex;flex-direction:column;gap:7px">
    <div class="field"><label>공차중량 (대차)</label><div class="inp"><input type="number" id="Wtare" step="10"><span class="unit">kg</span></div></div>
    <div class="field"><label>적재하중 (차량)</label><div class="inp"><input type="number" id="Wload" step="10"><span class="unit">kg</span></div></div>
    <div class="rule"></div>
    <div class="field"><label>휠 열 수 (전후)</label><div class="inp"><input type="number" id="nRow" step="1" min="1"><span class="unit">열</span></div></div>
    <div class="field"><label>휠 행 수 (좌우)</label><div class="inp"><input type="number" id="nCol" step="1" min="1"><span class="unit">행</span></div></div>
    <div class="field"><label>축거 (전후 전장)</label><div class="inp"><input type="number" id="wb" step="50"><span class="unit">mm</span></div></div>
    <div class="field"><label>윤거 (좌우 전폭)</label><div class="inp"><input type="number" id="tr" step="50"><span class="unit">mm</span></div></div>
    <div class="field"><label>무게중심 편심 eₓ</label><div class="inp"><input type="number" id="ex" step="10"><span class="unit">mm</span></div></div>
    <div class="field"><label>무게중심 편심 e_y</label><div class="inp"><input type="number" id="ey" step="10"><span class="unit">mm</span></div></div>
    <p class="hint" id="hintFrac">—</p>
    <div class="rule"></div>
    <div class="field"><label>바닥 평탄도 재분배 계수<small>부정정 재분배. 편심은 위에서 이미 반영됨</small></label><div class="inp"><input type="number" id="k3" step="0.05"></div></div>
    <div class="field"><label>가감속 aₓ</label><div class="inp"><input type="number" id="ax" step="0.1"><span class="unit">m/s²</span></div></div>
    <div class="field"><label>횡가속 a_y</label><div class="inp"><input type="number" id="ay" step="0.1"><span class="unit">m/s²</span></div></div>
    <div class="field"><label>무게중심 높이 h_cg</label><div class="inp"><input type="number" id="hcg" step="25"><span class="unit">mm</span></div></div>
    <div class="rule"></div>
    <div class="field"><label>단차 충격계수 자동</label><div class="inp"><label class="hint" style="display:flex;gap:5px;align-items:center;cursor:pointer"><input type="checkbox" id="kSauto" style="width:auto">자동</label></div></div>
    <div class="field"><label>단차 높이 h_step</label><div class="inp"><input type="number" id="hstep" step="0.5"><span class="unit">mm</span></div></div>
    <div class="field"><label>충격 감쇠 보정 η<small>운동량 상한 대비. 실측 DAF 범위에 맞춘 값</small></label><div class="inp"><input type="number" id="etaImp" step="0.05"></div></div>
    <div class="field"><label>언스프렁 질량비<small>1 = 서스펜션 없음</small></label><div class="inp"><input type="number" id="mUns" step="0.05"></div></div>
    <div class="field"><label>충격계수 kS (수동)</label><div class="inp"><input type="number" id="kS" step="0.05"></div></div>
  </div>
</div></details>

<details class="grp" open><summary><i class="caret"></i>바퀴<span class="tag" id="tgWheel">—</span></summary><div class="grp-b">
  <select id="wPre" aria-label="바퀴 재질"></select>
  <div class="slid"><span class="hint" style="width:34px">D</span><input type="range" id="Dr" min="40" max="600" step="5"><span class="v" id="Dv"></span></div>
  <div class="slid"><span class="hint" style="width:34px">L</span><input type="range" id="Lr" min="15" max="300" step="5"><span class="v" id="Lv"></span></div>
  <div class="field"><label>트레드 두께<small>0 = 일체형 솔리드. 허브 구속 보정의 기준</small></label><div class="inp"><input type="number" id="wT" step="0.5"><span class="unit">mm</span></div></div>
  <div class="field"><label>에지 라운드 R_e<small>단부 응력집중을 낮추는 유일한 기하 수단</small></label><div class="inp"><input type="number" id="edgeR" step="0.5"><span class="unit">mm</span></div></div>
  <div class="field"><label>크라운 반경<small>0 = 평면 트레드. 값 입력 시 타원접촉으로 전환</small></label><div class="inp"><input type="number" id="crown" step="25"><span class="unit">mm</span></div></div>
  <div class="rule"></div>
  <div class="field"><label>탄성계수 E₁</label><div class="inp"><input type="number" id="wE" step="1"><span class="unit">MPa</span></div></div>
  <div class="field"><label>포아송비 ν₁</label><div class="inp"><input type="number" id="wNu" step="0.01"></div></div>
  <div class="field"><label>허용 접촉면압</label><div class="inp"><input type="number" id="wPa" step="1"><span class="unit">MPa</span></div></div>
  <div class="field"><label>인장강도</label><div class="inp"><input type="number" id="wTen" step="1"><span class="unit">MPa</span></div></div>
  <div class="field"><label>히스테리시스 손실률 α</label><div class="inp"><input type="number" id="wAlpha" step="0.005"></div></div>
  <div class="field"><label>허용 온도</label><div class="inp"><input type="number" id="wTmax" step="5"><span class="unit">°C</span></div></div>
  <div class="field"><label>면압 온도저감 계수<small>/°C, 23°C 기준</small></label><div class="inp"><input type="number" id="wKt" step="0.001"></div></div>
  <div class="field"><label>바닥 곡률 R₂<small>0 = 평면, 음수 = 오목(레일)</small></label><div class="inp"><input type="number" id="R2" step="50"><span class="unit">mm</span></div></div>
</div></details>

<details class="grp" open><summary><i class="caret"></i>바닥<span class="tag" id="tgFloor">—</span></summary><div class="grp-b">
  <select id="fPre" aria-label="바닥 마감"></select>
  <div class="field"><label>도막 두께 t<small>0 = 무도장</small></label><div class="inp"><input type="number" id="fT" step="0.1"><span class="unit">mm</span></div></div>
  <div class="field"><label>콘크리트 f_ck</label><div class="inp"><input type="number" id="fck" step="1"><span class="unit">MPa</span></div></div>
  <p class="hint" id="hintConc">—</p>
  <div class="rule"></div>
  <div class="field"><label>도막 탄성계수 E₂</label><div class="inp"><input type="number" id="fE" step="100"><span class="unit">MPa</span></div></div>
  <div class="field"><label>도막 포아송비 ν₂</label><div class="inp"><input type="number" id="fNu" step="0.01"></div></div>
  <div class="field"><label>도막 압축강도</label><div class="inp"><input type="number" id="fComp" step="5"><span class="unit">MPa</span></div></div>
  <div class="field"><label>전동접촉 저감계수<small>압축강도 대비 허용 접촉압 비</small></label><div class="inp"><input type="number" id="fRed" step="0.05"></div></div>
  <div class="field"><label>도막 인장강도</label><div class="inp"><input type="number" id="fTen" step="1"><span class="unit">MPa</span></div></div>
  <div class="field"><label>부착강도</label><div class="inp"><input type="number" id="bond" step="0.1"><span class="unit">MPa</span></div></div>
  <div class="field"><label>E_c 수동 지정<small>0 = ACI 식 자동</small></label><div class="inp"><input type="number" id="EcMan" step="1000"><span class="unit">MPa</span></div></div>
</div></details>

<details class="grp" open><summary><i class="caret"></i>주행 · 기동<span class="tag" id="tgRun">—</span></summary><div class="grp-b">
  <div class="field"><label>주행 속도 v</label><div class="inp"><input type="number" id="v" step="0.1"><span class="unit">m/s</span></div></div>
  <div class="field"><label>듀티 사이클<small>0~1, 전체 시간 중 주행 비율</small></label><div class="inp"><input type="number" id="duty" step="0.05" min="0" max="1"></div></div>
  <div class="field"><label>주위 온도</label><div class="inp"><input type="number" id="Tamb" step="1"><span class="unit">°C</span></div></div>
  <div class="rule"></div>
  <p class="hint">접선력 조건 — 계면 전단과 표면 인장은 이 선택으로 완전히 달라집니다.</p>
  <div class="seg" data-set="maneuver"><button data-v="drive">직진 가감속</button><button data-v="spin">제자리 선회</button><button data-v="manual">직접</button></div>
  <div class="field"><label>마찰계수 μ (가용)</label><div class="inp"><input type="number" id="mu" step="0.05"></div></div>
  <div class="field"><label>접선력비 (직접 지정)</label><div class="inp"><input type="number" id="muMan" step="0.01"></div></div>
  <div class="field"><label>램프 경사</label><div class="inp"><input type="number" id="grade" step="0.01"></div></div>
  <div class="rule"></div>
  <div class="field"><label>대류계수 (정지)</label><div class="inp"><input type="number" id="hNat" step="1"><span class="unit">W/m²K</span></div></div>
  <div class="field"><label>속도 대류 기울기</label><div class="inp"><input type="number" id="hVel" step="1"></div></div>
  <div class="field"><label>허브 전도 UA</label><div class="inp"><input type="number" id="UAhub" step="0.05"><span class="unit">W/K</span></div></div>
</div></details>

<details class="grp"><summary><i class="caret"></i>해석 옵션<span class="tag" id="tgOpt">—</span></summary><div class="grp-b">
  <p class="hint">트레드 허브 구속 보정 — 얇은 트레드의 겉보기 강성 상승을 반영합니다. 끄면 원본 계산기와 동일한 반무한체 가정이 됩니다.</p>
  <div class="seg" data-set="confine"><button data-v="1">적용</button><button data-v="0">미적용</button></div>
  <p class="hint">도막·기재 비교 — 각 재료의 균질 반무한체 중 높은 면압을 사용합니다. 실제 층상체의 상한 보장은 없으며 별도 검증이 필요합니다.</p>
  <div class="seg" data-set="layer"><button data-v="1">적용</button><button data-v="0">미적용</button></div>
  <div class="field"><label>Gent 계수 k<small>재료 경도에 따라 0.5~1.0</small></label><div class="inp"><input type="number" id="kGent" step="0.05"></div></div>
  <div class="field"><label>포아송비 일괄 지정<small>0 = 재질 기본값</small></label><div class="inp"><input type="number" id="nuOv" step="0.01"></div></div>
  <div class="field"><label>바닥에도 적용</label><div class="inp"><label class="hint" style="display:flex;gap:5px;align-items:center;cursor:pointer"><input type="checkbox" id="nuOvAll" style="width:auto">ν₂ 포함</label></div></div>
</div></details>

<details class="grp"><summary><i class="caret"></i>판정 기준<span class="tag">임계값</span></summary><div class="grp-b">
  <div class="field"><label>안전율 SF</label><div class="inp"><input type="number" id="SF" step="0.1" min="1"></div></div>
  <div class="field"><label>단부 예리단부 K₀<small>실측·FEM 범위 2~3</small></label><div class="inp"><input type="number" id="K0" step="0.1" min="1"></div></div>
  <div class="field"><label>단부 국부항복 허용배수</label><div class="inp"><input type="number" id="edgeAllow" step="0.05"></div></div>
  <div class="rule"></div>
  <div class="field"><label>b/R 주의 / 불가</label><div class="inp"><input type="number" id="brW" step="0.01" style="width:40px"><input type="number" id="brF" step="0.01" style="width:40px"></div></div>
  <div class="field"><label>t_tread/b 주의 / 불가</label><div class="inp"><input type="number" id="ttW" step="0.05" style="width:40px"><input type="number" id="ttF" step="0.05" style="width:40px"></div></div>
  <div class="field"><label>t_coat/b 주의 / 불가</label><div class="inp"><input type="number" id="tbW" step="0.1" style="width:40px"><input type="number" id="tbF" step="0.1" style="width:40px"></div></div>
  <div class="field"><label>L/2b 주의 / 불가</label><div class="inp"><input type="number" id="arW" step="0.5" style="width:40px"><input type="number" id="arF" step="0.5" style="width:40px"></div></div>
  <p class="hint">아래 경고 구간과 경험계수는 스크리닝 정책값입니다. 경고 상태도 허용치 이내의 통과를 뜻하지 않습니다.</p>
  <div class="field"><label>면압 불가 비율</label><div class="inp"><input type="number" id="surfOver" min="1" step="0.05"></div></div>
  <div class="field"><label>단부압 불가 비율</label><div class="inp"><input type="number" id="edgeOver" min="1" step="0.05"></div></div>
  <div class="field"><label>인장·전단 불가 비율</label><div class="inp"><input type="number" id="stressOver" min="1" step="0.05"></div></div>
  <div class="field"><label>단부 완화 계수</label><div class="inp"><input type="number" id="edgeDecay" step="0.1"></div></div>
  <div class="field"><label>충격계수 계산 상한</label><div class="inp"><input type="number" id="impactMax" min="1" step="0.5"></div></div>
  <div class="field"><label>구속 OFF t/b 주의</label><div class="inp"><input type="number" id="unconfWarn" step="0.1"></div></div>
  <div class="field"><label>구속 OFF t/b 불가</label><div class="inp"><input type="number" id="unconfBad" step="0.1"></div></div>
  <div class="field"><label>지압 면적비 A₂/A₁<small>검증된 지지 면적비, 기본 1</small></label><div class="inp"><input type="number" id="bearingAreaRatio" min="1" max="4" step="0.1"></div></div>
  <div class="field"><label>무도장 표면 부착 비<small>콘크리트 인장강도 대비 경험값</small></label><div class="inp"><input type="number" id="bareBondFactor" step="0.05"></div></div>
</div></details>`;

const NUMS=['Fdirect','Wtare','Wload','nRow','nCol','wb','tr','ex','ey','k3','ax','ay','hcg','hstep',
 'etaImp','mUns','kS','wT','edgeR','crown','wE','wNu','wPa','wTen','wAlpha','wTmax','wKt','R2',
 'fT','fck','fE','fNu','fComp','fRed','fTen','bond','EcMan','v','duty','Tamb','mu','muMan','grade',
 'hNat','hVel','UAhub','kGent','nuOv','SF','K0','edgeAllow','brW','brF','ttW','ttF','tbW','tbF','arW','arF',
 'surfOver','edgeOver','stressOver','edgeDecay','impactMax','unconfWarn','unconfBad','bearingAreaRatio','bareBondFactor'];
const CHECKS=['kSauto','nuOvAll'];

/* ══════════════════════════════════════════ 입력 스트립 */
const STRIP_HTML = `
<div class="cellin"><span class="eyebrow">캐스터당 하중</span>
  <div class="big"><span class="n" id="sF" style="font-size:19px;font-weight:500;letter-spacing:-.02em">—</span><u>N</u></div>
  <span class="hint" id="sFsub">—</span></div>
<div class="cellin"><span class="eyebrow">바퀴 재질</span>
  <select id="sWPre"></select><span class="hint" id="sWsub">—</span></div>
<div class="cellin"><span class="eyebrow">직경 D</span>
  <div class="slid"><input type="range" id="sD" min="40" max="600" step="5"><span class="v" id="sDv"></span></div>
  <span class="hint">접촉폭과 b/R을 가장 크게 움직이는 변수</span></div>
<div class="cellin"><span class="eyebrow">폭 L</span>
  <div class="slid"><input type="range" id="sL" min="15" max="300" step="5"><span class="v" id="sLv"></span></div>
  <span class="hint">면압에는 1차, 단부집중에는 간접 영향</span></div>
<div class="cellin"><span class="eyebrow">바닥 마감</span>
  <select id="sFPre"></select><span class="hint" id="sFfsub">—</span></div>
<div class="cellin"><span class="eyebrow">주행 속도</span>
  <div class="slid"><input type="range" id="sV" min="0" max="3" step="0.05"><span class="v" id="sVv"></span></div>
  <span class="hint" id="sVsub">발열 판정을 지배</span></div>
<div class="cellin"><span class="eyebrow">기동 조건</span>
  <div class="seg" data-set="maneuver" style="margin-top:2px"><button data-v="drive">직진</button><button data-v="spin">선회</button></div>
  <span class="hint" id="sMsub">—</span></div>`;

/* ══════════════════════════════════════════════ 렌더 */
function renderVerdict(c){
  const v=$('#verdict'); v.dataset.s=c.worst;
  const mark={ok:'✓',warn:'!',bad:'×'}[c.worst];
  const head={ok:'현재 사양으로 진행 가능합니다',
              warn:'진행 가능하나 확인이 필요합니다',
              bad:'이 사양으로는 사용할 수 없습니다'}[c.worst];
  const dr=c.driver;
  let lead;
  if(c.worst==='ok') lead=`10개 검사 항목이 모두 허용치 안에 있습니다. 접촉 반폭 <b>${fmt(c.r.b,2)} mm</b>, 최대 접촉압 <b>${fmt(c.r.pmax,2)} MPa</b> (허용 ${fmt(c.allow.surf,1)}), 트레드 온도 <b>${fmt(c.th.T,0)} °C</b>.`;
  else lead=`결정 요인은 <b>${esc(dr.title)}</b> — ${esc(dr.why)}`;
  const others=c.failing.slice(1,4).map(g=>`${g.sym}`).join(' · ');
  const sub = c.failing.length>1 ? `<br><span style="color:var(--ink3)">함께 걸린 항목: ${esc(others)}${c.failing.length>4?` 외 ${c.failing.length-4}개`:''}</span>` : '';
  const keys=[
    ['최대 접촉압 p_max', fmt(c.r.pmax,2), 'MPa', `허용 ${fmt(c.allow.surf,1)} · ${c.allow.surfGov} 지배`, c.G.pSurf.s],
    ['접촉 반폭 b', fmt(c.r.b,2), 'mm', `접촉 자국 ${fmt(c.Le,0)} × ${fmt(2*c.r.b,1)} mm`, c.G.ar.s],
    ['기재 전달압 p_sub', fmt(c.pSub,2), 'MPa', `콘크리트 허용 ${fmt(c.allow.conc,1)}`, c.G.pSub.s],
    ['트레드 온도 T', fmt(c.th.T,0), '°C', `허용 ${c.W.Tmax} · 열 허용하중 ${fmt(c.Fth/S.g,0)} kg`, c.G.therm.s],
    ['캐스터당 하중', fmt(c.Fop/S.g,0), 'kg', `피크 ${fmt(c.Fpk/S.g,0)} kg (충격 ×${fmt(c.kSeff,2)})`, c.G.load.s],
  ];
  v.innerHTML=`<div class="verdict-h"><div class="vmark">${mark}</div>
    <div class="vtxt"><h2>${head}</h2><p>${lead}${sub}</p></div></div>
    <div class="vkeys">${keys.map(([k,val,u,s,st])=>
      `<div class="vkey"><span class="k">${esc(k)}</span>
       <span class="v" style="color:${st==='ok'?'var(--ink)':SC(st)}">${val}<u>${u}</u></span>
       <span class="s">${esc(s)}</span></div>`).join('')}</div>`;
}

function renderAlerts(c){
  const a=[];
  if(c.LC.lift) a.push(['bad','휠 들림으로 하중 분배 해가 무효입니다',
    `최소 휠 반력이 음수(${fmt(c.LC.fracMin,3)})입니다. 현재 계산값은 참고용이며, 접촉 중인 지지점을 다시 결정하는 해석이 필요합니다. 지지 배치와 편심을 수정하십시오.`]);
  if(c.overflow||c.rop.overflow) a.push(['bad','크라운 접촉 타원이 휠 폭을 넘었습니다',
    `접촉 타원의 횡방향 폭이 유효 접촉길이 ${fmt(c.Le,0)} mm 를 넘습니다. 표시값은 선접촉 참고값이며 유한 폭 3D 해석이 필요합니다.`]);
  if(!c.r.converged) a.push(['warn','접촉 반복해가 수렴하지 않았습니다',
    `${c.r.iter}회 반복에서 수렴 판정에 도달하지 못했습니다. 물성값이 극단적이지 않은지 확인하십시오.`]);
  if(S.maneuver==='drive' && c.MU.need>S.mu) a.push(['warn','요구 접선력이 가용 마찰을 넘습니다',
    `가감속에 필요한 접선력비 ${fmt(c.MU.need,3)} 가 마찰계수 ${S.mu} 를 초과합니다. 실제로는 휠이 슬립합니다 — 가속도를 낮추거나 구동륜 수를 늘리십시오.`]);
  if(S.loadMode!=='direct' && c.LC.grid){
    const G=c.LC.grid, exq=c.LC.exq||0, eyq=c.LC.eyq||0;
    if(G.nr===1 && Math.abs(exq)>1) a.push(['warn','전후 1열 배치라 종방향 편심을 받을 수 없습니다',
      `휠이 한 열뿐이면 종방향 모멘트에 저항할 지지점이 없어 편심 eₓ ${fmt(exq,0)} mm (가감속 등가편심 포함)가 계산에서 무시됩니다. 실제로는 차체가 앞뒤로 기울어집니다 — 전후 2열 이상으로 배치하거나 별도 지지를 검토하십시오.`]);
    if(G.nc===1 && Math.abs(eyq)>1) a.push(['warn','좌우 1행 배치라 횡방향 편심을 받을 수 없습니다',
      `휠이 한 행뿐이면 횡방향 모멘트에 저항할 지지점이 없어 편심 e_y ${fmt(eyq,0)} mm 가 무시됩니다. 좌우 2행 이상으로 배치하십시오.`]);
  }
  if(!S.confine && S.wT>0) a.push(['warn','트레드 구속 보정이 꺼져 있습니다',
    `트레드 ${S.wT} mm 가 허브에 접착된 층인데 반무한체로 계산 중입니다. 원본 계산기와 같은 조건이며, 이 상태의 p_max 는 실제보다 낮게 나옵니다.`]);
  $('#alerts').innerHTML=a.map(([s,t,d])=>
    `<div class="callout" data-s="${s}"><div><b>${esc(t)}</b>${d}</div></div>`).join('');
}

function renderLadder(c){
  const stageName={1:'하중',2:'접촉',3:'표면압',4:'기재 전달',5:'전단 · 박리',6:'인장 균열',7:'열 · 듀티'};
  const rows=[];
  /* 1단계 — 하중 */
  rows.push({id:'load',stage:1,sym:'F_pk',title:'설계하중 산출',s:c.G.load.s,
    v:c.Fpk,u:'N',lim:`주행 ${fmt(c.Fop,0)} N`,
    why:`${S.loadMode==='direct'?'직접 입력 — 입력값을 주행하중으로 봅니다':`휠 ${c.LC.n}개 중 최대 분담 ${fmt(c.LC.fracMax*100,1)}%`} · 단차 충격 ×${fmt(c.kSeff,2)} 적용 후 피크 ${fmt(c.Fpk/S.g,0)} kg`,
    rat:{expr:'R_i = W·g·[1/n + e_x·x_i/Σx² + e_y·y_i/Σy²] · k_flat     e_dyn = (a/g)·h_cg',
         subs:c.LC.rows.map(r=>`${r.k} = ${fmt(r.v,r.u==='×'?4:1)} ${r.u}`).join('\n'),
         src:'rigid',
         note:'가감속·선회에 의한 하중이동은 (a/g)·h_cg 크기의 등가편심과 수학적으로 같으므로 기하편심에 합산했습니다. 원본 계산기는 휠 수와 무관하게 4점을 가정했고, 동하중을 근거 없는 배수로 곱했습니다.'}});
  c.gates.forEach(g=>rows.push({...g,id:g.id==='load'?'loadValidity':g.id}));

  let last=0;
  $('#ladder').innerHTML=
    `<div class="ladder-h"><b>계산 체인</b><span>하중에서 발열까지 ${rows.length}개 검사 · 각 항목을 펼치면 식과 근거가 나옵니다</span></div>`+
    rows.map(g=>{
      const open=openRungs.has(g.id)||(S.mode==='pro'&&openRungs.size===0&&g.s!=='ok');
      const showStage=g.stage!==last; last=g.stage;
          const val=isFinite(g.v)?fmt(g.v, Math.abs(g.v)>=1000?0:(Math.abs(g.v)>=100?1:(Math.abs(g.v)>=10?2:3))):'∞';
      const src=SRC[g.rat.src]||SRC.hertz, cf=CONF[src.c];
      return `<details class="rung" data-s="${g.s}" data-id="${g.id}"${open?' open':''}>
        <summary><span class="stepno">${showStage?g.stage:'·'}</span>
          <span class="rungmid"><span class="t">${esc(g.title)} <code>${esc(g.sym)}</code>
            ${showStage?`<span class="eyebrow" style="font-size:10px">${esc(stageName[g.stage])}</span>`:''}</span>
            <span class="w">${g.why}</span></span>
          <span class="rungright"><span class="rungval">${val}${g.u?`<u>${g.u}</u>`:''}
            ${g.lim?`<i>기준 ${esc(g.lim)}</i>`:''}</span>
            <span class="pill" data-s="${g.s}">${STATUS[g.s]}</span></span></summary>
        <div class="why">
          <div class="formula">${esc(g.rat.expr)}</div>
          <div class="subs">${esc(g.rat.subs)}</div>
          <p class="note">${g.rat.note}</p>
          <div class="srcline"><span class="conf" data-c="${src.c}">${cf.n}</span>
            <span>${esc(src.t)}</span><span class="r">${esc(src.r)}</span></div>
        </div></details>`;
    }).join('');
  $$('.rung').forEach(d=>d.addEventListener('toggle',()=>{
    d.open?openRungs.add(d.dataset.id):openRungs.delete(d.dataset.id);}));
}

let fixesTimer=null;
const fixesCache=new Map();
function renderFixes(c){
  clearTimeout(fixesTimer);
  if(c.worst!=='bad'){ $('#fixCard').hidden=true; return; }
  const snapshot={...S}, key=JSON.stringify({...snapshot,mode:null,tab:null});
  $('#fixCard').hidden=false; $('#fixTag').textContent='개선안 계산 중'; $('#fixes').replaceChildren();
  if(fixesCache.has(key)){ showFixes(c,fixesCache.get(key)); return; }
  fixesTimer=setTimeout(()=>{
    if(C!==c) return;
    const sg=suggest(snapshot);
    if(fixesCache.size>=24) fixesCache.delete(fixesCache.keys().next().value);
    fixesCache.set(key,sg); showFixes(c,sg);
  },150);
}
function showFixes(c,sg){
  const card=$('#fixCard');
  if(c.worst!=='bad'){ card.hidden=true; return; }
  const parts=sg.items.map(x=>
    `<button class="fix" data-k="${x.key}" data-v="${x.to}"><span>${esc(x.label)}</span>
      <b>${fmt(x.from,x.dec)}</b><span class="arrow">→</span><span class="to">${fmt(x.to,x.dec)}</span>
      <span class="hint">${esc(x.unit)}</span></button>`);
  if(sg.scale) parts.push(`<button class="fix" data-scale="${sg.scale.k}">
    <span>휠 치수 동시 확대</span><b>×1.00</b><span class="arrow">→</span>
    <span class="to">×${fmt(sg.scale.k,2)}</span>
    <span class="hint">D${fmt(sg.scale.D,0)} × L${fmt(sg.scale.L,0)}${sg.scale.wT>0?` · 트레드 ${fmt(sg.scale.wT,1)}`:''}</span></button>`);
  card.hidden=false;
  $('#fixTag').textContent = parts.length? `${parts.length}개 경로` : '단일 변수로는 해결 불가';
  $('#fixes').innerHTML = parts.join('') ||
    `<p class="hint">스캔 범위 안에서는 변수 하나만 바꿔 불가 판정을 해소할 수 없습니다. 재질 변경, 휠 수 증가, 바닥 사양 변경을 함께 검토하십시오.</p>`;
  $$('#fixes .fix').forEach(b=>b.onclick=()=>{
    if(b.dataset.scale){ set(scaledGeom(S, +b.dataset.scale)); }
    else set({[b.dataset.k]: +b.dataset.v});
  });
}

function renderLoad(c){
  $('#loadTag').textContent=`${c.LC.n} 휠 · ${fmt(c.Fop/S.g,0)} kg/휠`;
  const rows=c.LC.rows.map(r=>
    `<div class="chainrow ${r.total?'tot':''} ${r.bad?'bad':''}"><span class="k">${esc(r.k)}
      ${r.sub?`<small>${esc(r.sub)}</small>`:''}</span>
      <span class="v">${fmt(r.v, r.u==='×'?4:(r.u==='EA'?0:1))} ${esc(r.u)}</span></div>`);
  const kMode = S.loadMode==='direct' ? (S.kSauto?'(직접입력 — 미적용)':'(수동)')
              : (S.kSauto?'(자동 · 운동량 상한 × η)':'(수동)');
  rows.push(`<div class="chainrow"><span class="k">단차 충격계수 k_S <small>${kMode}</small></span><span class="v">× ${fmt(c.kSeff,2)}</span></div>`);
  rows.push(`<div class="chainrow tot"><span class="k">피크 설계하중 F_pk</span><span class="v">${fmt(c.Fpk,0)} N · ${fmt(c.Fpk/S.g,0)} kg</span></div>`);
  $('#loadChainList').innerHTML=rows.join('');
}

function renderResults(c){
  $('#resTag').textContent=`F_pk ${fmt(c.Fpk,0)} N`;
  const cells=[
    ['등가 탄성계수 E*',fmt(c.r.Es,1),'MPa',`바퀴 ${fmt(c.r.E1e,1)} / 바닥 ${fmt(c.r.E2e,0)} MPa`],
    ['바퀴 겉보기 탄성계수',fmt(c.r.E1e,1),'MPa',S.confine&&S.wT>0?`구속 보정 ×${fmt(c.r.conf.ratio,2)} (S=${fmt(c.r.conf.S,2)})`:'보정 없음'],
    ['접촉 반폭 b',fmt(c.r.b,3),'mm',`전폭 ${fmt(2*c.r.b,3)} mm`],
    ['접촉 면적 A',fmt(c.r.A,1),'mm²',c.line?'2b × L_eff':'π·a·b (타원)'],
    ['유효 접촉길이 L_eff',fmt(c.Le,1),'mm',S.edgeR>0?`공칭 ${S.L} − 2×R_e ${S.edgeR}`:'에지 라운드 0 — 예리한 모서리'],
    ['평균 접촉압 p_avg',fmt(c.r.pavg,2),'MPa','판정에는 쓰지 마십시오'],
    ['최대 전단 τ_max',fmt(c.sf.tauMax,2),'MPa',c.sf.surfGoverns?`표면 (μ ${fmt(c.MU.mu,2)} > 0.30)`:`깊이 ${fmt(c.sf.zTau,2)} mm`],
    ['기하 간섭량 δ',fmt(c.r.delta,3),'mm','R − √(R²−b²)'],
    ['구름저항계수 f',fmt(c.th.f,4),'',`휠당 구동토크 ${fmt(c.th.torque,2)} N·m`],
    ['단부 집중계수 K',fmt(c.Kedge,2),'',c.line?`R_e ${S.edgeR} mm / b ${fmt(c.r.b,1)} mm`:'크라운 접촉 — 해당 없음'],
  ];
  if(!c.line) cells.push(['횡방향 접촉 반폭 a',fmt(c.r.a,2),'mm',`횡/종 비 a/b = ${fmt(c.r.ellipK,2)}`]);
  if(S.layer&&S.fT>0) cells.push(['균질체 비교 선택',c.r.mix?'기재':'도막','',`계산 E₂ ${fmt(c.r.E2e,0)} MPa · 층상체의 상한 보장 없음`]);
  $('#results').innerHTML=cells.map(([k,v,u,d])=>
    `<div class="stat"><span class="k">${esc(k)}</span><span class="v">${v}<u>${u}</u></span><span class="d">${esc(d)}</span></div>`).join('');
}

/* ══════════════════════════════════ 실사 단면도 ══ */
const NARROW = ()=> (window.innerWidth||1200) < 720;
const rng = seed => { let a=seed>>>0; return ()=>{ a|=0; a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; };

/* 파라미터 변경 시 부드럽게 따라가는 표시값 */
const DISP={b:12,R:100,pen:1,pmax:5,Le:76};
let rafTween=null, rollPhase=0, rafRoll=null, rollOmega=0;
const REDUCED = typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion:reduce)').matches;
function tween(target, draw){
  const from={...DISP}, t0=performance.now(), dur=REDUCED?0:260;
  if(rafTween) cancelAnimationFrame(rafTween);
  if(!dur){ Object.assign(DISP,target); draw(); return; }
  const step=now=>{ const k=clamp((now-t0)/dur,0,1), e=1-Math.pow(1-k,3);
    for(const p in target) DISP[p]=from[p]+(target[p]-from[p])*e;
    draw(); if(k<1) rafTween=requestAnimationFrame(step); };
  draw(); rafTween=requestAnimationFrame(step);
}

function defsFor(svg, c){
  const d=sv('defs');
  const lg=(id,stops,attrs={})=>{const g=sv('linearGradient',{id,x1:0,y1:0,x2:0,y2:1,...attrs});
    stops.forEach(([o,col,op])=>g.append(sv('stop',{offset:o,'stop-color':col,
      ...(op!=null?{'stop-opacity':op}:{})}))); d.append(g); return g;};
  const wc=c.WN.c;
  lg('gTread',[[0,'#ffffff',.55],[.28,wc,.95],[.72,wc,1],[1,'#000000',.30]],{x1:.15,y1:0,x2:.7,y2:1});
  lg('gHub',  [[0,'#F2F5F8',1],[.35,'#C8D0D8',1],[.6,'#98A4AE',1],[1,'#6E7A85',1]],{x1:.1,y1:0,x2:.85,y2:1});
  lg('gCoat', [[0,'#ffffff',.72],[.18,c.FN.c,.95],[1,c.FN.c,1]]);
  lg('gConc', [[0,'#ffffff',.55],[.10,'#B9BDB8',1],[.45,'#A0A59F',1],[1,'#82877F',1]]);
  lg('gPress',[[0,'var(--bad)',.92],[.55,'var(--warn)',.75],[1,'var(--accent)',.35]]);
  const rg=sv('radialGradient',{id:'gGlow',cx:.5,cy:1,r:.9});
  rg.append(sv('stop',{offset:0,'stop-color':'var(--bad)','stop-opacity':.75}),
            sv('stop',{offset:1,'stop-color':'var(--bad)','stop-opacity':0}));
  d.append(rg);
  const f=sv('filter',{id:'fSoft',x:'-40%',y:'-40%',width:'180%',height:'180%'});
  f.append(sv('feGaussianBlur',{stdDeviation:5})); d.append(f);
  const f2=sv('filter',{id:'fTiny',x:'-30%',y:'-30%',width:'160%',height:'160%'});
  f2.append(sv('feGaussianBlur',{stdDeviation:1.4})); d.append(f2);
  svg.append(d); return d;
}

/* 콘크리트 + 도막 + 골재를 실제 단면처럼 */
function drawFloor(g, x0, x1, FY, depth, c, s){
  const fT=S.fT, ct=fT>0?Math.max(fT*s,3.2):0;
  g.append(sv('rect',{x:x0,y:FY,width:x1-x0,height:depth,fill:'url(#gConc)'}));
  const r=rng(20260913), W=x1-x0;
  for(let i=0;i<Math.round(W*depth/620);i++){
    const ax=x0+r()*W, ay=FY+ct+4+r()*(depth-ct-6);
    const rr=1.6+r()*7.5, sq=.55+r()*.6, tone=r();
    g.append(sv('ellipse',{cx:ax,cy:ay,rx:rr,ry:rr*sq,
      transform:`rotate(${r()*180} ${ax} ${ay})`,
      fill: tone>.72?'#8B9089':(tone>.4?'#9EA39B':'#767B74'),
      opacity:.28+r()*.4}));
  }
  for(let i=0;i<Math.round(W*depth/1400);i++){
    const ax=x0+r()*W, ay=FY+ct+3+r()*(depth-ct-5);
    g.append(sv('circle',{cx:ax,cy:ay,r:.7+r()*1.5,fill:'#5E635C',opacity:.3+r()*.35}));
  }
  if(ct>0){
    g.append(sv('rect',{x:x0,y:FY,width:x1-x0,height:ct,fill:'url(#gCoat)'}));
    g.append(sv('rect',{x:x0,y:FY,width:x1-x0,height:Math.min(ct*.34,2.2),fill:'#ffffff',opacity:.45}));
    g.append(sv('line',{x1:x0,y1:FY+ct,x2:x1,y2:FY+ct,stroke:'#000',opacity:.28,'stroke-width':1}));
  }
  g.append(sv('line',{x1:x0,y1:FY,x2:x1,y2:FY,stroke:'var(--ink)','stroke-width':1.5,opacity:.85}));
  return ct;
}

/* 변형된 트레드 윤곽 — 접촉면 평탄화 + 측면 벌지 */
function wheelBody(g, CX, cy, Rs, bs, FY, c, phase, R, sc){
  const wc=c.WN.c;
  const hubR = S.wT>0 ? clamp((R-S.wT)*sc, Rs*0.12, Rs*0.94) : Rs*0.34;
  g.append(sv('ellipse',{cx:CX,cy:FY+4,rx:Math.max(bs*2.6,Rs*.5),ry:6,
    fill:'#0B1418',opacity:.16,filter:'url(#fSoft)'}));
  const clip=sv('clipPath',{id:'cpAbove'});
  clip.append(sv('rect',{x:CX-Rs-40,y:cy-Rs-30,width:2*Rs+80,height:(FY)-(cy-Rs-30)}));
  g.append(clip);
  const body=sv('g',{'clip-path':'url(#cpAbove)'}); g.append(body);
  body.append(sv('circle',{cx:CX,cy,r:Rs,fill:'url(#gTread)'}));
  /* 측면 벌지 */
  const pen=FY-(cy-Rs);
  if(pen>2.2 && bs>3){
    const bg=Math.min(pen*.75, bs*.4, 15);
    for(const sgn of [-1,1]){
      const px=CX+sgn*bs, ang=Math.atan2(FY-cy, sgn*bs), a2=ang-sgn*0.42;
      const qx=CX+Rs*Math.cos(a2), qy=cy+Rs*Math.sin(a2);
      g.append(sv('path',{d:`M${px} ${FY}Q${px+sgn*bg} ${FY-bg*.2} ${(px+qx)/2+sgn*bg*.9} ${(FY+qy)/2}T${qx} ${qy}`
        +`A${Rs} ${Rs} 0 0 ${sgn>0?0:1} ${px} ${FY}Z`, fill:wc, opacity:.9}));
    }
  }
  body.append(sv('circle',{cx:CX,cy,r:Rs,fill:'none',stroke:'#000',opacity:.35,'stroke-width':1.3}));
  /* 회전하는 허브 */
  const rot=sv('g',{id:'hubRot','data-cx':CX,'data-cy':cy,transform:`rotate(${phase} ${CX} ${cy})`}); body.append(rot);
  if(S.wT>0){
    rot.append(sv('circle',{cx:CX,cy,r:hubR,fill:'url(#gHub)',stroke:'#5A646E','stroke-width':1}));
    rot.append(sv('circle',{cx:CX,cy,r:hubR,fill:'none',stroke:'#fff',opacity:.35,'stroke-width':1,
      'stroke-dasharray':'3 5'}));
  } else {
    rot.append(sv('circle',{cx:CX,cy,r:hubR,fill:'url(#gHub)',opacity:.85}));
  }
  rot.append(sv('circle',{cx:CX,cy,r:hubR*.30,fill:'#39424B'}));
  rot.append(sv('circle',{cx:CX,cy,r:hubR*.30,fill:'none',stroke:'#161C21','stroke-width':1.4}));
  for(let i=0;i<6;i++){const a=i*Math.PI/3;
    rot.append(sv('circle',{cx:CX+hubR*.62*Math.cos(a),cy:cy+hubR*.62*Math.sin(a),r:Math.max(hubR*.09,1.6),
      fill:'#4C5860',stroke:'#2A3238','stroke-width':.8}));}
  /* 트레드 회전 마크 */
  for(let i=0;i<12;i++){const a=i*Math.PI/6;
    const r1=hubR+(Rs-hubR)*.72, r2=Rs*.985;
    rot.append(sv('line',{x1:CX+r1*Math.cos(a),y1:cy+r1*Math.sin(a),
      x2:CX+r2*Math.cos(a),y2:cy+r2*Math.sin(a),stroke:'#000',opacity:.10,'stroke-width':1.4}));}
  /* 하이라이트 */
  body.append(sv('ellipse',{cx:CX-Rs*.34,cy:cy-Rs*.46,rx:Rs*.30,ry:Rs*.17,
    transform:`rotate(-38 ${CX-Rs*.34} ${cy-Rs*.46})`,fill:'#fff',opacity:.14,filter:'url(#fTiny)'}));
  return hubR;
}

function figSection(c){
  const nw=NARROW();
  const W  = nw?470:920,  H = nw?608:400;
  const PW = nw?W:520,    FY= nw?220:270, DEP = nw?48:59;
  const DX = nw?12:548,   DY= nw?310:18,  DW  = nw?W-24:W-560;
  const svg=sv('svg',{viewBox:`0 0 ${W} ${H}`,role:'img'});
  svg.setAttribute('aria-label',
    `접촉 단면. 바퀴 직경 ${S.D} mm, 접촉 전폭 ${fmt(2*c.r.b,2)} mm, 최대 접촉압 ${fmt(c.r.pmax,2)} MPa`);
  defsFor(svg,c);
  const g=sv('g'); svg.append(g);
  const b=DISP.b, R=DISP.R, pen=DISP.pen;

  /* ───────── 패널 A : 실사 단면 ───────── */
  /* 축척 — 직경을 키우면 바퀴가 실제로 커 보여야 한다.
     화면에 다 담기도록 완만하게(멱 0.55) 늘리되 단조 증가는 보장한다. */
  const RsMax = Math.min((FY-54)/2, 130), R_REF = 240;
  let Rs = clamp(RsMax*Math.pow(Math.max(R,1)/R_REF, 0.55), RsMax*0.34, RsMax);
  let s  = Rs/Math.max(R,1e-3);
  if(2*b*s > PW*0.80){ s = (PW*0.80)/(2*Math.max(b,1e-6)); Rs = R*s; }
  const CX = PW/2, bs=b*s, cy=FY-Rs+pen*s;
  drawFloor(g, 0, PW, FY, DEP, c, s);
  wheelBody(g, CX, cy, Rs, bs, FY, c, rollPhase, R, s);
  g.append(sv('ellipse',{cx:CX,cy:FY,rx:Math.max(bs*1.3,7),ry:Math.max(bs*.45,5),fill:'url(#gGlow)',opacity:.65}));
  g.append(sv('rect',{x:CX-bs,y:FY-2,width:Math.max(2*bs,2),height:4,fill:'var(--bad)',opacity:.95,rx:1.5}));
  hdim(g,CX-bs,CX+bs,FY+DEP*0.66,`2b = ${fmt(2*b,2)} mm`,{ext:DEP*0.66,bg:true});
  const ra=-56*Math.PI/180, rx=CX+Rs*Math.cos(ra), ry=cy+Rs*Math.sin(ra);
  g.append(sv('line',{x1:CX,y1:cy,x2:rx,y2:ry,class:'svg-dim'}),arrow(rx,ry,Math.cos(ra),Math.sin(ra)));
  txt(g,(CX+rx)/2+9,(cy+ry)/2-4,`R ${fmt(R,1)}`);
  txt(g,12,20,`${c.WN.n}`,{cls:'svg-lbl'});
  txt(g,12,36,`D ${S.D} × L ${S.L} mm${S.wT>0?` · 트레드 ${S.wT} mm`:' · 솔리드'}`);
  txt(g,PW-12,20,`F_pk ${fmt(c.Fpk,0)} N`,{anchor:'end'});
  txt(g,PW-12,36,`b/R ${fmt(c.bR,3)}`,{anchor:'end',fill:SC(c.G.bR.s)});
  txt(g,12,54,`폭당 하중 F_pk/L_eff = ${fmt(c.Fpk/c.Le,1)} N/mm`);
  txt(g,12,FY+DEP+18,`${c.FN.n} · 콘크리트 f_ck ${S.fck} MPa`);
  if(pen*s>3) txt(g,CX-bs-10,FY-10,`δ ${fmt(pen,2)}`,{anchor:'end',fill:'var(--warn)'});
  /* 축척 막대 — 바퀴 크기 변화를 눈으로 비교할 기준 */
  (()=>{ const want=(PW*0.26)/s, pow=Math.pow(10,Math.floor(Math.log10(Math.max(want,1))));
    const n=want/pow, unit=pow*(n>=5?5:n>=2.5?2.5:n>=2?2:1), len=unit*s;
    const sx=14, sy=FY-16;
    g.append(sv('rect',{x:sx-4,y:sy-15,width:len+8,height:26,rx:3,fill:'var(--surface)',opacity:.82}));
    g.append(sv('line',{x1:sx,y1:sy,x2:sx+len,y2:sy,stroke:'var(--ink)','stroke-width':1.4}));
    [0,len].forEach(o=>g.append(sv('line',{x1:sx+o,y1:sy-5,x2:sx+o,y2:sy+5,stroke:'var(--ink)','stroke-width':1.4})));
    g.append(sv('line',{x1:sx+len/2,y1:sy-3,x2:sx+len/2,y2:sy+3,stroke:'var(--ink3)','stroke-width':1}));
    txt(g,sx,sy-8,`${fmt(unit,unit<1?1:0)} mm`); })();
  const rd=clamp(bs*1.45,26,64), la=-34*Math.PI/180;
  g.append(sv('circle',{cx:CX,cy:FY,r:rd,fill:'none',stroke:'var(--ink3)','stroke-width':1,'stroke-dasharray':'5 4'}));
  const lx=CX+rd*Math.cos(la), ly=FY+rd*Math.sin(la);
  g.append(sv('line',{x1:lx,y1:ly,x2:lx+30,y2:ly-22,class:'svg-dim'}));
  txt(g,lx+34,ly-24,'A',{cls:'svg-lbl'});

  /* ───────── 패널 B : 상세 A (확대 접촉부) ───────── */
  const ph   = nw?112:124;
  const pBase= DY+52+ph;
  // 바닥 텍스처를 기존 높이의 절반으로 줄이고 압력·도막 관계를 우선 배치.
  const floorDepth=nw?40:114, fBot=pBase+floorDepth;
  const cw   = DW*0.62, cx0 = DX+(DW-cw)/2;
  const dscale = cw/(2*Math.max(b,1e-6)), mag = dscale/s;
  const dcap = S.fT>0 ? clamp(S.fT*dscale, 4, floorDepth*0.5) : 0;
  txt(g,DX,DY+14,'상세 A — 도막을 누르는 압력',{cls:'svg-lbl'});
  txt(g,DX+DW,DY+14,`${mag>=1?fmt(mag,0)+':1':'1:'+fmt(1/mag,0)}`,{anchor:'end'});
  /* 변형된 트레드 실루엣 (압력분포 뒤) */
  const treadTop=DY+22, rise=Math.min(66,(pBase-treadTop)*0.5);
  const prof=`M${DX} ${pBase-rise}Q${cx0-(cx0-DX)*0.34} ${pBase} ${cx0} ${pBase}`
     +`L${cx0+cw} ${pBase}Q${cx0+cw+(DX+DW-cx0-cw)*0.34} ${pBase} ${DX+DW} ${pBase-rise}`;
  g.append(sv('path',{d:prof+`L${DX+DW} ${treadTop}L${DX} ${treadTop}Z`,
    fill:c.WN.c,'fill-opacity':.22,stroke:'none'}));
  g.append(sv('path',{d:prof,fill:'none',stroke:c.WN.c,'stroke-width':1.5}));
  /* 바닥 */
  g.append(sv('rect',{x:DX,y:pBase,width:DW,height:floorDepth,fill:'url(#gConc)','data-detail-floor':''}));
  const groundClip=sv('clipPath',{id:'detailGroundClip'});
  groundClip.append(sv('rect',{x:DX,y:pBase+dcap,width:DW,height:floorDepth-dcap}));
  svg.querySelector('defs').append(groundClip);
  const aggregate=sv('g',{'clip-path':'url(#detailGroundClip)'});g.append(aggregate);
  const r2=rng(77001);
  for(let i=0;i<20;i++){const ax=DX+r2()*DW, ay=pBase+dcap+5+r2()*Math.max(fBot-pBase-dcap-8,1);
    const rr=2+r2()*9;
    aggregate.append(sv('ellipse',{cx:ax,cy:ay,rx:rr,ry:rr*(.5+r2()*.6),transform:`rotate(${r2()*180} ${ax} ${ay})`,
      fill:r2()>.5?'#9EA39B':'#7C817A',opacity:.18+r2()*.2}));}
  if(dcap>0){ g.append(sv('rect',{x:DX,y:pBase,width:DW,height:dcap,fill:'url(#gCoat)'}));
    g.append(sv('rect',{x:DX,y:pBase,width:DW,height:Math.min(dcap*.3,2.5),fill:'#fff',opacity:.5}));
    g.append(sv('line',{x1:DX,y1:pBase+dcap,x2:DX+DW,y2:pBase+dcap,stroke:'#000',opacity:.3,'stroke-width':1}));
    txt(g,DX+DW-4,pBase+dcap+14,`도막 ${S.fT} mm`,{anchor:'end',fill:'var(--ink)'}); }
  g.append(sv('line',{x1:DX,y1:pBase,x2:DX+DW,y2:pBase,stroke:'var(--ink)','stroke-width':1.5}));
  /* 압력분포 */
  // L 조절에 따라 자동 정규화하지 않는다. 같은 재료·SF에서 px/MPa 고정.
  // 축 상한을 넘는 값은 그래프만 잘라 표시하고 실제 수치를 그대로 명시한다.
  const nominalAllow=Math.min(S.wPa,S.fT>0?S.fComp*S.fRed:concreteBearing(S))/S.SF;
  const pressureCap=nominalAllow*1.25, kP=ph/pressureCap;
  const pressure=DISP.pmax, shownAvg=pressure/(c.line?4/Math.PI:1.5);
  const pressureHeight=p=>Math.min(p,pressureCap)*kP;
  const hMax=pressureHeight(pressure), clipped=pressure>pressureCap;
  let d=`M${cx0} ${pBase}`;
  for(let i=0;i<=110;i++){const u=-1+2*i/110;
    d+=`L${cx0+(u+1)/2*cw} ${pBase-pressureHeight(pressure*Math.sqrt(Math.max(1-u*u,0)))}`;}
  g.append(sv('path',{d:d+'Z',fill:'url(#gPress)','fill-opacity':.55,stroke:'var(--bad)','stroke-width':1.7}));
  g.append(sv('rect',{x:cx0,y:pBase-2.6,width:cw,height:5.2,fill:'var(--bad)',rx:2}));
  const arrows=sv('g',{'data-pressure-arrows':'','data-scale':kP,'data-cap':pressureCap});g.append(arrows);
  for(let i=1;i<=7;i++){
    const u=-1+i/4, ax=cx0+(u+1)*cw/2;
    const localPressure=pressure*Math.sqrt(Math.max(1-u*u,0)), len=pressureHeight(localPressure);
    if(len<=0)continue;
    arrows.append(sv('line',{x1:ax,y1:pBase-len,x2:ax,y2:pBase,stroke:'var(--bad)','stroke-width':1.6,
      'data-pressure':localPressure,'data-position':u}));
    // 작은 압력에서도 화살촉이 화살표 길이를 넘지 않도록 한다.
    const head=Math.min(7,len), half=Math.min(3,len*.43);
    arrows.append(sv('path',{d:`M${ax} ${pBase}L${ax-half} ${pBase-head}L${ax+half} ${pBase-head}Z`,fill:'var(--bad)'}));
  }
  const avgY=pBase-pressureHeight(shownAvg);
  g.append(sv('line',{x1:cx0,y1:avgY,x2:cx0+cw,y2:avgY,stroke:'var(--ink2)','stroke-width':1,'stroke-dasharray':'5 4'}));
  txt(g,DX+DW-4,avgY-5,`p_avg ${fmt(shownAvg,2)}`,{anchor:'end'});
  txt(g,cx0+cw/2,pBase-hMax-9,`p_max ${fmt(pressure,2)} MPa${clipped?' · 상단 초과':''}`,{anchor:'middle',fill:'var(--bad)'});
  const aly=pBase-pressureHeight(c.allow.surf);
  if(aly>DY+30 && aly<pBase-6){
    g.append(sv('line',{x1:DX+4,y1:aly,x2:DX+DW-4,y2:aly,stroke:'var(--ok)','stroke-width':1.5,'stroke-dasharray':'7 4'}));
    txt(g,DX+6,aly-5,`허용 ${fmt(c.allow.surf,1)} MPa`,{fill:'var(--ok)'}); }
  hdim(g,cx0,cx0+cw,fBot+22,`2b = ${fmt(2*b,2)} mm`,{ext:22});
  txt(g,DX,fBot+47,`표면 ${fmt(pressure,2)} → 기재 ${fmt(subPressure(pressure,S.fT,b),2)} MPa`,{cls:'svg-lbl',fill:'var(--ink)'});
  txt(g,DX,fBot+64,`화살표 길이 ∝ 면압 · 표시 상한 ${fmt(pressureCap,1)} MPa`);
  txt(g,DX,fBot+81,`p(x,0) = p_max·√(1 − (x/b)²)${c.line?'':' · 타원 후속해는 참고값'}`);

  $('#figTag').textContent=`단면 ${s>=1?fmt(s,1)+':1':'1:'+fmt(1/s,1)} · 상세 A ${mag>=1?fmt(mag,0)+':1':'1:'+fmt(1/mag,0)}`;
  $('#figLegend').innerHTML=[
    [c.WN.c, `${c.WN.n} — E ${fmt(S.wE,0)} → 겉보기 ${fmt(c.r.E1e,0)} MPa`],
    [S.fT>0?c.FN.c:'#9EA39B', S.fT>0?`${c.FN.n} — 전달압 ${fmt(c.pSub,2)} MPa`:'무도장 콘크리트'],
    ['#8B9089',`콘크리트 f_ck ${S.fck} · E_c ${fmt(c.Ec,0)} MPa`],
    ['var(--bad)',`접촉 ${fmt(2*c.r.b,2)} mm · p_max ${fmt(c.r.pmax,2)} MPa · 간섭 δ ${fmt(c.r.delta,2)} mm`],
  ].map(([col,t])=>`<span><i style="background:${col}"></i>${esc(t)}</span>`).join('');
  return svg;
}

/* ══════════════════════ 접촉 자국 평면도 + 폭방향 압력 ══ */
function figPlan(c){
  const nw=NARROW();
  const W=nw?460:880, H=nw?430:250;
  const svg=sv('svg',{viewBox:`0 0 ${W} ${H}`}); const g=sv('g'); svg.append(g);
  const b=DISP.b, Le=c.line?DISP.Le:2*c.r.a, K=c.line?c.Kedge:1;
  /* 평면도 */
  const AW=nw?W-40:380, AX=nw?20:20, AY=nw?90:112;
  const ps=Math.min(AW/Le, 62/Math.max(2*b,1e-3));
  const pw=Le*ps, ph=Math.max(2*b*ps,4), px0=AX+(AW-pw)/2, top=AY-ph/2;
  const st=SC(c.G.ar.s);
  txt(g,AX,26,'접촉 자국 — 평면도',{cls:'svg-lbl'});
  txt(g,AX,44,`${c.line?'L_eff':'2a'} ${fmt(Le,1)} × 2b ${fmt(2*b,2)} mm · ${c.line?'L/2b':'a/b'} = ${fmt(c.ar,2)}`,{fill:st});
  g.append(c.line?sv('rect',{x:px0,y:top,width:pw,height:ph,fill:st,'fill-opacity':.24,stroke:st,'stroke-width':1.4})
    :sv('ellipse',{cx:px0+pw/2,cy:AY,rx:pw/2,ry:ph/2,fill:st,'fill-opacity':.24,stroke:st,'stroke-width':1.4}));
  if(c.line&&K>1.02){ const ew=Math.min(Math.max(S.edgeR,b*.3)*ps, pw*.2);
    [px0,px0+pw-ew].forEach(x=>g.append(sv('rect',{x,y:top,width:ew,height:ph,fill:'var(--bad)','fill-opacity':.5})));
    txt(g,px0+pw/2,top-9,`단부 K ${fmt(K,2)} → ${fmt(c.pEdge,1)} MPa`,{anchor:'middle',fill:'var(--bad)'}); }
  g.append(sv('line',{x1:px0-12,y1:AY,x2:px0+pw+12,y2:AY,class:'svg-cl'}));
  hdim(g,px0,px0+pw,top+ph+30,`${c.line?'L_eff':'2a'} ${fmt(Le,1)}`,{ext:26});
  txt(g,px0+pw/2,top+ph+56,'← 주행 방향',{cls:'svg-lbl',anchor:'middle'});
  /* 폭 방향 압력 */
  const BX=nw?36:470, BY=nw?H-52:H-52, BW=nw?W-56:380, BH=nw?150:150;
  txt(g,BX,nw?250:26,'폭 방향 압력분포 p(y)',{cls:'svg-lbl'});
  axis(g,BX,BY,BX+BW,BY);
  const base=BH/Math.max(K,1), frac=.14;
  let e=`M${BX} ${BY}`;
  for(let i=0;i<=160;i++){const u=i/160, ee=Math.min(u,1-u)/frac;
    e+=`L${BX+u*BW} ${BY-base*(c.line?(1+(K-1)*Math.exp(-3*ee)):Math.sqrt(Math.max(0,1-(2*u-1)**2)))}`;}
  g.append(sv('path',{d:e+`L${BX+BW} ${BY}Z`,fill:K>1.05?'var(--bad)':'var(--accent)','fill-opacity':.18,
    stroke:K>1.05?'var(--bad)':'var(--accent)','stroke-width':1.8}));
  g.append(sv('line',{x1:BX,y1:BY-base,x2:BX+BW,y2:BY-base,stroke:'var(--ink3)','stroke-width':1,'stroke-dasharray':'5 4'}));
  txt(g,BX+BW-3,BY-base-6,`공칭 ${fmt(c.r.pmax,1)} MPa`,{anchor:'end'});
  if(c.line) txt(g,BX+BW/2,BY-BH-8,`단부 ${fmt(c.pEdge,1)} MPa`,{anchor:'middle',fill:'var(--bad)'});
  const aly=BY-base*(c.allow.surf/Math.max(c.r.pmax,1e-6));
  if(aly>BY-BH-16&&aly<BY){ g.append(sv('line',{x1:BX,y1:aly,x2:BX+BW,y2:aly,stroke:'var(--ok)','stroke-width':1.4,'stroke-dasharray':'7 4'}));
    txt(g,BX+2,aly-5,`허용 ${fmt(c.allow.surf,1)} MPa`,{fill:'var(--ok)'}); }
  hdim(g,BX,BX+BW,BY+24,`${c.line?'L_eff':'2a'} = ${fmt(Le,1)} mm`,{ext:20});
  $('#planTag').textContent=`K_edge ${fmt(c.Kedge,2)} · ${c.line?'L/2b':'a/b'} ${fmt(c.ar,2)}`;
  $('#planLegend').innerHTML=[
    [st,`접촉 자국 ${fmt(Le,1)} × ${fmt(2*b,2)} mm`],
    ['var(--bad)', c.line?`단부 분포는 개략도 · K = 1 + (K₀−1)/(1 + ${S.edgeDecay}·R_e/b)`
                        :'크라운 접촉 — 단부 특이점 없음'],
    ['var(--ok)',`허용 ${fmt(c.allow.surf,1)} MPa (${c.allow.surfGov} 지배)`],
  ].map(([col,t])=>`<span><i style="background:${col}"></i>${esc(t)}</span>`).join('');
  return svg;
}

function figDepth(c){
  const W=460,H=380,MID=176,ZP=142,BX=150,CW=150;
  const svg=sv('svg',{viewBox:`0 0 ${W} ${H}`}); const g=sv('g'); svg.append(g);
  const b=c.r.b, wT=S.wT, fT=S.fT;
  const zr=Math.max(4*b, wT*1.1, fT*2.5, .4), sd=ZP/zr;
  const wc=c.WN.c, fc=c.FN.c;
  const upTop=MID-(wT>0?Math.min(wT*sd,ZP):ZP);
  g.append(sv('rect',{x:50,y:upTop,width:W-62,height:MID-upTop,fill:wc,'fill-opacity':.13}));
  if(wT>0&&wT*sd<ZP){ g.append(sv('line',{x1:50,y1:upTop,x2:W-12,y2:upTop,stroke:wc,'stroke-width':1.3,'stroke-dasharray':'5 3'}));
    txt(g,W-12,upTop-5,`허브 접착면 ${fmt(wT,1)} mm`,{anchor:'end'}); }
  let fb=MID;
  if(fT>0){ fb=MID+Math.max(fT*sd,2);
    g.append(sv('rect',{x:50,y:MID,width:W-62,height:fb-MID,fill:fc,'fill-opacity':.45}));
    g.append(sv('line',{x1:50,y1:fb,x2:W-12,y2:fb,stroke:fc,'stroke-width':1.3}));
    txt(g,W-12,fb+12,`도막–콘크리트 계면 ${fmt(fT,2)} mm`,{anchor:'end'}); }
  g.append(sv('rect',{x:50,y:fb,width:W-62,height:MID+ZP-fb,fill:'var(--concrete)','fill-opacity':.2}));
  g.append(sv('line',{x1:50,y1:MID,x2:W-12,y2:MID,stroke:'var(--ink)','stroke-width':1.7}));
  g.append(sv('line',{x1:50,y1:MID-ZP,x2:50,y2:MID+ZP,stroke:'var(--ink3)','stroke-width':1}));
  const step=niceStep(zr,3), dec=Math.max(0,-Math.floor(Math.log10(step)));
  for(let z=0;z<=zr+1e-9;z+=step) for(const dir of [-1,1]){
    if(z<1e-9&&dir<0) continue; const y=MID+dir*z*sd; if(Math.abs(y-MID)>ZP+.5) continue;
    g.append(sv('line',{x1:45,y1:y,x2:50,y2:y,class:'svg-dim'}));
    txt(g,42,y+4,fmt(z,dec),{anchor:'end'}); }
  txt(g,50,MID-ZP-20,'바퀴 트레드 ↑',{cls:'svg-lbl'});
  txt(g,50,MID+ZP+26,'바닥 ↓',{cls:'svg-lbl'});
  txt(g,6,MID-ZP-20,'깊이');txt(g,6,MID-ZP-6,'mm');
  g.append(sv('line',{x1:BX,y1:MID-ZP,x2:BX,y2:MID+ZP,class:'svg-cl'}));
  const TS=CW/0.3003;
  for(const dir of [-1,1]){
    let dT=`M${BX} ${MID}`;
    for(let i=1;i<=100;i++){const z=zr*i/100;
      dT+=`L${BX+tauProfile(z/b)*TS} ${MID+dir*z*sd}`;}
    g.append(sv('path',{d:dT,fill:'none',stroke:'var(--accent)','stroke-width':1.8}));
    let dS=`M${BX+CW} ${MID}`;
    for(let i=1;i<=100;i++){const z=zr*i/100, sz=1/Math.sqrt(1+(z/b)*(z/b));
      dS+=`L${BX+CW*sz} ${MID+dir*z*sd}`;}
    g.append(sv('path',{d:dS,fill:'none',stroke:'var(--ink3)','stroke-width':1.3,'stroke-dasharray':'4 3'}));
  }
  if(c.sf.surfGoverns){
    g.append(sv('rect',{x:50,y:MID-3,width:W-62,height:6,fill:'var(--bad)',opacity:.45}));
    g.append(sv('circle',{cx:BX+ (c.sf.tauSurf/c.r.pmax)*TS, cy:MID, r:4, fill:'var(--bad)'}));
    txt(g,W-12,MID-ZP-6,`τ_max 표면 ${fmt(c.sf.tauMax,2)} MPa (μ ${fmt(c.MU.mu,2)} > 0.30)`,{anchor:'end',fill:'var(--bad)'});
  } else {
    for(const dir of [-1,1]){ const y=MID+dir*c.sf.zSub*sd; if(Math.abs(y-MID)>ZP) continue;
      g.append(sv('line',{x1:BX,y1:y,x2:BX+CW,y2:y,stroke:'var(--warn)','stroke-width':1.1,'stroke-dasharray':'4 3'}));
      g.append(sv('circle',{cx:BX+CW,cy:y,r:3.6,fill:'var(--warn)'})); }
    txt(g,W-12,MID-ZP-6,`τ_max ${fmt(c.sf.tauMax,2)} MPa @ ${fmt(c.sf.zTau,2)} mm`,{anchor:'end'});
  }
  const notes=[];
  if(c.sf.surfGoverns) notes.push(['var(--bad)',`μ_util ${fmt(c.MU.mu,2)} > 0.30 이라 최대전단이 표면으로 올라왔습니다. 표면 아래 0.786b 가 아니라 접촉면 자체가 임계입니다 — 원본 계산기는 항상 0.786b 를 표시했습니다.`]);
  if(wT>0 && !c.sf.surfGoverns && c.sf.zTau>=wT*0.75) notes.push(['var(--bad)',`τ_max 깊이 ${fmt(c.sf.zTau,2)} mm 가 트레드 두께 ${fmt(wT,1)} mm 에 도달 — 허브 접착면 박리 위험.`]);
  if(fT>0 && Math.abs(c.sf.zTau-fT)<Math.max(fT*.6,b*.3)) notes.push(['var(--bad)',`τ_max 가 도막–콘크리트 계면(${fmt(fT,2)} mm)에 근접 — 도막 들뜸 위험.`]);
  if(fT>0 && c.sf.zTau>fT*2.5) notes.push(['var(--warn)',`τ_max 가 도막 아래 콘크리트 내부에 형성 — 도막은 하중을 분산하지 못합니다.`]);
  if(!notes.length) notes.push(['var(--ok)','최대 전단면이 층 경계에서 충분히 떨어져 있습니다.']);
  notes.push(['var(--accent)','τ(z) — 최대전단응력 (무마찰 헤르츠장)']);
  notes.push(['var(--ink3)','σ_z(z) = p_max/√(1+(z/b)²) — 기재 전달압 산정에 쓰는 감쇠식']);
  $('#depthLegend').innerHTML=notes.map(([col,t])=>`<span><i style="background:${col}"></i>${esc(t)}</span>`).join('');
  return svg;
}

function figSurf(c){
  const W=460,H=330,M={l:56,r:22,t:34,b:52};
  const svg=sv('svg',{viewBox:`0 0 ${W} ${H}`}); const g=sv('g'); svg.append(g);
  const mu=c.MU.mu, p0=c.r.pmax;
  const yMax=Math.max(2*mu*p0*1.25, p0*0.4, c.allow.tens*1.4), yMin=-p0*1.12;
  const X=u=>M.l+(u+2.2)/4.4*(W-M.l-M.r), Y=v=>H-M.b-(v-yMin)/(yMax-yMin)*(H-M.t-M.b);
  const stp=niceStep(yMax-yMin,5);
  for(let v=Math.ceil(yMin/stp)*stp; v<=yMax; v+=stp){
    g.append(sv('line',{x1:M.l,y1:Y(v),x2:W-M.r,y2:Y(v),stroke:'var(--line)','stroke-width':1}));
    txt(g,M.l-6,Y(v)+4,fmt(v,0),{anchor:'end'}); }
  axis(g,M.l,Y(0),W-M.r,Y(0)); axis(g,M.l,M.t,M.l,H-M.b);
  const P=u=>Math.abs(u)<=1?p0*Math.sqrt(1-u*u):0;
  const Q=u=>Math.abs(u)<=1? 2*mu*p0*u : 2*mu*p0*(u-Math.sign(u)*Math.sqrt(u*u-1));
  let d='',first=true;
  for(let i=0;i<=220;i++){const u=-2.2+4.4*i/220, v=-P(u)+Q(u);
    d+=(first?'M':'L')+X(u)+' '+Y(v); first=false;}
  g.append(sv('rect',{x:X(-1),y:M.t,width:X(1)-X(-1),height:H-M.b-M.t,fill:'var(--accent)','fill-opacity':.06}));
  g.append(sv('path',{d,fill:'none',stroke:'var(--accent)','stroke-width':2}));
  const lim=c.allow.tens;
  g.append(sv('line',{x1:M.l,y1:Y(lim),x2:W-M.r,y2:Y(lim),stroke:'var(--ok)','stroke-width':1.4,'stroke-dasharray':'7 4'}));
  txt(g,W-M.r,Y(lim)-6,`인장 허용 ${fmt(lim,2)} MPa`,{anchor:'end',fill:'var(--ok)'});
  const st=SC(c.G.tens.s);
  g.append(sv('circle',{cx:X(1),cy:Y(2*mu*p0),r:4.5,fill:st}));
  txt(g,X(1)+8,Y(2*mu*p0)-6,`σ_t = 2μp₀ = ${fmt(2*mu*p0,2)}`,{fill:st});
  txt(g,X(-1)-6,Y(-p0)+4,`−p_max`,{anchor:'end'});
  txt(g,M.l,M.t-14,'표면 σ_x  (+ 인장 / − 압축),  MPa',{cls:'svg-lbl'});
  for(const [u,l] of [[-1,'−b'],[0,'0'],[1,'+b (후단)'],[2,'2b']]){
    g.append(sv('line',{x1:X(u),y1:H-M.b,x2:X(u),y2:H-M.b+4,class:'svg-dim'}));
    txt(g,X(u),H-M.b+18,l,{anchor:'middle'}); }
  txt(g,W-M.r,H-8,'접촉면 좌표 x / b',{cls:'svg-lbl',anchor:'end'});
  $('#surfLegend').innerHTML=[
    ['var(--accent)',`σ_x(x) = −p(x) + 2μ_util·p₀·(x/b) — 마찰이 실린 표면 응력`],
    [st,`후단 인장 ${fmt(2*mu*p0,2)} MPa (${c.MU.n}, μ_util ${fmt(mu,3)})`],
    ['var(--ok)',`허용 ${fmt(lim,2)} MPa — ${(!c.bare&&c.cTb>1)?'도막 인장강도':'콘크리트 f_ctm = 0.30·f_ck^⅔'} / 안전율 ${S.SF}`],
  ].map(([col,t])=>`<span><i style="background:${col}"></i>${esc(t)}</span>`).join('');
  return svg;
}

function figThermal(c){
  const W=860,H=380,M={l:64,r:26,t:34,b:52};
  const svg=sv('svg',{viewBox:`0 0 ${W} ${H}`}); const g=sv('g'); svg.append(g);
  const vMax=Math.max(3, S.v*1.4);
  const pts=[];
  for(let i=1;i<=80;i++){
    const v=vMax*i/80;
    const cc=computeCore({...S,v,kSauto:false,kS:1,loadMode:'direct',Fdirect:c.Fop});
    pts.push([v, cc.ok? cc.Fth/S.g : NaN]);
  }
  const pLim = (()=>{ // 면압 한계 하중 (열과 무관)
    let lo=0, hi=c.Fop*20;
    for(let i=0;i<40;i++){ const mid=(lo+hi)/2;
      const cc=computeCore({...S,loadMode:'direct',Fdirect:mid,kSauto:false,kS:Math.max(c.kSeff,1),v:0});
      (cc.ok && cc.r.pmax<=cc.allow.surf) ? lo=mid : hi=mid; }
    return lo/S.g; })();
  const yMax=Math.max(pLim, c.Fop/S.g)*2.2;
  const X=v=>M.l+v/vMax*(W-M.l-M.r), Y=k=>H-M.b-clamp(k/yMax,0,1)*(H-M.t-M.b);
  const ys=niceStep(yMax,5);
  for(let k=0;k<=yMax;k+=ys){ g.append(sv('line',{x1:M.l,y1:Y(k),x2:W-M.r,y2:Y(k),stroke:'var(--line)','stroke-width':1}));
    txt(g,M.l-7,Y(k)+4,fmt(k,0),{anchor:'end'}); }
  const xs=niceStep(vMax,6);
  for(let v=0;v<=vMax+1e-9;v+=xs){ g.append(sv('line',{x1:X(v),y1:H-M.b,x2:X(v),y2:H-M.b+4,class:'svg-dim'}));
    txt(g,X(v),H-M.b+18,fmt(v,1),{anchor:'middle'}); }
  axis(g,M.l,H-M.b,W-M.r,H-M.b); axis(g,M.l,M.t,M.l,H-M.b);
  /* 허용 영역 */
  let area=`M${X(pts[0][0])} ${Y(Math.min(pts[0][1],pLim))}`;
  pts.forEach(p=>{area+=`L${X(p[0])} ${Y(Math.min(isFinite(p[1])?p[1]:yMax,pLim))}`;});
  area+=`L${X(vMax)} ${H-M.b}L${X(pts[0][0])} ${H-M.b}Z`;
  g.append(sv('path',{d:area,fill:'var(--ok)','fill-opacity':.12,stroke:'none'}));
  const finitePts=pts.filter(p=>isFinite(p[1]));
  if(finitePts.length)g.append(sv('path',{d:'M'+finitePts.map(p=>`${X(p[0])} ${Y(p[1])}`).join('L'),
    fill:'none',stroke:'var(--warn)','stroke-width':2}));
  g.append(sv('line',{x1:M.l,y1:Y(pLim),x2:W-M.r,y2:Y(pLim),stroke:'var(--bad)','stroke-width':1.8,'stroke-dasharray':'8 4'}));
  txt(g,W-M.r,Y(pLim)-7,`면압 한계 ${fmt(pLim,0)} kg`,{anchor:'end',fill:'var(--bad)'});
  const cx=X(clamp(S.v,0,vMax)), cy=Y(c.Fop/S.g), okNow=c.G.therm.s==='ok'&&c.G.pSurf.s==='ok';
  g.append(sv('line',{x1:cx,y1:H-M.b,x2:cx,y2:cy,class:'svg-cl'}),sv('line',{x1:M.l,y1:cy,x2:cx,y2:cy,class:'svg-cl'}));
  g.append(sv('circle',{cx,cy,r:6,fill:okNow?'var(--ok)':'var(--bad)',stroke:'var(--surface)','stroke-width':2}));
  txt(g,cx+11,cy-9,`현재  ${fmt(S.v,2)} m/s · ${fmt(c.Fop/S.g,0)} kg`,{fill:okNow?'var(--ok)':'var(--bad)'});
  txt(g,M.l-46,M.t-14,'연속 허용하중 (kg/휠)',{cls:'svg-lbl'});
  txt(g,W-M.r,H-8,'주행 속도 (m/s)',{cls:'svg-lbl',anchor:'end'});
  txt(g,W-M.r,M.t-14,`듀티 ${fmt(S.duty*100,0)}% · 주위 ${S.Tamb}°C · 허용 ${c.W.Tmax}°C · ${c.WN.n}`,{anchor:'end'});
  $('#thTag').textContent=`α ${fmt(S.wAlpha,3)} · R_th ${fmt(c.th.Rth,2)} K/W`;
  $('#thermalLegend').innerHTML=[
    ['var(--warn)','발열 한계 — 트레드가 허용 온도에 도달하는 하중'],
    ['var(--bad)','면압 한계 — 속도와 무관하게 접촉압이 허용치에 도달하는 하중'],
    ['var(--ok)','두 조건을 모두 만족하는 운전 영역'],
  ].map(([c2,t])=>`<span><i style="background:${c2};opacity:${c2.includes('ok')?.35:1}"></i>${esc(t)}</span>`).join('');
  return svg;
}

function figReverse(c){
  const W=860,H=380,M={l:64,r:26,t:34,b:52};
  const svg=sv('svg',{viewBox:`0 0 ${W} ${H}`}); const g=sv('g'); svg.append(g);
  const Lmin=Math.max(15,S.L*0.35), Lmax=Math.max(S.L*2.6,120);
  const need=L=>{
    let lo=10, hi=2500;
    for(let i=0;i<26;i++){ const mid=(lo+hi)/2;
      const cc=compute({...S,D:mid,L});
      (cc.ok && cc.worst!=='bad') ? hi=mid : lo=mid; }
    return hi>2400?NaN:hi; };
  const pts=[]; for(let i=0;i<=26;i++){const L=Lmin+(Lmax-Lmin)*i/26; pts.push([L,need(L)]);}
  const good=pts.filter(p=>isFinite(p[1]));
  const Dmax=Math.min(Math.max(...good.map(p=>p[1]),S.D*1.3)*1.12, 2600);
  const X=L=>M.l+(L-Lmin)/(Lmax-Lmin)*(W-M.l-M.r), Y=D=>H-M.b-clamp(D/Dmax,0,1)*(H-M.t-M.b);
  const ys=niceStep(Dmax,5);
  for(let d=0;d<=Dmax;d+=ys){g.append(sv('line',{x1:M.l,y1:Y(d),x2:W-M.r,y2:Y(d),stroke:'var(--line)','stroke-width':1}));
    txt(g,M.l-7,Y(d)+4,fmt(d,0),{anchor:'end'});}
  const xs=niceStep(Lmax-Lmin,7);
  for(let L=Math.ceil(Lmin/xs)*xs;L<=Lmax;L+=xs){g.append(sv('line',{x1:X(L),y1:H-M.b,x2:X(L),y2:H-M.b+4,class:'svg-dim'}));
    txt(g,X(L),H-M.b+18,fmt(L,0),{anchor:'middle'});}
  axis(g,M.l,H-M.b,W-M.r,H-M.b); axis(g,M.l,M.t,M.l,H-M.b);
  if(good.length>1){
    g.append(sv('path',{d:`M${X(good[0][0])} ${Y(good[0][1])}`+good.map(p=>`L${X(p[0])} ${Y(p[1])}`).join('')
      +`L${X(good[good.length-1][0])} ${M.t}L${X(good[0][0])} ${M.t}Z`,fill:'var(--ok)','fill-opacity':.13,stroke:'none'}));
    g.append(sv('path',{d:'M'+good.map(p=>`${X(p[0])} ${Y(p[1])}`).join('L'),fill:'none',stroke:'var(--accent)','stroke-width':2.2}));
  }
  const cx=X(clamp(S.L,Lmin,Lmax)), cy=Y(S.D), nd=need(S.L), okNow=c.worst!=='bad';
  g.append(sv('line',{x1:cx,y1:H-M.b,x2:cx,y2:cy,class:'svg-cl'}),sv('line',{x1:M.l,y1:cy,x2:cx,y2:cy,class:'svg-cl'}));
  g.append(sv('circle',{cx,cy,r:6,fill:okNow?'var(--ok)':'var(--bad)',stroke:'var(--surface)','stroke-width':2}));
  txt(g,cx+11,cy+(okNow?18:-10),`현재 D${S.D} × L${S.L}`,{fill:okNow?'var(--ok)':'var(--bad)'});
  txt(g,M.l-46,M.t-14,'필요 직경 D (mm)',{cls:'svg-lbl'});
  txt(g,W-M.r,H-8,'바퀴 폭 L (mm)',{cls:'svg-lbl',anchor:'end'});
  $('#rvTag').textContent = isFinite(nd)?`현재 폭 ${S.L} mm 기준 필요 직경 ${fmt(nd,0)} mm`:'스캔 범위 내 해 없음';
  $('#revLegend').innerHTML=[
    ['var(--accent)','불가 판정이 사라지는 최소 직경 — 전 게이트 동시 만족선'],
    ['var(--ok)','두 치수가 모두 충족되는 영역'],
    [okNow?'var(--ok)':'var(--bad)', isFinite(nd)
      ? `현재 D ${S.D} mm ${S.D>=nd?`— 필요 ${fmt(nd,0)} mm 충족`:`— 필요 ${fmt(nd,0)} mm 의 ${fmt(S.D/nd*100,0)}%`}`
      : '이 폭에서는 직경만으로 해소되지 않습니다'],
  ].map(([c2,t])=>`<span><i style="background:${c2}"></i>${esc(t)}</span>`).join('');
  return svg;
}

/* ══════════════════════════════════════════════ 매트릭스 */
function renderMatrix(){
  const wk=Object.keys(WHEELS), fk=Object.keys(FLOORS);
  let h=`<thead><tr><th>바닥 \\ 바퀴</th>${wk.map(k=>`<th>${esc(WHEELS[k].n)}</th>`).join('')}</tr></thead><tbody>`;
  for(const f of fk){
    h+=`<tr><td>${esc(FLOORS[f].n)}</td>`;
    for(const w of wk){
      const T={...S}; applyWheel(T,w); applyFloor(T,f);
      const cc=compute(T);
      h+= cc.ok
        ? `<td data-s="${cc.worst}" data-w="${w}" data-f="${f}">${fmt(cc.r.pmax,1)}<i>b/R ${fmt(cc.bR,2)} · T ${fmt(cc.th.T,0)}°C · ${esc(cc.driver?cc.driver.sym:'전 항목 통과')}</i></td>`
        : `<td data-s="bad">—<i>계산 불가</i></td>`;
    }
    h+='</tr>';
  }
  $('#mx').innerHTML=h+'</tbody>';
  $('#mxTag').textContent=`p_max MPa · D${S.D}×L${S.L} · F_op ${fmt(C.Fop,0)} N · v ${S.v} m/s · ${S.maneuver==='spin'?'제자리 선회':'직진'}`;
  $$('#mx td[data-w]').forEach(td=>td.onclick=()=>{
    const T={...S}; applyWheel(T,td.dataset.w); applyFloor(T,td.dataset.f);
    S=T; setTab('chain'); syncInputs(); render(); });
}

/* ══════════════════════════════════════════════ 근거 대장 */
const LIMITS=[
  ['반복 통과 피로','동일 궤적을 수만 회 반복하는 주차로봇에서 도막·PU 모두 누적 손상이 쌓이지만, 이 해석기는 단발 정적·정상상태 판정만 합니다. S–N 데이터가 있으면 별도로 대조하십시오.'],
  ['정차 크리프 · 압흔','차를 물고 장시간 대기하면 PU가 크리프해 플랫스팟이 남습니다. 점탄성 시간의존 해석이 필요합니다.'],
  ['콘크리트 표면 거칠기','실제 접촉은 골재 돌기에 집중되어 국부압이 헤르츠 평균을 크게 넘습니다. 평활면 가정입니다.'],
  ['축 · 베어링','휠 폭이 좁고 하중이 크면 실제 설계를 지배하는 것은 축 굽힘과 베어링 L10 수명인 경우가 많습니다. 여기서는 다루지 않습니다.'],
  ['부분 슬립 접촉장','직진 구동의 접선응력 분포는 Cattaneo–Mindlin 부분 슬립이지만, 여기서는 μ_util 을 균일 미끄럼으로 단순화했습니다. 완전 미끄럼(선회) 케이스는 정확합니다.'],
  ['동적 구조 응답','단차 충격은 1자유도 운동량 상한 + 경험 감쇠계수입니다. 프레임 유연성과 실제 감쇠는 반영되지 않습니다.'],
];
function renderSources(){
  $('#confList').innerHTML=Object.entries(CONF).map(([k,v])=>
    `<div class="stat"><span class="k"><span class="conf" data-c="${k}">${v.n}</span></span>
     <span class="d" style="margin-top:4px">${esc(v.d)}</span></div>`).join('');
  $('#srcTable').innerHTML=`<thead><tr><th>항목</th><th>신뢰도</th><th>출처</th></tr></thead><tbody>`+
    Object.entries(SRC).map(([k,v])=>`<tr><td>${esc(v.t)}</td>
      <td><span class="conf" data-c="${v.c}">${CONF[v.c].n}</span></td>
      <td style="font-family:var(--mono);font-size:11.5px;text-align:left">${esc(v.r)}</td></tr>`).join('')+`</tbody>`;
  $('#limits').innerHTML=`<div class="chainlist">`+LIMITS.map(([t,d])=>
    `<div class="chainrow" style="align-items:flex-start"><span class="k"><b style="color:var(--ink)">${esc(t)}</b>
      <small style="font-family:var(--sans);font-size:11.5px;color:var(--ink3);white-space:normal;line-height:1.55;margin-top:2px">${esc(d)}</small></span></div>`).join('')+`</div>`;
}

/* ══════════════════════════════════════════════ 열 패널 */
function renderThermal(c){
  $('#figThermal').replaceChildren(figThermal(c));
  $('#thStats').innerHTML=[
    ['구름저항계수 f',fmt(c.th.f,4),'',`(4/3π)·α·(b/R), α = ${fmt(S.wAlpha,3)}`],
    ['순간 구름손실',fmt(c.th.Prr,1),'W',`f · F · v`],
    ['평균 소산 (듀티 반영)',fmt(c.th.P,1),'W',`듀티 ${fmt(S.duty*100,0)}%`],
    ['방열 면적',fmt(c.th.Aw*1e4,0),'cm²','트레드 원주면 + 양 측면'],
    ['대류계수 h',fmt(c.th.h,1),'W/m²K',`${S.hNat} + ${S.hVel}·v`],
    ['열저항 R_th',fmt(c.th.Rth,2),'K/W',`1/(h·A + UA_hub ${S.UAhub})`],
    ['온도 상승 ΔT',fmt(c.th.dT,1),'K',`주위 ${S.Tamb}°C`],
    ['트레드 온도',fmt(c.th.T,1),'°C',`허용 ${c.W.Tmax}°C`],
    ['열 기준 허용하중',fmt(c.Fth/S.g,0),'kg','P ∝ F^1.5 역산'],
    ['휠당 구동토크',fmt(c.th.torque,2),'N·m','f · F · R'],
  ].map(([k,v,u,d])=>`<div class="stat"><span class="k">${esc(k)}</span>
    <span class="v">${v}<u>${u}</u></span><span class="d">${esc(d)}</span></div>`).join('');
  const cal=calibrate(S);
  $('#calTag').textContent = cal ? `보정계수 ×${fmt(cal.scale,3)}` : '보정 불가 — 정격·온도·손실률 확인';
  if(!$('#calF')) $('#calBody').innerHTML=`
    <p class="hint" style="margin-bottom:10px">손실률 α 와 열저항 R_th 는 물리 모델이지만 계수는 재료·형상마다 다릅니다.
      제조사 카탈로그의 <b>연속 정격점</b>(그 하중·속도에서 허용 온도에 딱 도달하는 점)을 넣으면 그 점을 지나도록 모델을 앵커합니다.</p>
    <div class="field"><label>정격 하중</label><div class="inp"><input type="number" id="calF" step="10"><span class="unit">N</span></div></div>
    <div class="field"><label>정격 속도</label><div class="inp"><input type="number" id="calV" step="0.1"><span class="unit">m/s</span></div></div>
    <div class="field"><label>정격 휠 직경</label><div class="inp"><input type="number" id="calD" step="5"><span class="unit">mm</span></div></div>
    <div class="field"><label>정격 휠 폭</label><div class="inp"><input type="number" id="calL" step="5"><span class="unit">mm</span></div></div>
    <div class="field" style="margin-top:8px"><label>현재 적용 보정계수 (α·R_th 곱)</label>
      <div class="inp"><input type="number" id="rthScale" step="0.05"></div></div>
    <button class="tbtn" id="btnCal" style="margin-top:10px;width:100%"></button>
    <p class="hint" id="calFeedback" style="margin-top:8px"></p>`;
  ['calF','calV','calD','calL','rthScale'].forEach(id=>{const e=$('#'+id); if(!e)return;
    if(document.activeElement!==e)e.value=S[id]; e.oninput=()=>{S[id]=e.valueAsNumber; render();};});
  const bc=$('#btnCal'); bc.disabled=!cal;
  bc.textContent=cal?`정격점에 맞추기 — ×${fmt(cal.scale,3)} 적용`:'정격·온도·손실률을 확인하십시오';
  bc.onclick=cal?()=>set({rthScale:cal.scale}):null;
  $('#calFeedback').textContent=cal?`보정 전 온도 상승 ${fmt(cal.dT0,1)} K · 허용까지 ${fmt(S.wTmax-S.Tamb,1)} K`:'';
}

/* ══════════════════════════════════ 구름 애니메이션 ══ */
function startRoll(c){
  if(rafRoll) cancelAnimationFrame(rafRoll);
  const R=c.r.R1/1000;
  const rpm = (S.v>0&&R>0) ? S.v/(2*Math.PI*R)*60 : 0;
  const note=$('#rollNote');
  if(note) note.textContent = rpm>0 ? `${fmt(rpm,0)} rpm · ${fmt(S.v,2)} m/s 주행 중` : '정지';
  rollOmega = REDUCED ? 0 : Math.min(S.v/Math.max(R,1e-6), 6)*0.35;
  if(rollOmega<=0) return;
  let last=performance.now();
  const loop=now=>{ const dt=Math.min((now-last)/1000,.05); last=now;
    rollPhase=(rollPhase+rollOmega*dt*180/Math.PI)%360;
    const el=document.getElementById('hubRot');
    if(el) el.setAttribute('transform',`rotate(${rollPhase} ${el.dataset.cx} ${el.dataset.cy})`);
    rafRoll=requestAnimationFrame(loop); };
  rafRoll=requestAnimationFrame(loop);
}

/* ══════════════════════════════════════════════ 배선 */
function set(patch){ Object.assign(S,patch); syncInputs(); render(); }

function buildUI(){
  $('#railIn').innerHTML=RAIL_HTML;
  $('#strip').innerHTML=STRIP_HTML;
  const wopt=Object.entries(WHEELS).map(([k,v])=>`<option value="${k}">${esc(v.n)}</option>`).join('');
  const fopt=Object.entries(FLOORS).map(([k,v])=>`<option value="${k}">${esc(v.n)}</option>`).join('');
  $('#wPre').innerHTML=wopt; $('#sWPre').innerHTML=wopt;
  $('#fPre').innerHTML=fopt; $('#sFPre').innerHTML=fopt;
  $('#scen').innerHTML=`<option value="">시나리오 불러오기…</option>`+
    Object.entries(SCENARIOS).map(([k,v])=>`<option value="${k}">${esc(v.n)} — ${esc(v.d)}</option>`).join('');
  $('#tabs').innerHTML=[['chain','계산 체인'],['thermal','열 · 듀티'],['matrix','조합 매트릭스'],
    ['reverse','치수 역산'],['sources','근거 대장']].map(([k,l])=>
    `<button role="tab" data-tab="${k}" aria-selected="${k==='chain'}">${l}</button>`).join('');

  NUMS.forEach(id=>{const e=$('#'+id); if(!e)return;
    e.addEventListener('input',()=>{
      S[id]=e.valueAsNumber;
      /* 무도장이면 바닥 물성이 f_ck 에서 파생되므로 표시값도 함께 갱신한다 */
      if((id==='fck'||id==='EcMan') && !(S.fT>0)){ applyFloor(S,S.fPre); syncInputs(); }
      render();});});
  CHECKS.forEach(id=>{const e=$('#'+id); if(!e)return;
    e.addEventListener('change',()=>{S[id]=e.checked; render();});});
  $$('[data-set]').forEach(seg=>seg.querySelectorAll('button').forEach(b=>b.onclick=()=>{
    const k=seg.dataset.set, v=b.dataset.v;
    S[k] = /^\d+$/.test(v) ? (+v===1) : v;
    if(k==='confine'||k==='layer') S[k]=(v==='1');
    syncInputs(); render();}));
  const wp=e=>{applyWheel(S,e.target.value); syncInputs(); render();};
  const fp=e=>{applyFloor(S,e.target.value); syncInputs(); render();};
  $('#wPre').onchange=wp; $('#sWPre').onchange=wp;
  $('#fPre').onchange=fp; $('#sFPre').onchange=fp;
  const link=(a,b,key,dec)=>{[a,b].forEach(id=>{const e=$('#'+id); if(!e)return;
    e.addEventListener('input',()=>{S[key]=+e.value; syncInputs(); render();});});};
  link('Dr','sD','D'); link('Lr','sL','L');
  $('#sV').addEventListener('input',()=>{S.v=+$('#sV').value; syncInputs(); render();});
  $('#scen').onchange=e=>{const k=e.target.value; if(!k)return;
    const T={...DEFAULTS}; const p=SCENARIOS[k].p;
    if(p.wPre) applyWheel(T,p.wPre); if(p.fPre) applyFloor(T,p.fPre);
    Object.assign(T,p,{mode:S.mode,tab:S.tab}); S=T; openRungs.clear(); syncInputs(); render(); e.target.value='';};
  $('#mEasy').onclick=()=>setMode('easy'); $('#mPro').onclick=()=>setMode('pro');
  $$('#tabs button').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
  $('#railToggle').onclick=()=>{const r=$('#rail'); const hidden=r.style.display==='none';
    r.style.display=hidden?'':'none';
    document.querySelector('.wrap').style.gridTemplateColumns=hidden?'':'1fr';};
  $('#btnExpand').onclick=()=>{const all=$$('.rung'); const anyClosed=all.some(d=>!d.open);
    all.forEach(d=>{d.open=anyClosed; anyClosed?openRungs.add(d.dataset.id):openRungs.delete(d.dataset.id);});
    $('#btnExpand').textContent=anyClosed?'근거 모두 닫기':'근거 모두 열기';};
  $('#btnTheme').onclick=()=>{
    const dark = document.documentElement.getAttribute('data-theme')==='dark';
    document.documentElement.setAttribute('data-theme', dark?'light':'dark');
    $('#btnTheme').setAttribute('aria-label', dark?'다크 모드로 전환':'라이트 모드로 전환');
    render();};
  $('#btnJson').onclick=()=>dl(`롤모델_설정_D${S.D}xL${S.L}.json`,'application/json',JSON.stringify({_app:'ROLLMODEL',_saved:new Date().toISOString(),...S},null,2));
  resolveDownloads();
  $('#btnImp').onclick=()=>$('#fileImp').click();
  $('#fileImp').onchange=e=>{const f=e.target.files[0]; if(!f)return; const r=new FileReader();
    r.onload=()=>{try{const next=importState(JSON.parse(r.result));
      S=next; openRungs.clear(); const tab=S.tab; setMode(S.mode); setTab(S.mode==='easy'?'chain':tab);
      syncInputs(); render();}catch(err){alert(`설정 파일을 읽을 수 없습니다: ${err.message}`);}};
    r.readAsText(f); e.target.value='';};
  $('#btnSvg').onclick=exportSvg;
  $('#btnCsv').onclick=exportCsv;
}

function syncInputs(){
  NUMS.forEach(id=>{const e=$('#'+id); if(e && document.activeElement!==e) e.value=S[id];});
  CHECKS.forEach(id=>{const e=$('#'+id); if(e) e.checked=!!S[id];});
  ['Dr','sD'].forEach(i=>{const e=$('#'+i); if(e&&document.activeElement!==e)e.value=S.D;});
  ['Lr','sL'].forEach(i=>{const e=$('#'+i); if(e&&document.activeElement!==e)e.value=S.L;});
  const sv_=$('#sV'); if(sv_)sv_.value=S.v;
  $('#Dv').textContent=`${S.D} mm`; $('#Lv').textContent=`${S.L} mm`;
  $('#sDv').textContent=`${S.D}`; $('#sLv').textContent=`${S.L}`; $('#sVv').textContent=fmt(S.v,2);
  $('#wPre').value=S.wPre; $('#sWPre').value=S.wPre;
  $('#fPre').value=S.fPre; $('#sFPre').value=S.fPre;
  $$('[data-set]').forEach(seg=>{const k=seg.dataset.set;
    seg.querySelectorAll('button').forEach(b=>{
      const v=b.dataset.v, cur=S[k];
      const on = /^\d+$/.test(v) ? (!!cur === (+v===1)) : (cur===v);
      b.setAttribute('aria-pressed', String(on));});});
  $$('[data-show]').forEach(el=>{el.style.display = (el.dataset.show===S.loadMode)
    ? (el.classList.contains('field')?'grid':'flex') : 'none';});
}

function setMode(m){ S.mode=m; document.body.dataset.mode=m;
  $('#mEasy').setAttribute('aria-pressed',String(m==='easy'));
  $('#mPro').setAttribute('aria-pressed',String(m==='pro'));
  $('#railToggle').style.display = m==='pro'?'grid':'none';
  $('#tabs').style.display = m==='pro'?'flex':'none';
  $$('.two.pro-only').forEach(e=>e.style.display = m==='pro'?'grid':'none');
  if(m==='easy'){ setTab('chain'); }
  render(); }

function setTab(t){ S.tab=t;
  $$('#tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));
  const map={chain:'#viewChain',thermal:'#viewThermal',matrix:'#viewMatrix',reverse:'#viewReverse',sources:'#viewSources'};
  for(const k in map) $(map[k]).style.display = (k===t)?'flex':'none';
  render(); }

/* 파일 저장 — claude.ai 아티팩트에서는 downloads 권한을 거쳐야 실제로 저장된다.
   단독 HTML 파일로 열었을 때는 브라우저 다운로드로 떨어진다. */
let DLNS = undefined;
const inViewer = () => typeof window!=='undefined' && window.claude && typeof window.claude.use==='function';
async function resolveDownloads(){
  if(DLNS!==undefined) return DLNS;
  if(!inViewer()){ DLNS=null; return null; }
  try{ DLNS = await window.claude.use('downloads'); }catch(_){ DLNS=null; }
  if(!DLNS) $$('[data-save]').forEach(b=>b.style.display='none');
  return DLNS;
}
async function dl(name,type,data){
  const blob=new Blob([data],{type});
  const ns = await resolveDownloads();
  if(ns){ try{ await ns.save({filename:name, data:blob}); }catch(e){
      if(e && e.code!=='declined') console.warn('저장 실패',e.code||e); }
    return; }
  if(inViewer()) return;                       // 뷰어인데 권한 없음 — 버튼은 이미 숨김
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(()=>{try{URL.revokeObjectURL(a.href);}catch(_){}} ,1500);
}

function exportSvg(){
  const s=$('#figSection svg'); if(!s)return;
  const cl=s.cloneNode(true); cl.setAttribute('width',860); cl.setAttribute('height',560);
  const cs=getComputedStyle(document.documentElement);
  const st=document.createElementNS(NS,'style');
  st.textContent=`text{font-family:'IBM Plex Mono',monospace;font-size:11px;fill:${cs.getPropertyValue('--ink2')}}
    .svg-lbl{font-family:'IBM Plex Sans KR',sans-serif;font-size:11.5px;fill:${cs.getPropertyValue('--ink2')}}
    .svg-dim{stroke:${cs.getPropertyValue('--ink3')};stroke-width:.9;fill:none}
    .svg-cl{stroke:${cs.getPropertyValue('--ink3')};stroke-width:.8;stroke-dasharray:12 3 3 3;fill:none}`;
  cl.prepend(st);
  let x=new XMLSerializer().serializeToString(cl);
  ['--ink','--ink2','--ink3','--accent','--ok','--warn','--bad','--surface','--line','--concrete']
    .forEach(v=>{x=x.split(`var(${v})`).join(cs.getPropertyValue(v).trim()||'#666');});
  x=x.replace(/var\([^)]*\)/g,'#888');
  dl(`롤모델_접촉단면_D${S.D}xL${S.L}.svg`,'image/svg+xml',
    '<?xml version="1.0"?>\n<!-- ROLLMODEL · 캐스터 접촉 해석 · '+new Date().toISOString().slice(0,10)+' -->\n'+x);
}
function exportCsv(){
  if(!C)return;
  const rows=[[`ROLLMODEL D${S.D}xL${S.L} F_op=${C?C.Fop.toFixed(0):''}N v=${S.v}m/s ${S.maneuver==='spin'?'선회':'직진'} ${new Date().toISOString().slice(0,10)}`],
    ['바닥','바퀴','p_max_MPa','p_edge_MPa','p_sub_MPa','b_mm','b_R','sigma_t_MPa','T_C','판정','결정요인']];
  for(const f of Object.keys(FLOORS)) for(const w of Object.keys(WHEELS)){
    const T={...S}; applyWheel(T,w); applyFloor(T,f); const cc=compute(T);
    rows.push(cc.ok?[FLOORS[f].n,WHEELS[w].n,cc.r.pmax.toFixed(2),cc.pEdge.toFixed(2),cc.pSub.toFixed(2),
      cc.r.b.toFixed(3),cc.bR.toFixed(4),cc.sf.sigT.toFixed(2),cc.th.T.toFixed(1),
      STATUS[cc.worst],cc.driver?cc.driver.sym:'—']:[FLOORS[f].n,WHEELS[w].n,'','','','','','','','계산불가','']);
  }
  dl(`롤모델_조합매트릭스_D${S.D}xL${S.L}.csv`,'text/csv;charset=utf-8','﻿'+rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n'));
}

/* ══════════════════════════════════════════════ 메인 */
function render(){
  const c=compute(S);
  if(!c.ok){
    C=null; clearTimeout(fixesTimer);
    if(rafTween)cancelAnimationFrame(rafTween); if(rafRoll)cancelAnimationFrame(rafRoll);
    ['figSection','figPlan','figDepth','figSurf','figThermal','figReverse','figLegend','planLegend','depthLegend','surfLegend',
      'thermalLegend','revLegend','results','loadChainList','thStats','mx'].forEach(id=>$('#'+id).replaceChildren());
    ['sF','sFsub','sWsub','sFfsub','sVsub','sMsub','figTag','planTag','rollNote','thTag','rvTag','resTag','loadTag','mxTag','hintFrac'].forEach(id=>$('#'+id).textContent='—');
    if($('#btnCal'))$('#btnCal').disabled=true;
    $('#btnSvg').disabled=true; $('#btnCsv').disabled=true; $('#btnJson').disabled=true;
    $('#verdict').dataset.s='bad';
    $('#verdict').innerHTML=`<div class="verdict-h"><div class="vmark">×</div><div class="vtxt">
      <h2>입력값을 계산할 수 없습니다</h2><p>${esc(c.error)}</p></div></div>`;
    $('#alerts').innerHTML=''; $('#ladder').innerHTML=''; $('#fixCard').hidden=true;
    $('#figSection').replaceChildren(); $('#figLegend').innerHTML='';
    updateTags(null); return;
  }
  C=c;
  $('#btnSvg').disabled=false; $('#btnCsv').disabled=false; $('#btnJson').disabled=false;
  renderVerdict(c); renderAlerts(c); renderLadder(c); renderFixes(c);
  renderLoad(c); renderResults(c);
  tween({b:c.r.b, R:c.r.R1, pen:c.r.delta, pmax:c.r.pmax, Le:c.Le}, ()=>{
    $('#figSection').replaceChildren(figSection(c));
    $('#figPlan').replaceChildren(figPlan(c));
  });
  startRoll(c);
  if(S.mode==='pro'){
    $('#figDepth').replaceChildren(figDepth(c));
    $('#figSurf').replaceChildren(figSurf(c));
    if(S.tab==='thermal') renderThermal(c);
    if(S.tab==='matrix')  renderMatrix();
    if(S.tab==='reverse') $('#figReverse').replaceChildren(figReverse(c));
    if(S.tab==='sources') renderSources();
  }
  updateTags(c);
}
function updateTags(c){
  const t=(id,v)=>{const e=$('#'+id); if(e)e.textContent=v;};
  t('tgLoad', c?`${fmt(c.Fop,0)} N`:'—');
  t('tgWheel',`D${S.D}×L${S.L}`);
  t('tgFloor',S.fT>0?`t ${fmt(S.fT,1)} mm`:'무도장');
  t('tgRun',  `${fmt(S.v,1)} m/s`);
  t('tgOpt',  `${S.confine?'구속 ON':'구속 OFF'} · ${S.layer?'층상 ON':'층상 OFF'}`);
  const hc=$('#hintConc'); if(hc) hc.innerHTML=
    `E_c = <b>${fmt(concreteE(S),0)}</b> MPa · 지압 0.85·f_ck·√(A₂/A₁) = <b>${fmt(concreteBearing(S),1)}</b> MPa · 인장 f_ctm = <b>${fmt(concreteTens(S),2)}</b> MPa`;
  const hf=$('#hintFrac'); if(hf&&c) hf.innerHTML= c.LC.grid
    ? `휠 ${c.LC.n}개 · 최대 분담 <b>${fmt(c.LC.fracMax*100,1)}%</b> (균등 ${fmt(100/c.LC.n,1)}%) · 최소 <b>${fmt(c.LC.fracMin*100,1)}%</b>`
    : '직접 입력 모드';
  const sf=$('#sF'); if(sf&&c){ sf.textContent=fmt(c.Fop,0);
    $('#sFsub').innerHTML=`${fmt(c.Fop/S.g,0)} kg · 피크 <b>${fmt(c.Fpk/S.g,0)}</b> kg`; }
  if(c){
    $('#sWsub').innerHTML=`E ${fmt(S.wE,0)} MPa → 겉보기 <b>${fmt(c.r.E1e,0)}</b> · 허용 ${fmt(c.allow.wheel,1)} MPa`;
    $('#sFfsub').innerHTML=`전달압 <b>${fmt(c.pSub,1)}</b> / 허용 ${fmt(c.allow.conc,1)} MPa`;
    $('#sVsub').innerHTML=`트레드 <b>${fmt(c.th.T,0)}</b>°C / 허용 ${c.W.Tmax}°C${S.v===0?' · 정지':''}`;
    $('#sMsub').innerHTML=`μ_util <b>${fmt(c.MU.mu,3)}</b> · 표면 인장 ${fmt(c.sf.sigT,2)} MPa`;
  }
}

/* 뷰포트가 좁아지면 도면 배치 자체를 바꾼다 */
let wasNarrow=NARROW(), rzT=null;
addEventListener('resize',()=>{ clearTimeout(rzT); rzT=setTimeout(()=>{
  const n=NARROW(); if(n!==wasNarrow){ wasNarrow=n; render(); }
  else if(C){ $('#figSection').replaceChildren(figSection(C)); $('#figPlan').replaceChildren(figPlan(C)); }
},180); });

/* ══════════════════════════════════════════════ 부팅 */
buildUI();
applyWheel(S,S.wPre); applyFloor(S,S.fPre);
Object.assign(S,{D:DEFAULTS.D,L:DEFAULTS.L,wT:DEFAULTS.wT,fT:DEFAULTS.fT});
setMode('easy'); setTab('chain'); syncInputs(); render();
