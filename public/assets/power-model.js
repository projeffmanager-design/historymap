/* Shared, deterministic preview model. All scores describe recorded data, not verified historical power. */
(function (root) {
  'use strict';
  const id = v => String(v && typeof v === 'object' ? v.$oid || v : v ?? '');
  const number = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  const plainName = value => String(value||'').replace(/\([^)]*\)|（[^）]*）/g,'').trim();
  const clamp = (value, low, high, fallback) => Math.min(high, Math.max(low, number(value) ?? fallback));
  const scaled = (value, reference) => 100 * Math.log1p(Math.max(0, value || 0)) / Math.log1p(Math.max(1, reference));
  const koreaEconomy = {
    2024:{metric:'명목 GDP',south:2556.9,north:43.7,source:'https://www.kostat.go.kr/boardDownload.es?bid=11825&list_no=442558&seq=2',observedYear:2024},
    2025:{metric:'명목 GNI',south:2717.1,north:48.5,source:'https://www.bok.or.kr/portal/bbs/P0002240/view.do?menuNo=200092&nttId=10085022',observedYear:2025},
    2026:{metric:'명목 GNI',south:2717.1,north:48.5,source:'https://www.bok.or.kr/portal/bbs/P0002240/view.do?menuNo=200092&nttId=10085022',observedYear:2025}
  };
  function koreanEconomyReference(name,year){
    const row=koreaEconomy[year];if(!row)return null;
    const plain=String(name||'').replace(/\([^)]*\)|（[^）]*）/g,'').trim();
    const side=['대한민국','한국','남한','Republic of Korea','South Korea'].includes(plain)?'south':['북한','조선민주주의인민공화국','Democratic People\'s Republic of Korea','North Korea'].includes(plain)?'north':null;
    return side?{metric:row.metric,valueTrillionKrw:row[side],observedYear:row.observedYear,source:row.source,score:100*Math.sqrt(row[side]/row.south),side}:null;
  }
  // Existing modern-city seed assumptions, not independently verified census totals.
  const legacyEraScale = {'-200':.055,0:.065,200:.018,400:.030,500:.045,600:.080,650:.100,700:.110,750:.130,800:.095,900:.100,1000:.115,1050:.145,1100:.185,1127:.180,1150:.165,1200:.195,1231:.165,1250:.130,1280:.110,1300:.115,1350:.105,1400:.125,1450:.140,1500:.160,1600:.200,1700:.240,1800:.350,1850:.390,1900:.450,1950:.620,2000:.900,2025:1};
  function inPeriod(doc, year) {
    const start=number(doc.start_year ?? doc.era_start), end=number(doc.end_year ?? doc.era_end);
    return (start===null || year>=start) && (end===null || year<=end);
  }
  function populationAt(doc, year) {
    if (!inPeriod(doc, year)) return null;
    if (!Object.keys(doc.pop_by_year || {}).length && number(doc.modern_pop)!==null) {
      const series=Object.fromEntries(Object.entries(doc.era_scale || legacyEraScale).map(([y,k])=>[y,number(k)!==null && Number(k)>=0 ? Math.round(Number(doc.modern_pop)*Number(k)) : null]));
      return populationAt({...doc,modern_pop:undefined,pop_by_year:series},year);
    }
    const points = Object.entries(doc.pop_by_year || {}).map(([y, v]) => [Number(y), number(v)])
      .filter(([y, v]) => Number.isFinite(y) && v !== null && v >= 0).sort((a, b) => a[0] - b[0]);
    if (!points.length) { const value=number(doc.est_population); return Number(doc.target_year) === year && doc.target_year != null && value!==null && value>=0 ? value : null; }
    if (year < points[0][0] || year > points.at(-1)[0]) return null;
    for (let i = 0; i < points.length; i++) {
      if (year === points[i][0]) return points[i][1];
      if (year < points[i][0]) {
        const [a, x] = points[i - 1], [b, y] = points[i];
        return Math.round(x + (y - x) * (year - a) / (b - a));
      }
    }
    return null;
  }
  function activeSettlement(doc, year, month=1) {
    if(doc.hidden || doc.is_natural_feature || doc.is_label || doc.is_military_flag)return null;
    const when=year*12+month-1;
    const records=Array.isArray(doc.history)&&doc.history.length?doc.history:[doc];
    const record=[...records].reverse().find(h=>{
      const start=number(h.start_year ?? h.start ?? h.built),end=number(h.end_year ?? h.end ?? h.destroyed);
      if(start===null && end===null)return false; // Undated markers are audited, not asserted as present in every era.
      return when >= (start===null?-Infinity:start*12+(number(h.start_month)??1)-1) && when <= (end===null?Infinity:end*12+(number(h.end_month)??12)-1);
    });
    if(!record)return null;
    const type=String(record.place_type || doc.place_type || '').toLowerCase();
    if(record.is_battle || doc.is_battle || ['battle','army','military','natural'].includes(type))return null;
    const castle=['seong','castle','fortress','hwangseong','성'].includes(type) || record.is_castle===true;
    const city=['city','capital','hwangseong','도시','수도'].includes(type) || record.is_city===true || record.is_capital===true;
    return {castle,city,type,name:record.name||doc.name};
  }
  function ringContains(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if (((a[1] > p[1]) !== (b[1] > p[1])) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function contains(geometry, p) {
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
    return polygons.some(rings => rings.length && ringContains(p, rings[0]) && !rings.slice(1).some(r => ringContains(p, r)));
  }
  function bounds(geometry) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    function walk(c) {
      if (!Array.isArray(c)) return;
      if (typeof c[0] === 'number') { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); }
      else c.forEach(walk);
    }
    walk(geometry?.coordinates);
    return b;
  }
  function ringArea(ring) {
    let area=0;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++)area+=(ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1]);
    return area/2;
  }
  // Returns a label point that is inside the largest polygon, unlike a bbox centre
  // which can land in the sea for concave coasts and multipart territories.
  function representativePoint(geometry) {
    const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?(geometry.coordinates||[]):[];
    if(!polygons.length)return null;
    const rings=[...polygons].filter(p=>p?.[0]?.length>=3).sort((a,b)=>Math.abs(ringArea(b[0]))-Math.abs(ringArea(a[0])));
    if(!rings.length)return null;
    const selected={type:'Polygon',coordinates:rings[0]},ring=rings[0][0],box=bounds(selected);
    let cross=0,cx=0,cy=0;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const f=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];cross+=f;cx+=(ring[j][0]+ring[i][0])*f;cy+=(ring[j][1]+ring[i][1])*f;
    }
    if(Math.abs(cross)>1e-12){const centroid=[cx/(3*cross),cy/(3*cross)];if(contains(selected,centroid))return centroid;}
    const centre=[(box[0]+box[2])/2,(box[1]+box[3])/2];
    if(contains(selected,centre))return centre;
    let best=null,bestScore=-Infinity;
    for(let row=1;row<20;row++)for(let col=1;col<20;col++){
      const point=[box[0]+(box[2]-box[0])*col/20,box[1]+(box[3]-box[1])*row/20];
      if(!contains(selected,point))continue;
      const edge=Math.min(point[0]-box[0],box[2]-point[0],point[1]-box[1],box[3]-point[1]);
      const centrality=-Math.hypot(point[0]-centre[0],point[1]-centre[1])*.01,score=edge+centrality;
      if(score>bestScore){best=point;bestScore=score;}
    }
    if(best)return best;
    for(let i=1;i<ring.length;i++){
      const point=[(ring[i-1][0]+ring[i][0])/2,(ring[i-1][1]+ring[i][1])/2];
      const nudged=[point[0]*.999+centre[0]*.001,point[1]*.999+centre[1]*.001];
      if(contains(selected,nudged))return nudged;
    }
    return ring[0]||null;
  }
  function build({ countries = [], regions = [], resources = [], markers = [], populationEffects = [], year, month=1, rate = 0.03, includeUndated = true }) {
    rate = Math.max(0.01, Math.min(0.05, Number(rate) || 0.03));
    const countryNames=new Map(countries.map(country=>[id(country.id??country._id),plainName(country.name)]));
    const stats = { unassigned: 0, ambiguous: 0, undated: 0, outsidePeriod: 0, populationMissing: 0, populationEffectsApplied:0, populationEffectsSkipped:0 };
    const issues = [];
    const rows = regions.map(r => {
      const direct = populationAt({pop_by_year:r.population_series,modern_pop:r.modern_population,era_scale:r.population_scale}, year);
      return { ...r, id: id(r.id), countryId: id(r.countryId), bbox: bounds(r.geometry), population: direct, populationOrigin: direct===null?'spatial_join':r.population_series?'polygon_series':'modern_distribution', populationRecords: direct===null?0:1, missingRecords: 0, conflicts: 0, sites: 0, iron: 0, horse: 0, salt: 0, silk: 0, gold: 0, castleCount:0,cityCount:0,settlementCount:0,unclassifiedCount:0, productionQuantities:{}, evidence: direct===null?[]:[{name:r.name,type:'population',value:direct,source:r.population_source||'폴리곤 인구 추정 · 출전 미등록',undated:false}] };
    });
    // Assignment depends only on geometry and stable IDs, never ownership or map color.
    rows.sort((a, b) => (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]) - (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]) || a.id.localeCompare(b.id));
    const byRegionId=new Map(),spatialCells=new Map(),largeRegions=[],cellSize=10;
    rows.forEach((row,index)=>{
      row._spatialOrder=index;
      if(!byRegionId.has(row.id))byRegionId.set(row.id,[]);
      byRegionId.get(row.id).push(row);
      const [west,south,east,north]=row.bbox;
      if(![west,south,east,north].every(Number.isFinite)){largeRegions.push(row);return;}
      const minX=Math.floor(west/cellSize),maxX=Math.floor(east/cellSize),minY=Math.floor(south/cellSize),maxY=Math.floor(north/cellSize);
      if((maxX-minX+1)*(maxY-minY+1)>120){largeRegions.push(row);return;}
      for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
        const key=`${x}:${y}`;
        if(!spatialCells.has(key))spatialCells.set(key,[]);
        spatialCells.get(key).push(row);
      }
    });
    const spatialMatches=p=>{
      if(p.some(v=>v===null))return [];
      const key=`${Math.floor(p[0]/cellSize)}:${Math.floor(p[1]/cellSize)}`;
      const candidates=[...(spatialCells.get(key)||[]),...largeRegions];
      if(largeRegions.length)candidates.sort((a,b)=>a._spatialOrder-b._spatialOrder);
      return candidates.filter(r=>p[0]>=r.bbox[0]&&p[0]<=r.bbox[2]&&p[1]>=r.bbox[1]&&p[1]<=r.bbox[3]&&contains(r.geometry,p));
    };
    const seen = new Set();
    for (const doc of resources) {
      if (doc._id && seen.has(id(doc._id))) continue;
      if (doc._id) seen.add(id(doc._id));
      const type = doc.resource_type;
      if (!['population', 'iron', 'horse', 'salt', 'silk', 'gold'].includes(type)) continue;
      const start = number(doc.start_year), end = number(doc.end_year);
      const undated = type !== 'population' && start === null && end === null;
      if (undated) { stats.undated++; if (!includeUndated) continue; }
      const p = [number(doc.lng ?? doc.location?.coordinates?.[0]), number(doc.lat ?? doc.location?.coordinates?.[1])];
      const regionId = doc.region_id ?? doc.territory_id;
      let matches = regionId ? byRegionId.get(id(regionId))||[] : spatialMatches(p);
      const issue = reason => issues.push({id:id(doc._id),name:doc.name_ko||doc.name||type,type,reason,regionId:id(regionId),lng:p[0],lat:p[1]});
      if (matches.length>1 && !regionId) { stats.ambiguous++; issue('중첩 영역: 최소 경계·지역 ID 순으로 한 곳에만 배정'); }
      const r = matches[0];
      if (!r) { stats.unassigned++; issue(regionId?'연결된 지역 ID가 현재 로드된 폴리곤에 없음':p.some(v=>v===null)?'좌표 없음':'포함하는 폴리곤 없음'); continue; }
      if ((start !== null && year < start) || (end !== null && year > end)) { stats.outsidePeriod++; if(type==='population')r.missingRecords++; issue('기록의 적용 기간 밖'); continue; }
      let value = null;
      if (type === 'population') {
        if(['polygon_series','modern_distribution'].includes(r.populationOrigin))continue; // Complete region total takes precedence over spatial samples.
        value = populationAt(doc, year);
        if (value === null) { stats.populationMissing++; r.missingRecords++; issue('해당 연도의 인구 근거 없음'); continue; }
        r.population = (r.population ?? 0) + value;
        if(!r.populationRecords)r.populationOrigin=regionId?'region_id':'spatial_join';
        r.populationRecords++;
      } else { r[type]++; r.sites++; }
      r.evidence.push({ name: doc.name_ko || doc.name || type, type, value, source: doc.source_record || doc.source || doc.hist || doc.description || '상세 출전 미등록', undated });
    }
    const seenMarkers=new Set();
    stats.markersUnassigned=0;stats.markersInactive=0;stats.markersAmbiguous=0;
    for(const marker of markers){
      const markerId=id(marker._id ?? marker.id);if(!markerId || seenMarkers.has(markerId))continue;seenMarkers.add(markerId);
      const active=activeSettlement(marker,year,month);if(!active){stats.markersInactive++;continue;}
      const p=[number(marker.lng ?? marker.location?.coordinates?.[0]),number(marker.lat ?? marker.location?.coordinates?.[1])];
      const matches=spatialMatches(p);
      if(!matches.length){stats.markersUnassigned++;issues.push({id:markerId,name:active.name,type:'settlement',reason:'성·도시를 포함하는 폴리곤 없음'});continue;}
      if(matches.length>1)stats.markersAmbiguous++;
      const r=matches[0];r.settlementCount++;if(active.castle)r.castleCount++;if(active.city)r.cityCount++;if(!active.castle&&!active.city)r.unclassifiedCount++;
    }
    for(const r of rows){
      // Production series are quantities, deliberately separate from resource-site counts.
      for(const [key,entry] of Object.entries(r.production_series||{})){
        if(!entry || typeof entry.unit!=='string')continue;
        const value=populationAt({pop_by_year:entry.values},year);
        r.productionQuantities[key]={value,unit:entry.unit,source:entry.source||'출전 미등록'};
      }
      r.basePopulation=r.population;
      const applicableEffects=populationEffects.filter(effect=>{
        if(number(effect?.percent)===null||year<(number(effect.effect_from)??number(effect.from)??-Infinity)||year>(number(effect.effect_to)??number(effect.to)??Infinity))return false;
        return effect.territory_ids?.length?effect.territory_ids.includes(r.id):effect.scope==='country'&&!!r.countryId&&countryNames.get(r.countryId)===plainName(effect.profile);
      });
      const override=[...(r.population_overrides||[])].reverse().find(o=>inPeriod(o,year));
      if(applicableEffects.length){
        const effect=applicableEffects.at(-1);
        r.populationEffect={name:effect.name,scope:effect.scope||'territories',percent:Number(effect.percent),source:effect.source||'',basis:effect.effect_basis||'',skipped:!!override||r.population===null,conflict:applicableEffects.length>1};
        if(!override&&r.population!==null){
          r.population=Math.max(0,Math.round(r.population*(1+Number(effect.percent)/100)));
          r.populationOrigin='event_adjusted';
          r.evidence.push({name:effect.name,type:'population',value:r.population,source:`사건 보정 ${effect.percent}% · ${effect.effect_basis||'산정 근거 미등록'} · ${effect.source||'출처 URL 미등록'}`,undated:false});
          stats.populationEffectsApplied++;
        }else stats.populationEffectsSkipped++;
        if(applicableEffects.length>1)issues.push({id:r.id,name:r.name,type:'population',reason:'동일 영토·연도에 사건 인구 보정이 중복되어 마지막 항목만 적용'});
      }
      if(override){
        const value=number(override.value),multiplier=number(override.multiplier);
        if(override.mode==='reset')r.populationOrigin='manual_reset';
        else if(value!==null&&value>=0)r.population=value;
        else if(multiplier!==null&&multiplier>=0&&r.population!==null)r.population=Math.round(r.population*multiplier);
        if(override.mode!=='reset'&&r.population!==null){
          r.populationOrigin='manual_override';r.missingRecords=0;r.populationRecords=1;
          r.evidence.push({name:r.name,type:'population',value:r.population,source:override.reason||'관리자 수동 보정',undated:false});
        }
      }
      // Person-equivalent potential, not an observed historical output or army count.
      const productivity=clamp(r.productivity_coefficient,.5,1.5,1);
      const training=clamp(r.training_coefficient,.7,1.3,1);
      const logistics=clamp(r.logistics_coefficient,.5,1.2,1);
      const defense=clamp(r.defense_coefficient,0,.2,0);
      r.modelCoefficients={productivity,training,logistics,defense};
      r.manpower=r.population===null?null:Math.floor(r.population*rate);
      r.baseProduction=r.population===null?null:r.population*productivity;
      r.siteBonus=r.baseProduction===null?null:Math.min(r.baseProduction*.2,r.cityCount*1000+r.castleCount*300+r.unclassifiedCount*100);
      r.productionPotential=r.baseProduction===null?null:r.baseProduction+r.siteBonus;
      const trained=r.manpower===null?null:r.manpower*training*logistics;
      r.coreBonus=trained===null?null:Math.min(trained*.1,r.horse*100);
      r.defenseBonus=trained===null?null:Math.min(trained*.1,r.castleCount*50+trained*defense);
      r.militaryPotential=trained===null?null:trained+r.coreBonus+r.defenseBonus;
      r.sitePotential=r.cityCount*3+r.castleCount*2+r.unclassifiedCount;
    }
    const grouped = new Map();
    for (const c of countries) grouped.set(id(c.id ?? c._id), { id: id(c.id ?? c._id), name: c.name, color: /^#[\da-f]{3,8}$/i.test(c.color || '') ? c.color : '#c8aa70', population: null, basePopulation:null, sites: 0, iron: 0, horse: 0, salt: 0, silk: 0, gold: 0, castleCount:0,cityCount:0,settlementCount:0,unclassifiedCount:0,sitePotential:0,baseProduction:0,siteBonus:0,productionPotential:0,militaryPotential:0,coreBonus:0,defenseBonus:0,productionQuantities:{}, regions: [], evidence: [] });
    for (const r of rows) {
      const c = grouped.get(r.countryId);
      r.ownershipStatus = c ? 'assigned' : 'unassigned';
      r.populationStatus = r.population!==null ? (r.missingRecords||r.conflicts?'partial':'available') : r.conflicts ? 'conflict' : r.missingRecords||r.population_series ? 'outside_period' : 'missing';
      r.populationReason = ({available:'인구 연결됨',partial:'일부 인구 기록만 합산됨',conflict:'영토 중첩으로 인구 귀속 충돌',outside_period:'해당 연도의 인구 근거 없음',missing:'인구 기록 미연결'})[r.populationStatus];
      if(!c)r.populationReason += ' · 국가 귀속 미확인';
      if (!c) continue;
      c.regions.push(r);
      if (r.population !== null) c.population = (c.population ?? 0) + r.population;
      if (r.basePopulation !== null) c.basePopulation = (c.basePopulation ?? 0) + r.basePopulation;
      for (const key of ['sites', 'iron', 'horse', 'salt', 'silk', 'gold','castleCount','cityCount','settlementCount','unclassifiedCount']) c[key] += r[key];
      c.sitePotential+=r.sitePotential;
      if(r.population!==null)for(const key of ['baseProduction','siteBonus','productionPotential','militaryPotential','coreBonus','defenseBonus'])c[key]+=r[key];
      for(const [key,entry] of Object.entries(r.productionQuantities)){
        const unitKey=JSON.stringify([key,entry.unit]);
        const aggregate=c.productionQuantities[unitKey] || (c.productionQuantities[unitKey]={resource:key,unit:entry.unit,value:null,coveredRegions:0});
        if(entry.value!==null){aggregate.value=(aggregate.value??0)+entry.value;aggregate.coveredRegions++;}
      }
      c.evidence.push(...r.evidence);
    }
    function score(items) {
      const maxPop = items.reduce((max,r)=>Math.max(max,r.population||0),1);
      const maxSites = items.reduce((max,r)=>Math.max(max,r.sites),1);
      const maxProduction = items.reduce((max,r)=>Math.max(max,r.productionPotential||0),1);
      const maxMilitary = items.reduce((max,r)=>Math.max(max,r.militaryPotential||0),1);
      const maxSitePotential = items.reduce((max,r)=>Math.max(max,r.sitePotential||0),1);
      for (const r of items) {
        r.manpower = r.population === null ? null : Math.floor(r.population * rate);
        r.populationScore = r.population === null ? null : scaled(r.population,maxPop);
        r.military = r.population === null ? null : scaled(r.militaryPotential,maxMilitary);
        r.production = r.population === null ? null : scaled(r.productionPotential,maxProduction);
        r.siteScore = r.population === null ? null : scaled(r.sitePotential,maxSitePotential);
        r.resourceScore = r.population === null ? null : scaled(r.sites,maxSites);
        r.power = r.population === null ? null : r.production*.45+r.military*.35+r.siteScore*.10+r.resourceScore*.10;
      }
    }
    const nations = [...grouped.values()].filter(c => c.regions.length);
    score(nations); score(rows);
    for(const c of nations){
      if(c.population===null)continue;
      const benchmark=koreanEconomyReference(c.name,year);
      if(!benchmark)continue;
      c.economicReference=benchmark;
      c.production=benchmark.score;
      c.power=c.production*.45+c.military*.35+c.siteScore*.10+c.resourceScore*.10;
    }
    nations.sort((a, b) => (b.power ?? -1) - (a.power ?? -1) || a.name.localeCompare(b.name));
    nations.forEach((c, i) => { c.rank = c.power === null ? null : i + 1; c.coverage = c.regions.filter(r => r.population !== null).length + '/' + c.regions.length; });
    stats.regionsMissing = rows.filter(r=>r.populationStatus!=='available').length;
    stats.regionsUnowned = rows.filter(r=>r.ownershipStatus==='unassigned').length;
    return { nations, regions: rows, issues, stats, year, rate, includeUndated, version: 'prototype-2-potential' };
  }
  // One reference for the entire selected period: curves must not silently
  // renormalize each year's strongest country to 100.
  function timeline(snapshots) {
    const all = snapshots.flatMap(s => s.nations);
    const reference = {
      population: all.reduce((max,c)=>Math.max(max,c.population||0),1),
      sites: all.reduce((max,c)=>Math.max(max,c.sites),1),
      production: all.reduce((max,c)=>Math.max(max,c.productionPotential||0),1),
      military: all.reduce((max,c)=>Math.max(max,c.militaryPotential||0),1),
      sitePotential: all.reduce((max,c)=>Math.max(max,c.sitePotential||0),1)
    };
    const points = snapshots.map(s => ({ year: s.year, stats: s.stats, regionAudit: s.regionAudit || (s.regions||[]).map(r=>({id:r.id,name:r.name,countryId:r.countryId,countryName:s.nations.find(c=>c.id===r.countryId)?.name||'',population:r.population,status:r.populationStatus,reason:r.populationReason})), nations: s.nations.map(c => {
      const populationScore = c.population === null ? null : scaled(c.population,reference.population);
      const military = populationScore === null ? null : scaled(c.militaryPotential,reference.military);
      const production = populationScore === null ? null : c.economicReference?.score ?? scaled(c.productionPotential,reference.production);
      const siteScore = populationScore === null ? null : scaled(c.sitePotential,reference.sitePotential);
      const resourceScore = populationScore === null ? null : scaled(c.sites,reference.sites);
      return { id: c.id, name: c.name, color: c.color, population: c.population, basePopulation:c.basePopulation, manpower: c.manpower,
        sites: c.sites, horse: c.horse, iron: c.iron, salt: c.salt, silk: c.silk, gold: c.gold,
        castleCount:c.castleCount,cityCount:c.cityCount,settlementCount:c.settlementCount,unclassifiedCount:c.unclassifiedCount,productionQuantities:c.productionQuantities,
        coverage: c.coverage, populationScore, military, production, siteScore, resourceScore,economicReference:c.economicReference||null,
        baseProduction:c.baseProduction,siteBonus:c.siteBonus,productionPotential:c.productionPotential,militaryPotential:c.militaryPotential,coreBonus:c.coreBonus,defenseBonus:c.defenseBonus,sitePotential:c.sitePotential,
        power: populationScore === null ? null : production*.45+military*.35+siteScore*.10+resourceScore*.10,
        snapshotPower: c.power };
    }).sort((a, b) => (b.power ?? -1) - (a.power ?? -1)) }));
    return { points, reference, version: 'prototype-2-period-reference' };
  }
  const api = { build, timeline, populationAt, koreanEconomyReference, activeSettlement, legacyEraScale, contains, bounds, representativePoint };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NationalPowerModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
