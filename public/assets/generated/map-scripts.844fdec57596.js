(function () {
  'use strict';

  /* ── 상태 ─────────────────────────────────────────────────── */
  var _tgEditId         = null;   // 현재 편집 중인 territory _id
  var _tgSelectMode     = false;  // 영토 클릭 선택 대기 중
  var _tgEditMode       = false;  // geoman 꼭지점 편집 중
  var _tgEditableLayer  = null;   // L.geoJSON 편집 레이어
  var _tgEditedGeometry = null;   // 수정된 geometry
  var _tgOriginalGeom   = null;   // 원본 geometry (복원용)
  var _tgFullCache      = {};     // id → full territory
  var _tgEraserMode     = false;
  var _tgEraserDown     = false;
  var _tgEraserStroke   = [];
  var _tgEraserPreview  = null;
  var _tgEraserVertices = null;
  var _tgEraserRadiusPx = 18;
  var _tg3dSelecting    = false;
  var _tg3dMarkers      = [];
  var _tg3dClickHandler = null;
  var _tg3dEraseDown    = false;
  var _tg3dErasePoints  = [];
  var _tg3dAddMode      = false;
  var _tg3dEditClickHandler = null;
  var _tgCurrentHidden  = false;
  var _tgSnapEnabled    = true;
  var _tgSnapSegments   = [];
  var _tgSnapDistancePx = 18;
  var _tgPairId=null,_tgPairGeometry=null,_tgPairOriginal=null,_tgPairClickHandler=null,_tgPairSharedLines=[],_tgPairMembers=[];
  var _tgCoastClickHandler=null,_tgCoastGuideLine=null,_tgCoastSelection=null;
  var _tgAOverlapCandidates=[];
  var _tgReferenceBId=null,_tgBoundarySelectMode=false,_tgBoundarySelected=new Map(),_tgBoundaryStroke=[],_tgBoundarySelecting=false;

  /* ── 토큰 ─────────────────────────────────────────────────── */
  function _tgToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  }

  /* ── UI 헬퍼 ──────────────────────────────────────────────── */
  function _tgBarOpen(open) {
    var bar = document.getElementById('territory-geom-edit-bar');
    if (bar) bar.classList.toggle('open', !!open);
  }
  function _tgSetTitle(t) {
    var el = document.getElementById('territory-geom-edit-title');
    if (el) el.textContent = t;
  }
  function _tgDisplayId(id) {
    if(id&&typeof id==='object')return String(id.$oid||id.oid||id._id||'');
    return String(id||'');
  }
  function _tgSetMsg(msg, cls) {
    var el = document.getElementById('territory-geom-edit-msg');
    if (!el) return;
    el.textContent = msg;
    el.className   = cls || '';
  }
  function _tgHideLayerPicker() {
    var picker=document.getElementById('territory-geom-layer-picker');
    if(picker)picker.style.display='none';
    var multi=document.getElementById('territory-geom-layer-multi');if(multi)multi.style.display='none';
    var cancel=document.getElementById('territory-geom-layer-cancel');if(cancel){cancel.style.display='none';cancel.onclick=null;}
  }
  function _tgTerritoryId(t) {
    var raw=t&&t.properties?(t.properties.territory_id||t.properties._id||t.id):(t&&(t._id||t.id));
    return _tgDisplayId(raw);
  }
  function _tgTerritoryName(t) {
    var p=t&&t.properties?t.properties:t||{};
    return p.name_ko||p.name_en||p.name||_tgTerritoryId(t).slice(-6)||'이름 없음';
  }
  function _tgTerritoryLevel(t) {
    var p=t&&t.properties?t.properties:t||{};
    return p.level||'미지정';
  }
  function _tgChooseTerritory(hits, onChoose) {
    var unique=[],seen=new Set();
    (hits||[]).forEach(function(t){var id=_tgTerritoryId(t);if(id&&!seen.has(id)){seen.add(id);unique.push(t);}});
    var rank={city:0,province:1,country:2};
    unique.sort(function(a,b){return (rank[_tgTerritoryLevel(a)]??9)-(rank[_tgTerritoryLevel(b)]??9);});
    if(!unique.length)return false;
    if(unique.length===1){_tgHideLayerPicker();onChoose(unique[0]);return true;}
    var picker=document.getElementById('territory-geom-layer-picker');
    var select=document.getElementById('territory-geom-layer-select');
    var confirm=document.getElementById('territory-geom-layer-confirm');
    if(!picker||!select||!confirm)return false;
    var multi=document.getElementById('territory-geom-layer-multi');if(multi)multi.style.display='none';select.style.display='';
    select.innerHTML='';
    unique.forEach(function(t,i){
      var id=_tgTerritoryId(t),opt=document.createElement('option');
      opt.value=String(i);
      opt.textContent='['+_tgTerritoryLevel(t)+'] '+_tgTerritoryName(t)+' · '+id;
      select.appendChild(opt);
    });
    picker.style.display='flex';
    _tgSetMsg('🧭 이 위치에 '+unique.length+'개 영토가 겹칩니다. 편집할 레이어를 선택하세요.','dirty');
    confirm.onclick=function(){
      var chosen=unique[Number(select.value)||0];
      if(!chosen)return;
      _tgHideLayerPicker();
      onChoose(chosen);
    };
    return true;
  }
  function _tgChooseTerritoryGroup(hits,side,onChoose){
    var unique=[],seen=new Set();
    (hits||[]).forEach(function(t){var id=_tgTerritoryId(t);if(id&&!seen.has(id)){seen.add(id);unique.push(t);}});
    var rank={city:0,province:1,country:2};
    unique.sort(function(a,b){return (rank[_tgTerritoryLevel(a)]??9)-(rank[_tgTerritoryLevel(b)]??9);});
    if(!unique.length)return false;
    if(unique.length===1){_tgHideLayerPicker();onChoose(unique[0],[]);return true;}
    var picker=document.getElementById('territory-geom-layer-picker'),select=document.getElementById('territory-geom-layer-select');
    var multi=document.getElementById('territory-geom-layer-multi'),confirm=document.getElementById('territory-geom-layer-confirm');
    if(!picker||!multi||!confirm)return false;
    if(select)select.style.display='none';multi.innerHTML='';multi.style.display='block';
    unique.forEach(function(t,index){
      var row=document.createElement('label');row.className='tg-group-row';
      var reference=document.createElement('input');reference.type='radio';reference.name='tg-reference-'+side;reference.value=String(index);reference.checked=index===0;
      var referenceLabel=document.createElement('span');referenceLabel.appendChild(reference);referenceLabel.appendChild(document.createTextNode(' 기준 '+side));
      var togetherLabel=document.createElement('span'),together=document.createElement('input');together.type='checkbox';together.dataset.index=String(index);together.disabled=index===0;
      togetherLabel.appendChild(together);togetherLabel.appendChild(document.createTextNode(' 함께 수정'));
      var title=document.createElement('span');title.textContent='['+_tgTerritoryLevel(t)+'] '+_tgTerritoryName(t)+' · '+_tgTerritoryId(t);
      reference.addEventListener('change',function(){multi.querySelectorAll('input[type="checkbox"]').forEach(function(box){box.disabled=box.dataset.index===reference.value;if(box.disabled)box.checked=false;});});
      row.append(referenceLabel,togetherLabel,title);multi.appendChild(row);
    });
    picker.style.display='flex';confirm.textContent=side+' 영역 선택 확정';
    _tgSetMsg(side+' 기준 영토와 함께 수정할 중첩 영토를 각각 선택하세요.','dirty');
    confirm.onclick=function(){
      var selected=multi.querySelector('input[type="radio"]:checked'),referenceIndex=selected?Number(selected.value):0;
      var companions=Array.from(multi.querySelectorAll('input[type="checkbox"]:checked')).map(function(box){return unique[Number(box.dataset.index)];}).filter(Boolean);
      _tgHideLayerPicker();confirm.textContent='선택한 영토 편집';onChoose(unique[referenceIndex],companions);
    };
    return true;
  }
  function _tgChoosePairTargets(hits,focus,onChoose){
    var unique=[],seen=new Set([String(_tgEditId)]);
    (hits||[]).forEach(function(t){var id=_tgTerritoryId(t);if(id&&!seen.has(id)){seen.add(id);unique.push(t);}});
    var rank={city:0,province:1,country:2};
    unique.sort(function(a,b){return (rank[_tgTerritoryLevel(a)]??9)-(rank[_tgTerritoryLevel(b)]??9);});
    if(!unique.length)return false;
    var picker=document.getElementById('territory-geom-layer-picker'),select=document.getElementById('territory-geom-layer-select');
    var multi=document.getElementById('territory-geom-layer-multi'),confirm=document.getElementById('territory-geom-layer-confirm');
    var cancel=document.getElementById('territory-geom-layer-cancel');
    if(!picker||!multi||!confirm)return false;
    if(select)select.style.display='none';multi.innerHTML='';multi.style.display='block';
    var allRow=document.createElement('label');allRow.className='tg-group-row';allRow.style.gridTemplateColumns='28px minmax(220px,1fr)';
    var all=document.createElement('input');all.type='checkbox';
    var allTitle=document.createElement('strong');allTitle.textContent='전체 선택';allRow.append(all,allTitle);multi.appendChild(allRow);
    unique.forEach(function(t,index){
      var row=document.createElement('label');row.className='tg-group-row';row.style.gridTemplateColumns='28px minmax(220px,1fr)';
      var box=document.createElement('input');box.type='checkbox';box.dataset.index=String(index);
      var title=document.createElement('span');title.textContent='['+_tgTerritoryLevel(t)+'] '+_tgTerritoryName(t)+' · '+_tgTerritoryId(t);
      row.append(box,title);multi.appendChild(row);
    });
    all.addEventListener('change',function(){multi.querySelectorAll('input[data-index]').forEach(function(box){box.checked=all.checked;});});
    multi.addEventListener('change',function(event){
      if(!event.target.matches('input[data-index]'))return;
      var boxes=Array.from(multi.querySelectorAll('input[data-index]'));all.checked=boxes.length>0&&boxes.every(function(box){return box.checked;});
    });
    picker.style.display='flex';confirm.textContent='선택한 경계 맞춤';
    if(cancel){cancel.style.display='';cancel.onclick=function(){_tgHideLayerPicker();_tgPairBtn(true,false);var m=window.mlMap3d;if(m)m.getCanvas().style.cursor='';_tgSetMsg('겹친 경계 대상 선택을 취소했습니다.');};}
    _tgSetMsg('↔ 함께 맞출 대상 영토를 선택하세요. 편집 중인 A 영토는 항상 포함됩니다.','dirty');
    confirm.onclick=function(){
      var chosen=Array.from(multi.querySelectorAll('input[data-index]:checked')).map(function(box){return unique[Number(box.dataset.index)];}).filter(Boolean);
      if(!chosen.length){_tgSetMsg('⚠️ 맞출 대상 영토를 하나 이상 선택하세요.','err');return;}
      _tgHideLayerPicker();confirm.textContent='선택한 영토 편집';onChoose(chosen,focus);
    };
    return true;
  }
  function _tgSaveBtn(show) {
    var btn = document.getElementById('territory-geom-save-btn');
    if (btn) { btn.style.display = show ? '' : 'none'; btn.disabled = false; }
  }
  function _tgEraserBtn(show) {
    var btn=document.getElementById('territory-geom-eraser-btn');
    if (btn) btn.style.display=show?'':'none';
  }
  function _tgAddVertexBtn(show) {
    var btn=document.getElementById('territory-geom-add-vertex-btn');
    if(btn)btn.style.display=show?'':'none';
  }
  function _tgSimplifyBtn(show) {
    var btn=document.getElementById('territory-geom-simplify-btn');
    if(btn){btn.style.display=show?'':'none';btn.disabled=false;}
  }
  function _tgHideBtn(show, hidden) {
    var btn=document.getElementById('territory-geom-hide-btn');
    if(!btn)return;
    btn.style.display=show?'':'none';btn.disabled=false;
    btn.textContent=hidden?'👁️ 영토 숨김 해제':'🙈 영토 숨김';
  }
  function _tgSnapBtn(show) {
    var btn=document.getElementById('territory-geom-snap-btn');
    if(!btn)return;
    btn.style.display=show?'':'none';
    btn.classList.toggle('active',_tgSnapEnabled);
    btn.textContent=_tgSnapEnabled?'🧲 경계 스냅 ON':'🧲 경계 스냅 OFF';
  }
  function _tgPairBtn(show,active) {
    var btn=document.getElementById('territory-geom-pair-btn');if(!btn)return;
    btn.style.display=show?'':'none';btn.classList.toggle('active',!!active);
    btn.textContent=active?'↔ B 대상 선택 중':'↔ A 기준선에 B 경계 맞춤';
  }
  function _tgCoastBtn(show,active){
    var btn=document.getElementById('territory-geom-coast-btn');if(!btn)return;
    btn.style.display=show?'':'none';btn.classList.toggle('active',!!active);
    btn.textContent=active?'🌊 기준 해안선 선택 중':'🌊 기준 해안선에 맞춤';
  }
  function _tgBoundaryBtns(show,selecting){
    var select=document.getElementById('territory-geom-boundary-select-btn'),apply=document.getElementById('territory-geom-boundary-apply-btn');
    if(select){select.style.display=show?'':'none';select.classList.toggle('active',!!selecting);select.textContent=selecting?'🖌 공유구간 선택 중':'🖌 공유구간 선택';}
    if(apply)apply.style.display=show?'':'none';
  }
  function _tgLoadedTerritories() {
    if (Array.isArray(window.territories) && window.territories.length) return window.territories;
    try {
      if (typeof territories !== 'undefined' && Array.isArray(territories)) return territories;
    } catch(e) {}
    return [];
  }

  /* ── 지오메트리 유틸 ──────────────────────────────────────── */
  function _dpSimp(pts, tol) {
    if (pts.length <= 2) return pts;
    var maxD = 0, idx = 0;
    var ax = pts[0][0], ay = pts[0][1];
    var bx = pts[pts.length-1][0], by = pts[pts.length-1][1];
    var dx = bx-ax, dy = by-ay, len = Math.sqrt(dx*dx+dy*dy);
    for (var i = 1; i < pts.length-1; i++) {
      var d = len === 0
        ? Math.sqrt(Math.pow(pts[i][0]-ax,2)+Math.pow(pts[i][1]-ay,2))
        : Math.abs(dy*pts[i][0]-dx*pts[i][1]+bx*ay-by*ax)/len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol) {
      return _dpSimp(pts.slice(0,idx+1),tol).slice(0,-1)
        .concat(_dpSimp(pts.slice(idx),tol));
    }
    return [pts[0], pts[pts.length-1]];
  }
  function _tgSimplify(geom, tol) {
    if (!geom) return geom;
    var sr = function(ring) {
      var s = _dpSimp(ring, tol);
      if (s.length>=2 && (s[0][0]!==s[s.length-1][0]||s[0][1]!==s[s.length-1][1])) s.push(s[0]);
      return s.length>=4 ? s : ring;
    };
    if (geom.type==='Polygon')
      return Object.assign({},geom,{coordinates:geom.coordinates.map(sr)});
    if (geom.type==='MultiPolygon')
      return Object.assign({},geom,{coordinates:geom.coordinates.map(function(p){return p.map(sr);})});
    return geom;
  }
  function _tgCountV(geom) {
    if (!geom||!geom.coordinates) return 0;
    var n=0;
    var w=function(c){Array.isArray(c[0])?c.forEach(w):n++;};
    w(geom.coordinates); return n;
  }
  function _tgBBox(geometry) {
    if (!geometry||!geometry.coordinates) return null;
    var minLat=Infinity,maxLat=-Infinity,minLng=Infinity,maxLng=-Infinity;
    var w=function(c){
      if(!Array.isArray(c)) return;
      if(typeof c[0]==='number'){var lng=c[0],lat=c[1];
        if(lat<minLat)minLat=lat; if(lat>maxLat)maxLat=lat;
        if(lng<minLng)minLng=lng; if(lng>maxLng)maxLng=lng;
      } else {c.forEach(w);}
    };
    w(geometry.coordinates);
    if(![minLat,maxLat,minLng,maxLng].every(Number.isFinite)) return null;
    return {minLat:minLat,maxLat:maxLat,minLng:minLng,maxLng:maxLng};
  }
  function _tgNorm(gj) {
    if (!gj) return null;
    if (gj.type==='Feature') return gj.geometry||null;
    if (gj.type==='FeatureCollection') {
      var gs=(gj.features||[]).map(function(f){return f.geometry;}).filter(Boolean);
      if (!gs.length) return null;
      if (gs.length===1) return gs[0];
      if (gs.every(function(g){return g.type==='Polygon';}))
        return {type:'MultiPolygon',coordinates:gs.map(function(g){return g.coordinates;})};
      return null;
    }
    return gj;
  }
  function _tgPointInRing(lng,lat,ring) {
    var inside=false;
    for(var i=0,j=ring.length-1;i<ring.length;j=i++){
      var xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
      if(((yi>lat)!==(yj>lat))&&(lng<(xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi))inside=!inside;
    }
    return inside;
  }
  function _tgPointInGeometry(lng,lat,geometry) {
    if(!geometry)return false;
    var polygons=geometry.type==='Polygon'?[geometry.coordinates]
      :geometry.type==='MultiPolygon'?geometry.coordinates:[];
    return polygons.some(function(poly){
      if(!poly.length||!_tgPointInRing(lng,lat,poly[0]))return false;
      for(var h=1;h<poly.length;h++)if(_tgPointInRing(lng,lat,poly[h]))return false;
      return true;
    });
  }

  function _tgEnableLayerEditing(layer) {
    if (!layer.pm) return false;
    layer.off('pm:edit',_tgSync);
    layer.off('pm:update',_tgSync);
    layer.off('pm:markerdragend',_tgSync);
    layer.off('pm:vertexremoved',_tgSync);
    layer.pm.enable({
      allowSelfIntersection:true, allowEditing:true, allowRemoval:true,
      allowCutting:false, allowRotation:false, allowDrag:false, snappable:false
    });
    layer.on('pm:edit',_tgSync);
    layer.on('pm:update',_tgSync);
    layer.on('pm:markerdragend',_tgSync);
    layer.on('pm:vertexremoved',_tgSync);
    return true;
  }
  function _tgRenderEditable(geometry) {
    window.territoryEditLayerGroup.clearLayers();
    _tgEditableLayer=L.geoJSON(
      {type:'Feature',properties:{_id:_tgEditId},geometry:geometry},
      {style:{color:'#f5d98b',weight:2.5,fillOpacity:0.18,fillColor:'#d4a843'}}
    ).addTo(window.territoryEditLayerGroup);
    var count=0;
    _tgEditableLayer.eachLayer(function(layer){ if (_tgEnableLayerEditing(layer)) count++; });
    return count;
  }

  function _tg3dRemoveMarkers() {
    _tg3dMarkers.forEach(function(m){try{m.remove();}catch(e){}});
    _tg3dMarkers=[];
  }
  function _tg3dSetGeometry(geometry) {
    var m=window.mlMap3d;if(!m)return;
    [_tgEditedGeometry].concat(_tgPairMembers.map(function(member){return member.geometry;})).filter(Boolean).forEach(function(g){_tgGeometryRings(g).forEach(function(r){if(r.length>2)r[r.length-1]=r[0].slice();});});
    var fc={type:'FeatureCollection',features:[{type:'Feature',properties:{_id:_tgEditId},geometry:geometry}]};
    if(m.getSource('territory-3d-edit'))m.getSource('territory-3d-edit').setData(fc);
    else {
      m.addSource('territory-3d-edit',{type:'geojson',data:fc});
      m.addLayer({id:'territory-3d-edit-fill',type:'fill',source:'territory-3d-edit',paint:{'fill-color':'#d4a843','fill-opacity':.2}});
      m.addLayer({id:'territory-3d-edit-line',type:'line',source:'territory-3d-edit',paint:{'line-color':'#ffe58f','line-width':3,'line-opacity':1}});
    }
    if(_tgPairMembers.length){
      var pair={type:'FeatureCollection',features:_tgPairMembers.map(function(member){return {type:'Feature',properties:{_id:member.id,name:member.name,edit_role:member.id===_tgReferenceBId?'reference-b':'companion'},geometry:member.geometry};})};
      if(m.getSource('territory-3d-pair-edit'))m.getSource('territory-3d-pair-edit').setData(pair);
      else{
        m.addSource('territory-3d-pair-edit',{type:'geojson',data:pair});
        m.addLayer({id:'territory-3d-pair-fill',type:'fill',source:'territory-3d-pair-edit',paint:{'fill-color':['case',['==',['get','edit_role'],'reference-b'],'#35d5d0','#71818a'],'fill-opacity':['case',['==',['get','edit_role'],'reference-b'],.16,.05]}});
        m.addLayer({id:'territory-3d-pair-line',type:'line',source:'territory-3d-pair-edit',paint:{'line-color':['case',['==',['get','edit_role'],'reference-b'],'#00f5ff','#78909c'],'line-width':['case',['==',['get','edit_role'],'reference-b'],4,1.5],'line-opacity':['case',['==',['get','edit_role'],'reference-b'],1,.45]}});
      }
      if(_tgPairSharedLines.length&&m.getSource('territory-3d-shared-line'))m.getSource('territory-3d-shared-line').setData({type:'MultiLineString',coordinates:_tgPairSharedLines});
    }
  }
  function _tgGeometryRings(geometry) {
    if(geometry?.type==='Polygon')return geometry.coordinates||[];
    if(geometry?.type==='MultiPolygon')return (geometry.coordinates||[]).flatMap(function(poly){return poly||[];});
    return [];
  }
  function _tgClearSnapGuides() {
    var m=window.mlMap3d;
    _tgSnapSegments=[];
    if(!m)return;
    if(m.getLayer('territory-3d-snap-guide'))m.removeLayer('territory-3d-snap-guide');
    if(m.getSource('territory-3d-snap-guide'))m.removeSource('territory-3d-snap-guide');
  }
  async function _tgLoadSnapNeighbors(full) {
    var m=window.mlMap3d,bbox=full?.bbox||_tgBBox(full?.geometry);
    _tgClearSnapGuides();
    if(!m||!bbox)return;
    var span=Math.max(bbox.maxLat-bbox.minLat,bbox.maxLng-bbox.minLng);
    var pad=Math.min(.15,Math.max(.04,span*.035));
    var snapTolerance=Math.max(.0005,Math.min(.004,span/1500));
    var current=typeof getCurrentYearMonth==='function'?getCurrentYearMonth():null;
    var searchBox={minLat:bbox.minLat-pad,maxLat:bbox.maxLat+pad,minLng:bbox.minLng-pad,maxLng:bbox.maxLng+pad};
    try{
      var response=await fetch('/api/territories/intersect',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+_tgToken()},
        body:JSON.stringify({
          bbox:searchBox,
          include_geometry:true,
          limit:120,
          exclude_id:String(_tgEditId),
          level:null,
          year:current?.year,
          snap_tolerance:snapTolerance
        })
      });
      if(!response.ok)throw new Error('HTTP '+response.status);
      var data=await response.json();
      (data.territories||[]).forEach(function(t){
        if(!t.geometry&&t.type&&t.coordinates)t.geometry={type:t.type,coordinates:t.coordinates};
      });
      var neighbors=(data.territories||[]).filter(function(t){
        if(_tgDisplayId(t._id)===String(_tgEditId)||!t.geometry)return false;
        if(current){
          var start=t.start_year!=null?Number(t.start_year):-Infinity;
          var end=t.end_year!=null?Number(t.end_year):Infinity;
          if(current.year<start||current.year>end)return false;
        }
        // 행정 단계와 관계없이 실제 접경 여부는 저장 시 geometry로 판정한다.
        return true;
      });
      var features=[];
      neighbors.forEach(function(t){
        var guideLines=[];
        _tgGeometryRings(t.geometry).forEach(function(ring){
          for(var i=0;i<ring.length-1;i++){
            var a=ring[i],b=ring[i+1];
            if(Math.max(a[0],b[0])<searchBox.minLng||Math.min(a[0],b[0])>searchBox.maxLng
              ||Math.max(a[1],b[1])<searchBox.minLat||Math.min(a[1],b[1])>searchBox.maxLat)continue;
            if(_tgSnapSegments.length>=12000)continue;
            _tgSnapSegments.push({a:a,b:b,name:t.name_ko||t.name||_tgDisplayId(t._id)});
            guideLines.push([a,b]);
          }
        });
        if(guideLines.length)features.push({
          type:'Feature',properties:{name:t.name_ko||t.name||'',_id:_tgDisplayId(t._id)},
          geometry:{type:'MultiLineString',coordinates:guideLines}
        });
      });
      if(features.length){
        m.addSource('territory-3d-snap-guide',{type:'geojson',data:{type:'FeatureCollection',features:features}});
        m.addLayer({id:'territory-3d-snap-guide',type:'line',source:'territory-3d-snap-guide',paint:{
          'line-color':'#36f1c5','line-width':1.5,'line-opacity':_tgSnapEnabled ? .72 : 0,'line-dasharray':[3,2]
        }});
      }
      _tgSnapBtn(true);
      // 인접 경계는 드래그 스냅과 저장 시 전파의 참고 데이터로만 쓴다.
      // 편집 진입 시 자동 이동하면 서로 다른 행정 레벨 경계로 꼭지점이
      // 분산되어 긴 대각선이 생길 수 있으므로 원본 geometry는 건드리지 않는다.
      _tgSetMsg('인접 경계 '+neighbors.length+'개 로드 · 원본은 자동 변경하지 않습니다. 이동 시 스냅되고 저장 시 정확한 접경만 동기화됩니다.');
    }catch(error){
      _tgSnapBtn(true);
      _tgSetMsg('⚠️ 인접 경계 스냅 데이터 로드 실패: '+error.message,'err');
    }
  }
  function _tgSnapLngLat(lngLat) {
    var m=window.mlMap3d;
    if(!_tgSnapEnabled||!m||!_tgSnapSegments.length)return null;
    var p=m.project([lngLat.lng,lngLat.lat]),best=null,bestDist=_tgSnapDistancePx;
    _tgSnapSegments.forEach(function(segment){
      var a=m.project(segment.a),b=m.project(segment.b);
      var da=Math.hypot(p.x-a.x,p.y-a.y),db=Math.hypot(p.x-b.x,p.y-b.y);
      // 가까운 이웃 꼭짓점은 선분 투영보다 우선한다.
      if(da<=Math.min(12,bestDist)){bestDist=da;best={coord:segment.a,name:segment.name,kind:'꼭짓점'};}
      if(db<=Math.min(12,bestDist)){bestDist=db;best={coord:segment.b,name:segment.name,kind:'꼭짓점'};}
      var dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
      if(!len2)return;
      var t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len2));
      var q={x:a.x+t*dx,y:a.y+t*dy},distance=Math.hypot(p.x-q.x,p.y-q.y);
      if(distance<bestDist){
        var ll=m.unproject(q);bestDist=distance;best={coord:[ll.lng,ll.lat],name:segment.name,kind:'경계선'};
      }
    });
    return best?{lng:best.coord[0],lat:best.coord[1],name:best.name,kind:best.kind,distance:bestDist}:null;
  }
  function _tgAutoSnapGeometryToNeighbors() {
    if(!_tgSnapEnabled||!_tgEditedGeometry||!_tgSnapSegments.length)return 0;
    var bbox=_tgBBox(_tgEditedGeometry);
    if(!bbox)return 0;
    // 저줌에서 18px가 수십~수백 km가 되지 않도록 좌표 거리에도 상한을 둔다.
    var span=Math.max(bbox.maxLat-bbox.minLat,bbox.maxLng-bbox.minLng);
    var maxGeo=Math.max(.008,Math.min(.08,span*.025));
    var changed=0;
    function same(a,b){return a&&b&&Math.abs(a[0]-b[0])<1e-9&&Math.abs(a[1]-b[1])<1e-9;}
    function snapRing(ring){
      if(!ring||ring.length<4)return;
      for(var i=0;i<ring.length-1;i++){
        var original=ring[i],snap=_tgSnapLngLat({lng:original[0],lat:original[1]});
        if(!snap)continue;
        var geoDist=Math.hypot(snap.lng-original[0],snap.lat-original[1]);
        if(geoDist>maxGeo)continue;
        var candidate=[snap.lng,snap.lat];
        var prev=i>0?ring[i-1]:ring[ring.length-2];
        var next=i<ring.length-2?ring[i+1]:ring[0];
        // 인접 꼭짓점과 합쳐져 링이 망가지는 자동 보정은 건너뛴다.
        if(same(candidate,prev)||same(candidate,next))continue;
        if(!same(candidate,original)){ring[i]=candidate;changed++;}
      }
      ring[ring.length-1]=ring[0].slice();
    }
    _tgGeometryRings(_tgEditedGeometry).forEach(snapRing);
    return changed;
  }
  function _tgToggleSnap() {
    _tgSnapEnabled=!_tgSnapEnabled;
    _tgSnapBtn(true);
    var m=window.mlMap3d;
    if(m?.getLayer('territory-3d-snap-guide'))m.setPaintProperty('territory-3d-snap-guide','line-opacity',_tgSnapEnabled ? .72 : 0);
    _tgSetMsg(_tgSnapEnabled?'🧲 인접 경계 스냅을 켰습니다.':'인접 경계 스냅을 껐습니다.',_tgSnapEnabled?'dirty':'');
  }

  function _tgOuterRingRefs(geometry){
    if(geometry?.type==='Polygon')return geometry.coordinates?.[0]?[{container:geometry.coordinates,index:0,ring:geometry.coordinates[0]}]:[];
    if(geometry?.type==='MultiPolygon')return (geometry.coordinates||[]).filter(function(p){return p&&p[0];}).map(function(p){return {container:p,index:0,ring:p[0]};});
    return [];
  }
  function _tgPointSegmentDistance(point,a,b){
    var dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
    var t=den?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/den)):0;
    var x=a[0]+t*dx,y=a[1]+t*dy;
    return Math.hypot(point[0]-x,point[1]-y);
  }
  function _tgDistanceToRing(point,ring){
    var best=Infinity;
    for(var i=0;i<ring.length-1;i++)best=Math.min(best,_tgPointSegmentDistance(point,ring[i],ring[i+1]));
    return best;
  }
  function _tgLongestNearRun(ring,other,tolerance){
    var open=ring.slice(0,-1),n=open.length;if(n<2)return null;
    var flags=open.map(function(point){return _tgDistanceToRing(point,other)<=tolerance;});
    var bestStart=-1,bestLength=0,start=-1,length=0;
    for(var i=0;i<n*2;i++){
      if(flags[i%n]){if(length===0)start=i;length=Math.min(length+1,n);if(length>bestLength){bestLength=length;bestStart=start%n;}}
      else{start=-1;length=0;}
    }
    return bestLength>=2?{start:bestStart,length:bestLength}:null;
  }
  function _tgFocusedNearRun(ring,other,tolerance,focus){
    if(!focus)return _tgLongestNearRun(ring,other,tolerance);
    var open=ring.slice(0,-1),n=open.length;if(n<2)return null;
    var flags=open.map(function(point){return _tgDistanceToRing(point,other)<=tolerance;}),anchor=-1,best=Infinity;
    open.forEach(function(point,index){
      if(!flags[index])return;
      var distance=Math.hypot(point[0]-focus[0],point[1]-focus[1]);
      if(distance<best){best=distance;anchor=index;}
    });
    if(anchor<0)return null;
    if(flags.every(Boolean))return {start:0,length:n};
    var start=anchor,length=1;
    while(length<n&&flags[(start-1+n)%n]){start=(start-1+n)%n;length++;}
    while(length<n&&flags[(start+length)%n])length++;
    return length>=2?{start:start,length:length}:null;
  }
  function _tgLongestNearLinearRun(line,other,tolerance){
    if(!line||line.length<2)return null;
    var bestStart=-1,bestLength=0,start=-1,length=0;
    line.forEach(function(point,index){
      if(_tgDistanceToRing(point,other)<=tolerance){
        if(length===0)start=index;length++;
        if(length>bestLength){bestLength=length;bestStart=start;}
      }else{start=-1;length=0;}
    });
    return bestLength>=2?{start:bestStart,length:bestLength}:null;
  }
  function _tgFocusedNearLinearRun(line,other,tolerance,focus){
    if(!focus)return _tgLongestNearLinearRun(line,other,tolerance);
    if(!line||line.length<2)return null;
    var flags=line.map(function(point){return _tgDistanceToRing(point,other)<=tolerance;}),anchor=-1,best=Infinity;
    line.forEach(function(point,index){
      if(!flags[index])return;
      var distance=Math.hypot(point[0]-focus[0],point[1]-focus[1]);
      if(distance<best){best=distance;anchor=index;}
    });
    if(anchor<0)return null;
    var start=anchor,end=anchor;
    while(start>0&&flags[start-1])start--;
    while(end<line.length-1&&flags[end+1])end++;
    return end-start+1>=2?{start:start,length:end-start+1}:null;
  }
  function _tgRunPoints(ring,run){
    var open=ring.slice(0,-1),out=[];
    for(var i=0;i<run.length;i++)out.push(open[(run.start+i)%open.length]);
    return out;
  }
  function _tgLineEndpointCost(source,target,reverse){
    if(!source?.length||!target?.length)return Infinity;
    var first=reverse?target[target.length-1]:target[0];
    var last=reverse?target[0]:target[target.length-1];
    return Math.hypot(source[0][0]-first[0],source[0][1]-first[1])+
      Math.hypot(source[source.length-1][0]-last[0],source[source.length-1][1]-last[1]);
  }
  function _tgResampleLine(points,count){
    var lengths=[0];for(var i=1;i<points.length;i++)lengths[i]=lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
    var total=lengths[lengths.length-1];if(!total)return Array.from({length:count},function(){return points[0].slice();});
    var out=[];
    for(var k=0;k<count;k++){
      var target=total*k/(count-1),j=1;while(j<lengths.length-1&&lengths[j]<target)j++;
      var span=lengths[j]-lengths[j-1]||1,t=(target-lengths[j-1])/span;
      out.push([points[j-1][0]+(points[j][0]-points[j-1][0])*t,points[j-1][1]+(points[j][1]-points[j-1][1])*t]);
    }
    return out;
  }
  function _tgReplaceRingRun(ref,run,newPoints){
    var open=ref.ring.slice(0,-1),rotated=open.slice(run.start).concat(open.slice(0,run.start));
    var next=newPoints.concat(rotated.slice(run.length));
    if(next.length<3)return false;
    next.push(next[0].slice());ref.container[ref.index]=next;ref.ring=next;return true;
  }
  function _tgSegmentsCross(a,b,c,d){
    var dx1=b[0]-a[0],dy1=b[1]-a[1],dx2=d[0]-c[0],dy2=d[1]-c[1];
    var den=dx1*dy2-dy1*dx2;if(Math.abs(den)<1e-10)return false;
    var rx=c[0]-a[0],ry=c[1]-a[1];
    var t=(rx*dy2-ry*dx2)/den,u=(rx*dy1-ry*dx1)/den;
    return t>1e-10&&t<1-1e-10&&u>1e-10&&u<1-1e-10;
  }
  function _tgCollectRingCrossings(ring,target){
    var n=(ring||[]).length-1,found=false;if(n<3)return false;
    for(var i=0;i<n;i++)for(var j=i+2;j<n;j++){
      if(i===0&&j===n-1)continue;
      if(!_tgSegmentsCross(ring[i],ring[i+1],ring[j],ring[j+1]))continue;
      found=true;
      if(target){target.add(ring[i]);target.add(ring[i+1]);target.add(ring[j]);target.add(ring[j+1]);}
    }
    return found;
  }
  function _tgRingHasSelfIntersection(ring){return _tgCollectRingCrossings(ring,null);}
  function _tgGeometryHasSelfIntersection(geometry){return !!geometry&&_tgGeometryRings(geometry).some(_tgRingHasSelfIntersection);}
  function _tgRemoveVertexEverywhere(coord){
    var removed=0,blocked=false;
    function removeFromRing(ring){
      for(var i=ring.length-2;i>=0;i--){
        if(ring[i]!==coord)continue;
        if(ring.length<=4){blocked=true;continue;}
        ring.splice(i,1);removed++;
      }
      if(ring.length>2)ring[ring.length-1]=ring[0].slice();
    }
    [_tgEditedGeometry].concat(_tgPairMembers.map(function(member){return member.geometry;})).filter(Boolean).forEach(function(geometry){
      _tgGeometryRings(geometry).forEach(removeFromRing);
    });
    _tgPairSharedLines.forEach(function(line){
      for(var i=line.length-1;i>=0;i--)if(line[i]===coord&&line.length>2)line.splice(i,1);
    });
    if(removed){
      _tg3dSetGeometry(_tgEditedGeometry);_tg3dRefreshMarkers();
      _tgSetMsg('꼭지점 1개를 연결된 '+removed+'개 경계에서 제거했습니다. 경계 저장으로 확정하세요.','dirty');
    }else _tgSetMsg(blocked?'⚠️ 꼭지점 3개만 남은 도형에서는 더 제거할 수 없습니다.':'⚠️ 제거할 꼭지점을 찾지 못했습니다.','err');
  }
  function _tgMakeSharedBoundary(first,second,focus){
    var bboxA=_tgBBox(first),bboxB=_tgBBox(second);if(!bboxA||!bboxB)return null;
    var span=Math.max(bboxA.maxLng-bboxA.minLng,bboxA.maxLat-bboxA.minLat,bboxB.maxLng-bboxB.minLng,bboxB.maxLat-bboxB.minLat);
    // 경계가 완전히 맞닿지 않은 기존 데이터도 다룰 수 있도록 좁은 범위부터
    // 단계적으로 확장한다. 첫 성공 단계에서 멈춰 먼 엉뚱한 경계를 잡지 않는다.
    var baseTolerance=Math.max(.006,Math.min(.18,span*.025));
    var maxTolerance=Math.max(.08,Math.min(.60,span*.10));
    var tolerances=[],candidateTolerance=baseTolerance;
    while(candidateTolerance<maxTolerance){tolerances.push(candidateTolerance);candidateTolerance*=1.8;}
    tolerances.push(maxTolerance);
    var best=null,tolerance=baseTolerance;
    for(var pass=0;pass<tolerances.length&&!best;pass++){
      tolerance=tolerances[pass];
      _tgOuterRingRefs(first).forEach(function(a){_tgOuterRingRefs(second).forEach(function(b){
        var ra=_tgFocusedNearRun(a.ring,b.ring,tolerance,focus),rb=_tgFocusedNearRun(b.ring,a.ring,tolerance,focus);
        if(!ra||!rb)return;
        var pa=_tgRunPoints(a.ring,ra),pb=_tgRunPoints(b.ring,rb);
        var focusDistance=focus?Math.min.apply(null,pa.concat(pb).map(function(point){return Math.hypot(point[0]-focus[0],point[1]-focus[1]);})):0;
        var score=Math.min(ra.length,rb.length);
        if(!best||focusDistance<best.focusDistance-1e-9||(Math.abs(focusDistance-best.focusDistance)<1e-9&&score>best.score))best={a:a,b:b,ra:ra,rb:rb,score:score,focusDistance:focusDistance,tolerance:tolerance};
      });});
    }
    if(!best)return null;
    var pa=_tgRunPoints(best.a.ring,best.ra),pb=_tgRunPoints(best.b.ring,best.rb);
    var reversed=_tgLineEndpointCost(pa,pb,true)<_tgLineEndpointCost(pa,pb,false);
    // A는 사용자가 이미 정리한 기준선이다. 새 중간선을 만들거나 A를 움직이지 않고
    // B의 해당 연속 구간만 A의 실제 좌표열로 교체한다.
    var reference=pa.map(function(point){return point.slice();});
    var originalB=best.b.ring;
    _tgReplaceRingRun(best.b,best.rb,reversed?reference.slice().reverse():reference.slice());
    if(_tgGeometryHasSelfIntersection(second)){
      best.b.container[best.b.index]=originalB;best.b.ring=originalB;return null;
    }
    reference._matchTolerance=best.tolerance;
    return reference;
  }
  function _tgMakeLocalMidBoundary(first,second,clickCoord,pointCount){
    function nearest(geometry,point){
      var best=null;
      _tgOuterRingRefs(geometry).forEach(function(ref){
        var open=ref.ring.slice(0,-1);
        open.forEach(function(coord,index){
          var distance=Math.hypot(coord[0]-point[0],coord[1]-point[1]);
          if(!best||distance<best.distance)best={ref:ref,index:index,distance:distance};
        });
      });
      return best;
    }
    function centered(ref,index,count){
      var n=ref.ring.length-1,length=Math.max(3,Math.min(count,n));
      return {start:(index-Math.floor(length/2)+n)%n,length:length,sparse:true};
    }
    var point=clickCoord||[(_tgBBox(first).minLng+_tgBBox(first).maxLng)/2,(_tgBBox(first).minLat+_tgBBox(first).maxLat)/2];
    var a=nearest(first,point),b=nearest(second,point);if(!a||!b)return null;
    var ra=centered(a.ref,a.index,pointCount||7),rb=centered(b.ref,b.index,pointCount||7);
    var pa=_tgRunPoints(a.ref.ring,ra),pb=_tgRunPoints(b.ref.ring,rb);
    var reversed=_tgLineEndpointCost(pa,pb,true)<_tgLineEndpointCost(pa,pb,false);if(reversed)pb.reverse();
    var count=Math.max(3,Math.min(80,Math.max(pa.length,pb.length))),aa=_tgResampleLine(pa,count),bb=_tgResampleLine(pb,count);
    var mid=aa.map(function(p,index){return [(p[0]+bb[index][0])/2,(p[1]+bb[index][1])/2];});
    _tgReplaceRingRun(a.ref,ra,mid);
    _tgReplaceRingRun(b.ref,rb,reversed?mid.slice().reverse():mid.slice());
    return mid;
  }
  function _tgFitCoastToReference(first,second,clickCoord,pointCount){
    function nearest(geometry,point){
      var best=null;
      _tgOuterRingRefs(geometry).forEach(function(ref){
        ref.ring.slice(0,-1).forEach(function(coord,index){
          var distance=Math.hypot(coord[0]-point[0],coord[1]-point[1]);
          if(!best||distance<best.distance)best={ref:ref,index:index,distance:distance};
        });
      });
      return best;
    }
    function centered(ref,index,count){
      var n=ref.ring.length-1,length=Math.max(3,Math.min(count,n));
      return {start:(index-Math.floor(length/2)+n)%n,length:length};
    }
    var a=nearest(first,clickCoord),b=nearest(second,clickCoord);if(!a||!b)return null;
    var ra=centered(a.ref,a.index,pointCount||15),rb=centered(b.ref,b.index,pointCount||15);
    var pa=_tgRunPoints(a.ref.ring,ra),reference=_tgRunPoints(b.ref.ring,rb);
    var reverse=_tgLineEndpointCost(pa,reference,true)<_tgLineEndpointCost(pa,reference,false);
    var line=reverse?reference.slice().reverse():reference.slice();
    _tgReplaceRingRun(a.ref,ra,line);
    return line;
  }
  function _tgFitCoastRangeToReference(first,second,startPoint,endPoint){
    function nearestRing(geometry){
      var best=null;
      _tgOuterRingRefs(geometry).forEach(function(ref){
        var open=ref.ring.slice(0,-1),si=0,ei=0,sd=Infinity,ed=Infinity;
        open.forEach(function(coord,index){
          var a=Math.hypot(coord[0]-startPoint[0],coord[1]-startPoint[1]);if(a<sd){sd=a;si=index;}
          var b=Math.hypot(coord[0]-endPoint[0],coord[1]-endPoint[1]);if(b<ed){ed=b;ei=index;}
        });
        if(si===ei)return;
        var score=sd+ed;if(!best||score<best.score)best={ref:ref,si:si,ei:ei,score:score};
      });
      return best;
    }
    function arcs(found){
      var n=found.ref.ring.length-1;
      function make(start,end){var length=((end-start+n)%n)+1,run={start:start,length:length};return {run:run,points:_tgRunPoints(found.ref.ring,run)};}
      return [make(found.si,found.ei),make(found.ei,found.si)];
    }
    function shapeScore(a,b,reverse){
      var oriented=reverse?b.slice().reverse():b,count=Math.max(8,Math.min(96,Math.max(a.length,oriented.length)));
      var aa=_tgResampleLine(a,count),bb=_tgResampleLine(oriented,count),sum=0;
      for(var i=0;i<count;i++)sum+=Math.hypot(aa[i][0]-bb[i][0],aa[i][1]-bb[i][1]);
      return sum/count;
    }
    var aFound=nearestRing(first),bFound=nearestRing(second);if(!aFound||!bFound)return null;
    var candidates=[];
    arcs(aFound).forEach(function(a){arcs(bFound).forEach(function(b){
      [false,true].forEach(function(reverse){candidates.push({a:a,b:b,reverse:reverse,score:shapeScore(a.points,b.points,reverse)});});
    });});
    candidates.sort(function(x,y){return x.score-y.score;});
    var best=candidates[0];if(!best)return null;
    var line=best.reverse?best.b.points.slice().reverse():best.b.points.slice();
    _tgReplaceRingRun(aFound.ref,best.a.run,line);
    return line;
  }
  function _tgFitFirstToSecond(first,second,preserveSecond){
    var bboxA=_tgBBox(first),bboxB=_tgBBox(second);if(!bboxA||!bboxB)return null;
    var span=Math.max(bboxA.maxLng-bboxA.minLng,bboxA.maxLat-bboxA.minLat,bboxB.maxLng-bboxB.minLng,bboxB.maxLat-bboxB.minLat);
    var tolerance=Math.max(.0005,Math.min(.012,span*.004)),candidates=[];
    _tgOuterRingRefs(first).forEach(function(a){_tgOuterRingRefs(second).forEach(function(b){
      var ra=_tgLongestNearRun(a.ring,b.ring,tolerance),rb=_tgLongestNearRun(b.ring,a.ring,tolerance);
      if(ra&&rb&&!(preserveSecond&&(ra.sparse||rb.sparse))){
        var pa=_tgRunPoints(a.ring,ra),pb=_tgRunPoints(b.ring,rb);
        var endpointCost=Math.min(_tgLineEndpointCost(pa,pb,false),_tgLineEndpointCost(pa,pb,true));
        // 자동 인접 전파는 양 끝도 실제로 가까운 연속 경계만 허용한다.
        // 이 제한이 없으면 링 중간이 먼 꼭지점과 직선으로 폐합될 수 있다.
        if(!preserveSecond||endpointCost<=tolerance*4)candidates.push({a:a,b:b,ra:ra,rb:rb,score:Math.min(ra.length,rb.length),sparse:!!(ra.sparse||rb.sparse),endpointCost:endpointCost});
      }
    });});
    // MultiPolygon은 서로 가까운 링 후보가 여럿이다. 첫 후보가 자기교차를
    // 만들더라도 실제 접경 링까지 계속 시도한다. 충분한 연속 구간을 우선한다.
    candidates.sort(function(x,y){return Number(x.sparse)-Number(y.sparse)||x.endpointCost-y.endpointCost||y.score-x.score;});
    for(var i=0;i<candidates.length;i++){
      var best=candidates[i],pointsA=_tgRunPoints(best.a.ring,best.ra),referenceB=_tgRunPoints(best.b.ring,best.rb);
      var reverse=_tgLineEndpointCost(pointsA,referenceB,true)<_tgLineEndpointCost(pointsA,referenceB,false);
      var originalRing=best.a.ring;
      var orientedB=reverse?referenceB.slice().reverse():referenceB.slice();
      _tgReplaceRingRun(best.a,best.ra,orientedB);
      if(!_tgGeometryHasSelfIntersection(first))return referenceB;
      best.a.container[best.a.index]=originalRing;best.a.ring=originalRing;

      // 방향에 따라 A만 교체할 때 접합부에서 자기교차가 생길 수 있다.
      // 이때 양 끝은 A의 안전한 접합점을 쓰고, B도 동일 좌표열로 맞춰
      // 두 도형의 공유 경계를 정확히 하나로 유지한다.
      if(!preserveSecond&&pointsA.length>1&&orientedB.length>1){
        var originalBRing=best.b.ring;
        var safeLine=orientedB.map(function(point){return point.slice();});
        safeLine[0]=pointsA[0].slice();safeLine[safeLine.length-1]=pointsA[pointsA.length-1].slice();
        _tgReplaceRingRun(best.a,best.ra,safeLine);
        _tgReplaceRingRun(best.b,best.rb,reverse?safeLine.slice().reverse():safeLine.slice());
        if(!_tgGeometryHasSelfIntersection(first)&&!_tgGeometryHasSelfIntersection(second))return safeLine;
        best.a.container[best.a.index]=originalRing;best.a.ring=originalRing;
        best.b.container[best.b.index]=originalBRing;best.b.ring=originalBRing;
      }
    }
    return null;
  }
  function _tgAttachToSharedLines(geometry,sharedLines,focus){
    var bbox=_tgBBox(geometry);if(!bbox)return null;
    var span=Math.max(bbox.maxLng-bbox.minLng,bbox.maxLat-bbox.minLat),tolerance=Math.max(.006,Math.min(.18,span*.025)),best=null;
    _tgOuterRingRefs(geometry).forEach(function(ref){(sharedLines||[]).forEach(function(line){
      var run=_tgFocusedNearRun(ref.ring,line,tolerance,focus),lineRun=_tgFocusedNearLinearRun(line,ref.ring,tolerance,focus);
      if(!run||!lineRun)return;
      var segment=line.slice(lineRun.start,lineRun.start+lineRun.length);
      var focusDistance=focus?Math.min.apply(null,segment.map(function(point){return Math.hypot(point[0]-focus[0],point[1]-focus[1]);})):0;
      var score=Math.min(run.length,lineRun.length);
      if(!best||focusDistance<best.focusDistance-1e-9||(Math.abs(focusDistance-best.focusDistance)<1e-9&&score>best.score))best={ref:ref,run:run,line:line,lineRun:lineRun,score:score,focusDistance:focusDistance};
    });});
    if(!best)return null;
    var nativePoints=_tgRunPoints(best.ref.ring,best.run);
    // 큰 행정구역에는 첫 공유선 전체가 아니라 실제로 맞닿는 연속 부분만 쓴다.
    var segment=best.line.slice(best.lineRun.start,best.lineRun.start+best.lineRun.length);
    var reverse=_tgLineEndpointCost(nativePoints,segment,true)<_tgLineEndpointCost(nativePoints,segment,false);
    var originalRing=best.ref.ring;
    _tgReplaceRingRun(best.ref,best.run,reverse?segment.slice().reverse():segment.slice());
    if(_tgGeometryHasSelfIntersection(geometry)){best.ref.container[best.ref.index]=originalRing;best.ref.ring=originalRing;return null;}
    return best.line;
  }
  function _tgClearPair(){
    var m=window.mlMap3d;
    if(m&&_tgPairClickHandler){m.off('click',_tgPairClickHandler);_tgPairClickHandler=null;}
    if(m){['territory-3d-shared-line','territory-3d-pair-fill','territory-3d-pair-line'].forEach(function(id){if(m.getLayer(id))m.removeLayer(id);});['territory-3d-shared-line','territory-3d-pair-edit'].forEach(function(id){if(m.getSource(id))m.removeSource(id);});}
    _tgPairId=null;_tgPairGeometry=null;_tgPairOriginal=null;_tgPairSharedLines=[];_tgPairMembers=[];_tgPairBtn(false,false);
  }
  async function _tgPreparePair(hits,focus){
    try{
      var unique=[],seen=new Set([String(_tgEditId)]);
      (hits||[]).forEach(function(hit){var id=_tgTerritoryId(hit);if(id&&!seen.has(id)){seen.add(id);unique.push({id:id,name:_tgTerritoryName(hit)});}});
      if(!unique.length)throw new Error('겹친 다른 영토를 찾지 못했습니다.');
      var loaded=await Promise.all(unique.map(async function(item){var full=await _tgFetch(item.id);return {id:_tgDisplayId(full._id||item.id),name:item.name,full:full};}));
      _tgPairMembers=[];_tgPairSharedLines=[];_tgBoundarySelected=new Map();
      var baseA=JSON.parse(JSON.stringify(_tgEditedGeometry)),trials=[];
      loaded.forEach(function(item){
        var geom=item.full.geometry||(item.full.geojson&&item.full.geojson.geometry);if(!geom)return;
        var candidateA=JSON.parse(JSON.stringify(baseA)),candidateB=JSON.parse(JSON.stringify(geom));
        var shared=_tgMakeSharedBoundary(candidateA,candidateB,focus);if(!shared)return;
        if(_tgGeometryHasSelfIntersection(candidateA)||_tgGeometryHasSelfIntersection(candidateB))return;
        var length=0;for(var i=1;i<shared.length;i++)length+=Math.hypot(shared[i][0]-shared[i-1][0],shared[i][1]-shared[i-1][1]);
        trials.push({item:item,a:candidateA,b:candidateB,shared:shared,length:length,original:JSON.parse(JSON.stringify(geom))});
      });
      var first=trials[0];
      if(!first)throw new Error('서로 가까운 연속 경계를 찾지 못했습니다. 더 가까운 경계 지점을 선택하세요.');
      _tgEditedGeometry=first.a;_tgReferenceBId=first.item.id;
      _tgPairSharedLines=[first.shared];
      _tgPairMembers=[{id:first.item.id,name:first.item.name,original:first.original,geometry:first.b}];
      // 편집 중인 A의 기준 좌표열을 유지하고, 선택한 모든 B 행정구역의
      // 같은 끝선만 그 좌표열에 연결한다.
      loaded.forEach(function(item){
        if(item.id===first.item.id)return;
        var geom=item.full.geometry||(item.full.geojson&&item.full.geojson.geometry);if(!geom)return;
        var member={id:item.id,name:item.name,original:JSON.parse(JSON.stringify(geom)),geometry:JSON.parse(JSON.stringify(geom))};
        var shared=_tgAttachToSharedLines(member.geometry,_tgPairSharedLines,focus);
        if(shared)_tgPairMembers.push(member);
      });
      _tgPairId=_tgPairMembers[0].id;_tgPairGeometry=_tgPairMembers[0].geometry;_tgPairOriginal=_tgPairMembers[0].original;
      var m=window.mlMap3d;_tg3dSetGeometry(_tgEditedGeometry);
      m.addSource('territory-3d-shared-line',{type:'geojson',data:{type:'MultiLineString',coordinates:_tgPairSharedLines}});
      m.addLayer({id:'territory-3d-shared-line',type:'line',source:'territory-3d-shared-line',paint:{'line-color':'#ff56d8','line-width':7,'line-opacity':1}});
      _tg3dRefreshMarkers();_tgPairBtn(true,false);m.getCanvas().style.cursor='';
      var gapText=Number(first.shared._matchTolerance)>0?' · 인식 허용 간격 약 '+Math.round(first.shared._matchTolerance*111)+'km':'';
      _tgSetMsg('↔ A 기준선은 유지하고 선택한 B 영토 '+_tgPairMembers.length+'개의 경계를 같은 좌표열로 맞췄습니다.'+gapText,'dirty');
    }catch(error){_tgClearPair();_tgPairBtn(true,false);_tgSetMsg('❌ 공유 경계 맞춤 실패: '+error.message,'err');}
  }
  function _tgStartPairSelect(){
    var m=window.mlMap3d;if(!m||!_tgEditId||!_tgEditedGeometry)return;
    if(_tgPairClickHandler){_tgClearPair();_tgPairBtn(true,false);_tgSetMsg('공유 경계 선택을 취소했습니다.');return;}
    if(_tgPairMembers.length)_tgClearPair();
    _tgPairBtn(true,true);m.getCanvas().style.cursor='crosshair';_tgSetMsg('↔ A에서 기준으로 삼을 경계 지점을 클릭하세요. 이어서 맞출 B 영토를 선택합니다.','dirty');
    _tgPairClickHandler=function(e){
      var ids=['territory-fill-city','territory-fill-province','territory-fill-country'].filter(function(x){return !!m.getLayer(x);});
      var hits=(ids.length?m.queryRenderedFeatures(e.point,{layers:ids}):[]).filter(function(f){return _tgTerritoryId(f)&&_tgTerritoryId(f)!==String(_tgEditId);});
      if(!hits.length){_tgSetMsg('⚠️ 이 위치에 선택 가능한 다른 영토가 없습니다.','err');return;}
      m.off('click',_tgPairClickHandler);_tgPairClickHandler=null;m.getCanvas().style.cursor='';
      var focus=[e.lngLat.lng,e.lngLat.lat];
      if(!_tgChoosePairTargets(hits,focus,function(chosen,point){_tgPreparePair(chosen,point);})){
        _tgPairBtn(true,false);_tgSetMsg('⚠️ 이 위치에 선택 가능한 다른 영토가 없습니다.','err');
      }
    };m.on('click',_tgPairClickHandler);
  }
  function _tgClearCoastGuide(){
    var m=window.mlMap3d;
    if(m&&_tgCoastClickHandler){m.off('click',_tgCoastClickHandler);_tgCoastClickHandler=null;}
    if(m?.getLayer('territory-3d-coast-endpoints'))m.removeLayer('territory-3d-coast-endpoints');
    if(m?.getLayer('territory-3d-coast-guide'))m.removeLayer('territory-3d-coast-guide');
    if(m?.getSource('territory-3d-coast-endpoints'))m.removeSource('territory-3d-coast-endpoints');
    if(m?.getSource('territory-3d-coast-guide'))m.removeSource('territory-3d-coast-guide');
    _tgCoastGuideLine=null;_tgCoastSelection=null;_tgCoastBtn(!!_tgEditMode,false);
  }
  function _tgStartCoastFit(){
    var m=window.mlMap3d;if(!m||!_tgEditMode||!_tgEditedGeometry)return;
    if(_tgCoastClickHandler){_tgClearCoastGuide();_tgSetMsg('해안선 기준 선택을 취소했습니다.');return;}
    _tgCoastBtn(true,true);m.getCanvas().style.cursor='crosshair';
    _tgCoastSelection=null;
    _tgSetMsg('🌊 기준 해안선 구간의 시작 지점을 클릭하고 기준 국가·도·시 폴리곤을 선택하세요.','dirty');
    _tgCoastClickHandler=function(e){
      if(_tgCoastSelection){
        var selection=_tgCoastSelection,end=[e.lngLat.lng,e.lngLat.lat];
        m.off('click',_tgCoastClickHandler);_tgCoastClickHandler=null;m.getCanvas().style.cursor='';
        try{
          var candidate=JSON.parse(JSON.stringify(_tgEditedGeometry));
          var line=_tgFitCoastRangeToReference(candidate,selection.geometry,selection.start,end);
          if(!line)throw new Error('두 지점 사이의 대응 해안 경로를 찾지 못했습니다.');
          if(_tgGeometryHasSelfIntersection(candidate))throw new Error('적용 결과에 자기교차가 발생합니다. 시작·끝 범위를 줄여주세요.');
          _tgEditedGeometry=candidate;_tgCoastGuideLine=line;_tg3dSetGeometry(candidate);_tg3dRefreshMarkers();
          if(m.getLayer('territory-3d-coast-guide'))m.removeLayer('territory-3d-coast-guide');
          if(m.getSource('territory-3d-coast-guide'))m.removeSource('territory-3d-coast-guide');
          m.addSource('territory-3d-coast-guide',{type:'geojson',data:{type:'LineString',coordinates:line}});
          m.addLayer({id:'territory-3d-coast-guide',type:'line',source:'territory-3d-coast-guide',paint:{'line-color':'#39bfff','line-width':7,'line-opacity':1}});
          if(m.getSource('territory-3d-coast-endpoints'))m.getSource('territory-3d-coast-endpoints').setData({type:'MultiPoint',coordinates:[selection.start,end]});
          _tgCoastBtn(true,false);_tgSetMsg('✅ '+selection.name+' 기준 해안선의 시작~끝 사이 '+line.length+'개 점을 모두 A에 동기화했습니다.','dirty');
        }catch(error){_tgCoastBtn(true,false);_tgSetMsg('❌ 해안선 맞춤 실패: '+error.message,'err');}
        return;
      }
      var ids=['territory-fill-city','territory-fill-province','territory-fill-country'].filter(function(id){return !!m.getLayer(id);});
      var radius=10,box=[[e.point.x-radius,e.point.y-radius],[e.point.x+radius,e.point.y+radius]];
      var hits=(ids.length?m.queryRenderedFeatures(box,{layers:ids}):[]).filter(function(feature){return _tgTerritoryId(feature)&&_tgTerritoryId(feature)!==String(_tgEditId);});
      if(!hits.length){_tgSetMsg('⚠️ 이 해안 지점에서 기준 폴리곤을 찾지 못했습니다.','err');return;}
      _tgChooseTerritory(hits,async function(referenceFeature){
        try{
          var referenceId=_tgTerritoryId(referenceFeature),full=await _tgFetch(referenceId);
          var reference=full.geometry||(full.geojson&&full.geojson.geometry);if(!reference)throw new Error('기준 geometry가 없습니다.');
          _tgCoastSelection={referenceId:referenceId,geometry:reference,start:[e.lngLat.lng,e.lngLat.lat],name:_tgTerritoryName(referenceFeature)||referenceId};
          if(m.getLayer('territory-3d-coast-endpoints'))m.removeLayer('territory-3d-coast-endpoints');
          if(m.getSource('territory-3d-coast-endpoints'))m.removeSource('territory-3d-coast-endpoints');
          m.addSource('territory-3d-coast-endpoints',{type:'geojson',data:{type:'MultiPoint',coordinates:[_tgCoastSelection.start]}});
          m.addLayer({id:'territory-3d-coast-endpoints',type:'circle',source:'territory-3d-coast-endpoints',paint:{'circle-radius':8,'circle-color':'#39bfff','circle-stroke-width':3,'circle-stroke-color':'#fff'}});
          _tgSetMsg('🌊 시작점 지정됨 · 같은 해안선을 따라 끝 지점을 클릭하세요. 사이의 모든 기준 점을 사용합니다.','dirty');
        }catch(error){_tgClearCoastGuide();_tgSetMsg('❌ 기준 해안선 불러오기 실패: '+error.message,'err');}
      });
    };m.on('click',_tgCoastClickHandler);
  }
  function _tgGroupItems(){return [{id:String(_tgEditId),name:'A',geometry:_tgEditedGeometry}].concat(_tgPairMembers);}
  function _tgRunFromSelection(ring,selected){
    var open=ring.slice(0,-1),n=open.length,best=null,start=-1,len=0;
    for(var i=0;i<n*2;i++){if(selected?.has(open[i%n])){if(!len)start=i;len=Math.min(n,len+1);if(!best||len>best.length)best={start:start%n,length:len};}else{start=-1;len=0;}}
    return best&&best.length>=2?best:null;
  }
  function _tgToggleBoundarySelect(){
    if(!_tgPairMembers.length)return;
    _tgBoundarySelectMode=!_tgBoundarySelectMode;_tgBoundaryBtns(true,_tgBoundarySelectMode);
    var m=window.mlMap3d;if(m){m.getCanvas().style.cursor=_tgBoundarySelectMode?'crosshair':'';if(!_tgBoundarySelectMode)m.dragPan.enable();}
    _tg3dRefreshMarkers();_tgSetMsg(_tgBoundarySelectMode?'경계를 따라 클릭·드래그하세요. 여러 번 선택할 수 있습니다.':'공유구간 선택을 잠시 중지했습니다.','dirty');
  }
  function _tgApplyBoundarySelection(){
    var reference=_tgPairMembers.find(function(member){return member.id===_tgReferenceBId;});if(!reference)return;
    var selectedB=_tgBoundarySelected.get(reference.id),bestB=null;
    _tgOuterRingRefs(reference.geometry).forEach(function(ref){var run=_tgRunFromSelection(ref.ring,selectedB);if(run&&(!bestB||run.length>bestB.run.length))bestB={ref:ref,run:run};});
    if(!bestB){_tgSetMsg('❌ 기준 B에서 연속된 꼭지점을 2개 이상 선택하세요.','err');return;}
    var selectedA=_tgBoundarySelected.get(String(_tgEditId)),hasASelection=_tgOuterRingRefs(_tgEditedGeometry).some(function(ref){return !!_tgRunFromSelection(ref.ring,selectedA);});
    if(!hasASelection){_tgSetMsg('❌ A에서도 연속된 꼭지점을 2개 이상 선택하세요.','err');return;}
    var rawLine=_tgRunPoints(bestB.ref.ring,bestB.run),m=window.mlMap3d;
    var center=m?m.project(rawLine[Math.floor(rawLine.length/2)]):null,tolerance=.0001;
    if(m&&center){var p0=m.unproject(center),p1=m.unproject({x:center.x+1.5,y:center.y});tolerance=Math.max(.000001,Math.hypot(p1.lng-p0.lng,p1.lat-p0.lat));}
    var line=_dpSimp(rawLine,tolerance),limit=240;
    while(line.length>limit){tolerance*=1.5;line=_dpSimp(rawLine,tolerance);}
    var originalBRing=bestB.ref.ring;_tgReplaceRingRun(bestB.ref,bestB.run,line);
    var linkedIds=new Set([reference.id]),failedA=false;
    _tgGroupItems().forEach(function(item){if(item.id===reference.id||failedA)return;var selected=_tgBoundarySelected.get(item.id),best=null;
      _tgOuterRingRefs(item.geometry).forEach(function(ref){var run=_tgRunFromSelection(ref.ring,selected);if(run&&(!best||run.length>best.run.length))best={ref:ref,run:run};});
      if(!best)return;var points=_tgRunPoints(best.ref.ring,best.run),reverse=Math.hypot(points[0][0]-line[line.length-1][0],points[0][1]-line[line.length-1][1])<Math.hypot(points[0][0]-line[0][0],points[0][1]-line[0][1]);
      var original=best.ref.ring;_tgReplaceRingRun(best.ref,best.run,reverse?line.slice().reverse():line.slice());
      if(_tgGeometryHasSelfIntersection(item.geometry)){best.ref.container[best.ref.index]=original;best.ref.ring=original;if(item.id===String(_tgEditId))failedA=true;}else linkedIds.add(item.id);
    });
    if(failedA){bestB.ref.container[bestB.ref.index]=originalBRing;bestB.ref.ring=originalBRing;_tgSetMsg('❌ 선택한 A 구간을 B에 연결하면 자기교차가 생깁니다. A 선택 범위를 다시 지정하세요.','err');return;}
    _tgPairMembers=_tgPairMembers.filter(function(member){return linkedIds.has(member.id);});
    _tgPairId=_tgPairMembers[0]?.id||null;_tgPairGeometry=_tgPairMembers[0]?.geometry||null;
    _tgPairSharedLines=[line];_tgBoundarySelectMode=false;_tgBoundaryBtns(true,false);
    if(m){if(m.getSource('territory-3d-shared-line'))m.getSource('territory-3d-shared-line').setData({type:'MultiLineString',coordinates:[line]});else{m.addSource('territory-3d-shared-line',{type:'geojson',data:{type:'MultiLineString',coordinates:[line]}});m.addLayer({id:'territory-3d-shared-line',type:'line',source:'territory-3d-shared-line',paint:{'line-color':'#00f5ff','line-width':8,'line-opacity':1}});}m.dragPan.enable();m.getCanvas().style.cursor='';}
    _tg3dSetGeometry(_tgEditedGeometry);_tg3dRefreshMarkers();_tgSetMsg('✅ B 기존 꼭지점 '+rawLine.length+'개 → 제어점 '+line.length+'개 · 연결 영토 '+linkedIds.size+'개','dirty');
  }
  function _tgBindBoundaryBrush(){
    var m=window.mlMap3d;if(!m||m._tgBoundaryBrushBound)return;m._tgBoundaryBrushBound=true;
    m.on('mousedown',function(e){if(!_tgBoundarySelectMode||e.originalEvent.button!==0)return;e.preventDefault();_tgBoundarySelecting=true;_tgBoundaryStroke=[e.point];m.dragPan.disable();});
    m.on('mousemove',function(e){if(!_tgBoundarySelecting)return;var last=_tgBoundaryStroke[_tgBoundaryStroke.length-1];if(Math.hypot(last.x-e.point.x,last.y-e.point.y)>3)_tgBoundaryStroke.push(e.point);});
    document.addEventListener('mouseup',function(){if(!_tgBoundarySelecting)return;_tgBoundarySelecting=false;
      function distance(p,a,b){var dx=b.x-a.x,dy=b.y-a.y,t=(dx||dy)?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy))):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
      _tgGroupItems().forEach(function(item){var set=_tgBoundarySelected.get(item.id)||new Set();_tgGeometryRings(item.geometry).forEach(function(ring){ring.slice(0,-1).forEach(function(coord){var p=m.project(coord);var hit=_tgBoundaryStroke.length===1?Math.hypot(p.x-_tgBoundaryStroke[0].x,p.y-_tgBoundaryStroke[0].y)<=18:_tgBoundaryStroke.some(function(s,i){return i>0&&distance(p,_tgBoundaryStroke[i-1],s)<=18;});if(hit)set.add(coord);});});_tgBoundarySelected.set(item.id,set);});
      _tgBoundaryStroke=[];m.dragPan.disable();_tg3dRefreshMarkers();var total=0;_tgBoundarySelected.forEach(function(s){total+=s.size;});_tgSetMsg('선택 꼭지점 '+total+'개 · 더 드래그하거나 선택구간 확정을 누르세요.','dirty');
    });
  }
  function _tgCrossingVertices(geometries){
    var crossing=new Set();
    (geometries||[_tgEditedGeometry].concat(_tgPairMembers.map(function(member){return member.geometry;}))).filter(Boolean).forEach(function(geometry){
      _tgGeometryRings(geometry).forEach(function(ring){_tgCollectRingCrossings(ring,crossing);});
    });
    return crossing;
  }
  function _tg3dRefreshMarkers(crossingOverride) {
    var m=window.mlMap3d;if(!m||!window.maplibregl)return;
    _tg3dRemoveMarkers();
    var crossingVertices=crossingOverride||_tgCrossingVertices();
    var renderedCoords=new Set();
    function addRing(ring,onlyCrossing,sharedLine){
      var coordinates=sharedLine||((ring||[]).slice(0,-1));
      // 전체 외곽선은 레이어로 계속 보이되, 저배율에서 수백 개의 조작점이
      // 화면을 덮지 않게 표시 밀도만 줄인다. 확대할수록 원본 꼭지점이 나타난다.
      var zoom=m.getZoom(),limit=zoom<5.5?70:zoom<6.5?120:zoom<7.5?220:Infinity;
      var step=sharedLine||coordinates.length<=limit?1:Math.max(1,Math.ceil(coordinates.length/limit));
      coordinates.forEach(function(coord,index){
        var crossing=crossingVertices.has(coord);
        if(!sharedLine&&!crossing&&step>1&&index%step!==0&&index!==coordinates.length-1)return;
        if((onlyCrossing&&!crossing)||renderedCoords.has(coord))return;
        renderedCoords.add(coord);
        var el=document.createElement('div');
        el.style.cssText='width:'+(crossing?'16':sharedLine?'11':'12')+'px;height:'+(crossing?'16':sharedLine?'11':'12')+'px;border-radius:50%;background:'+(crossing?'#ff2d2d':sharedLine?'#ff56d8':'#fff')+';border:'+(crossing?'3px solid #fff':'2px solid '+(sharedLine?'#6f175d':'#3288ff'))+';box-sizing:border-box;box-shadow:'+(crossing?'0 0 0 3px rgba(255,45,45,.45),0 1px 5px #000':sharedLine?'0 0 0 2px rgba(255,86,216,.2),0 1px 3px #000':'0 1px 3px #000')+';cursor:'+
          (_tgEraserMode?'crosshair':'grab')+';pointer-events:'+(_tgEraserMode?'none':'auto');
        if(crossing)el.title='자기교차 선분의 꼭지점';
        el.addEventListener('contextmenu',function(event){
          event.preventDefault();event.stopPropagation();
          if(_tgEraserMode||_tgBoundarySelectMode)return;
          _tgRemoveVertexEverywhere(coord);
        });
        if(_tgBoundarySelectMode&&!_tgPairSharedLines.length)el.addEventListener('click',function(event){event.stopPropagation();_tgBoundarySelected.forEach(function(set){set.delete(coord);});_tg3dRefreshMarkers();});
        var marker=new maplibregl.Marker({element:el,draggable:!_tgEraserMode&&!_tgBoundarySelectMode}).setLngLat(coord).addTo(m);
        if(!_tgEraserMode&&!_tgBoundarySelectMode)marker.on('dragend',function(){
          var ll=marker.getLngLat(),snapped=_tgSnapLngLat(ll);
          if(snapped){ll=snapped;marker.setLngLat([ll.lng,ll.lat]);}
          coord[0]=ll.lng;coord[1]=ll.lat;
          if(ring)ring[ring.length-1]=ring[0].slice();
          _tg3dSetGeometry(_tgEditedGeometry);
          _tg3dRefreshMarkers();
          _tgSetMsg(snapped
            ? '🧲 '+snapped.name+'의 '+snapped.kind+'에 맞물림 · 경계 저장으로 확정하세요.'
            : '꼭짓점 이동됨 · 경계 저장을 눌러 확정하세요.','dirty');
        });
        marker._tgCoord=coord;marker._tgRing=ring||null;_tg3dMarkers.push(marker);
      });
    }
    if(_tgPairMembers.length&&!_tgPairSharedLines.length){
      // A는 기존 노란 편집선으로 유지하고, 선택한 B들의 원본 꼭지점만
      // 표시한다. A/B 좌표 객체를 공유하지 않아 각 경계를 따로 움직인다.
      _tgPairMembers.forEach(function(member){
        _tgGeometryRings(member.geometry).forEach(function(ring){addRing(ring,false);});
      });
    }else if(_tgPairSharedLines.length){
      // A/B 전체의 흰 꼭지점은 숨기고, B에서 가져온 공유 경계의 청록
      // 기준점만 표시해 어느 좌표를 조정하는지 명확하게 한다.
      _tgPairSharedLines.forEach(function(line){addRing(null,false,line);});
    }else{
      if(_tgEditedGeometry.type==='Polygon')_tgEditedGeometry.coordinates.forEach(function(ring){addRing(ring,false);});
      else if(_tgEditedGeometry.type==='MultiPolygon')_tgEditedGeometry.coordinates.forEach(function(p){p.forEach(function(ring){addRing(ring,false);});});
    }
  }
  function _tg3dClear() {
    var m=window.mlMap3d;
    _tgClearPair();
    _tgClearCoastGuide();
    _tg3dRemoveMarkers();
    _tgClearSnapGuides();
    if(m&&_tg3dClickHandler){m.off('click',_tg3dClickHandler);_tg3dClickHandler=null;}
    if(m){
      ['territory-3d-edit-fill','territory-3d-edit-line'].forEach(function(id){if(m.getLayer(id))m.removeLayer(id);});
      if(m.getSource('territory-3d-edit'))m.removeSource('territory-3d-edit');
      m.getCanvas().style.cursor='';m.dragPan.enable();
    }
    _tg3dSelecting=false;_tg3dEraseDown=false;_tg3dErasePoints=[];_tg3dAddMode=false;
    _tgAOverlapCandidates=[];
    _tgReferenceBId=null;_tgBoundarySelectMode=false;_tgBoundarySelected=new Map();_tgBoundaryStroke=[];_tgBoundarySelecting=false;_tgBoundaryBtns(false,false);
    var addBtn=document.getElementById('territory-geom-add-vertex-btn');
    if(addBtn){addBtn.classList.remove('active');addBtn.textContent='➕ 꼭짓점 추가';}
    _tgAddVertexBtn(false);
    _tgSimplifyBtn(false);
    _tgSnapBtn(false);
    _tgPairBtn(false,false);
    _tgCoastBtn(false,false);
    _tgHideBtn(false,false);
  }
  async function _tgOpen3dEdit(id,name,overlapHits) {
    try{
      var m=window.mlMap3d;
      var displayId=_tgDisplayId(id);
      _tgHideLayerPicker();_tg3dSelecting=false;if(_tg3dClickHandler){m.off('click',_tg3dClickHandler);_tg3dClickHandler=null;}
      _tgEditMode=true;_tgEditId=displayId;_tgSetTitle('🧭 '+(name||displayId)+' 3D 경계 편집 · Object ID: '+displayId);_tgSetMsg('geometry 불러오는 중...');
      var full=await _tgFetch(id);var geom=full.geometry||(full.geojson&&full.geojson.geometry);
      if(!geom)throw new Error('편집할 geometry가 없습니다.');
      displayId=_tgDisplayId(full._id||full.id||displayId);_tgEditId=displayId;
      _tgAOverlapCandidates=(overlapHits||[]).filter(function(hit){return _tgTerritoryId(hit)!==String(displayId);});
      _tgCurrentHidden=full.hidden===true;
      _tgSetTitle('🧭 '+(name||full.name||displayId)+' 3D 경계 편집 · Object ID: '+displayId);
      _tgOriginalGeom=JSON.parse(JSON.stringify(geom));_tgEditedGeometry=JSON.parse(JSON.stringify(geom));
      _tg3dSetGeometry(_tgEditedGeometry);_tg3dRefreshMarkers();_tgSaveBtn(true);_tgEraserBtn(true);_tgAddVertexBtn(true);_tgSimplifyBtn(true);_tgHideBtn(true,_tgCurrentHidden);_tgSnapBtn(true);_tgPairBtn(true,false);_tgCoastBtn(true,false);
      _tgSetMsg('편집 준비 완료 · 주변 영토는 미리 불러오지 않습니다. 중간 경계 추천에서 선택한 영토만 로드합니다.');
    }catch(e){_tgSetMsg('❌ '+e.message,'err');_tgEditMode=false;}
  }
  function _tgEnter3dSelect() {
    var m=window.mlMap3d;if(!m)return;
    _tgBind3dEraser();
    _tgHideLayerPicker();_tgSelectMode=false;_tg3dSelecting=true;_tgBarOpen(true);_tgSaveBtn(false);_tgEraserBtn(false);_tgSimplifyBtn(false);_tgHideBtn(false,false);_tgCoastBtn(false,false);
    _tgSetTitle('🧭 3D 영토 경계 편집');_tgSetMsg('편집할 영토 폴리곤을 3D 지도에서 클릭하세요.');m.getCanvas().style.cursor='crosshair';
    _tg3dClickHandler=function(e){
      if(!_tg3dSelecting)return;
      var ids=['territory-fill-city','territory-fill-province','territory-fill-country'].filter(function(x){return !!m.getLayer(x);});
      var hits=(ids.length?m.queryRenderedFeatures(e.point,{layers:ids}):[])
        .filter(function(f){return !!_tgTerritoryId(f);});
      if(!hits.length){_tgSetMsg('⚠️ 이 위치에서 편집 가능한 영토를 찾지 못했습니다.','err');return;}
      _tgChooseTerritoryGroup(hits,'A',function(hit,aCompanions){
        _tgOpen3dEdit(_tgTerritoryId(hit),_tgTerritoryName(hit),aCompanions);
      });
    };
    m.on('click',_tg3dClickHandler);
  }

  function _tgStopEraser(keepMessage) {
    _tgEraserMode=false; _tgEraserDown=false; _tgEraserStroke=[];
    if (_tgEraserPreview) { map.removeLayer(_tgEraserPreview); _tgEraserPreview=null; }
    if (_tgEraserVertices) { map.removeLayer(_tgEraserVertices); _tgEraserVertices=null; }
    map.dragging.enable();
    var btn=document.getElementById('territory-geom-eraser-btn');
    if (btn) { btn.classList.remove('active'); btn.textContent='🧽 지우개'; }
    map.getContainer().style.cursor='';
    if (!keepMessage&&_tgEditableLayer) _tgEditableLayer.eachLayer(function(layer){ _tgEnableLayerEditing(layer); });
    if (window._is3dMode&&window.mlMap3d) {
      window.mlMap3d.dragPan.enable();
      window.mlMap3d.getCanvas().style.cursor='';
      if(!keepMessage&&_tgEditMode&&_tgEditedGeometry)_tg3dRefreshMarkers();
    }
    if (!keepMessage && _tgEditMode) _tgSetMsg('꼭지점 드래그 → 이동 · 지우개 → 클릭한 채 지나간 영역 삭제');
  }

  function _tgStartEraser() {
    if (!_tgEditMode||!_tgEditedGeometry) return;
    if (_tgEraserMode) { _tgStopEraser(); return; }
    if(_tg3dAddMode)_tgToggle3dAddVertex();
    _tgEraserMode=true;
    if(window._is3dMode&&window.mlMap3d){
      _tg3dRefreshMarkers();
      var btn3=document.getElementById('territory-geom-eraser-btn');
      if(btn3){btn3.classList.add('active');btn3.textContent='🧽 지우개 ON';}
      window.mlMap3d.getCanvas().style.cursor='crosshair';
      _tgSetMsg('지울 3D 경계 꼭짓점을 클릭한 채 드래그하세요.','dirty');
      return;
    }
    if (_tgEditableLayer) _tgEditableLayer.eachLayer(function(layer){ if(layer.pm) layer.pm.disable(); });
    _tgRenderEraserVertices();
    var btn=document.getElementById('territory-geom-eraser-btn');
    if (btn) { btn.classList.add('active'); btn.textContent='🧽 지우개 ON'; }
    map.getContainer().style.cursor='crosshair';
    _tgSetMsg('지울 꼭짓점을 클릭한 채 드래그하세요. 경계 저장 전까지 DB에는 반영되지 않습니다.','dirty');
  }

  function _tgRenderEraserVertices() {
    if (_tgEraserVertices) map.removeLayer(_tgEraserVertices);
    _tgEraserVertices=L.layerGroup().addTo(map);
    if(!_tgEditedGeometry||!_tgEditedGeometry.coordinates)return;
    function addRing(ring) {
      (ring||[]).slice(0,-1).forEach(function(coord){
        L.circleMarker([coord[1],coord[0]],{
          pane:'territoryEditPane',radius:4,weight:1.5,
          color:'#2f88ff',fillColor:'#fff',fillOpacity:.95,
          opacity:1,interactive:false
        }).addTo(_tgEraserVertices);
      });
    }
    if(_tgEditedGeometry.type==='Polygon')_tgEditedGeometry.coordinates.forEach(addRing);
    else if(_tgEditedGeometry.type==='MultiPolygon')_tgEditedGeometry.coordinates.forEach(function(poly){poly.forEach(addRing);});
  }

  function _tgUpdateEraserPreview() {
    if (_tgEraserPreview) map.removeLayer(_tgEraserPreview);
    if (!_tgEraserStroke.length) return;
    _tgEraserPreview=L.polyline(_tgEraserStroke,{pane:'territoryEditPane',color:'#ff564a',weight:_tgEraserRadiusPx*2,opacity:.48,lineCap:'round',interactive:false}).addTo(map);
  }
  function _tgApplyEraserStroke() {
    if (!_tgEraserStroke.length||!_tgEditedGeometry) return;
    try {
      var strokePts=_tgEraserStroke.map(function(ll){return map.latLngToContainerPoint(ll);});
      function pointSegmentDistance(p,a,b) {
        var dx=b.x-a.x,dy=b.y-a.y;
        if (!dx&&!dy) return p.distanceTo(a);
        var t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
        return p.distanceTo(L.point(a.x+t*dx,a.y+t*dy));
      }
      function touched(coord) {
        var p=map.latLngToContainerPoint(L.latLng(coord[1],coord[0]));
        if (strokePts.length===1) return p.distanceTo(strokePts[0])<=_tgEraserRadiusPx;
        for(var i=1;i<strokePts.length;i++) if(pointSegmentDistance(p,strokePts[i-1],strokePts[i])<=_tgEraserRadiusPx)return true;
        return false;
      }
      var removed=0;
      function eraseRing(ring) {
        if(!ring||ring.length<4)return ring;
        var open=ring.slice(0,-1);
        var hitCount=0;
        var keep=open.filter(function(c){var hit=touched(c);if(hit)hitCount++;return !hit;});
        if(!hitCount)return ring;
        removed+=hitCount;
        // 유효한 링을 만들 꼭짓점이 3개 미만이면 해당 링 자체를 지운다.
        if(keep.length<3)return null;
        keep.push(keep[0].slice()); return keep;
      }
      var next=JSON.parse(JSON.stringify(_tgEditedGeometry));
      if(next.type==='Polygon') {
        var polygonRings=next.coordinates.map(eraseRing);
        if(!polygonRings[0]){
          _tgSetMsg('⚠️ 영토 전체의 마지막 도형은 지울 수 없습니다. 영토 숨김 또는 삭제 기능을 사용하세요.','err');return;
        }
        next.coordinates=[polygonRings[0]].concat(polygonRings.slice(1).filter(Boolean));
      }
      else if(next.type==='MultiPolygon') {
        next.coordinates=next.coordinates.map(function(poly){
          var rings=poly.map(eraseRing);
          return rings[0]?[rings[0]].concat(rings.slice(1).filter(Boolean)):null;
        }).filter(Boolean);
        if(!next.coordinates.length){
          _tgSetMsg('⚠️ 영토 전체의 마지막 도형은 지울 수 없습니다. 영토 숨김 또는 삭제 기능을 사용하세요.','err');return;
        }
      }
      else throw new Error('Polygon/MultiPolygon만 지원합니다.');
      if(!removed){_tgSetMsg('지우개 경로 안에 꼭짓점이 없습니다. 조금 더 가까이 지나가세요.','dirty');return;}
      _tgEditedGeometry=next;
      if (!_tgRenderEditable(_tgEditedGeometry)) throw new Error('편집 레이어 재생성 실패');
      if (_tgEraserMode) _tgEditableLayer.eachLayer(function(layer){if(layer.pm)layer.pm.disable();});
      _tgRenderEraserVertices();
      _tgSetMsg('꼭짓점 '+removed+'개 삭제됨 · 경계 저장으로 확정하거나 취소로 되돌릴 수 있습니다.','dirty');
    } catch(e) { _tgSetMsg('❌ 지우개 적용 실패: '+e.message,'err'); }
  }

  function _tgApply3dEraserStroke() {
    var m=window.mlMap3d;
    if(!m||!_tg3dErasePoints.length||!_tgEditedGeometry)return;
    function distance(p,a,b){
      var dx=b.x-a.x,dy=b.y-a.y;
      if(!dx&&!dy)return Math.hypot(p.x-a.x,p.y-a.y);
      var t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
      return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));
    }
    function touched(c){
      var p=m.project(c);
      if(_tg3dErasePoints.length===1)return distance(p,_tg3dErasePoints[0],_tg3dErasePoints[0])<=_tgEraserRadiusPx;
      for(var i=1;i<_tg3dErasePoints.length;i++)if(distance(p,_tg3dErasePoints[i-1],_tg3dErasePoints[i])<=_tgEraserRadiusPx)return true;
      return false;
    }
    if(_tgPairSharedLines.length){
      var victims=[];_tgPairSharedLines.forEach(function(line){line.forEach(function(coord,index){if(index>0&&index<line.length-1&&touched(coord))victims.push(coord);});});
      if(!victims.length){_tgSetMsg('지우개 경로 안에 공유 꼭지점이 없습니다.','dirty');return;}
      _tgPairSharedLines.forEach(function(line){for(var li=line.length-2;li>0;li--)if(victims.includes(line[li])&&line.length>2)line.splice(li,1);});
      _tgGroupItems().forEach(function(item){_tgGeometryRings(item.geometry).forEach(function(ring){for(var ri=ring.length-2;ri>=0;ri--)if(victims.includes(ring[ri])&&ring.length>4)ring.splice(ri,1);ring[ring.length-1]=ring[0].slice();});});
      _tg3dSetGeometry(_tgEditedGeometry);_tg3dRefreshMarkers();_tgSetMsg('공유 경계 전체에서 꼭지점 '+victims.length+'개를 삭제했습니다.','dirty');return;
    }
    var removed=0;
    function eraseRing(ring){
      var open=ring.slice(0,-1);
      var hitCount=0;
      var keep=open.filter(function(c){var hit=touched(c);if(hit)hitCount++;return !hit;});
      if(!hitCount)return ring;
      removed+=hitCount;
      // 삼각형에서 하나라도 지우면 무효 링으로 남기지 않고 도형 단위로 제거한다.
      if(keep.length<3)return null;
      keep.push(keep[0].slice());return keep;
    }
    var next=JSON.parse(JSON.stringify(_tgEditedGeometry));
    if(next.type==='Polygon'){
      var polygonRings=next.coordinates.map(eraseRing);
      if(!polygonRings[0]){_tgSetMsg('⚠️ 영토 전체의 마지막 도형은 지울 수 없습니다. 영토 숨김 또는 삭제 기능을 사용하세요.','err');return;}
      next.coordinates=[polygonRings[0]].concat(polygonRings.slice(1).filter(Boolean));
    }
    else if(next.type==='MultiPolygon'){
      next.coordinates=next.coordinates.map(function(poly){
        var rings=poly.map(eraseRing);
        return rings[0]?[rings[0]].concat(rings.slice(1).filter(Boolean)):null;
      }).filter(Boolean);
      if(!next.coordinates.length){_tgSetMsg('⚠️ 영토 전체의 마지막 도형은 지울 수 없습니다. 영토 숨김 또는 삭제 기능을 사용하세요.','err');return;}
    }
    if(!removed){_tgSetMsg('지우개 경로 안에 꼭짓점이 없습니다.','dirty');return;}
    _tgEditedGeometry=next;_tg3dSetGeometry(next);_tg3dRefreshMarkers();
    _tgSetMsg('꼭짓점 '+removed+'개 삭제됨 · 경계 저장으로 확정하세요.','dirty');
  }
  function _tgToggle3dAddVertex() {
    if(!window._is3dMode||!_tgEditMode)return;
    if(_tgEraserMode){_tgStopEraser(true);_tg3dRefreshMarkers();}
    _tg3dAddMode=!_tg3dAddMode;
    var btn=document.getElementById('territory-geom-add-vertex-btn');
    if(btn){btn.classList.toggle('active',_tg3dAddMode);btn.textContent=_tg3dAddMode?'➕ 경계선 클릭 중':'➕ 꼭짓점 추가';}
    if(window.mlMap3d)window.mlMap3d.getCanvas().style.cursor=_tg3dAddMode?'crosshair':'';
    _tgSetMsg(_tg3dAddMode?'새 꼭짓점을 넣을 경계선 위를 클릭하세요.':'꼭짓점 추가 모드를 종료했습니다.',_tg3dAddMode?'dirty':'');
  }
  function _tg3dInsertVertex(point,lngLat) {
    var m=window.mlMap3d,best=null,bestDist=Infinity;
    function segmentDistance(p,a,b){var dx=b.x-a.x,dy=b.y-a.y;if(!dx&&!dy)return Math.hypot(p.x-a.x,p.y-a.y);var t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));}
    if(_tgPairSharedLines.length){
      var sharedBest=null;
      _tgPairSharedLines.forEach(function(line){for(var si=0;si<line.length-1;si++){var sd=segmentDistance(point,m.project(line[si]),m.project(line[si+1]));if(!sharedBest||sd<sharedBest.distance)sharedBest={line:line,index:si+1,a:line[si],b:line[si+1],distance:sd};}});
      if(!sharedBest||sharedBest.distance>24){_tgSetMsg('⚠️ 공유 경계선에 더 가까이 클릭하세요.','err');return;}
      var sharedPoint=[lngLat.lng,lngLat.lat];sharedBest.line.splice(sharedBest.index,0,sharedPoint);
      _tgGroupItems().forEach(function(item){_tgGeometryRings(item.geometry).forEach(function(ring){for(var ri=0;ri<ring.length-1;ri++){if((ring[ri]===sharedBest.a&&ring[ri+1]===sharedBest.b)||(ring[ri]===sharedBest.b&&ring[ri+1]===sharedBest.a)){ring.splice(ri+1,0,sharedPoint);break;}}if(ring.length>2)ring[ring.length-1]=ring[0].slice();});});
      _tg3dSetGeometry(_tgEditedGeometry);_tg3dRefreshMarkers();_tgSetMsg('공유 경계 전체에 꼭지점 1개를 추가했습니다.','dirty');return;
    }
    function scanRing(ring){
      for(var i=0;i<ring.length-1;i++){
        var d=segmentDistance(point,m.project(ring[i]),m.project(ring[i+1]));
        if(d<bestDist){bestDist=d;best={ring:ring,index:i+1};}
      }
    }
    if(_tgEditedGeometry.type==='Polygon')_tgEditedGeometry.coordinates.forEach(scanRing);
    else if(_tgEditedGeometry.type==='MultiPolygon')_tgEditedGeometry.coordinates.forEach(function(poly){poly.forEach(scanRing);});
    if(!best||bestDist>24){_tgSetMsg('⚠️ 경계선에 더 가까이 클릭하세요.','err');return;}
    var snapped=_tgSnapLngLat(lngLat);
    if(snapped)lngLat={lng:snapped.lng,lat:snapped.lat};
    best.ring.splice(best.index,0,[lngLat.lng,lngLat.lat]);
    best.ring[best.ring.length-1]=best.ring[0].slice();
    _tg3dSetGeometry(_tgEditedGeometry);_tg3dRefreshMarkers();
    _tgSetMsg(snapped
      ? '🧲 새 꼭짓점이 '+snapped.name+'의 '+snapped.kind+'에 맞물림 · 경계 저장으로 확정하세요.'
      : '꼭짓점 1개 추가됨 · 계속 추가하거나 경계 저장으로 확정하세요.','dirty');
  }
  function _tgBind3dEraser() {
    var m=window.mlMap3d;if(!m||m._tgEraserBound)return;
    m._tgEraserBound=true;
    m.on('mousedown',function(e){
      if(!_tgEraserMode||!_tgEditMode||!window._is3dMode||e.originalEvent.button!==0)return;
      e.preventDefault();_tg3dEraseDown=true;_tg3dErasePoints=[e.point];m.dragPan.disable();
    });
    m.on('mousemove',function(e){
      if(!_tg3dEraseDown)return;
      var last=_tg3dErasePoints[_tg3dErasePoints.length-1];
      if(Math.hypot(last.x-e.point.x,last.y-e.point.y)>=3)_tg3dErasePoints.push(e.point);
    });
    m.on('click',function(e){
      if(_tg3dAddMode&&_tgEditMode&&window._is3dMode)_tg3dInsertVertex(e.point,e.lngLat);
    });
    document.addEventListener('mouseup',function(){
      if(!_tg3dEraseDown)return;
      _tg3dEraseDown=false;m.dragPan.enable();_tgApply3dEraserStroke();_tg3dErasePoints=[];
    });
  }

  /* ── API: full territory (geometry 포함) ─────────────────── */
  async function _tgFetch(id) {
    if (_tgFullCache[id]) return _tgFullCache[id];
    var token = _tgToken();
    var headers = token ? {'Authorization':'Bearer '+token} : {};
    var res = await fetch('/api/territories/'+id, {headers:headers});
    if (!res.ok) throw new Error('territory API: HTTP '+res.status);
    var json = await res.json();
    _tgFullCache[id] = json;
    return json;
  }

  /* ── geoman 편집 이벤트 → geometry 동기화 ────────────────── */
  function _tgSync() {
    if (!_tgEditableLayer) return;
    var geometry = _tgNorm(_tgEditableLayer.toGeoJSON());
    if (!geometry) { _tgSetMsg('❌ geometry 변환 실패','err'); return; }
    _tgEditedGeometry = geometry;
    var b = _tgBBox(geometry);
    _tgSetMsg(b
      ? '수정됨 · '+geometry.type+' · lat '+b.minLat.toFixed(2)+'~'+b.maxLat.toFixed(2)+
        ', lng '+b.minLng.toFixed(2)+'~'+b.maxLng.toFixed(2)
      : '수정됨 · '+geometry.type, 'dirty');
  }

  /* ── 1단계: 영토 선택 모드 진입 ─────────────────────────── */
  async function _tgEnterSelect() {
    if(window._is3dMode&&window.mlMap3d){
      _tgEnter3dSelect();
      return;
    }
    if (_tgEditMode) {
      _tgSetMsg('⚠️ 이미 편집 중입니다. 먼저 저장하거나 취소하세요.','err');
      _tgBarOpen(true);
      return;
    }
    _tgHideLayerPicker();
    _tgSelectMode = true;
    _tgBarOpen(true);
    _tgSetTitle('🧭 영토 경계 편집');
    _tgSetMsg('영토 데이터 확인 중...');
    _tgSaveBtn(false);

    if (_tgLoadedTerritories().length === 0 && typeof window.loadTerritoryTiles === 'function') {
      try { await window.loadTerritoryTiles(); }
      catch(e) { _tgSetMsg('❌ 영토 데이터 로드 실패: '+e.message, 'err'); return; }
    }
    var loadedCount = _tgLoadedTerritories().length;
    if (!loadedCount) {
      _tgSetMsg('❌ 현재 화면의 영토 데이터를 불러오지 못했습니다. 영토 레이어를 켠 뒤 다시 시도하세요.', 'err');
      return;
    }
    window.territories = _tgLoadedTerritories();
    _tgSetMsg('📍 편집할 영토 폴리곤을 지도에서 직접 클릭하세요. (로드: '+loadedCount+'개)');

    var pane = map.getPane('territoryPane');
    if (pane) pane.style.pointerEvents = 'auto';
    map.getContainer().style.cursor = 'crosshair';
    map.on('click', _tgMapClick);
  }

  /* ── 2단계: 지도 클릭 → 영토 bbox 히트 테스트 ───────────── */
  function _tgMapClick(e) {
    if (!_tgSelectMode || _tgEditMode) return;
    var lat = e.latlng.lat, lng = e.latlng.lng;

    /* ── 인라인 bbox 계산기 (window.getTerritoryBounds 로드 전 안전장치) ── */
    function _calcBounds(t) {
      // 1) 서버에서 내려온 bbox 필드
      if (t.bbox && t.bbox.minLat !== undefined) return t.bbox;
      // 2) window에 노출된 getTerritoryBounds (클로저 함수)
      if (typeof window.getTerritoryBounds === 'function') {
        try { var b = window.getTerritoryBounds(t); if (b) return b; } catch(e_){}
      }
      // 3) 직접 좌표 순회
      var coords = null;
      if (t.type && t.coordinates) {
        if (t.type === 'Polygon') coords = [t.coordinates[0]];
        else if (t.type === 'MultiPolygon') coords = t.coordinates.map(function(p){return p[0];});
      } else if (t.geojson && t.geojson.geometry) {
        var g = t.geojson.geometry;
        if (g.type === 'Polygon') coords = [g.coordinates[0]];
        else if (g.type === 'MultiPolygon') coords = g.coordinates.map(function(p){return p[0];});
      }
      if (!coords) return null;
      var minLat=Infinity, maxLat=-Infinity, minLng=Infinity, maxLng=-Infinity;
      coords.forEach(function(ring){
        (ring||[]).forEach(function(c){
          var ln=c[0], la=c[1];
          if(la<minLat)minLat=la; if(la>maxLat)maxLat=la;
          if(ln<minLng)minLng=ln; if(ln>maxLng)maxLng=ln;
        });
      });
      if (!isFinite(minLat)) return null;
      t._bounds = {minLat:minLat,maxLat:maxLat,minLng:minLng,maxLng:maxLng};
      return t._bounds;
    }

    var allTerr = _tgLoadedTerritories();
    var hits = allTerr.filter(function(t) {
      var b = _calcBounds(t);
      if (!b) return false;
      // bbox 사전 필터 (빠른 제외)
      if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) return false;
      var geometry=t.geometry||(t.geojson&&t.geojson.geometry)||(t.type&&t.coordinates?{type:t.type,coordinates:t.coordinates}:null);
      return geometry?_tgPointInGeometry(lng,lat,geometry):true;
    });

    if (!hits.length) {
      _tgSetMsg('⚠️ 해당 위치에 영토가 없습니다. 다른 곳을 클릭하세요. (로드: '+(allTerr.length)+'개)', 'err');
      return;
    }

    /* 가장 작은/구체적인 영토 우선 (city > province > country) */
    var LP = {city:0,province:1,country:2};
    hits.sort(function(a,b_) {
      var lp=(LP[a.level]||1)-(LP[b_.level]||1);
      if (lp!==0) return lp;
      var ba=_calcBounds(a)||{minLat:0,maxLat:1,minLng:0,maxLng:1};
      var bb=_calcBounds(b_)||{minLat:0,maxLat:1,minLng:0,maxLng:1};
      var aA=(ba.maxLat-ba.minLat)*(ba.maxLng-ba.minLng);
      var bA=(bb.maxLat-bb.minLat)*(bb.maxLng-bb.minLng);
      return aA-bA;
    });

    _tgChooseTerritory(hits,function(chosen){
      _tgOpenEdit(_tgTerritoryId(chosen),_tgTerritoryName(chosen));
    });
  }

  /* ── 3단계: geometry 로드 & geoman 편집 시작 ─────────────── */
  async function _tgOpenEdit(id, name) {
    try {
      _tgHideLayerPicker();
      _tgSelectMode = false;
      _tgEditMode   = true;
      map.off('click', _tgMapClick);
      map.getContainer().style.cursor = '';

      _tgSetTitle('🧭 '+(name||id)+' 경계 편집');
      _tgSetMsg('geometry 불러오는 중...');

      if (typeof L.PM==='undefined' && typeof L.pm==='undefined') {
        _tgSetMsg('❌ leaflet-geoman 미로드. 페이지를 새로고침하세요.','err');
        _tgEditMode=false; return;
      }

      _tgEditId = id;
      var full  = await _tgFetch(id);
      var geom  = (full.geometry)||(full.geojson&&full.geojson.geometry)||null;
      if (!geom) {
        _tgSetMsg('❌ 편집할 geometry가 없습니다. (DB에 geometry 필드 없음)','err');
        _tgEditMode=false; return;
      }

      _tgOriginalGeom   = JSON.parse(JSON.stringify(geom));
      var editGeom      = JSON.parse(JSON.stringify(geom));
      var vCount        = _tgCountV(editGeom);

      /* 꼭지점 과다 → 자동 단순화 */
      var VLIMIT = 500;
      if (vCount > VLIMIT) {
        var tol=0.001;
        for (var i=0;i<8;i++) {
          var s=_tgSimplify(editGeom,tol);
          if (_tgCountV(s)<=VLIMIT){editGeom=s;break;} tol*=2;
        }
        var after=_tgCountV(editGeom);
        _tgSetMsg('⚠️ 꼭지점 '+vCount+'개 → 단순화 후 '+after+'개로 편집 (저장 시 단순화된 geometry 반영)','dirty');
      }
      _tgEditedGeometry = editGeom;

      /* 편집 레이어 생성 + geoman 꼭지점 편집 활성화 */
      var cnt=_tgRenderEditable(editGeom);
      if (cnt===0) {
        _tgSetMsg('⚠️ geoman 초기화 실패. 페이지를 새로고침하세요.','err');
        _tgEditMode=false; return;
      }

      /* territoryPane 포인터 이벤트 원상복귀 */
      var pane=map.getPane('territoryPane');
      if (pane) pane.style.pointerEvents='none';

      var bounds=_tgEditableLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds,{padding:[40,40],maxZoom:9});

      _tgSaveBtn(true);
      _tgEraserBtn(true);
      if (vCount<=VLIMIT)
        _tgSetMsg('꼭지점 드래그 → 이동  ·  우클릭 → 삭제  ·  자연환경에 맞게 경계를 조정하세요.');

    } catch(e) {
      _tgSetMsg('❌ '+e.message,'err');
      _tgEditMode=false;
    }
  }

  /* ── 취소 ──────────────────────────────────────────────────── */
  function _tgCancel() {
    _tgStopEraser(true);
    _tg3dClear();
    _tgHideLayerPicker();
    _tgSelectMode=false; _tgEditMode=false;
    _tgEditId=null; _tgEditedGeometry=null; _tgOriginalGeom=null; _tgEditableLayer=null;
    map.off('click',_tgMapClick);
    map.getContainer().style.cursor='';
    var pane=map.getPane('territoryPane');
    if (pane) pane.style.pointerEvents='none';
    window.territoryEditLayerGroup.clearLayers();
    _tgEraserBtn(false);
    _tgBarOpen(false);
  }

  /* ── 저장 ──────────────────────────────────────────────────── */
  function _tgWatchTileBuild(saveStartedAt) {
    if(!['localhost','127.0.0.1'].includes(location.hostname))return;
    var watchId=Date.now();window._tgTileBuildWatchId=watchId;
    var deadline=Date.now()+10*60*1000;
    async function poll(){
      if(window._tgTileBuildWatchId!==watchId)return;
      try{
        var response=await fetch('/api/internal/tile-status?v='+Date.now(),{cache:'no-store'});
        if(response.ok){
          var status=await response.json();var build=status.lastBuild;
          if(build&&Number(build.startedAt)>=saveStartedAt&&build.status==='completed'){
            var message='✅ 타일 재빌드 완료 · '+(build.mode||'증분')+' · '+(build.tileCount||0)+'개 · '+(build.elapsedSeconds||0)+'초';
            if(typeof showToast==='function')showToast(message,'success');
            _tgSetMsg(message,'ok');return;
          }
          if(build&&Number(build.startedAt)>=saveStartedAt&&build.status==='failed'){
            var errorMessage='❌ 타일 재빌드 실패: '+(build.error||'서버 로그를 확인하세요.');
            if(typeof showToast==='function')showToast(errorMessage,'error');
            _tgSetMsg(errorMessage,'err');return;
          }
        }
      }catch(e){}
      if(Date.now()<deadline)setTimeout(poll,1500);
      else if(typeof showToast==='function')showToast('⚠️ 타일 재빌드 완료 확인 시간이 초과되었습니다. 서버 로그를 확인하세요.','warning');
    }
    setTimeout(poll,700);
  }

  async function _tgSimplify500() {
    if(!_tgEditId||!window._is3dMode)return;
    if(!confirm('현재 저장된 영토 '+_tgEditId+'를 목표 꼭짓점 500개로 단순화할까요?\n저장하지 않은 현재 편집 내용은 단순화 결과로 교체됩니다.'))return;
    var btn=document.getElementById('territory-geom-simplify-btn');
    var token=_tgToken();var startedAt=Date.now();
    if(btn){btn.disabled=true;btn.textContent='🪶 단순화 중…';}
    _tgSetMsg('Object ID '+_tgEditId+' · 500개로 단순화 중...');
    try{
      var response=await fetch('/api/territories/'+encodeURIComponent(_tgEditId)+'/simplify',{
        method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body:JSON.stringify({targetVertices:500})
      });
      var result=await response.json();
      if(!response.ok)throw new Error(result.message+(result.error?' · '+result.error:''));
      var geometry=result.geometry;
      if(!geometry)throw new Error('서버 응답에 단순화 geometry가 없습니다.');
      _tgOriginalGeom=JSON.parse(JSON.stringify(geometry));
      _tgEditedGeometry=JSON.parse(JSON.stringify(geometry));
      _tgFullCache[_tgEditId]=Object.assign({},_tgFullCache[_tgEditId]||{},result,{geometry:geometry,bbox:result.bbox});
      if(window.territories){
        var index=window.territories.findIndex(function(t){return _tgDisplayId(t._id)===String(_tgEditId);});
        if(index!==-1)window.territories[index]=Object.assign({},window.territories[index],{
          geometry:geometry,type:geometry.type,coordinates:geometry.coordinates,bbox:result.bbox,
          geojson:{type:'Feature',properties:window.territories[index].geojson?.properties||{},geometry:geometry}
        });
      }
      _tg3dSetGeometry(geometry);_tg3dRefreshMarkers();
      if(typeof _historyCountryOutlineCache!=='undefined')_historyCountryOutlineCache.clear();
      _tgWatchTileBuild(startedAt);
      _tgSetMsg('✅ Object ID '+_tgEditId+' · '+result.beforeVertices+' → '+result.afterVertices+'개 단순화 완료 · 타일 재빌드 중…','ok');
      if(typeof showToast==='function')showToast('🪶 영토 단순화 완료: '+result.beforeVertices+' → '+result.afterVertices+'개','success');
    }catch(error){
      _tgSetMsg('❌ 단순화 실패: '+error.message,'err');
    }finally{
      if(btn){btn.disabled=false;btn.textContent='🪶 500개로 단순화';}
    }
  }

  async function _tgToggleHidden() {
    if(!_tgEditId||!window._is3dMode)return;
    var nextHidden=!_tgCurrentHidden;
    var action=nextHidden?'숨김':'숨김 해제';
    if(!confirm('Object ID '+_tgEditId+' 영토를 '+action+' 처리할까요?\n타일 재빌드 후 전체 지도에 반영됩니다.'))return;
    var btn=document.getElementById('territory-geom-hide-btn');
    var token=_tgToken();var startedAt=Date.now();
    if(!token||token==='null'||token==='undefined'){
      _tgSetMsg('❌ 로그인 토큰이 없습니다. 다시 로그인하세요.','err');return;
    }
    if(btn){btn.disabled=true;btn.textContent='⏳ '+action+' 중…';}
    _tgSetMsg('Object ID '+_tgEditId+' · 영토 '+action+' 저장 중...');
    try{
      var response=await fetch('/api/territories/'+encodeURIComponent(_tgEditId)+'/hidden',{
        method:'PATCH',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body:JSON.stringify({hidden:nextHidden})
      });
      var result=await response.json();
      if(!response.ok)throw new Error(result.message||('HTTP '+response.status));
      _tgCurrentHidden=result.hidden===true;
      if(_tgFullCache[_tgEditId])_tgFullCache[_tgEditId].hidden=_tgCurrentHidden;

      // 현재 화면에서도 즉시 제거/상태 갱신한다. 정적 타일은 백그라운드 재빌드가 교체한다.
      var list=window.territories;
      if(Array.isArray(list)){
        var index=list.findIndex(function(t){return _tgDisplayId(t._id||t.id)===String(_tgEditId);});
        if(index!==-1){
          if(_tgCurrentHidden)list.splice(index,1);
          else list[index].hidden=false;
        }
      }
      if(window._sessionMapCache?.territoriesById){
        if(_tgCurrentHidden)window._sessionMapCache.territoriesById.delete(String(_tgEditId));
        else if(Array.isArray(list)){
          var restored=list.find(function(t){return _tgDisplayId(t._id||t.id)===String(_tgEditId);});
          if(restored)window._sessionMapCache.territoriesById.set(String(_tgEditId),restored);
        }
      }
      if(typeof _historyCountryOutlineCache!=='undefined')_historyCountryOutlineCache.clear();
      if(typeof _dominantCountryCache!=='undefined')_dominantCountryCache.clear();
      if(typeof _activeCastleTerritoryCache!=='undefined')_activeCastleTerritoryCache.clear();
      _tgWatchTileBuild(startedAt);
      if(typeof showToast==='function')showToast('✅ 영토 '+action+' 완료 · 타일 재빌드 중…','success');
      _tgSetMsg('✅ 영토 '+action+' 완료 · 타일 재빌드 중…','ok');
      setTimeout(function(){
        _tgCancel();
        var current=typeof getCurrentYearMonth==='function'?getCurrentYearMonth():null;
        if(current&&typeof updateMap==='function')updateMap(current.year,current.month,false,true);
        else if(typeof updateVisibleTerritories==='function')updateVisibleTerritories();
      },500);
    }catch(error){
      _tgSetMsg('❌ 영토 '+action+' 실패: '+error.message,'err');
      _tgHideBtn(true,_tgCurrentHidden);
    }
  }

  async function _tgSave() {
    if (!_tgEditId) return;
    var token=_tgToken();
    if (!token||token==='null'||token==='undefined') {
      _tgSetMsg('❌ 로그인 토큰이 없습니다. 다시 로그인하세요.','err'); return;
    }

    var geometry=_tgEditedGeometry||_tgOriginalGeom;
    var bbox=_tgBBox(geometry);
    var pairUpdates=_tgPairMembers.map(function(member){return {id:member.id,name:member.name,geometry:member.geometry,bbox:_tgBBox(member.geometry)};});
    if (!geometry||!bbox) { _tgSetMsg('❌ geometry/bbox 계산 실패','err'); return; }
    if(pairUpdates.some(function(update){return !update.geometry||!update.bbox;})){_tgSetMsg('❌ 편집 그룹의 geometry/bbox 계산 실패','err');return;}

    var invalidNames=[];
    if(_tgGeometryHasSelfIntersection(geometry))invalidNames.push('A('+(_tgFullCache[_tgEditId]?.name_ko||_tgFullCache[_tgEditId]?.name||String(_tgEditId).slice(-6))+')');
    pairUpdates.forEach(function(update){if(_tgGeometryHasSelfIntersection(update.geometry))invalidNames.push(update.name||String(update.id).slice(-6));});
    if (invalidNames.length) {
      var crossingVertices=_tgCrossingVertices([geometry].concat(pairUpdates.map(function(update){return update.geometry;})));
      var crossingCount=crossingVertices.size;
      _tg3dRefreshMarkers(crossingVertices);
      _tgSetMsg(_tgPairSharedLines.length
        ? '❌ 자기교차 영토: '+invalidNames.join(', ')+' · 공유선 밖의 문제는 해당 영토를 단독 편집해 해소하세요.'
        : '❌ 자기교차 영토: '+invalidNames.join(', ')+' · 빨간 문제 꼭지점 '+crossingCount+'개를 먼저 해소하세요.','err');
      return;
    }

    _tgSetMsg('저장 중...');
    var saveBtn=document.getElementById('territory-geom-save-btn');
    if (saveBtn) saveBtn.disabled=true;

    try {
      var saveStartedAt=Date.now();
      /* ① DB 저장 */
      var pairMode=pairUpdates.length>0;
      var res=await fetch(pairMode?'/api/territories/shared-boundary':'/api/territories/'+_tgEditId,{
        method:'PUT',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body:JSON.stringify(pairMode?{updates:[{id:_tgEditId,geometry:geometry,bbox:bbox}].concat(pairUpdates)}:{geometry:geometry,bbox:bbox})
      });
      var json=await res.json();
      if (!res.ok){
        _tgSetMsg('❌ '+(json.message||'저장 실패'),'err');
        if(saveBtn)saveBtn.disabled=false; return;
      }
      _tgWatchTileBuild(saveStartedAt);

      /* ② 캐시 갱신 */
      _tgFullCache[_tgEditId]=Object.assign({},_tgFullCache[_tgEditId]||{},json,{geometry:geometry,bbox:bbox});
      pairUpdates.forEach(function(update){_tgFullCache[update.id]=Object.assign({},_tgFullCache[update.id]||{},{geometry:update.geometry,bbox:update.bbox});});

      /* ③ 수정 좌표를 즉시 유지한다. 재빌드 전 구 타일을 다시 읽어 덮어쓰지 않는다. */

      /* ④ territories 메모리의 실제 벡터 좌표까지 갱신 */
      if (window.territories) {
        var fi=window.territories.findIndex(function(t){
          var tid=t._id&&t._id.$oid?t._id.$oid:String(t._id);
          return tid===String(_tgEditId);
        });
        if (fi!==-1) window.territories[fi]=Object.assign({},window.territories[fi],{
          bbox:bbox,
          type:geometry.type,
          coordinates:geometry.coordinates,
          geometry:geometry,
          geojson:{type:'Feature',properties:window.territories[fi].geojson?.properties||{},geometry:geometry}
        });
        pairUpdates.forEach(function(update){
          var pi=window.territories.findIndex(function(t){return _tgDisplayId(t._id||t.id)===String(update.id);});
          if(pi!==-1)window.territories[pi]=Object.assign({},window.territories[pi],{
            bbox:update.bbox,type:update.geometry.type,coordinates:update.geometry.coordinates,geometry:update.geometry,
            geojson:{type:'Feature',properties:window.territories[pi].geojson?.properties||{},geometry:update.geometry}
          });
        });
      }

      /* 경계가 같아 보이는 이전 union 결과와 소유권 판정 캐시를 즉시 폐기 */
      if (typeof _historyCountryOutlineCache!=='undefined') _historyCountryOutlineCache.clear();
      if (typeof _dominantCountryCache!=='undefined') _dominantCountryCache.clear();
      if (typeof _activeCastleTerritoryCache!=='undefined') _activeCastleTerritoryCache.clear();
      if (typeof _simplifiedCoordsCache!=='undefined') _simplifiedCoordsCache.clear();

      _tgSetMsg(pairMode?'✅ 공유 경계 '+(pairUpdates.length+1)+'개 영토 일괄 저장 완료 · 타일 재빌드 중…':'✅ 경계 저장 완료 · 타일 재빌드 중… 완료되면 화면에 알려드립니다.','ok');
      if(typeof showToast==='function')showToast(pairMode?'↔ 공유 경계 '+(pairUpdates.length+1)+'개 영토 저장 완료 · 타일 재빌드 중…':'🗺️ 경계 저장 완료 · 타일 재빌드 중…','info');

      /* ⑤ 편집 종료 & 지도 재렌더 */
      setTimeout(function(){
        _tgCancel();
        var current=typeof getCurrentYearMonth==='function'?getCurrentYearMonth():null;
        if (current&&typeof updateMap==='function') updateMap(current.year,current.month,false,true);
        else if (typeof updateVisibleTerritories==='function') updateVisibleTerritories();
      },1400);

    } catch(e){
      _tgSetMsg('❌ 네트워크 오류: '+e.message,'err');
      if(saveBtn)saveBtn.disabled=false;
    }
  }

  /* ── window 공개 ────────────────────────────────────────────── */
  window.openTerritoryGeomEdit   = _tgEnterSelect;
  window.cancelTerritoryGeomEdit = _tgCancel;
  window.saveTerritoryGeomEdit   = _tgSave;

  /* ── 버튼 이벤트 바인딩 ─────────────────────────────────────── */
  function _bind() {
    var saveBtn=document.getElementById('territory-geom-save-btn');
    if (saveBtn) saveBtn.addEventListener('click',_tgSave);

    var eraserBtn=document.getElementById('territory-geom-eraser-btn');
    if (eraserBtn) eraserBtn.addEventListener('click',_tgStartEraser);

    var addVertexBtn=document.getElementById('territory-geom-add-vertex-btn');
    if(addVertexBtn)addVertexBtn.addEventListener('click',_tgToggle3dAddVertex);

    var snapBtn=document.getElementById('territory-geom-snap-btn');
    if(snapBtn)snapBtn.addEventListener('click',_tgToggleSnap);

    var pairBtn=document.getElementById('territory-geom-pair-btn');
    if(pairBtn)pairBtn.addEventListener('click',_tgStartPairSelect);

    var coastBtn=document.getElementById('territory-geom-coast-btn');
    if(coastBtn)coastBtn.addEventListener('click',_tgStartCoastFit);

    var boundarySelectBtn=document.getElementById('territory-geom-boundary-select-btn');
    if(boundarySelectBtn)boundarySelectBtn.addEventListener('click',_tgToggleBoundarySelect);
    var boundaryApplyBtn=document.getElementById('territory-geom-boundary-apply-btn');
    if(boundaryApplyBtn)boundaryApplyBtn.addEventListener('click',_tgApplyBoundarySelection);

    var simplifyBtn=document.getElementById('territory-geom-simplify-btn');
    if(simplifyBtn)simplifyBtn.addEventListener('click',_tgSimplify500);

    var hideBtn=document.getElementById('territory-geom-hide-btn');
    if(hideBtn)hideBtn.addEventListener('click',_tgToggleHidden);

    map.on('mousedown',function(e){
      if(!_tgEraserMode||e.originalEvent.button!==0)return;
      L.DomEvent.stop(e.originalEvent);
      _tgEraserDown=true; _tgEraserStroke=[e.latlng];
      map.dragging.disable(); _tgUpdateEraserPreview();
    });
    map.on('mousemove',function(e){
      if(!_tgEraserMode||!_tgEraserDown)return;
      var last=_tgEraserStroke[_tgEraserStroke.length-1];
      if(map.latLngToContainerPoint(last).distanceTo(map.latLngToContainerPoint(e.latlng))<3)return;
      _tgEraserStroke.push(e.latlng); _tgUpdateEraserPreview();
    });
    document.addEventListener('mouseup',function(){
      if(!_tgEraserDown)return;
      _tgEraserDown=false; map.dragging.enable();
      _tgApplyEraserStroke();
      if(_tgEraserPreview){map.removeLayer(_tgEraserPreview);_tgEraserPreview=null;}
      _tgEraserStroke=[];
    });

    var cancelBtn=document.getElementById('territory-geom-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click',_tgCancel);

    /* 🍔 햄버거 메뉴 */
    var menuBtn=document.getElementById('menu-territory-boundary-edit');
    if (menuBtn) menuBtn.addEventListener('click',function(){
      document.getElementById('hamburger-menu-panel')  ?.classList.remove('active');
      document.getElementById('hamburger-menu-overlay')?.classList.remove('active');
      document.getElementById('hamburger-menu-btn')    ?.classList.remove('active');
      _tgEnterSelect();
    });

    /* PC 드롭다운 */
    var dropBtn=document.getElementById('territoryBoundaryEditBtnDropdown');
    if (dropBtn) dropBtn.addEventListener('click',function(){
      var m=document.getElementById('edit-dropdown-menu');
      if(m) m.style.display='none';
      _tgEnterSelect();
    });
  }

  document.readyState==='loading'
    ? document.addEventListener('DOMContentLoaded',_bind)
    : _bind();

})();
