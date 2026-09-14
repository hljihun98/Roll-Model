/* 첫 사용 안내. 예시는 별도 상태로 계산하며 사용자의 S는 변경하지 않는다. */
(()=>{
  const KEY='rollmodel.guide.v1';
  const demoBase=()=>({...DEFAULTS,loadMode:'direct',Fdirect:6000,kSauto:false,kS:1});
  const scenario=k=>{const s={...DEFAULTS},p=SCENARIOS[k].p;applyWheel(s,p.wPre);applyFloor(s,p.fPre);return Object.assign(s,p);};
  const material=(wheel,floor)=>{const s=demoBase();applyWheel(s,wheel);applyFloor(s,floor);return s;};
  const steps=[
    {title:'먼저, 비슷한 사용 조건을 고르세요',where:'① 사용 조건 선택 → 시나리오',target:'#scenarioPanel',focus:'#scen',
      text:'시나리오는 무게, 바퀴, 바닥, 주행 조건을 한 번에 채워 주는 출발점입니다. 가장 비슷한 예시를 고른 뒤 실제 설계값으로 바꾸세요.',
      effect:'시나리오를 바꾸면 여러 입력이 함께 달라집니다. 비교를 시작하기 전에 하중과 바퀴 치수를 확인하세요.',
      choices:[['승용차',()=>scenario('park_sedan')],['SUV',()=>scenario('park_suv')],['소형 AMR',()=>scenario('agv')]]},
    {title:'로봇 중량과 적재하중부터 넣으세요',where:'② 하중 → 로봇 중량 · 적재하중 · 휠 배치',target:'#inputLoad',focus:'#Wtare',
      text:'필수 입력은 로봇 중량, 적재하중(차량), 휠 배치(기본 2×2 4점 접지), 축거·윤거입니다. 무게중심 편심·가감속은 상세 조건에 기본값이 들어 있어 몰라도 계산됩니다. 캐스터당 하중을 이미 안다면 직접 입력할 수 있어요.',
      effect:'아래 예시는 다른 조건을 고정하고 휠 하중만 바꿉니다. 하중이 커지면 접촉압과 압력 화살표가 커집니다. F_op는 주행, F_pk는 단차 통과 피크 하중입니다.',
      choices:[['3,000 N',()=>({...demoBase(),Fdirect:3000})],['6,000 N',demoBase],['9,000 N',()=>({...demoBase(),Fdirect:9000})]]},
    {title:'바퀴 재질과 직경·폭을 정하세요',where:'③ 바퀴 → 재질 · 직경 D · 폭 L',target:'#inputWheel',focus:'#sWPre',
      text:'바퀴 재질을 고르고 직경 D와 폭 L을 조절하세요. D는 바퀴 크기, L은 옆면 방향 너비입니다. 단단한 재질은 접촉면이 작아져 압력이 커질 수 있어요.',
      effect:'아래는 같은 하중에서 폭 또는 재질만 바꾼 비교입니다. 빨간 화살표는 각 위치의 압력(MPa)입니다. 폭을 넓히면 총힘이 같아도 압력과 화살표 길이가 줄어듭니다.',
      choices:[['PU · D200 · L80',demoBase],['폭만 L120',()=>({...demoBase(),L:120})],['재질만 나일론',()=>material('pa6','lin3')]]},
    {title:'바닥 마감과 도막 두께를 확인하세요',where:'④ 바닥 → 바닥 마감 · 도막·기재 설정',settings:'Floor',
      text:'실제 바닥에 맞는 마감을 고른 뒤 도막 두께와 콘크리트 강도를 확인하세요. 도막 표면 압력뿐 아니라 아래 콘크리트에 전달되는 압력과 박리 가능성도 함께 봅니다.',
      effect:'아래는 바퀴와 하중을 고정한 바닥 비교입니다. 두꺼운 도막이 항상 안전한 것은 아닙니다. 도막·기재 비교는 근사이므로 주의 판정이 남을 수 있어요.',
      choices:[['에폭시 3 mm',()=>material('pu95','lin3')],['에폭시 6 mm',()=>material('pu95','lin6')],['무도장',()=>material('pu95','bare')]]},
    {title:'속도와 선회는 서로 다른 손상을 만듭니다',where:'⑤ 주행 · 기동 → 속도 · 직진/선회',target:'#inputRun',focus:'#v',
      text:'속도와 주행 시간 비율(듀티, 상세 조건)이 커지면 발열이 증가합니다. 제자리 선회는 미끄럼을 만들어 도막의 전단·표면 인장을 키울 수 있어요.',
      effect:'느린 직진과 빠른 직진에서는 온도를, 제자리 선회에서는 표면 인장을 비교해 보세요. 이 예시는 하중을 고정해 기동 조건의 영향을 구분합니다.',
      choices:[['직진 0.5 m/s',()=>({...demoBase(),v:.5})],['직진 2 m/s',()=>({...demoBase(),v:2})],['제자리 선회',()=>({...demoBase(),v:.3,maneuver:'spin'})]]},
    {title:'색보다 먼저, 판정 이유를 읽으세요',where:'⑥ 판정 결과 → 접촉 단면 → 개선 제안 · 상세 근거',target:'#verdict',
      text:'가능은 구현된 검사를 통과했다는 뜻이고, 주의는 별도 확인이 필요하다는 뜻입니다. 불가는 허용치 초과 또는 모델 적용 불가를 뜻해요. 각 검사 항목을 펼치면 식과 이유가 나옵니다.',
      effect:'판정 아래 결과 신뢰도는 기본값 사용 현황과 결과에 영향이 큰 입력을 보여 줍니다. 불가이면 개선 제안을 적용한 뒤 다시 확인하세요. 상세 모드에서 열·재료 조합·치수 역산을 보고, 설정 저장으로 조건을 남길 수 있습니다. 미지원 물리 현상은 별도 검토가 필요합니다.',
      choices:[['가능 예시',()=>({...material('pu95','bare'),Fdirect:500,D:300,L:120,v:.3,maneuver:'manual',muMan:0})],['주의 예시',demoBase],['불가 예시',()=>({...material('pu95','coat'),maneuver:'spin'})]]}
  ];
  const dialog=document.createElement('dialog');dialog.id='startGuide';dialog.className='guide';
  dialog.setAttribute('aria-labelledby','guideHeading');
  dialog.innerHTML=`<div class="guide-head"><div><span class="eyebrow">처음 사용하는 롤모델</span><h2 id="guideHeading">입력부터 판정까지, 함께 살펴보기</h2></div><button class="tbtn" id="guideSkip">건너뛰기</button></div>
    <div class="guide-progress" role="progressbar" aria-label="안내 진행" aria-valuemin="1" aria-valuemax="${steps.length}"><span></span></div>
    <div class="guide-body"><div class="guide-copy"><p class="guide-location" id="guideLocation"></p><h3 id="guideTitle" tabindex="-1"></h3><p id="guideText"></p><p class="guide-effect" id="guideEffect"></p><button class="tbtn" id="guideLocate">실제 설정 위치 보기</button><p class="guide-return-note">화면을 살펴본 뒤 상단 ‘가이드 이어보기’로 돌아오세요.</p></div>
    <section class="guide-demo" aria-label="입력 영향 체험"><div class="guide-demo-head"><b>눌러서 비교해 보세요</b><button class="tbtn" id="guideMotion"></button></div><div id="guideChoices" class="guide-choices" role="group" aria-label="예시 조건 선택"></div>
    <svg viewBox="0 0 360 150" aria-hidden="true"><rect x="20" y="105" width="320" height="10" rx="2" fill="var(--accent)" opacity=".65"/><rect x="20" y="115" width="320" height="22" fill="var(--line2)"/><path d="M55 58Q100 102 125 105H235Q260 102 305 58" fill="none" stroke="var(--ink3)" stroke-width="2"/>
    <g class="guide-vectors">${[-.75,-.5,0,.5,.75].map((u,i)=>`<g transform="translate(${80+i*50} 103)"><line data-demo-arrow="${u}" x1="0" y1="-70" x2="0" y2="0" stroke="var(--bad)" stroke-width="2"/><path d="M0 0L-4 -8L4 -8Z" fill="var(--bad)"/></g>`).join('')}</g><text x="180" y="18" text-anchor="middle" fill="var(--ink2)" font-size="11">도막을 누르는 압력</text></svg>
    <div class="guide-demo-results" id="guideResults" aria-live="polite"></div><p class="guide-example-note">설명용 별도 예시입니다. 현재 입력은 바뀌지 않습니다.<br>그림의 형상·압력 길이는 예시용 축척입니다.</p></section></div>
    <div class="guide-foot"><span id="guideCount" aria-live="polite"></span><div><button class="tbtn" id="guidePrev">이전</button><button class="tbtn guide-primary" id="guideNext">다음</button></div></div>`;
  document.body.append(dialog);
  const q=s=>dialog.querySelector(s);
  let index=0,choice=0,paused=REDUCED,restoreFocus=null,resumeIndex=null;
  function motion(){dialog.classList.toggle('guide-paused',paused);q('#guideMotion').textContent=paused?'애니메이션 재생':'애니메이션 멈춤';q('#guideMotion').setAttribute('aria-pressed',String(!paused));}
  function preview(){
    const state=steps[index].choices[choice][1](),c=compute(state);
    if(!c.ok){q('#guideResults').textContent=c.error;return;}
    q('#guideChoices').querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===choice)));
    // 모든 예시에 같은 0~20 MPa 축척. 상한 초과는 수치에 별도 표시한다.
    q('.guide-vectors').querySelectorAll('line').forEach(line=>{
      const u=+line.dataset.demoArrow,p=c.r.pmax*Math.sqrt(1-u*u),len=Math.min(p,20)/20*75;
      line.setAttribute('y1',-len);
      const head=Math.min(8,len),half=Math.min(4,len*.5);
      line.nextElementSibling.setAttribute('d',`M0 0L-${half} -${head}L${half} -${head}Z`);
    });
    q('#guideResults').innerHTML=`<div><span>최대 접촉압</span><b>${fmt(c.r.pmax,2)} <small>MPa</small></b></div><div><span>트레드 온도</span><b>${fmt(c.th.T,1)} <small>°C</small></b></div><div><span>표면 인장</span><b>${fmt(c.sf.sigT,2)} <small>MPa</small></b></div><div><span>종합 판정</span><b style="color:${SC(c.worst)}">${STATUS[c.worst]}</b></div><p>${c.r.pmax>20?'그림 높이 상한 20 MPa 초과 · ':''}피크 하중 ${fmt(c.Fpk,0)} N · 접촉 전폭 ${fmt(2*c.r.b,1)} mm</p>`;
  }
  function renderStep(focus=false){
    const step=steps[index];choice=0;
    q('#guideLocation').textContent=step.where;q('#guideTitle').textContent=step.title;
    q('#guideText').textContent=step.text;q('#guideEffect').textContent=step.effect;
    q('#guideCount').textContent=`${index+1} / ${steps.length}`;
    q('.guide-progress').setAttribute('aria-valuenow',index+1);q('.guide-progress span').style.width=`${(index+1)/steps.length*100}%`;
    q('#guidePrev').disabled=index===0;q('#guideNext').textContent=index===steps.length-1?'설계 시작':'다음';
    q('#guideLocate').textContent=index===steps.length-1?'실제 판정 결과 보기':'실제 설정 위치 보기';
    q('#guideChoices').replaceChildren(...step.choices.map(([label],i)=>{const b=document.createElement('button');b.className='tbtn';b.textContent=label;b.onclick=()=>{choice=i;preview();};return b;}));
    preview();if(focus)q('#guideTitle').focus({preventScroll:true});q('.guide-body').scrollTop=0;
  }
  function open(){if(dialog.open)return;restoreFocus=document.activeElement;index=resumeIndex??0;resumeIndex=null;$('#btnGuide').textContent='시작 가이드';paused=REDUCED;renderStep();motion();dialog.showModal();q('#guideNext').focus();}
  function close(){try{localStorage.setItem(KEY,'done');}catch{}resumeIndex=null;$('#btnGuide').textContent='시작 가이드';dialog.close();(restoreFocus&&restoreFocus!==document.body?restoreFocus:$('#btnGuide')).focus({preventScroll:true});}
  q('#guideLocate').onclick=()=>{
    const step=steps[index];resumeIndex=index;dialog.close();$('#btnGuide').textContent='가이드 이어보기';
    if(step.settings)openSettings(step.settings);
    else if(step.target==='#verdict')showResults();
    else {if(matchMedia('(max-width:960px)').matches)setRailVisible(false);jumpTo(step.target,step.focus);}
  };
  q('#guideSkip').onclick=close;q('#guidePrev').onclick=()=>{if(index>0){index--;renderStep(true);}};
  q('#guideNext').onclick=()=>{if(index===steps.length-1)close();else{index++;renderStep(true);}};
  q('#guideMotion').onclick=()=>{paused=!paused;motion();};
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const buttons=[...dialog.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons[buttons.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  $('#btnGuide').onclick=open;
  let seen=false;try{seen=localStorage.getItem(KEY)==='done';}catch{}
  if(!seen)open();
})();
