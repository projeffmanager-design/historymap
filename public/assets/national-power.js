(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = v => v === null || v === undefined ? '자료 없음' : new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(v);
  const score = v => v === null || v === undefined ? '—' : v.toFixed(1);
  const state = { open: false, tab: 'nation', selected: '', region: '', sort: 'power', descending: true, rate: 0.03, includeUndated: true, data: null, resources: null, loading: false, error: '', generation: 0, auditFilter: 'missing', auditMap: false };
  let panel, timer, syncTimer, lastFingerprint = '';
  const boundMaps = new WeakSet();
  let comparisonWindow, comparisonFrame, comparisonClose, comparisonJob = 0;
  let auditLayer;
  let territoryBase = null;
  let markerBase = null;
  let baseDataPromise = null;
  let populationResources = null;
  let populationBasePromise = null;
  let referenceLoadPromise = null;
  const trendCache = new Map(), trendPending = new Set();
  function ensurePowerReferences(force=false){
    if(!window.PowerReferenceData)return Promise.resolve();
    if(force||!referenceLoadPromise)referenceLoadPromise=window.PowerReferenceData.load().catch(error=>{referenceLoadPromise=null;throw error;});
    return referenceLoadPromise;
  }
  const populationLabelPoints = new Map();
  const statisticFields=['population_series','population_source','modern_population','population_scale','population_overrides','population_revision','production_series','productivity_coefficient','training_coefficient','logistics_coefficient','defense_coefficient'];
  function regionGeoJSON(missingOnly=false) {
    return {type:'FeatureCollection',features:(state.data?.regions||[]).filter(r=>!missingOnly||r.populationStatus!=='available'||r.ownershipStatus==='unassigned').map(r=>({type:'Feature',id:r.id,geometry:r.geometry,properties:{region_id:r.id,name:r.name,year:state.data.year,country_id:r.countryId||null,population:r.population,population_status:r.populationStatus,population_reason:r.populationReason,population_origin:r.populationOrigin,castle_count:r.castleCount,city_count:r.cityCount,settlement_count:r.settlementCount,production_quantities:r.productionQuantities,ownership_status:r.ownershipStatus,color:r.ownershipStatus==='unassigned'?'#939aa5':r.populationStatus==='partial'||r.populationStatus==='conflict'?'#efa644':'#e46b6b'}}))};
  }
  function updateAuditMap() {
    const leaflet=readMap(),globe=window.mlMap3d,visible=state.open&&state.auditMap&&!!state.data;
    if(auditLayer){auditLayer.remove();auditLayer=null;}
    if(globe?.getLayer?.('np-audit-fill'))globe.removeLayer('np-audit-fill');
    if(globe?.getLayer?.('np-audit-line'))globe.removeLayer('np-audit-line');
    if(globe?.getSource?.('np-audit'))globe.removeSource('np-audit');
    if(!visible)return;
    const geojson=regionGeoJSON(true);
    if(leaflet&&window.L?.geoJSON){auditLayer=L.geoJSON(geojson,{style:f=>({color:f.properties.color,weight:2,dashArray:'5 4',fillColor:f.properties.color,fillOpacity:.18}),onEachFeature:(f,l)=>{l.bindTooltip(`${esc(f.properties.name)} · ${esc(f.properties.population_reason)}`);l.on('click',()=>focusRegion(f.id));}}).addTo(leaflet);}
    if(globe?.isStyleLoaded?.()){
      globe.addSource('np-audit',{type:'geojson',data:geojson});
      globe.addLayer({id:'np-audit-fill',type:'fill',source:'np-audit',paint:{'fill-color':['get','color'],'fill-opacity':.22}});
      globe.addLayer({id:'np-audit-line',type:'line',source:'np-audit',paint:{'line-color':['get','color'],'line-width':2,'line-dasharray':[3,2]}});
    }
  }
  function focusRegion(id) {
    const r=state.data?.regions.find(r=>r.id===id);if(!r)return;
    const [west,south,east,north]=r.bbox;
    if([west,south,east,north].every(Number.isFinite)){
      if(window._is3dMode&&window.mlMap3d)window.mlMap3d.fitBounds([[west,south],[east,north]],{padding:75,maxZoom:8});
      else readMap()?.fitBounds?.([[south,west],[north,east]],{padding:[50,50],maxZoom:8});
    }
    state.selected=r.countryId;state.region=r.id;state.tab='region';render();
  }
  function exportRegions() {
    const blob=new Blob([JSON.stringify(regionGeoJSON(),null,2)],{type:'application/geo+json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`population-regions-${time().year}.geojson`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function time() { return { year: Number($('#yearInput')?.value ?? 1100), month: Number($('#monthInput')?.value ?? 1) }; }
  function fingerprint() { return `${time().year}:${time().month}:${typeof countries !== 'undefined' ? countries.length : 0}:${typeof territories !== 'undefined' ? territories.length : 0}:${typeof castles !== 'undefined' ? castles.length : 0}`; }
  function readMap() { return typeof map !== 'undefined' ? map : window.map; }
  function rendered3dTerritories() {
    const found=new Map(),data=window._3dTerritoryData;
    if(!window._is3dMode||!data)return found;
    const anchors=Array.isArray(window._3dPopulationAnchors)?window._3dPopulationAnchors:[];
    const masks=Array.isArray(window._3dPopulationVisibleMasks)?window._3dPopulationVisibleMasks:[];
    for(const anchor of anchors){
      const rawId=anchor?.territory_id||anchor?._id||anchor?.id||'',regionId=String(rawId?.$oid||rawId);
      if(!regionId||!['Polygon','MultiPolygon'].includes(anchor?.geometry?.type))continue;
      const point=NationalPowerModel.representativePoint(anchor.geometry),owner=String(anchor?.country_id||'');
      // The hierarchy worker can take several seconds on complex historical
      // boundaries.  While it is pending, the anchors are the exact polygons
      // already painted on screen and are safe population-label locations.
      // Once final masks arrive, reject anchors that were clipped away.
      if(!point||(masks.length&&!masks.some(mask=>String(mask?.country_id||'')===owner&&NationalPowerModel.contains(mask.geometry,point))))continue;
      const box=NationalPowerModel.bounds(anchor.geometry),area=(box[2]-box[0])*(box[3]-box[1]);
      if(!found.has(regionId)||area>found.get(regionId).area)found.set(regionId,{geometry:anchor.geometry,area});
    }
    if(anchors.length)return found;
    for(const feature of [...(data.country||[]),...(data.province||[]),...(data.city||[])]){
      const rawId=feature?.properties?.territory_id||feature?.properties?._id||feature?.properties?.id||'';
      const regionId=String(rawId?.$oid||rawId);
      if(!regionId||!['Polygon','MultiPolygon'].includes(feature?.geometry?.type))continue;
      const box=NationalPowerModel.bounds(feature.geometry),area=(box[2]-box[0])*(box[3]-box[1]);
      if(!found.has(regionId)||area>found.get(regionId).area)found.set(regionId,{geometry:feature.geometry,area});
    }
    return found;
  }
  async function ensureBaseData() {
    if(window.nationalPowerPreview)return;
    if(state.resources&&territoryBase&&markerBase)return;
    if(baseDataPromise)return baseDataPromise;
    const readArray=async(url,label)=>{
      const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw new Error(`${label} 조회 실패 (${response.status}). 서버가 최신 버전인지 확인하세요.`);
      const data=await response.json();if(!Array.isArray(data))throw new Error(label+' 응답 형식을 확인해 주세요.');
      return data;
    };
    baseDataPromise=Promise.all([
      state.resources||readArray('/api/resources?type=population,iron,horse,salt,silk,gold','자원'),
      territoryBase||readArray('/api/power-regions','전체 영토'),
      markerBase||readArray('/api/power-markers','전체 성·도시')
    ]).then(([resourceData,territoryData,markerData])=>{
      state.resources=resourceData;territoryBase=territoryData;markerBase=markerData;
    }).finally(()=>{baseDataPromise=null;});
    return baseDataPromise;
  }
  async function ensurePopulationBaseData() {
    if(window.nationalPowerPreview)return;
    if(populationResources&&territoryBase)return;
    if(populationBasePromise)return populationBasePromise;
    const readArray=async(url,label)=>{
      const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw new Error(`${label} 조회 실패 (${response.status}). 서버가 최신 버전인지 확인하세요.`);
      const data=await response.json();if(!Array.isArray(data))throw new Error(label+' 응답 형식을 확인해 주세요.');
      return data;
    };
    // The map population overlay does not need every castle or non-population
    // resource.  Avoid the large marker request on its first toggle.
    populationBasePromise=Promise.all([
      populationResources||readArray('/api/resources?type=population','인구'),
      territoryBase||readArray('/api/power-regions','전체 영토')
    ]).then(([resourceData,territoryData])=>{
      populationResources=resourceData;territoryBase=territoryData;
    }).finally(()=>{populationBasePromise=null;});
    return populationBasePromise;
  }
  function snapshot(year = time().year, month = time().month) {
    if (window.nationalPowerPreview) return window.nationalPowerPreview(year);
    const list = typeof countries !== 'undefined' ? countries : [];
    const liveTerritories = typeof territories !== 'undefined' ? territories : [];
    const merged = new Map((territoryBase||[]).map(t=>[String(t._id?.$oid||t._id),t]));
    for(const t of liveTerritories){
      const key=String(t._id?.$oid||t._id),base=merged.get(key),combined={...t,...base};
      const liveGeometry=t.geojson?.geometry||t.geometry||(t.type&&t.coordinates?{type:t.type,coordinates:t.coordinates}:null);
      if(['Polygon','MultiPolygon'].includes(liveGeometry?.type))combined.display_geometry=liveGeometry;
      // Never replace the canonical boundary with a clipped viewport tile.
      if(base){combined.geometry=base.geometry||base.geojson?.geometry||{type:base.type,coordinates:base.coordinates};delete combined.geojson;}
      merged.set(key,combined);
    }
    const territoryList=[...merged.values()];
    const markerMap=new Map((markerBase||[]).map(c=>[String(c._id?.$oid||c._id),c]));
    for(const c of typeof castles!=='undefined'?castles:[])markerMap.set(String(c._id?.$oid||c._id),c);
    const markerList=[...markerMap.values()];
    const regions = [];
    const otherTime = year !== time().year || month !== time().month;
    const previousActive = window._activeCastlesForTerritory;
    // The map's precomputed active markers belong to its displayed date only.
    {
      window._activeCastlesForTerritory = typeof getActiveHistoryInfo==='function' ? markerList.flatMap(c=>{
        if(typeof c.lat!=='number'||typeof c.lng!=='number'||c.is_natural_feature||c.is_label||c.is_military_flag)return [];
        const active=getActiveHistoryInfo(c.history,year*12+month-1);
        if(!active)return [];
        const raw=active?.record?.country_id||c.country_id;
        if(!raw)return [];
        const politicalCountry=list.find(country=>String(country._id?.$oid||country._id)===String(raw.$oid||raw));
        if(typeof getEffectiveCountryInfo==='function'&&getEffectiveCountryInfo(politicalCountry,year,month)?.territory_enabled===false)return [];
        return [{lat:c.lat,lng:c.lng,countryId:String(raw.$oid||raw),isCapital:!!(active?.record?.is_capital||c.is_capital)}];
      }) : null;
    }
    try { for (const t of territoryList) {
      const owner = otherTime && typeof calculateDominantCountry === 'function' ? calculateDominantCountry(t, year, month)?.countryId : typeof getCachedDominantCountry === 'function' ? getCachedDominantCountry(t, year, month)?.countryId : null;
      const geometry = t.geojson?.geometry || t.geometry || (t.type && t.coordinates ? { type: t.type, coordinates: t.coordinates } : null);
      if (['Polygon', 'MultiPolygon'].includes(geometry?.type)) regions.push({ id: String(t._id?.$oid || t._id || t.name), name: t.name || '이름 없는 지역', countryId: owner ? String(owner.$oid||owner) : '', geometry, displayGeometry:t.display_geometry||geometry, ...Object.fromEntries(statisticFields.map(field=>[field,t[field]??t.properties?.[field]])) });
    }} finally { window._activeCastlesForTerritory = previousActive; }
    return { populationEffects:window.PowerReferenceData?.populationEffects()||[], countries: list.map(c => {
      const current = typeof getEffectiveCountryInfo === 'function' ? getEffectiveCountryInfo(c, year, month) || c : c;
      return { id: String(c._id?.$oid||c._id), name: current.name || c.name, color: current.color || c.color };
    }), regions, markers: markerList };
  }
  async function load() {
    const generation = ++state.generation;
    state.loading = true; state.error = ''; render();
    try {
      if (!window.nationalPowerPreview) {
        await Promise.all([ensureBaseData(),ensurePowerReferences()]);
        if(generation!==state.generation)return;
      }
      if (generation !== state.generation) return;
      const input = snapshot();
      state.data = NationalPowerModel.build({ ...input, resources: input.resources || state.resources || [], ...time(), rate: state.rate, includeUndated: state.includeUndated });
      window.dispatchEvent(new CustomEvent('national-power-data',{detail:state.data}));
      lastFingerprint = fingerprint();
      const retainedRegion=state.tab==='region'&&state.data.regions.find(r=>r.id===state.region);
      if(retainedRegion)state.selected=retainedRegion.countryId;
      else if (!state.data.nations.some(c => c.id === state.selected)) state.selected = state.data.nations[0]?.id || '';
      if (!state.data.regions.some(r => r.id === state.region && r.countryId === state.selected)) state.region = '';
    } catch (error) { if (generation === state.generation) { state.error = error.message; state.data = null; } }
    finally { if (generation === state.generation) { state.loading = false; render(); decorate(); updateAuditMap(); } }
  }
  function gauge(value, extra = '') { return `<span class="np-gauge ${extra}" role="meter" aria-label="상대 지수" aria-valuemin="0" aria-valuemax="100" ${value == null ? 'aria-valuetext="자료 없음"' : `aria-valuenow="${value.toFixed(1)}"`}><i style="width:${value ?? 0}%"></i></span>`; }
  function tabs() { return `<nav class="np-tabs" aria-label="국력 보기">${[['nation', '국가'], ['region', '지역'], ['compare', '국가 비교'], ['audit','자료 누락']].map(([key, name]) => `<button data-tab="${key}" aria-pressed="${state.tab === key}" class="${state.tab === key ? 'selected' : ''}">${name}</button>`).join('')}<button data-action="analysis">비교·추이 ↗</button></nav>`; }
  function auditView() {
    const data=state.data;
    const rows=data.regions.filter(r=>state.auditFilter==='all' ? true : state.auditFilter==='unowned' ? r.ownershipStatus==='unassigned' : r.populationStatus!=='available');
    return `<div class="np-section-title">폴리곤별 인구 연결 <span>현재 로드된 ${data.regions.length}개 영역</span></div><p class="np-audit-summary">인구 누락·부분 ${data.stats.regionsMissing}개 · 국가 귀속 미확인 ${data.stats.regionsUnowned}개</p><div class="np-audit-tools"><select id="np-audit-filter" aria-label="인구 누락 필터">${[['missing','인구 누락·부분'],['unowned','국가 귀속 미확인'],['all','전체 지역']].map(([v,l])=>`<option value="${v}" ${v===state.auditFilter?'selected':''}>${l}</option>`).join('')}</select><button data-action="geojson">인구 GeoJSON ↓</button></div><label class="np-audit-map"><input type="checkbox" id="np-audit-map" ${state.auditMap?'checked':''}> 지도에 누락 지역 표시 <small>빨강: 인구 누락 · 주황: 부분/충돌 · 회색: 국가 미확인</small></label><div class="np-region-list np-audit-list">${rows.map(r=>`<button data-audit-region="${esc(r.id)}"><span>${esc(r.name)}<small>${esc(data.nations.find(c=>c.id===r.countryId)?.name||'국가 귀속 미확인')}</small></span><span class="np-audit-reason">${esc(r.populationReason)}</span><b>${fmt(r.population)}</b></button>`).join('')||'<p>이 필터에 해당하는 지역이 없습니다.</p>'}</div><details class="np-evidence"><summary>연결 실패·제외 원자료 ${data.issues.length}건</summary>${data.issues.map(i=>`<article><b>${esc(i.name)}</b><p>${esc(i.reason)}${i.regionId?' · 지역 ID '+esc(i.regionId):''}</p></article>`).join('')}</details>`;
  }
  function stat(name, value, label, index, tone) { return `<div class="np-stat ${tone}"><small>${name}</small><strong>${value}</strong><span>${label}</span>${gauge(index)}</div>`; }
  function regionEditor(row) {
    return `<details class="np-evidence"><summary>영토 인구 수동 보정 · 관리자</summary><p>원자료는 보존됩니다. 기간이 겹치면 마지막 보정을 적용합니다. 국가 귀속과 무관하게 이 영토에만 저장됩니다.</p><form class="np-population-form" data-region="${esc(row.id)}" data-revision="${row.population_revision||0}"><label>시작 연도<input name="start_year" type="number" min="-5000" max="2100" value="${time().year}" required></label><label>종료 연도<input name="end_year" type="number" min="-5000" max="2100" value="${time().year}" required></label><label>방식<select name="mode"><option value="value">인구 직접 지정</option><option value="multiplier">자동 추정값에 배율 적용</option><option value="reset">자동 추정값으로 복원</option></select></label><label>인구 또는 배율<input name="amount" type="number" min="0" step="any" placeholder="예: 50000 또는 0.8"></label><label class="np-full">보정 사유<input name="reason" maxlength="1000" required placeholder="출처 또는 조정 근거"></label><button type="submit" ${window.nationalPowerPreview?'disabled':''}>관리자 보정 저장</button><output role="status">${window.nationalPowerPreview?'시연 화면에서는 DB 저장하지 않습니다.':'관리자 로그인이 필요합니다.'}</output></form><p>기존 보정 ${row.population_overrides?.length||0}건 · 버전 ${row.population_revision||0}</p>${(row.population_overrides||[]).slice(-5).map(o=>`<p>${o.start_year}~${o.end_year}년 · ${esc(o.mode)} · ${esc(o.reason)}</p>`).join('')}</details>`;
  }
  async function savePopulation(form) {
    const output=form.querySelector('output'),button=form.querySelector('button');
    const values=new FormData(form),mode=values.get('mode');
    const payload={mode,start_year:Number(values.get('start_year')),end_year:Number(values.get('end_year')),revision:Number(form.dataset.revision),reason:values.get('reason')};
    if(mode!=='reset'){
      if(values.get('amount')===''){output.textContent='인구 또는 배율을 입력하세요.';return;}
      payload[mode==='value'?'value':'multiplier']=Number(values.get('amount'));
    }
    button.disabled=true;output.textContent='저장 중…';
    try{
      const token=localStorage.getItem('token')||sessionStorage.getItem('token')||'';
      const response=await fetch(`/api/territories/${encodeURIComponent(form.dataset.region)}/population`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload)});
      const result=await response.json();if(!response.ok)throw new Error(result.message||'저장 실패');
      territoryBase=null;populationLabelPoints.clear();trendCache.clear();await load();
      const message=panel.querySelector('.np-population-form output');if(message)message.textContent='저장했습니다. 영토·국가 합계를 다시 계산했습니다.';
    }catch(error){output.textContent=error.message;button.disabled=false;}
  }
  function details(row, country) {
    if (!row) return '<div class="np-empty">이 국가에 연결된 지역이 없습니다.</div>';
    const modernMilitary=state.tab==='nation'?window.ModernMilitaryReference?.lookup(country.name,time().year):null;
    const descriptive=state.tab==='nation'?window.PowerReferenceData?.lookup(country.name,time().year):null;
    const referenceItems=items=>items.map(item=>`<article class="np-reference-item"><b><span aria-hidden="true">${esc(item.icon||'•')}</span> ${esc(item.name)}</b><span>${esc([item.branch,item.status].filter(Boolean).join(' · '))}</span>${item.source?`<p><a href="${esc(item.source)}" target="_blank" rel="noopener noreferrer">자료 확인 ↗</a></p>`:''}</article>`).join('');
    return `<div class="np-identity"><span class="np-crest">${esc(country.name.slice(0, 1))}</span><div><small>${state.tab === 'region' ? esc(country.name) + ' · 지역 보고서' : 'NATIONAL POWER · 국가 보고서'}</small><h2>${esc(row.name)}</h2><span class="np-status">모델 추정 · ${window.nationalPowerPreview ? '시연 데이터' : '기존 지도 데이터'}</span></div>${country.rank ? `<span class="np-rank">#${country.rank}<small>국가 순위</small></span>` : ''}</div>
      <div class="np-total"><div><span>총 국력</span><strong>${score(row.power)}<small> / 100</small></strong></div>${gauge(row.power)}<p>${state.tab === 'region' ? '전체 연결 지역' : '현재 자료가 연결된 국가'} 내 상대지수 · 역사적 확정값 아님</p></div>
      ${modernMilitary?`<div class="np-count-note">2026 현대 군사력 참고: Global Firepower ${modernMilitary.rank}위 · PwrIndx ${modernMilitary.index.toFixed(4)} (낮을수록 강함). 위의 모델 군사력·인구·총 국력과 별개이며 <a href="${window.ModernMilitaryReference.source}" target="_blank" rel="noopener noreferrer">원자료</a>에서 확인할 수 있습니다.</div>`:''}
      ${row.economicReference?`<div class="np-count-note">생산력 경제 보정: 한국은행·통계청 ${row.economicReference.observedYear}년 ${esc(row.economicReference.metric)} ${row.economicReference.valueTrillionKrw.toLocaleString('ko-KR')}조 원 기준. ${time().year!==row.economicReference.observedYear?'현재 선택 연도 자료가 없어 최신 관측치를 준용합니다. ':''}남북 비교용 보정이며 다른 나라의 인구 기반 잠재력과 완전한 동등 비교는 아닙니다. <a href="${esc(row.economicReference.source)}" target="_blank" rel="noopener noreferrer">원자료 ↗</a></div>`:''}
      <div class="np-stats">${stat('⚔ 군사력', score(row.military), '동원·훈련·보급 잠재력 지수', row.military, 'military')}${stat('◈ 생산력', score(row.production), '인구·생산성·거점 잠재력 지수', row.production, 'production')}${stat('♟ 추정 인구', fmt(row.population), '연결된 인구 자료 합계 · 명', row.populationScore, 'population')}</div>
      ${state.tab==='nation'?`<section class="np-trend" aria-label="${esc(country.name)} 국력 변화"><div class="np-trend-heading"><strong>국력 변화</strong><button type="button" data-action="country-analysis">전체 분석 ↗</button></div><div id="np-trend-content">${trendMarkup(country)}</div></section>`:''}
      <details class="np-evidence"><summary>국력 계산 상세 · 잠재력 모델</summary><p>생산 잠재량 ${fmt(row.productionPotential)} 인구환산 단위 = 기본 ${fmt(row.baseProduction)} + 거점 보너스 ${fmt(row.siteBonus)} (기본의 최대 20%).</p><p>군사 잠재량 ${fmt(row.militaryPotential)} 동원환산 단위 = 동원 후보 × 훈련·보급 계수 + 핵심 전력 ${fmt(row.coreBonus)} + 방어 ${fmt(row.defenseBonus)}. 식량·장비 상한 자료가 없어 실제 병력은 아닙니다.</p>${row.modelCoefficients?`<p>지역 계수: 1인당 생산성 ${row.modelCoefficients.productivity} · 훈련 ${row.modelCoefficients.training} · 보급 ${row.modelCoefficients.logistics} · 방어 ${row.modelCoefficients.defense}. 미입력 계수는 모델 기본값을 사용합니다.</p>`:''}<p>종합 점수 = 생산력 45% + 군사력 35% + 거점 10% + 자원 입지 10%. 일반 모델은 로그 정규화하고, 2024–2026년 남북한 생산력은 관측 경제 규모의 제곱근 비율로 보정합니다. 인구를 별도 항목으로 다시 합산하지 않습니다.</p></details>
      ${descriptive?`<details class="np-evidence" open><summary>전력 상세 분석 · 주력 무기 (점수 미반영)</summary><p>기록된 무기·함종의 목록이며 보유 수량이나 전투력 점수가 아닙니다. 검증 대기 항목은 사료와 운용 시기를 확인해야 합니다.</p>${referenceItems(descriptive.weapons)||'<p>등록된 전력 참고 항목이 없습니다.</p>'}</details><details class="np-evidence" open><summary>주요 생산품 (점수 미반영)</summary><p>생산품의 존재와 생산량은 구분합니다. 아래 목록은 생산력 수치에 더하지 않습니다.</p>${referenceItems(descriptive.products)||'<p>등록된 생산품 참고 항목이 없습니다.</p>'}</details>`:''}
      <div class="np-mobilization"><span>동원 잠재 인원 <small>인구 × ${(state.rate * 100).toFixed(0)}%</small></span><strong>${fmt(row.manpower)}${row.manpower === null ? '' : ' 명'}</strong></div>
      <div class="np-section-title">성·도시 마커 <span>선택 연도 · 영토 내 중복 제거</span></div><div class="np-resources"><div><span>성</span><b>${fmt(row.castleCount)}</b></div><div><span>도시·수도</span><b>${fmt(row.cityCount)}</b></div><div><span>기타 거점</span><b>${fmt(row.unclassifiedCount)}</b></div><div><span>전체 거점</span><b>${fmt(row.settlementCount)}</b></div></div><p class="np-count-note">성·도시 중복 유형은 전체에서 1곳으로 계산합니다. 주·군·현 등은 기타 거점이며, 사서 기록 수가 아닌 등록 마커 수입니다.</p>
      <details class="np-evidence"><summary>생산량 · 영토 통계</summary>${Object.entries(row.productionQuantities||{}).map(([key,p])=>`<p>${esc(p.resource||key)}: ${fmt(p.value)} ${esc(p.unit)}${p.coveredRegions!==undefined?' · 연결 '+p.coveredRegions+'/'+row.regions.length+'개 영역':''}</p>`).join('')||'<p>등록된 생산량 시계열이 없습니다. 아래 입지 수와 생산량은 다릅니다.</p>'}</details>
      ${state.tab==='region'?`<p class="np-count-note">인구 산출: ${esc(({polygon_series:'영토 시계열',modern_distribution:'현대 분포 × 시대계수',event_adjusted:'사건 비율 보정',manual_override:'관리자 수동 보정',manual_reset:'관리자 자동 추정 복원',region_id:'지역 ID 연결',spatial_join:'인구 포인트 공간 연결'})[row.populationOrigin]||'기준 자료 미확인')}</p>${row.populationEffect?`<p class="np-count-note">사건 인구 효과: ${esc(row.populationEffect.name)} · ${row.populationEffect.percent>0?'+':''}${row.populationEffect.percent}% · 기준 ${fmt(row.basePopulation)}명 → 최종 ${fmt(row.population)}명${row.populationEffect.skipped?' · 미적용(수동 보정 우선 또는 기준 인구 없음)':''}${row.populationEffect.conflict?' · 중복 효과 점검 필요':''}</p>`:''}${regionEditor(row)}`:''}
      <div class="np-section-title">전략 자원 <span>등록 입지 수 · 생산량 아님</span></div><div class="np-resources">${[['iron', '철'], ['horse', '말'], ['salt', '소금'], ['silk', '비단'], ['gold', '금']].map(([key, label]) => `<div><span>${label}</span><b>${fmt(row[key])}</b></div>`).join('')}</div>
      ${state.tab === 'nation' ? `<div class="np-section-title">지역별 현황 <span>인구 자료 연결 ${esc(country.coverage)}개 지역</span></div><div class="np-region-list">${country.regions.map(r => `<button data-region="${esc(r.id)}"><span>${esc(r.name)}<small>${fmt(r.population)}${r.population === null ? '' : ' 명'}</small></span>${gauge(r.power)}<b>${score(r.power)}</b><span>›</span></button>`).join('')}</div>` : ''}
      <details class="np-evidence"><summary>산출 근거 · 자료 ${row.evidence.length}건</summary><p>사료 검증 전의 잠정 모델입니다. 날짜 없는 자원은 입지 잠재력으로만 반영합니다. 자료가 없는 지역의 인구는 합계에서 제외됩니다.</p>${row.evidence.length ? row.evidence.map(e => `<article><b>${esc(e.name)}</b><span>${e.type === 'population' ? fmt(e.value) + ' 명 · 연도별 모델값' : e.undated ? '시대 미확인 입지' : '기간 등록 입지'}</span><p>${esc(e.source)}</p></article>`).join('') : '<p>연결된 근거 없음</p>'}</details>`;
  }
  function comparison() {
    const items = [...state.data.nations].sort((a, b) => {
      const av = a[state.sort], bv = b[state.sort];
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      return (state.sort === 'name' ? av.localeCompare(bv, 'ko') : av - bv) * (state.descending ? -1 : 1);
    });
    const max = Math.max(1, ...items.map(c => c.power || 0));
    return `<div class="np-section-title">국가별 국력 비교 <span>${items.length}개 정권 · 같은 시점 기준</span></div><div class="np-chart">${[...state.data.nations].filter(c => c.power !== null).slice(0, 6).map(c => `<button data-country="${esc(c.id)}"><span>${esc(c.name)}</span><i><em style="width:${c.power / max * 100}%;background:${c.color}"></em></i><b>${score(c.power)}</b></button>`).join('')}</div><div class="np-table-scroll"><table><caption>열 제목을 누르면 정렬됩니다. 순위는 등록 자료 기준입니다.</caption><thead><tr>${[['name', '국가'], ['power', '총 국력'], ['military', '군사력'], ['production', '생산력'], ['population', '인구']].map(([k, label]) => `<th scope="col" aria-sort="${state.sort === k ? state.descending ? 'descending' : 'ascending' : 'none'}"><button data-sort="${k}">${label}${state.sort === k ? state.descending ? ' ↓' : ' ↑' : ''}</button></th>`).join('')}</tr></thead><tbody>${items.map(c => `<tr class="${c.id === state.selected ? 'selected' : ''}"><th scope="row"><button data-country="${esc(c.id)}"><i style="background:${c.color}"></i>${esc(c.name)}</button></th><td><b>${score(c.power)}</b>${gauge(c.power)}</td><td>${score(c.military)}</td><td>${score(c.production)}</td><td>${fmt(c.population)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function render() {
    if (!panel) return;
    panel.hidden = !state.open;
    document.querySelectorAll('[data-power-toggle]').forEach(b => {
      if(b.matches('input[type="checkbox"]'))b.checked=state.open;
      else { b.setAttribute('aria-pressed', String(state.open)); b.classList.toggle('active', state.open); }
    });
    if (!state.open) return;
    const selectedRegion=state.data?.regions.find(r=>r.id===state.region);
    const country = state.data?.nations.find(c => c.id === state.selected) || (state.tab==='region'&&selectedRegion ? {name:'귀속 미확인',regions:state.data.regions.filter(r=>r.countryId===selectedRegion.countryId)} : null);
    const year = time().year;
    panel.innerHTML = `<header class="np-header"><div><small>고려만리지도 · 전략 정보</small><h1>국력 현황 <span>${year < 0 ? '기원전 ' + -year : year}년</span></h1></div><button data-action="close" aria-label="국력 패널 닫기">×</button></header>${tabs()}<div class="np-body">
      <div class="np-toolbar"><label>국가<select id="np-country" aria-label="국가 선택">${(state.data?.nations || []).map(c => `<option value="${esc(c.id)}" ${c.id === state.selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><button data-action="refresh" aria-label="국력 새로고침" ${state.loading ? 'disabled' : ''}>↻ 새로고침</button></div>
      ${state.loading ? '<div class="np-empty" role="status">시대별 자료를 집계하고 있습니다…</div>' : state.error ? `<div class="np-empty" role="alert">${esc(state.error)}<p>서버 연결을 확인한 뒤 새로고침해 주세요.</p></div>` : state.tab === 'audit' && state.data ? auditView() : !country ? '<div class="np-empty">현재 연도에 연결된 영토 자료가 없습니다.<p>지도 자료가 로드된 후 새로고침하거나 연도를 변경해 주세요.</p></div>' : state.tab === 'compare' ? comparison() : (state.tab === 'region' ? `<label class="np-region-select">지역<select id="np-region" aria-label="지역 선택">${country.regions.map(r => `<option value="${esc(r.id)}" ${r.id === state.region ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>` : '') + details(state.tab === 'region' ? country.regions.find(r => r.id === state.region) || country.regions[0] : country, country)}
      <details class="np-method"><summary>모델 설정 및 데이터 범위</summary><label>동원율 <output>${Math.round(state.rate * 100)}%</output><input id="np-rate" aria-label="동원율" type="range" min="1" max="5" step="1" value="${state.rate * 100}"></label><label><input id="np-undated" type="checkbox" ${state.includeUndated ? 'checked' : ''}> 시대 미확인 자원 입지를 잠재력에 포함</label><p>생산 잠재량 = 인구 × 생산성 계수 + 상한 있는 거점 보너스. 군사 잠재량 = 동원 후보 × 훈련·보급 계수 + 상한 있는 핵심 전력·방어 보너스. 일반 모델은 로그 정규화합니다. 2024–2026년 남북한 국가 생산력에만 관측 경제 규모의 제곱근 비율을 적용합니다. 총 국력 = 생산력 45% + 군사력 35% + 거점 10% + 자원 입지 10%.</p><p>인구는 기준연도 사이를 선형 보간하며 범위 밖은 자료 없음으로 처리합니다. 국가와 지역의 점수는 각각 정규화됩니다. 국가는 연결 지역의 잠재량을 먼저 합산한 뒤 계산합니다.</p><p>현재 로드된 지도 영토 기준이며 전국 완전 통계가 아닙니다. 중첩 점자료는 국가와 무관하게 최소 경계·지역 ID 순으로 한 곳에만 배정합니다. 경계·마커 수정 후에는 새로고침해 주세요.</p>${state.data ? `<p>미배정 ${state.data.stats.unassigned}건 · 중첩 배정 ${state.data.stats.ambiguous}건 · 시대 미확인 입지 ${state.data.stats.undated}건 · 인구 연도 범위 밖 ${state.data.stats.populationMissing}건</p>` : ''}<p>prototype-2 · 가중치·동원율·거점 환산치는 검증 전 가정이며 통계적 신뢰구간은 아직 제공하지 않습니다.</p></details></div><footer class="np-footer"><i></i>${window.nationalPowerPreview ? 'UI 시연용 가상 데이터' : '기존 인구·자원 자료 기반 잠정 모델'} · ${state.data?.nations.length || 0}개 국가</footer>`;
    if(selectedRegion && !state.data?.nations.some(c=>c.id===state.selected)){
      const choice=document.createElement('option');choice.value=state.selected;choice.textContent='국가 귀속 미확인';choice.selected=true;
      panel.querySelector('#np-country')?.prepend(choice);
    }
    if(!state.loading&&!state.error&&state.tab==='nation'&&country)scheduleTrend(country);
  }
  function pickCountry(id) { state.selected = id; state.region = ''; state.tab = 'nation'; render(); decorate(); }
  function openCountryFromLabel(label) {
    const rawId=label.dataset.countryId;
    const name=label.textContent.trim();
    const id=rawId||state.data?.nations.find(country=>country.name===name)?.id||(typeof countries!=='undefined'?countries.find(country=>(country.name||'')===name)?._id:null);
    if(!id)return false;
    // 실제 지도에서 국가명은 국력 분석창이 아닌 기존 국가 정보창을 연다.
    // 미리보기에는 국가 정보창이 없으므로 국력 패널을 폴백으로 사용한다.
    if(!window.nationalPowerPreview&&typeof getCountryInfoById==='function'&&typeof window.showCountryInfoModal==='function'){
      const country=getCountryInfoById(String(id.$oid||id));
      if(country){window.showCountryInfoModal(country);return true;}
    }
    state.selected=String(id.$oid||id);state.region='';state.tab='nation';
    if(state.open){render();decorate();}else toggle(true);
    if(panel?.querySelector('.np-body'))panel.querySelector('.np-body').scrollTop=0;
    return true;
  }
  function countryPeriod(countryId) {
    if(window.nationalPowerPreview)return null;
    const list=typeof countries!=='undefined'?countries:[];
    const base=list.find(country=>String(country._id?.$oid||country._id)===String(countryId));
    if(!base)return null;
    const current=typeof getEffectiveCountryInfo==='function'?getEffectiveCountryInfo(base,time().year,time().month)||base:base;
    const start=Number(current.start_year??current.start??base.start_year??base.start);
    const rawEnd=current.end_year??current.end??base.end_year??base.end;
    const end=rawEnd===null||rawEnd===undefined||rawEnd===''?time().year:Number(rawEnd);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start>end)return null;
    return {start:Math.max(-5000,Math.round(start)),end:Math.min(2100,Math.round(end))};
  }
  function trendSpec(country) {
    const year=time().year,period=countryPeriod(country.id);
    const start=period?.start??year-60,end=period?.end??year+60;
    const years=[...new Set([...Array.from({length:7},(_,i)=>Math.round(start+(end-start)*i/6)),year])].filter(y=>y>=start&&y<=end).sort((a,b)=>a-b);
    return {years,key:[country.id,start,end,time().month,state.rate,state.includeUndated].join(':')};
  }
  function trendMarkup(country) {
    const spec=trendSpec(country),points=trendCache.get(spec.key);
    if(!points)return '<p class="np-trend-loading" role="status">국력 추이를 계산하고 있습니다…</p>';
    const valid=points.filter(p=>Number.isFinite(p.power));
    if(valid.length<2)return '<p class="np-trend-loading">이 기간에 비교 가능한 국력 자료가 부족합니다.</p>';
    const W=440,H=96,L=10,R=10,T=12,B=13,minYear=points[0].year,maxYear=points.at(-1).year,span=Math.max(1,maxYear-minYear),x=y=>L+(y-minYear)/span*(W-L-R),y=v=>H-B-(v/100)*(H-T-B);
    let d='',connected=false;
    for(const p of points){if(!Number.isFinite(p.power)){connected=false;continue;}d+=`${connected?'L':'M'}${x(p.year).toFixed(1)},${y(p.power).toFixed(1)} `;connected=true;}
    const events=(window.PowerReferenceData?.eventsFor(country.name,minYear,maxYear)||[]).slice(0,8);
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(country.name)} ${minYear}년부터 ${maxYear}년까지의 국력 추이"><line x1="${L}" x2="${W-R}" y1="${y(50)}" y2="${y(50)}" class="np-trend-grid"/><path d="${d}" class="np-trend-line"/>${points.filter(p=>Number.isFinite(p.power)).map(p=>`<circle cx="${x(p.year).toFixed(1)}" cy="${y(p.power).toFixed(1)}" r="${p.year===time().year?5:3}" class="${p.year===time().year?'current':''}"><title>${p.year}년 · 국력 ${score(p.power)}</title></circle>`).join('')}${events.map(e=>`<circle cx="${x(Math.max(minYear,Math.min(maxYear,e.from))).toFixed(1)}" cy="${H-5}" r="2.5" class="np-trend-event"><title>${esc(e.name)} · ${e.from}년</title></circle>`).join('')}</svg><div class="np-trend-years">${points.map(p=>`<button type="button" data-trend-year="${p.year}" ${p.year===time().year?'aria-current="date"':''} title="${p.year}년 지도와 국가 수치 보기">${p.year<0?'BC '+-p.year:p.year}</button>`).join('')}</div><p class="np-trend-note">연도를 누르면 지도와 수치가 함께 변경됩니다. 작은 점은 등록된 역사 사건입니다.</p>`;
  }
  function scheduleTrend(country) {
    const spec=trendSpec(country);
    if(trendCache.has(spec.key)||trendPending.has(spec.key))return;
    trendPending.add(spec.key);
    setTimeout(async()=>{
      const points=[];
      try{
        for(const year of spec.years){
          const input=snapshot(year,time().month);
          const result=year===state.data?.year&&state.data?.month===time().month?state.data:NationalPowerModel.build({...input,resources:input.resources||state.resources||[],year,month:time().month,rate:state.rate,includeUndated:state.includeUndated});
          points.push({year,power:result?.nations.find(n=>String(n.id)===String(country.id))?.power??null});
          await new Promise(resolve=>setTimeout(resolve,0));
        }
        trendCache.set(spec.key,points);
        const target=panel?.querySelector('#np-trend-content');
        if(target&&state.open&&state.tab==='nation'&&String(state.selected)===String(country.id)&&trendSpec(country).key===spec.key)target.innerHTML=trendMarkup(country);
        const embedded=document.querySelector('#cdp-power-content [data-country-power-trend]');
        if(embedded&&embedded.dataset.countryPowerTrend===String(country.id))embedded.innerHTML=trendMarkup(country);
      }catch(error){const target=panel?.querySelector('#np-trend-content');if(target&&state.selected===country.id)target.innerHTML='<p class="np-trend-loading">추이를 계산하지 못했습니다. 전체 분석에서 다시 시도해 주세요.</p>';}
      finally{trendPending.delete(spec.key);}
    },150);
  }
  async function renderCountryTab(countryId, mount) {
    if(!mount)return;
    const id=String(countryId?.$oid||countryId||'');
    const requestKey=`${id}:${time().year}:${time().month}`;
    mount.dataset.requestKey=requestKey;
    mount.innerHTML='<p class="np-embedded-loading" role="status">국력 자료를 불러오는 중입니다…</p>';
    try {
      if(!state.data||state.data.year!==time().year||state.data.month!==time().month||lastFingerprint!==fingerprint())await load();
      if(mount.dataset.requestKey!==requestKey)return;
      if(state.error)throw new Error(state.error);
      const country=state.data?.nations.find(row=>String(row.id)===id);
      if(!country){mount.innerHTML='<p class="np-embedded-loading">이 시점에 연결된 영토·국력 자료가 없습니다.</p>';return;}
      mount.innerHTML=`<div class="np-embedded"><div class="np-embedded-heading"><div><small>현재 지도 · ${esc(time().year)}년</small><h3>${esc(country.name)} 국력</h3></div><button type="button" data-power-analysis="${esc(id)}">전체 분석 ↗</button></div><div class="np-total"><div><span>총 국력</span><strong>${score(country.power)}<small> / 100</small></strong></div>${gauge(country.power)}<p>등록 자료 내 상대 지수 · 역사적 확정값 아님</p></div><div class="np-stats">${stat('⚔ 군사력',score(country.military),'동원·훈련·보급 잠재력',country.military,'military')}${stat('◈ 생산력',score(country.production),'인구·거점 잠재력',country.production,'production')}${stat('♟ 추정 인구',fmt(country.population),'연결 지역 합계 · 명',country.populationScore,'population')}</div><section class="np-trend" aria-label="${esc(country.name)} 국력 변화"><div class="np-trend-heading"><strong>국력 변화</strong></div><div data-country-power-trend="${esc(id)}">${trendMarkup(country)}</div></section><p class="np-embedded-note">연도별 비교와 인구 변화, 역사 사건은 전체 분석에서 확인할 수 있습니다.</p><div class="np-section-title">거점·전략 자원</div><div class="np-resources"><div><span>성</span><b>${fmt(country.castleCount)}</b></div><div><span>도시·수도</span><b>${fmt(country.cityCount)}</b></div><div><span>철</span><b>${fmt(country.iron)}</b></div><div><span>말</span><b>${fmt(country.horse)}</b></div><div><span>소금</span><b>${fmt(country.salt)}</b></div></div><details class="np-evidence"><summary>산출 기준</summary><p>생산력 45% + 군사력 35% + 거점 10% + 자원 입지 10%. 지역 인구·자원 자료를 연결한 잠정 모델이며 실제 병력이나 생산량은 아닙니다.</p></details></div>`;
      scheduleTrend(country);
    } catch(error) {if(mount.dataset.requestKey===requestKey)mount.innerHTML=`<p class="np-embedded-loading" role="alert">${esc(error.message)} <button type="button" data-power-retry="${esc(id)}">다시 시도</button></p>`;}
  }
  function decorate() {
    if (!state.open || !state.data || (state.loading && state.data.year!==time().year)) {
      document.querySelectorAll('.np-map-badge').forEach(el => el.remove());
      return;
    }
    if(state.loading)return;
    const byId = new Map(state.data.nations.map(c => [String(c.id), c]));
    const byName = new Map(state.data.nations.map(c => [c.name, c]));
    const countryForLabel = el => byId.get(String(el.dataset.countryId||'')) || byName.get(el.textContent.trim());
    const candidates = new Map();
    const visibleLabels=[...document.querySelectorAll('.macro-country-name, .cm-country-name, .np-preview-label')].filter(el=>{
      const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
      return el.getClientRects().length&&style.visibility!=='hidden'&&style.opacity!=='0'&&rect.bottom>=0&&rect.top<=innerHeight&&rect.right>=0&&rect.left<=innerWidth;
    });
    const preferredByDisplay=new Map();
    visibleLabels.forEach(el=>{
      const country=countryForLabel(el);if(!country)return;
      const key=el.textContent.trim();
      const population=Number.isFinite(country.population)?country.population:null;
      const quality=(population!==null?1e12+population:0)+(country.regions?.length||0)*1e6+(country.settlementCount||0);
      if(!preferredByDisplay.has(key)||quality>preferredByDisplay.get(key).quality)preferredByDisplay.set(key,{id:country.id,quality});
    });
    visibleLabels.forEach(el => {
      const country = countryForLabel(el);
      const rect = el.getBoundingClientRect();
      if (!country || String(preferredByDisplay.get(el.textContent.trim())?.id)!==String(country.id)) return;
      if (!candidates.has(country.id)) candidates.set(country.id, []);
      candidates.get(country.id).push(el);
    });
    const chosen = new Set([...candidates.values()].map(labels =>
      labels.find(el => el.parentElement.querySelector('.np-map-badge')) || labels[0]
    ));
    const positionBadge=badge=>{
      badge.classList.remove('np-badge-edge','np-badge-up');
      if(badge.getBoundingClientRect().right>innerWidth-12)badge.classList.add('np-badge-edge');
      if(badge.getBoundingClientRect().bottom>innerHeight-86)badge.classList.add('np-badge-up');
    };
    document.querySelectorAll('.np-map-badge').forEach(badge => {
      if (![...chosen].some(el => el.parentElement === badge.parentElement)) badge.remove();
    });
    chosen.forEach(el => {
      const c = countryForLabel(el);
      const existing = el.parentElement.querySelector('.np-map-badge');
      const key = c ? `${c.id}:${score(c.power)}:${score(c.military)}:${score(c.production)}:${c.population}:${c.castleCount}:${c.cityCount}` : '';
      if (existing?.dataset.powerKey === key){positionBadge(existing);return;}
      existing?.remove();
      if (!c) return;
      const badge = document.createElement('button'); badge.className = 'np-map-badge';
      badge.dataset.powerKey = key;
      badge.innerHTML = `<span class="np-badge-total">총 국력 <b>${score(c.power)}</b></span>${gauge(c.power)}<span class="np-badge-detail"><span>군사력 <b>${score(c.military)}</b></span><span>생산력 <b>${score(c.production)}</b></span><span>인구 <b>${fmt(c.population)}${c.population === null ? '' : '명'}</b></span></span>`;
      badge.querySelector('.np-badge-detail').insertAdjacentHTML('beforeend',`<span>성 · 도시 <b>${fmt(c.castleCount)} · ${fmt(c.cityCount)}</b></span>`);
      badge.setAttribute('aria-label', `${c.name} 총 국력 ${score(c.power)}, 군사력 ${score(c.military)}, 생산력 ${score(c.production)}, 인구 ${fmt(c.population)} 상세 보기`);
      badge.title = `${c.name} 국력 상세페이지 열기`;
      badge.addEventListener('click', event => { event.stopPropagation(); pickCountry(c.id); openComparison(c.id, 'country'); });
      el.parentElement.appendChild(badge);
      positionBadge(badge);
    });
  }
  function toggle(force) {
    state.open = typeof force === 'boolean' ? force : !state.open;
    if (state.open) {
      ensurePowerReferences().then(()=>{if(state.open)render();}).catch(()=>{});
      if(state.data&&state.data.year===time().year&&!state.loading){render();decorate();}
      else load();
      syncTimer = syncTimer || setInterval(sync, 900);
    }
    else { clearInterval(syncTimer); syncTimer = null; render(); decorate(); updateAuditMap(); $('[data-power-toggle]')?.focus(); }
  }
  function sync() {
    if (!state.open) return;
    bindMaps();
    const fp = fingerprint();
    if (fp !== lastFingerprint) { lastFingerprint = fp; clearTimeout(timer); timer = setTimeout(load, 120); }
    else if (!state.loading) decorate();
  }
  function bindMaps() {
    [readMap(), window.mlMap3d].filter(Boolean).forEach(m => {
      if (!m.on || boundMaps.has(m)) return;
      boundMaps.add(m);
      m.on('click', e => {
        const point = e.latlng || e.lngLat;
        if (!state.open || !state.data || !point) return;
        const matches = state.data.regions.filter(r => NationalPowerModel.contains(r.geometry, [point.lng, point.lat]));
        if (new Set(matches.map(r => r.countryId)).size !== 1) return;
        const r = matches[0];
        if (r) { state.selected = r.countryId; state.region = r.id; state.tab = 'region'; render(); }
      });
      m.on('moveend', () => setTimeout(decorate, 100));
      m.on('zoomend', () => setTimeout(decorate, 100));
      if(m===window.mlMap3d)m.on('style.load', updateAuditMap);
    });
  }
  function openComparison(countryId = state.selected, view = 'comparison') {
    if(view==='country' && !window.nationalPowerPreview && typeof getCountryInfoById==='function' && typeof window.showCountryInfoModal==='function') {
      const country=getCountryInfoById(countryId) || (typeof getCountryInfo==='function' ? getCountryInfo(state.data?.nations.find(row=>String(row.id)===String(countryId))?.name||'') : null);
      if(country){
        Promise.resolve(window.showCountryInfoModal(country,'power')).then(()=>expandCountryAnalysis(countryId));
        return;
      }
    }
    const period=view==='country'?countryPeriod(countryId):null;
    const query = new URLSearchParams({ year: time().year, country: countryId, view, ...(period||{}), ...(window.nationalPowerPreview ? {demo: '1'} : {}) });
    closeComparison();
    comparisonFrame=document.createElement('iframe');
    comparisonFrame.id='np-comparison-page';
    comparisonFrame.title=view === 'country' ? '국가 국력 상세페이지' : '국력 비교 연구실';
    comparisonFrame.src='/power-comparison.html?'+query;
    const topbarBottom=Math.max(0,Math.round($('#top-bar-container')?.getBoundingClientRect().bottom||46));
    Object.assign(comparisonFrame.style,{top:`${topbarBottom}px`,right:'0',bottom:'0',left:'0',height:`calc(100dvh - ${topbarBottom}px)`});
    document.body.appendChild(comparisonFrame);
    comparisonWindow=comparisonFrame.contentWindow;
    comparisonClose=document.createElement('button');
    comparisonClose.type='button';
    comparisonClose.id='np-comparison-close';
    comparisonClose.textContent='✕ 상세 닫기';
    comparisonClose.setAttribute('aria-label','국력 상세페이지를 닫고 지도로 돌아가기');
    Object.assign(comparisonClose.style,{top:'auto',right:'18px',bottom:'18px',left:'auto',transform:'none',zIndex:'2147483000'});
    comparisonClose.addEventListener('click',closeComparison);
    document.body.appendChild(comparisonClose);
    comparisonClose.focus();
  }
  function closeComparison() {
    comparisonJob++;
    const embedded=comparisonFrame?.parentElement?.id==='cdp-power-content';
    comparisonFrame?.remove(); comparisonClose?.remove();
    comparisonFrame=null; comparisonClose=null; comparisonWindow=null;
    if(embedded)collapseCountryAnalysisLayout();
  }
  function collapseCountryAnalysisLayout(){
    const countryPanel=$('#country-detail-panel');
    countryPanel?.classList.remove('cdp-power-expanded','cdp-fullscreen');
    countryPanel?.style.removeProperty('top');
    countryPanel?.style.removeProperty('height');
    const fullscreen=$('#cdp-fullscreen-btn');
    fullscreen?.setAttribute('aria-pressed','false');
    if(fullscreen)fullscreen.textContent='□';
    const button=$('#cdp-power-content [data-power-analysis]');
    if(button)button.textContent='전체 분석 ↗';
  }
  function expandCountryAnalysis(countryId){
    const countryPanel=$('#country-detail-panel'),mount=$('#cdp-power-content');
    if(!countryPanel?.classList.contains('active')||!mount)return;
    if(comparisonFrame?.parentElement===mount)return;
    closeComparison();
    const period=countryPeriod(countryId);
    const query=new URLSearchParams({year:time().year,country:countryId,view:'country',embedded:'1',...(period||{})});
    countryPanel.classList.add('cdp-fullscreen','cdp-power-expanded');
    const top=Math.round($('#top-bar-container')?.getBoundingClientRect().bottom||0);
    countryPanel.style.setProperty('top',`${top}px`,'important');
    countryPanel.style.setProperty('height',`${Math.max(180,window.innerHeight-top)}px`,'important');
    const fullscreen=$('#cdp-fullscreen-btn');
    fullscreen?.setAttribute('aria-pressed','true');
    if(fullscreen)fullscreen.textContent='▣';
    const button=mount.querySelector('[data-power-analysis]');
    if(button)button.textContent='← 요약 보기';
    comparisonFrame=document.createElement('iframe');
    comparisonFrame.id='np-country-analysis-frame';
    comparisonFrame.title='국가 국력 전체 분석';
    comparisonFrame.src='/power-comparison.html?'+query;
    mount.appendChild(comparisonFrame);
    comparisonWindow=comparisonFrame.contentWindow;
    window.bringAppPanelToFront?.(countryPanel);
  }
  async function sendComparison(event) {
    if (event.origin !== location.origin || event.source !== comparisonWindow) return;
    if(event.data?.type==='power-history-close'){closeComparison();return;}
    if(event.data?.type !== 'power-history-request')return;
    const {requestId, start, end, step} = event.data;
    const reply = data => event.source.postMessage({type:'power-history-response', requestId, ...data}, location.origin);
    if (![start,end,step].every(Number.isInteger) || start < -5000 || end > 2100 || start > end || step < 1 || Math.ceil((end-start)/step)+1 > 101) { reply({error:'기간과 간격을 확인하세요. 최대 101개 시점까지 계산합니다.'}); return; }
    const job = ++comparisonJob;
    try {
      if (!state.resources && !window.nationalPowerPreview) await load();
      if (state.error) throw new Error(state.error);
      const samples = [], years = [];
      for (let y = start; y <= end; y += step) years.push(y);
      if (years.at(-1) !== end) years.push(end);
      const rate = state.rate, includeUndated = state.includeUndated, month = time().month;
      for (const year of years) {
        if (job !== comparisonJob) return;
        const input = snapshot(year, month);
        const result = NationalPowerModel.build({...input, resources: input.resources || state.resources || [], year, month, rate, includeUndated});
        // Keep only aggregates; do not duplicate polygons and source arrays per year.
        samples.push({year,stats:result.stats,regionAudit:result.regions.map(r=>({id:r.id,name:r.name,countryId:r.countryId,countryName:result.nations.find(c=>c.id===r.countryId)?.name||'',population:r.population,status:r.populationStatus,reason:r.populationReason})),nations:result.nations.map(({regions,evidence,...c})=>c)});
        event.source.postMessage({type:'power-history-progress', requestId, completed:samples.length, total:years.length}, location.origin);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const payload = {...NationalPowerModel.timeline(samples), demo:!!window.nationalPowerPreview, rate, includeUndated, month, generatedAt:new Date().toISOString()};
      reply({payload});
    } catch (error) { reply({error:error.message}); }
  }
  function boot() {
    const anchor = $('#btn-resource-bar');
    const button = document.createElement('button'); button.type = 'button'; button.id = 'btn-national-power'; button.dataset.powerToggle = ''; button.className = 'layer-toggle-btn np-toggle'; button.innerHTML = '⚔ 국력'; button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-controls', 'national-power-panel');
    if (anchor) anchor.after(button); else document.body.appendChild(button);
    const mobileAnchor = $('#menu-layer-resource')?.closest('label');
    if (mobileAnchor) {
      const mobile=document.createElement('label');
      const checkbox=document.createElement('input');
      checkbox.type='checkbox';checkbox.id='menu-national-power';checkbox.dataset.powerToggle='';checkbox.setAttribute('aria-controls','national-power-panel');
      mobile.append(checkbox,document.createTextNode(' ⚔ 국력'));
      mobileAnchor.after(mobile);
    }
    document.querySelectorAll('[data-power-toggle]').forEach(b => b.addEventListener('click', () => toggle()));
    panel = document.createElement('aside'); panel.id = 'national-power-panel'; panel.hidden = true; panel.setAttribute('aria-label', '국가 및 지역 국력'); document.body.appendChild(panel);
    document.getElementById('cdp-power-content')?.addEventListener('click',event=>{
      const analysis=event.target.closest('[data-power-analysis]');
      if(analysis){
        if(comparisonFrame?.parentElement===event.currentTarget)closeComparison();
        else expandCountryAnalysis(analysis.dataset.powerAnalysis);
        return;
      }
      const retry=event.target.closest('[data-power-retry]');
      if(retry){renderCountryTab(retry.dataset.powerRetry,event.currentTarget);return;}
      const yearButton=event.target.closest('[data-trend-year]');
      if(yearButton){const year=Number(yearButton.dataset.trendYear);if(typeof updateTime==='function')updateTime(year,time().month);}
    });
    panel.addEventListener('submit',event=>{if(event.target.matches('.np-population-form')){event.preventDefault();savePopulation(event.target);}});
    panel.addEventListener('click', event => {
      const target = event.target.closest('button'); if (!target) return;
      if (target.dataset.action === 'close') toggle(false);
      if (target.dataset.action === 'analysis') openComparison();
      if (target.dataset.action === 'country-analysis') openComparison(state.selected,'country');
      if (target.dataset.trendYear){const year=Number(target.dataset.trendYear);if(typeof updateTime==='function')updateTime(year,time().month);else{const input=$('#yearInput');if(input){input.value=year;input.dispatchEvent(new Event('change',{bubbles:true}));}}}
      if (target.dataset.action === 'geojson') exportRegions();
      if (target.dataset.auditRegion) focusRegion(target.dataset.auditRegion);
      if (target.dataset.action === 'refresh') { state.resources = null; territoryBase=null; markerBase=null;populationLabelPoints.clear();trendCache.clear();load(); }
      if (target.dataset.tab) { state.tab = target.dataset.tab; render(); }
      if (target.dataset.country) pickCountry(target.dataset.country);
      if (target.dataset.region) { state.region = target.dataset.region; state.tab = 'region'; render(); }
      if (target.dataset.sort) { state.descending = state.sort === target.dataset.sort ? !state.descending : true; state.sort = target.dataset.sort; render(); }
    });
    panel.addEventListener('change', event => {
      if(event.target.id==='np-audit-filter'){state.auditFilter=event.target.value;render();}
      if(event.target.id==='np-audit-map'){state.auditMap=event.target.checked;updateAuditMap();}
      if (event.target.id === 'np-country') pickCountry(event.target.value);
      if (event.target.id === 'np-region') { state.region = event.target.value; render(); }
      if (event.target.id === 'np-rate') { state.rate = Number(event.target.value) / 100; load(); }
      if (event.target.id === 'np-undated') { state.includeUndated = event.target.checked; load(); }
    });
    document.addEventListener('keydown', e => {
      if(e.key!=='Escape')return;
      if(comparisonFrame){closeComparison();return;}
      if(state.open)toggle(false);
    });
    document.addEventListener('click',event=>{
      const label=event.target.closest?.('.macro-country-name, .cm-country-name, .np-preview-label');
      if(!label||!openCountryFromLabel(label))return;
      event.preventDefault();event.stopPropagation();
    },true);
    ['yearInput', 'monthInput', 'combinedSlider'].forEach(id => document.getElementById(id)?.addEventListener('change', sync));
    // Both Leaflet and MapLibre may initialize after the dashboard.
    bindMaps();
    window.addEventListener('message', sendComparison);
    window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==comparisonWindow||event.data?.type!=='power-profile-updated')return;referenceLoadPromise=null;trendCache.clear();ensurePowerReferences(true).then(async()=>{if(state.open)await load();populationLabelPoints.clear();window.dispatchEvent(new Event('national-power-profile-updated'));}).catch(()=>{});});
    window.NationalPower = { toggle, refresh: load, selectCountry: pickCountry, renderCountryTab, closeCountryAnalysis: () => {
      if(comparisonFrame?.parentElement?.id==='cdp-power-content')closeComparison();
    }, getSnapshot: () => state.data, populationLayer: async year => {
      if(!window.nationalPowerPreview)await Promise.all([ensurePopulationBaseData(),ensurePowerReferences()]);
      if(state.error)throw new Error(state.error);
      const input=snapshot(year,time().month);
      const result=NationalPowerModel.build({...input,resources:populationResources||input.resources||state.resources||[],year,month:time().month,rate:state.rate,includeUndated:state.includeUndated});
      if(window._is3dMode){
        // Prefer the exact live territory IDs and geometries that survived the
        // 3D hierarchy pass.  Population is a regional attribute; it must not
        // disappear merely because the owning country's ID cannot be matched.
        const rendered=rendered3dTerritories();
        const regional=[];
        for(const region of result.regions){
          if(region.population===null)continue;
          const visible=rendered.get(String(region.id));
          if(!visible)continue;
          const point=NationalPowerModel.representativePoint(visible.geometry);
          if(!point)continue;
          regional.push({_id:`visible-region:${region.id}`,name:region.name,pop_by_year:{[year]:region.population},population:region.population,lng:point[0],lat:point[1],region_id:region.id,population_origin:region.populationOrigin,level:'region'});
        }
        if(regional.length){
          console.info(`[영토 인구] ${year}년 최종 3D 영토와 연결된 지역 ${regional.length}개 표시`);
          return regional;
        }

        // Older/cached territory payloads may lack stable region IDs.  Keep a
        // visible fallback on the final rendered polygons, while preserving
        // each nation's calculated population total exactly.
        const masks=(window._3dPopulationVisibleMasks||[]).filter(mask=>mask?.country_id&&['Polygon','MultiPolygon'].includes(mask?.geometry?.type));
        if(!masks.length){console.warn('[영토 인구] 최종 3D 영토 폴리곤이 없어 표시할 수 없습니다.');return [];}
        const byCountry=new Map();
        for(const mask of masks){
          const box=NationalPowerModel.bounds(mask.geometry),area=Math.max(1e-9,(box[2]-box[0])*(box[3]-box[1])*Math.max(.15,Math.cos(((box[1]+box[3])/2)*Math.PI/180)));
          const row={...mask,area,point:NationalPowerModel.representativePoint(mask.geometry)};
          if(row.point){if(!byCountry.has(mask.country_id))byCountry.set(mask.country_id,[]);byCountry.get(mask.country_id).push(row);}
        }
        const output=[];
        for(const nation of result.nations){
          if(nation.population===null)continue;
          const visible=byCountry.get(String(nation.id))||[];
          const totalArea=visible.reduce((sum,row)=>sum+row.area,0);let assigned=0;
          visible.forEach((row,index)=>{
            const population=index===visible.length-1?nation.population-assigned:Math.round(nation.population*row.area/totalArea);
            assigned+=population;if(population<=0)return;
            output.push({_id:`visible:${nation.id}:${index}`,name:row.name||nation.name,pop_by_year:{[year]:population},population,lng:row.point[0],lat:row.point[1],region_id:'',population_origin:'visible_polygon_area_allocation',level:row.level});
          });
        }
        console.info(`[영토 인구] 지역 ID 연결 실패로 국가 합계를 최종 영토 ${output.length}개에 배분 표시`);
        return output;
      }
      return result.regions.filter(r=>r.population!==null&&r.countryId).flatMap(r=>{
        const displayGeometry=r.displayGeometry||r.geometry;
        const cacheKey=`${r.id}:${window._is3dMode?'3d':'2d'}`;
        let point=populationLabelPoints.get(cacheKey);
        if(!point){point=NationalPowerModel.representativePoint(displayGeometry);if(point)populationLabelPoints.set(cacheKey,point);}
        if(!point)return [];
        return [{_id:r.id,name:r.name,pop_by_year:{[year]:r.population},population:r.population,lng:point[0],lat:point[1],region_id:r.id,population_origin:r.populationOrigin}];
      });
    } };
    if(!window.nationalPowerPreview){
      const warm=()=>ensurePopulationBaseData().then(()=>{
        // Prepare the full resource and marker snapshot before first opening.
        setTimeout(()=>ensureBaseData().catch(()=>{}),1200);
      }).catch(()=>{});
      if('requestIdleCallback' in window)requestIdleCallback(warm,{timeout:4000});
      else setTimeout(warm,1500);
    }
    if (new URLSearchParams(location.search).get('power') === '1') toggle(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
