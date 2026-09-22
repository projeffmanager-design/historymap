(async function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const fmt = v => v == null ? '자료 없음' : new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(v);
  const people = v => v == null ? '자료 없음' : `${new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:1}).format(v)}명`;
  const countKeys=['castleCount','cityCount','settlementCount'];
  const val = (v,k) => v == null ? '—' : ['population','manpower',...countKeys].includes(k) ? fmt(v) : v.toFixed(1);
  const yr = y => y < 0 ? `기원전 ${-y}년` : `${y}년`;
  const names = {power:'총 국력',military:'군사력',production:'생산력',population:'인구',manpower:'동원 잠재 인원',castleCount:'성',cityCount:'도시·수도',settlementCount:'전체 거점'};
  for(const key of countKeys){
    $('#metric').insertAdjacentHTML('beforeend',`<option value="${key}">${names[key]} 마커 수</option>`);
    $('#ranking thead tr').lastElementChild.insertAdjacentHTML('beforebegin',`<th><button data-sort="${key}">${names[key]} ↕</button></th>`);
    $('#detail-table thead tr').lastElementChild.insertAdjacentHTML('beforebegin',`<th>${names[key]}</th>`);
  }
  $('#country-summary').insertAdjacentHTML('afterend','<p id="settlement-summary" class="pc-help"></p>');
  $('#country-summary').insertAdjacentHTML('afterend','<div id="power-reference-summary" class="pc-help"></div>');
  $('#power-reference-summary').insertAdjacentHTML('afterend',`<details id="profile-editor" class="pc-profile-editor"><summary>국가 상세 자료 편집</summary><p>사건·무기·생산품의 항목을 직접 수정하세요. 인구·국력 숫자는 영토 데이터로 계산되므로 <a href="/population-spreadsheet.html" target="_blank" rel="noopener noreferrer">영토 인구표</a>에서 원자료를 수정합니다.</p><form id="profile-editor-form"><div class="pc-editor-years"><label>국가 적용 시작 연도 <input name="from" type="number" min="-5000" max="2100"></label><label>국가 적용 종료 연도 <input name="to" type="number" min="-5000" max="2100"></label></div><section class="pc-editor-section"><div class="pc-editor-heading"><h3>역사 사건</h3><button type="button" data-add="events">+ 사건 추가</button></div><div class="pc-editor-list" data-list="events"></div></section><section class="pc-editor-section"><div class="pc-editor-heading"><h3>주력 무기·전력</h3><button type="button" data-add="weapons">+ 무기 추가</button></div><div class="pc-editor-list" data-list="weapons"></div></section><section class="pc-editor-section"><div class="pc-editor-heading"><h3>주요 생산품</h3><button type="button" data-add="products">+ 생산품 추가</button></div><div class="pc-editor-list" data-list="products"></div></section><div class="pc-editor-actions"><button type="submit">변경사항 저장</button><button type="button" id="profile-edit-cancel">취소</button><output id="profile-editor-status" role="status"></output></div></form></details>`);
  $('#profile-editor-form').prepend($('#profile-editor-form .pc-editor-actions'));
  let isAdmin=false;
  const showAdminControls=allowed=>{
    isAdmin=allowed;
    $('#export').style.display=allowed?'':'none';
    $('#export').disabled=!allowed||!data||$('#calculate').disabled;
    $('#profile-edit-open').style.display=allowed?'':'none';
    $('#profile-editor').style.display=allowed?'':'none';
    if(!allowed)$('#profile-editor').open=false;
  };
  async function refreshAdminControls(){
    showAdminControls(false);
    const token=localStorage.getItem('token')||sessionStorage.getItem('token');
    if(!token)return;
    try{
      const response=await fetch('/api/user/me',{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok)return;
      const user=await response.json();
      showAdminControls(user.role==='admin'||user.role==='superuser');
    }catch(_error){}
  }
  window.addEventListener('focus',refreshAdminControls);
  const colors = ['#e0bc73','#82bfb0','#8eb6e3','#d08f95','#b39cdb','#aec07b'];
  const query = new URLSearchParams(location.search), demo = query.get('demo')==='1';
  if(query.get('embedded')==='1'){
    document.body.classList.add('pc-embedded');
    const style=document.createElement('style');
    style.textContent='.pc-embedded .pc-header{display:none}.pc-embedded main{max-width:1600px;padding-top:18px}';
    document.head.appendChild(style);
  }
  const countryView = query.get('view') === 'country';
  const profile = $('#detail-country').closest('section');
  if (countryView) {
    $('#results').prepend(profile);
    profile.querySelector('.eyebrow').textContent = 'COUNTRY PROFILE / 국가 상세';
    $('.pc-intro h1').textContent = '국가 국력 상세';
    $('.pc-intro h1').nextElementSibling.textContent = '선택 국가의 총 국력·군사력·생산력·인구 변화를 확인하세요. 아래에서 다른 국가와 비교할 수 있습니다.';
  }
  const host = window.parent!==window ? window.parent : window.opener;
  $('#map-link').addEventListener('click',e=>{if(window.parent!==window){e.preventDefault();host.postMessage({type:'power-history-close'},location.origin);}});
  $('#page-close').addEventListener('click',()=>{
    if(window.parent!==window){host.postMessage({type:'power-history-close'},location.origin);return;}
    if(window.opener&&!window.opener.closed){window.close();return;}
    location.href='/index.html?power=1';
  });
  $('#profile-edit-open').addEventListener('click',()=>{
    if(!isAdmin)return;
    const editor=$('#profile-editor');editor.open=true;editor.scrollIntoView({behavior:'smooth',block:'start'});
    const token=localStorage.getItem('token')||sessionStorage.getItem('token');
    $('#profile-editor-status').textContent=token?'무기·생산품·사건 목록을 수정한 뒤 저장하세요.':'저장하려면 관리자 계정으로 먼저 로그인하세요.';
  });
  const initialYear = Number(query.get('year')||1100);
  const periodStart=query.has('start')?Number(query.get('start')):NaN;
  const periodEnd=query.has('end')?Number(query.get('end')):NaN;
  let data, selected=query.get('country')||'', picked=new Set(), requestId=0, timeout, sort='power', descending=true;
  refreshAdminControls();
  let regionOptions=[],regionOptionsPromise=null;
  function ensureRegionOptions(){
    if(regionOptions.length)return Promise.resolve();
    if(regionOptionsPromise)return regionOptionsPromise;
    regionOptionsPromise=(async()=>{try{
      let response=await fetch('/api/power-region-options');
      if(response.status===404)response=await fetch('/api/power-regions');
      if(!response.ok)throw Error('영토 목록 조회 실패');
      regionOptions=(await response.json()).map(region=>({id:String(region.id||region._id?.$oid||region._id),name:region.name_ko||region.name||'이름 없는 영토'}));
      renderTerritoryPickers();
    }
    catch(error){$('#profile-editor-status').textContent=error.message+' · 서버 상태를 확인하세요.';}})().finally(()=>{regionOptionsPromise=null;});
    return regionOptionsPromise;
  }
  function renderTerritoryPickers(){
    document.querySelectorAll('[data-territory-picker]').forEach(picker=>{
      const selectedIds=new Set((picker.dataset.ids||'').split(',').filter(Boolean)),query=picker.querySelector('[data-territory-search]').value.trim().toLocaleLowerCase();
      const selected=regionOptions.filter(region=>selectedIds.has(region.id));
      const matches=query?regionOptions.filter(region=>region.name.toLocaleLowerCase().includes(query)||region.id.includes(query)).slice(0,40):[];
      const shown=[...new Map([...selected,...matches].map(region=>[region.id,region])).values()];
      picker.querySelector('[data-territory-results]').innerHTML=shown.map(region=>`<label><input type="checkbox" data-territory-id="${esc(region.id)}" ${selectedIds.has(region.id)?'checked':''}>${esc(region.name)} <small>${esc(region.id)}</small></label>`).join('')||'<span>영토 이름을 검색해 선택하세요.</span>';
      picker.querySelector('[data-territory-count]').textContent=selectedIds.size?`${selectedIds.size}개 영토 선택`:'영토 미선택 · 비율 입력 시 국가 전체';
    });
  }
  $('#start-year').value=demo?1000:Number.isFinite(periodStart)?periodStart:Math.max(-5000,initialYear-100);
  $('#end-year').value=demo?1120:Number.isFinite(periodEnd)?periodEnd:Math.min(2100,initialYear+100);
  if(!demo&&Number.isFinite(periodStart)&&Number.isFinite(periodEnd)){
    const span=Math.max(0,periodEnd-periodStart);
    const step=[1,5,10,25,50,100].find(value=>Math.ceil(span/value)+1<=101)||100;
    $('#year-step').value=String(step);
  }
  $('#data-mode').textContent=demo?'시연용 가상 데이터':'지도 연동 · 잠정 추정';
  if(demo)$('#map-link').href='/power-preview.html';
  const status = text => { $('#status').textContent=text; };
  function fillProfileEditor(name){
    const editor=$('#profile-editor'),record=window.PowerReferenceData?.raw(name)||{},form=$('#profile-editor-form');
    editor.dataset.country=name;
    form.elements.from.value=record.from??'';form.elements.to.value=record.to??'';
    for(const type of ['events','weapons','products'])document.querySelector(`[data-list="${type}"]`).innerHTML=(record[type]||[]).map(item=>editorRow(type,item)).join('');
    renderTerritoryPickers();
    $('#profile-editor-status').textContent='';
  }
  const editorFields={events:[['name','사건 이름'],['from','시작 연도'],['to','종료 연도'],['source','출처 URL']],weapons:[['icon','아이콘'],['name','무기 이름'],['branch','분야'],['status','설명·근거 상태'],['from','시작 연도'],['to','종료 연도'],['source','출처 URL']],products:[['icon','아이콘'],['name','생산품 이름'],['status','설명·근거 상태'],['from','시작 연도'],['to','종료 연도'],['source','출처 URL']]};
  function editorRow(type,item={}){
    const effect=type==='events'?`<div class="pc-event-effect"><b>영토 인구 효과 <small>비율을 비워두면 설명만 표시</small></b><div class="pc-event-effect-years"><label>인구 변화율 (%)<input data-effect-field="percent" type="number" min="-100" max="100" step="0.1" value="${esc(item.percent??'')}" placeholder="예: -10"></label><label>효과 시작 연도<input data-effect-field="effect_from" type="number" min="-5000" max="2100" value="${esc(item.effect_from??'')}" placeholder="사건 시작 연도"></label><label>효과 종료 연도<input data-effect-field="effect_to" type="number" min="-5000" max="2100" value="${esc(item.effect_to??'')}" placeholder="사건 종료 연도"></label></div><div data-territory-picker data-ids="${esc((item.territory_ids||[]).join(','))}"><label>대상 영토 검색 <small>선택 사항</small><input data-territory-search type="search" placeholder="일부 지역만 적용할 때 검색"></label><span data-territory-count></span><div class="pc-territory-results" data-territory-results></div></div><label>변화율 산정 근거<input data-effect-field="effect_basis" type="text" maxlength="500" value="${esc(item.effect_basis??'')}" placeholder="예: 사료 기록 범위와 기존 인구 추정치를 비교한 시나리오 가정"></label><p>영토를 선택하지 않으면 해당 연도에 이 국가가 소유한 모든 영토의 기준 인구에 같은 비율을 적용합니다. 기준 자료에 피해가 이미 포함됐다면 비율을 넣지 마세요. 수동 보정은 우선하며 출처 URL이 필요합니다.</p></div>`:'';
    const title={events:'역사 사건',weapons:'주력 무기·전력',products:'주요 생산품'}[type];
    const header=`<div class="pc-editor-row-header"><strong>${title}</strong><div class="pc-editor-row-controls"><button type="button" data-remove aria-label="${title} 삭제">삭제</button><span class="pc-delete-confirm" hidden>삭제할까요? <button type="button" data-remove-confirm>삭제 확정</button><button type="button" data-remove-cancel>유지</button></span></div></div>`;
    return `<div class="pc-editor-row" data-editor-row="${type}">${header}${editorFields[type].map(([field,label])=>`<label>${label}<input data-field="${field}" type="${field==='from'||field==='to'?'number':'text'}" ${field==='from'||field==='to'?'min="-5000" max="2100"':''} ${field==='name'||type==='events'&&(field==='from'||field==='to')?'required':''} value="${esc(item[field]??'')}" placeholder="${field==='source'?'https://…':''}"></label>`).join('')}${effect}</div>`;
  }
  function collectEditorRows(type){
    return [...document.querySelectorAll(`[data-editor-row="${type}"]`)].map(row=>{
      const item={};for(const input of row.querySelectorAll('[data-field]')){const value=input.value.trim();if(!value)continue;item[input.dataset.field]=['from','to'].includes(input.dataset.field)?Number(value):value;}
      if(!item.name)throw Error(`${type} 항목의 이름을 입력하세요.`);
      if(type==='events'&&(item.from==null||item.to==null))throw Error('역사 사건의 시작·종료 연도를 입력하세요.');
      if(type==='events'){
        const percent=row.querySelector('[data-effect-field="percent"]').value;
        if(percent!==''){
          item.percent=Number(percent);
          for(const field of ['effect_from','effect_to']){const value=row.querySelector(`[data-effect-field="${field}"]`).value;item[field]=value===''?item[field==='effect_from'?'from':'to']:Number(value);}
          item.territory_ids=(row.querySelector('[data-territory-picker]').dataset.ids||'').split(',').filter(Boolean);
          item.effect_basis=row.querySelector('[data-effect-field="effect_basis"]').value.trim();
          if(!item.source)throw Error(`${item.name}: 인구 보정 출처 URL을 입력하세요.`);
          if(item.effect_basis.length<5)throw Error(`${item.name}: 변화율 산정 근거를 5자 이상 입력하세요.`);
        }
      }
      return item;
    });
  }
  const busy = value => {$('#calculate').disabled=value;$('#export').disabled=value||!data||!isAdmin;};
  const point = () => data.points[Number($('#year-range').value)||0];
  function countries(){const list=new Map();data.points.forEach(p=>p.nations.forEach(c=>list.set(c.id,c)));return [...list.values()];}
  function accept(payload){
    clearTimeout(timeout);data=payload;busy(false);const list=countries();
    if(!list.some(c=>c.id===selected))selected=list[0]?.id||'';
    picked=new Set([...picked].filter(id=>list.some(c=>c.id===id)));if(!picked.size)picked=new Set(list.slice(0,4).map(c=>c.id));
    $('#results').hidden=false;$('#year-range').max=data.points.length-1;
    const index=data.points.findIndex(p=>p.year>=initialYear);$('#year-range').value=index<0?data.points.length-1:index;
    $('#point-year').innerHTML=data.points.map((p,i)=>`<option value="${i}">${yr(p.year)}</option>`).join('');
    $('#detail-country').innerHTML=list.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');$('#detail-country').value=selected;
    $('#model-settings').textContent=`동원율 ${data.rate*100}% · 시대 미확인 입지 ${data.includeUndated?'포함':'제외'} · 각 연도 ${data.month}월 · ${data.version} · 생성 ${new Date(data.generatedAt).toLocaleString('ko-KR')}`;
    status(`${data.points.length}개 시점 · ${list.length}개 국가 분석 완료 · ${data.demo?'시연용 가상 데이터':'원본 지도에 로드된 영역 기준'}`);render();
  }
  async function request(){
    const start=Number($('#start-year').value),end=Number($('#end-year').value),step=Number($('#year-step').value);
    if(![start,end,step].every(Number.isInteger)||start < -5000||end>2100||start>end||step<1||Math.ceil((end-start)/step)+1>101){status('기간과 간격을 확인하세요. 최대 101개 시점까지 계산합니다.');return;}
    const id=++requestId;busy(true);status('연도별 영토 귀속과 인구를 계산하고 있습니다…');
    if(demo&&!host){try{
      if(!window.nationalPowerPreview)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/public/assets/power-demo.js';s.onload=resolve;s.onerror=()=>reject(new Error('시연 자료 로드 실패'));document.head.appendChild(s);});
      const years=[];for(let y=start;y<=end;y+=step)years.push(y);if(years.at(-1)!==end)years.push(end);
      const snapshots=years.map(year=>NationalPowerModel.build({...window.nationalPowerPreview(year),year}));
      if(id===requestId)accept({...NationalPowerModel.timeline(snapshots),demo:true,rate:.03,includeUndated:true,month:1,generatedAt:new Date().toISOString()});
    }catch(e){busy(false);status(e.message);}return;}
    if(!host||host.closed){busy(false);status('원본 지도에서 국력 → 비교·추이 ↗로 열어 주세요. 지도 탭이 열려 있어야 기간을 계산할 수 있습니다.');return;}
    host.postMessage({type:'power-history-request',requestId:id,start,end,step},location.origin);
    clearTimeout(timeout);timeout=setTimeout(()=>{requestId++;busy(false);status('지도 응답이 없습니다. 원본 지도의 자료 로드 상태를 확인한 뒤 다시 분석해 주세요.');},120000);
  }
  window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==host||e.data?.requestId!==requestId)return;if(e.data.type==='power-history-progress'){status(`연도별 집계 ${e.data.completed} / ${e.data.total}…`);return;}if(e.data.type!=='power-history-response')return;clearTimeout(timeout);if(e.data.error){busy(false);status(e.data.error);}else if(e.data.payload?.points?.length)accept(e.data.payload);});
  function chart(series,metric,title,markers=[],events=[]){
    const ps=data.points,W=700,H=events.length?278:245,L=62,R=18,T=events.length?51:18,B=34,absolute=['population','manpower',...countKeys].includes(metric);
    const values=series.flatMap(s=>s.values.filter(v=>v!==null));if(!values.length)return '<p class="pc-empty">이 기간에 표시할 자료가 없습니다.</p>';
    const max=absolute?Math.max(1,...values)*1.1:100,first=ps[0].year,last=ps.at(-1).year,span=Math.max(1,last-first),xYear=year=>L+(year-first)/span*(W-L-R),x=i=>xYear(ps[i].year),y=v=>H-B-v/max*(H-T-B);
    let svg=`<svg class="pc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>`;
    for(let i=0;i<=4;i++){const v=max*i/4;svg+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-9}" y="${y(v)+4}" text-anchor="end">${absolute?new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:1}).format(v):v}</text>`;}
    const tick=Math.max(1,Math.ceil((ps.length-1)/5));ps.forEach((p,i)=>{if(i%tick===0||i===ps.length-1)svg+=`<text x="${x(i)}" y="${H-9}" text-anchor="middle">${p.year<0?'BC '+-p.year:p.year}</text>`;});
    if(events.length){
      const rowEnd=[-Infinity,-Infinity];
      events.filter(e=>e.from<=last&&e.to>=first).sort((a,b)=>a.from-b.from).forEach(e=>{
        const start=Math.max(first,e.from),end=Math.min(last,e.to),eventX=xYear(start),endX=xYear(end),label=String(e.name||'사건'),short=label.length>10?label.slice(0,9)+'…':label;
        const labelX=Math.max(L+36,Math.min(W-R-36,eventX)),labelWidth=Math.max(58,short.length*10),row=rowEnd.findIndex(right=>labelX-labelWidth/2>right+8);
        if(row>=0)rowEnd[row]=labelX+labelWidth/2;
        svg+=`<g class="pc-chart-event"><title>${esc(`${yr(e.from)}${e.to!==e.from?'–'+yr(e.to):''} · ${label}`)}</title><line class="pc-chart-event-guide" x1="${eventX}" x2="${eventX}" y1="${T}" y2="${H-B}"/>${endX>eventX+2?`<line class="pc-chart-event-span" x1="${eventX}" x2="${endX}" y1="${T-5}" y2="${T-5}"/>`:''}<circle class="pc-chart-event-dot" cx="${eventX}" cy="${T-5}" r="4"/>${row>=0?`<text class="pc-chart-event-label" x="${labelX}" y="${row===0?17:34}" text-anchor="middle">${esc(short)}</text>`:''}</g>`;
      });
    }
    series.forEach(s=>{let path='',connected=false;s.values.forEach((v,i)=>{if(v===null){connected=false;return;}path+=`${connected?'L':'M'}${x(i)},${y(v)} `;connected=true;});svg+=`<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5" ${s.dash?'stroke-dasharray="5 4"':''}/>`;s.values.forEach((v,i)=>{if(v!==null){const warning=markers.find(m=>m.index===i);svg+=`<circle cx="${x(i)}" cy="${y(v)}" r="${warning?6:3.5}" fill="${warning?'#ff9378':s.color}" tabindex="0"><title>${esc(s.name)} · ${yr(ps[i].year)} · ${val(v,metric)}${countKeys.includes(metric)?'개':absolute?'명':'점'}${warning?' · 급감 '+(warning.fraction*100).toFixed(1)+'%: '+esc(warning.reason):''}</title></circle>`;}});});
    return svg+'</svg><div class="pc-legend">'+series.map(s=>`<span><i style="background:${s.color};${s.dash?'height:0;border-top:2px dashed '+s.color:''}"></i>${esc(s.name)}</span>`).join('')+(events.length?'<span><i class="pc-legend-event"></i>주요 사건</span>':'')+(markers.length?'<span><i class="pc-legend-drop"></i>인구 집계 급감</span>':'')+'</div>';
  }
  function renderYear(){
    const p=point(),metric=$('#metric').value;$('#point-year').value=$('#year-range').value;$('#year-label').textContent=yr(p.year);$('#year-range-label').textContent=`${data.points[0].year} — ${data.points.at(-1).year}`;
    const rows=[...p.nations].sort((a,b)=>(b[metric]??-1)-(a[metric]??-1)),max=Math.max(1,...rows.map(c=>c[metric]||0));
    $('#ranking-chart').innerHTML=rows.length?`<p class="eyebrow">${names[metric]} · 상위 10개국</p><div class="pc-bars">${rows.slice(0,10).map((c,i)=>`<div class="pc-bar"><button data-country="${esc(c.id)}">${esc(c.name)}</button><i><em style="width:${(c[metric]??0)/max*100}%;background:${colors[i%6]}"></em></i><b>${val(c[metric],metric)}</b></div>`).join('')}</div>`:'<p class="pc-empty">이 연도에 연결된 국가가 없습니다.</p>';
    const table=[...p.nations].sort((a,b)=>a[sort]==null?(b[sort]==null?0:1):b[sort]==null?-1:(sort==='name'?a.name.localeCompare(b.name):a[sort]-b[sort])*(descending?-1:1));
    $('#ranking tbody').innerHTML=table.map(c=>`<tr><td><button data-country="${esc(c.id)}">${esc(c.name)}</button></td>${['power','military','production','population',...countKeys].map(k=>`<td>${val(c[k],k)}</td>`).join('')}<td>${esc(c.coverage)}</td></tr>`).join('');
    document.querySelectorAll('[data-sort]').forEach(b=>b.parentElement.setAttribute('aria-sort',b.dataset.sort===sort?(descending?'descending':'ascending'):'none'));
    if($('#coverage-rows'))$('#coverage-rows').innerHTML=(p.regionAudit||[]).filter(r=>r.status!=='available'||!r.countryId).map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.countryName||'귀속 미확인')}</td><td>${esc(r.reason)}</td><td>${fmt(r.population)}</td></tr>`).join('')||'<tr><td colspan="4">누락 지역 없음 (현재 로드된 영역 기준)</td></tr>';
  }
  function renderCompare(){const list=countries(),metric=$('#metric').value;$('#country-picks').innerHTML=list.map((c,i)=>`<label><input type="checkbox" value="${esc(c.id)}" ${picked.has(c.id)?'checked':''}><i style="background:${colors[i%6]}"></i>${esc(c.name)}</label>`).join('');$('#comparison-chart').innerHTML=chart(list.filter(c=>picked.has(c.id)).map(c=>({name:c.name,color:colors[list.findIndex(x=>x.id===c.id)%6],values:data.points.map(p=>p.nations.find(n=>n.id===c.id)?.[metric]??null)})),metric,'국가 간 '+names[metric]+' 추이');}
  function renderDetail(){
    const countryName = countries().find(c => c.id === selected)?.name || '선택 국가';
    if($('#profile-editor').dataset.country!==countryName)fillProfileEditor(countryName);
    profile.querySelector('h2').textContent = countryName + ' 국력 변화';
    if (countryView) {
      $('.pc-intro h1').textContent = countryName + ' 국력 상세';
      document.title = countryName + ' 국력 상세 · 고려만리지도';
    }
    const list=data.points.map(p=>p.nations.find(c=>c.id===selected)||null),current=list[Number($('#year-range').value)]||null;
    const profileData=window.PowerReferenceData?.lookup(countryName,point().year);
    const profileItems=items=>items.map(item=>`<div class="pc-reference-item"><span class="pc-reference-icon" aria-hidden="true">${esc(item.icon||'•')}</span><div><b>${esc(item.name)}</b><small>${esc([item.branch,item.status].filter(Boolean).join(' · '))}</small>${item.source?`<a href="${esc(item.source)}" target="_blank" rel="noopener noreferrer">근거 ↗</a>`:''}</div></div>`).join('');
    const periodEvents=(window.PowerReferenceData?.eventsFor(countryName,data.points[0].year,data.points.at(-1).year)||[]).sort((a,b)=>a.from-b.from||a.to-b.to);
    $('#power-reference-summary').innerHTML=`${current?.economicReference?`<p>생산력 경제 기준: ${current.economicReference.observedYear}년 ${esc(current.economicReference.metric)} ${current.economicReference.valueTrillionKrw.toLocaleString('ko-KR')}조 원. 남북 비교 보정이며 다른 국가의 모델 생산력과 완전 동등한 비교는 아닙니다. <a href="${esc(current.economicReference.source)}" target="_blank" rel="noopener noreferrer">원자료 ↗</a></p>`:''}<h3>시대별 주요 사건 <small>인구 효과를 등록한 사건만 수치에 반영</small></h3><ol class="pc-event-list">${periodEvents.map(event=>`<li><b>${event.from===event.to?yr(event.from):`${yr(event.from)}–${yr(event.to)}`}</b><span>${esc(event.name)}</span>${event.source?`<a href="${esc(event.source)}" target="_blank" rel="noopener noreferrer">출처 ↗</a>`:''}</li>`).join('')||'<li class="pc-event-empty">이 기간에 등록된 사건이 없습니다. 관리자 수정에서 추가할 수 있습니다.</li>'}</ol>${profileData?`<h3>주력 무기·전력 <small>점수 미반영</small></h3><div class="pc-reference-grid">${profileItems(profileData.weapons)||'<span>등록 없음</span>'}</div><h3>주요 생산품 <small>점수 미반영</small></h3><div class="pc-reference-grid">${profileItems(profileData.products)||'<span>등록 없음</span>'}</div>`:''}`;
    const effectEvents=periodEvents.filter(event=>Number.isFinite(event.percent));
    if(effectEvents.length)$('#power-reference-summary').insertAdjacentHTML('beforeend',`<p>인구 보정 등록: ${effectEvents.map(event=>`${esc(event.name)} ${event.percent>0?'+':''}${event.percent}% · ${event.territory_ids?.length?event.territory_ids.length+'개 영토':'국가 전체'} · ${yr(event.effect_from)}–${yr(event.effect_to)}`).join(' / ')}. 수동 보정이 있는 영토는 수동값이 우선합니다.</p>`);
    $('#settlement-summary').textContent=`${yr(point().year)} 등록 마커: 성 ${fmt(current?.castleCount)} · 도시·수도 ${fmt(current?.cityCount)} · 전체 거점 ${fmt(current?.settlementCount)}. 전체는 중복을 제거한 수이며, 사서 기록 수가 아닙니다.`;
    $('#country-summary').innerHTML=['power','military','production','population'].map(k=>{const a=list[0]?.[k]??null,b=list.at(-1)?.[k]??null,delta=a===null||b===null?'양 끝 연도 자료 없음':`${b-a>=0?'+':''}${k==='population'?fmt(b-a)+'명':(b-a).toFixed(1)+'점'}`;return `<div><small>${names[k]} · ${yr(point().year)}</small><strong>${val(current?.[k]??null,k)}</strong>${k==='military'?`<p>추정 가용 인원 ${people(current?.manpower)} · 실제 병력 아님</p>`:''}<p>기간 처음 → 끝 ${delta}</p></div>`;}).join('');
    $('#detail-chart').innerHTML=chart(['power','military','production'].map((k,i)=>({name:names[k],color:[colors[0],colors[3],colors[1]][i],values:list.map(c=>c?.[k]??null)})),'power','선택 국가의 국력 군사력 생산력 변화',[],periodEvents);
    const drops=window.PopulationChange.analyze(data.points,selected,(from,to)=>window.PowerReferenceData?.eventsFor(countryName,from,to)||[]);
    const dropItems=[...drops].sort((a,b)=>b.fraction-a.fraction).slice(0,8);
    const populationSeries=[{name:'추정 인구 · 보정 후',color:colors[2],values:list.map(c=>c?.population??null)}];
    if(list.some(c=>c?.basePopulation!=null&&c.basePopulation!==c.population))populationSeries.unshift({name:'기준 인구 · 보정 전',color:'#9aabb8',dash:true,values:list.map(c=>c?.basePopulation??null)});
    $('#population-chart').innerHTML=chart(populationSeries,'population','선택 국가의 인구 변화',drops,periodEvents)+`<div class="pc-drop-list"><h3>인구 집계 급변 구간 <small>18% 이상 감소</small></h3><p class="pc-drop-explain">숫자는 해당 연도에 이 국가로 연결된 영토의 합계입니다. 영토 귀속이 바뀌면 실제 주민 수가 그대로여도 그래프가 급변할 수 있습니다.</p>${dropItems.map(d=>`<article><b>${yr(d.fromYear)} → ${yr(d.year)} · −${(d.fraction*100).toFixed(1)}%</b><span>${fmt(d.previous)} → ${fmt(d.current)}명</span><p>${esc(d.reason)}</p><p>같은 시기 사건: ${d.events.length?d.events.map(e=>`${esc(e.name)}${e.source?` <a href="${esc(e.source)}" target="_blank" rel="noopener noreferrer">출처 ↗</a>`:''}`).join(' · '):'등록된 사건 없음'}${d.events.length?' <em>사건과 집계 변화의 인과관계는 별도 검증이 필요합니다.</em>':''}</p></article>`).join('')||'<p>선택 기간에 기준을 넘는 급변 구간이 없습니다.</p>'}</div>`;
    $('#detail-table tbody').innerHTML=data.points.map((p,i)=>`<tr><td>${yr(p.year)}</td>${['power','military','production','population','manpower',...countKeys].map(k=>`<td>${val(list[i]?.[k]??null,k)}</td>`).join('')}<td>${esc(list[i]?.coverage??'—')}</td></tr>`).join('');
  }
  function render(){renderYear();renderCompare();renderDetail();}
  $('#profile-editor').addEventListener('click',event=>{
    const add=event.target.closest('[data-add]');if(add){const list=document.querySelector(`[data-list="${add.dataset.add}"]`);list.insertAdjacentHTML('beforeend',editorRow(add.dataset.add));renderTerritoryPickers();list.lastElementChild.querySelector('[data-field="name"]').focus();return;}
    const confirmed=event.target.closest('[data-remove-confirm]');if(confirmed){confirmed.closest('[data-editor-row]').remove();$('#profile-editor-status').textContent='항목을 목록에서 제거했습니다. 변경사항 저장을 눌러 반영하세요.';return;}
    const cancelled=event.target.closest('[data-remove-cancel]');if(cancelled){const controls=cancelled.closest('.pc-editor-row-controls');controls.querySelector('[data-remove]').hidden=false;controls.querySelector('.pc-delete-confirm').hidden=true;return;}
    const remove=event.target.closest('[data-remove]');if(remove){const controls=remove.closest('.pc-editor-row-controls');remove.hidden=true;controls.querySelector('.pc-delete-confirm').hidden=false;controls.querySelector('[data-remove-cancel]').focus();}
  });
  $('#profile-editor').addEventListener('input',event=>{if(event.target.matches('[data-territory-search]')){renderTerritoryPickers();if(!regionOptions.length)ensureRegionOptions();}});
  $('#profile-editor').addEventListener('change',event=>{
    if(!event.target.matches('[data-territory-id]'))return;
    const picker=event.target.closest('[data-territory-picker]'),ids=new Set((picker.dataset.ids||'').split(',').filter(Boolean));
    if(event.target.checked)ids.add(event.target.dataset.territoryId);else ids.delete(event.target.dataset.territoryId);
    picker.dataset.ids=[...ids].join(',');renderTerritoryPickers();
  });
  $('#profile-edit-cancel').addEventListener('click',()=>{fillProfileEditor($('#profile-editor').dataset.country);$('#profile-editor').open=false;});
  $('#profile-editor-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!isAdmin)return;const form=event.currentTarget,output=$('#profile-editor-status'),name=$('#profile-editor').dataset.country;
    const token=localStorage.getItem('token')||sessionStorage.getItem('token')||'';
    if(!token){output.textContent='관리자 로그인이 필요합니다.';return;}
    try{
      const record={from:form.elements.from.value,to:form.elements.to.value,weapons:collectEditorRows('weapons'),products:collectEditorRows('products'),events:collectEditorRows('events')};
      output.textContent='저장 중…';await window.PowerReferenceData.save(name,record,token);output.textContent='저장했습니다. 지도 인구와 국력 집계를 새로 계산합니다.';host?.postMessage({type:'power-profile-updated'},location.origin);renderDetail();
    }catch(error){output.textContent=error.message;}
  });
  $('#period-form').addEventListener('submit',e=>{e.preventDefault();request();});$('#year-range').addEventListener('input',()=>{renderYear();renderDetail();});$('#point-year').addEventListener('change',e=>{$('#year-range').value=e.target.value;renderYear();renderDetail();});$('#metric').addEventListener('change',()=>{renderYear();renderCompare();});$('#detail-country').addEventListener('change',e=>{selected=e.target.value;renderDetail();});
  $('#country-picks').addEventListener('change',e=>{if(e.target.type!=='checkbox')return;if(e.target.checked){if(picked.size>=6){e.target.checked=false;status('비교 곡선은 최대 6개국까지 선택할 수 있습니다.');return;}picked.add(e.target.value);}else picked.delete(e.target.value);renderCompare();});
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.sort){descending=sort===b.dataset.sort?!descending:true;sort=b.dataset.sort;renderYear();}if(b.dataset.country){selected=b.dataset.country;$('#detail-country').value=selected;renderDetail();$('#country-summary').scrollIntoView({behavior:'smooth',block:'center'});}});
  $('#export').addEventListener('click',()=>{if(!isAdmin||!data)return;const rows=[['연도','국가','총 국력(기간 공통)','군사력','생산력','인구','동원 잠재 인원','성','도시·수도','전체 거점','인구 연결 지역','데이터 구분']];data.points.forEach(p=>p.nations.forEach(c=>rows.push([p.year,c.name,c.power,c.military,c.production,c.population,c.manpower,c.castleCount,c.cityCount,c.settlementCount,c.coverage,data.demo?'가상 시연':'지도 자료 추정'])));const quote=v=>'"'+String(v??'').replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')+'"';const blob=new Blob(['\ufeff'+rows.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='national-power-comparison.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  await window.PowerReferenceData?.load().catch(()=>{});
  await request();
})();
