'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const G=require('../public/river-geometry');
const line=()=>({type:'MultiLineString',coordinates:[[[0,0],[1,.1],[2,0],[3,0]],[[10,10],[11,11]]]});
const polygon=()=>({type:'Polygon',coordinates:[[[0,0],[1,0],[2,0],[2,2],[0,2],[0,0]],[[.5,.5],[1,.5],[1,1],[.5,.5]]]});
test('all branches, islands, holes and collection paths are individually addressable',()=>{
 const data={type:'FeatureCollection',features:[{type:'Feature',properties:{name:'keep'},geometry:line()},{type:'Feature',geometry:{type:'MultiPolygon',coordinates:[polygon().coordinates,[[[4,4],[5,4],[5,5],[4,4]]]]}}]};
 const before=G.clone(data),paths=G.paths(data);assert.equal(paths.length,5);
 const changed=G.replace(data,paths[1].path,[[12,12],[13,13]]);
 assert.deepEqual(data,before);assert.deepEqual(changed.features[0].geometry.coordinates[0],before.features[0].geometry.coordinates[0]);assert.deepEqual(changed.features[1],before.features[1]);
 assert.deepEqual(changed.features[0].properties,{name:'keep'});
});
test('range interpolates endpoints, retains bends and supports both click directions',()=>{
 const pts=line().coordinates[0],forward=G.range(pts,[.5,.05],[2.5,0]);
 assert.deepEqual(forward.line,[[.5,.05],[1,.1],[2,0],[2.5,0]]);
 assert.deepEqual(G.range(pts,[2.5,0],[.5,.05]).line,forward.line.slice().reverse());
 assert.throws(()=>G.range(pts,[1,.1],[1,.1]));
});
test('only selected river section changes; exterior segments and other branches stay exact',()=>{
 const geo=line(),before=G.clone(geo),path=G.paths(geo)[0].path;
 const fitted=G.replaceRange(geo.coordinates[0],[.5,.05],[2.5,0],[[.5,0],[1,0],[2,0],[2.5,0]]);
 const next=G.replace(geo,path,fitted);assert.deepEqual(next.coordinates[0],[[0,0],[.5,0],[1,0],[2,0],[2.5,0],[3,0]]);
 assert.deepEqual(next.coordinates[1],before.coordinates[1]);assert.deepEqual(geo,before);
 assert.deepEqual(G.replaceRange(geo.coordinates[0],[2.5,0],[.5,.05],[[2.5,0],[2,0],[1,0],[.5,0]]),fitted);
});
test('river fits to closest boundary arc in either direction without taking the long arc',()=>{
 const territory=polygon();
 assert.deepEqual(G.bestBoundary(territory,[[.1,-.02],[1,.03],[1.9,-.02]]).line,[[.1,0],[1,0],[1.9,0]]);
 assert.deepEqual(G.bestBoundary(territory,[[1.9,-.02],[1,.03],[.1,-.02]]).line,[[1.9,0],[1,0],[.1,0]]);
 const wrap=G.bestBoundary(territory,[[0,.5],[0,0],[.5,0]]).line;
 assert.deepEqual(wrap,[[0,.5],[0,0],[.5,0]]);
});
test('line validation rejects empty, degenerate and nonfinite coordinates',()=>{
 for(const pts of [[],[[1,2]],[[1,2],[1,2]],[[NaN,0],[1,1]],[[181,0],[1,1]]])assert.equal(G.validLine(pts),false);
 assert.equal(G.validLine([[1,2],[2,3]]),true);
});
function editorFixture(geometry){
 const elements=[];function element(){const el={style:{},children:[],listeners:{},setAttribute(){},appendChild(c){this.children.push(c);},addEventListener(n,f){this.listeners[n]=f;},remove(){this.removed=true;}};elements.push(el);return el;}
 const handlers=new Map(),sources=new Map(),layers=new Map(),markers=new Set();
 const map={on(n,f){if(!handlers.has(n))handlers.set(n,new Set());handlers.get(n).add(f);},off(n,f){handlers.get(n)?.delete(f);},fire(n,e){for(const f of handlers.get(n)||[])f(e);},
 project:p=>({x:p[0]*100,y:p[1]*100}),getCanvas:()=>({style:{},clientWidth:1000,clientHeight:700}),getSource:id=>sources.get(id),addSource(id,v){sources.set(id,{data:v.data,setData(d){this.data=d;}});},removeSource:id=>sources.delete(id),getLayer:id=>layers.get(id),addLayer:l=>layers.set(l.id,l),removeLayer:id=>layers.delete(id)};
 class Marker{constructor(o){this.element=o.element;this.events={};}setLngLat(p){this.ll={lng:p[0],lat:p[1]};return this;}getLngLat(){return this.ll;}addTo(){markers.add(this);return this;}on(n,f){this.events[n]=f;}remove(){markers.delete(this);}}
 const context=vm.createContext({window:{},RiverGeometry:G,maplibregl:{Marker},document:{createElement:element,body:{appendChild(){}}}});
 vm.runInContext(fs.readFileSync(require.resolve('../public/globe-point-editor.js'),'utf8'),context);
 let finished;const editor=new context.window.GlobePointEditor({map,geometry,onFinish:v=>finished=v});
 return {editor,map,markers,handlers,sources,layers,get finished(){return finished;}};
}
const event=()=>({preventDefault(){},stopPropagation(){}});
test('native point drag changes correct branch and ring closure; cancel cleans every handle and listener',()=>{
 const geo={type:'MultiPolygon',coordinates:[polygon().coordinates,[[[4,4],[5,4],[5,5],[4,4]]]]},before=G.clone(geo),f=editorFixture(geo);
 const first=[...f.markers][0];first.ll={lng:.1,lat:.2};first.events.drag();first.events.dragend();
 const value=f.editor.value();assert.deepEqual(Array.from(value.coordinates[0][0][0]),[.1,.2]);assert.deepEqual(value.coordinates[0][0][0],value.coordinates[0][0].at(-1));
 assert.deepEqual(JSON.parse(JSON.stringify(value.coordinates[0][1])),before.coordinates[0][1]);assert.deepEqual(geo,before);
 f.editor.finish(false);assert.equal(f.finished,null);assert.equal(f.markers.size,0);assert.equal(f.sources.size,0);assert.equal(f.layers.size,0);assert.equal(f.handlers.get('click').size,0);assert.equal(f.handlers.get('moveend').size,0);
});
test('newly inserted native point can immediately be dragged; other branches remain untouched',()=>{
 const f=editorFixture(line());f.editor.addButton.onclick();
 f.map.fire('click',{lngLat:{lng:.5,lat:.05},originalEvent:{}});
 assert.equal(f.editor.coordinates().length,5);
 const newPoint=[...f.markers].find(m=>Math.abs(m.ll.lng-.5)<1e-8);assert.ok(newPoint);
 newPoint.ll={lng:.6,lat:.3};newPoint.events.drag();newPoint.events.dragend();f.editor.finish(true);
 assert.deepEqual(Array.from(f.finished.coordinates[0][1]),[.6,.3]);assert.deepEqual(JSON.parse(JSON.stringify(f.finished.coordinates[1])),line().coordinates[1]);
});
test('hole deletion keeps minimum valid ring and never mutates exterior',()=>{
 const f=editorFixture(polygon());f.editor.index=1;f.editor.refresh();
 [...f.markers][0].element.listeners.contextmenu(event());assert.equal(f.editor.coordinates().length,4);
 assert.deepEqual(JSON.parse(JSON.stringify(f.editor.value().coordinates[0])),polygon().coordinates[0]);f.editor.destroy();
});
test('dense rivers allocate a bounded number of draggable DOM markers',()=>{
 const f=editorFixture({type:'LineString',coordinates:Array.from({length:30000},(_,i)=>[i/3000,Math.sin(i/1000)*.1+1])});
 assert.ok(f.markers.size<=241);assert.equal(f.editor.value().coordinates.length,30000);f.editor.destroy();assert.equal(f.markers.size,0);
});
function bridgeFixture(){
 const main=fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.2b9385b0203b.js'),'utf8'),a=main.indexOf('    window.RiverBoundaryBridge = {'),b=main.indexOf('    // 🚩 [추가] 색상 선택기 이벤트',a);
 const drawing={_id:'same-id',type:'river',name:'그리기 강',geojson:line()},natural={_id:{$oid:'same-id'},type:'river',name:'자연 강',geometry:line()};
 const requests=[];const ctx=vm.createContext({window:{_3dRefreshLayers(){}},drawings:[drawing],naturalFeatures:[natural],API_BASE_URL:'/api',token:'fixture',console,saveDrawingsCache:()=>Promise.resolve(),getCurrentYearMonth:()=>({year:981,month:1}),updateMap(){},fetch:async(url,options={})=>{requests.push({url,...options});return {ok:true,json:async()=>url.includes('natural-features')?natural:drawing};}});
 vm.runInContext(main.slice(a,b),ctx);return {ctx,api:ctx.window.RiverBoundaryBridge,requests,drawing,natural};
}
test('bridge selects complete river from correct collection and writes only that collection',async()=>{
 for(const source of ['drawing','natural-feature']){
  const f=bridgeFixture(),river=await f.api.load(source,'same-id'),geometry={...line(),coordinates:[[[0,0],[1,1]],[[10,10],[11,11]]]},links=[{territory_id:'a'}];
  assert.equal(river.geometry,source==='drawing'?f.drawing.geojson:f.natural.geometry);
  await f.api.save(river,geometry,links);const request=f.requests.at(-1),body=JSON.parse(request.body);
  assert.equal(request.method,'PUT');assert.match(request.url,source==='drawing'?/drawings/:/natural-features/);assert.deepEqual(body[source==='drawing'?'geojson':'geometry'],geometry);assert.deepEqual(body.territory_boundaries,links);
  assert.equal(f.requests.some(r=>r.url.includes('territories')),false);
  assert.equal(f.ctx.drawings[0]===f.drawing,source!=='drawing');assert.equal(f.ctx.naturalFeatures[0]===f.natural,source==='drawing');
 }
});
test('bridge rejects failed persistence before changing local river memory',async()=>{
 const f=bridgeFixture(),river=await f.api.load('drawing','same-id');f.ctx.fetch=async()=>({ok:false,json:async()=>({message:'save denied'})});
 await assert.rejects(f.api.save(river,line(),[]),/save denied/);assert.equal(f.ctx.drawings[0],f.drawing);assert.equal(f.ctx.naturalFeatures[0],f.natural);
});
test('sparse boundary accepts both endpoints inside one edge and preserves untouched corners',()=>{
 const polygon={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]]]};
 const fit=G.fitBoundary(polygon,[[2,-.01],[3,-.02],[4,-.01]]).geometry;
 for(const p of [[0,0],[10,0],[10,10],[0,10]])assert.ok(fit.coordinates[0].some(q=>q[0]===p[0]&&q[1]===p[1]));
 assert.deepEqual(fit.coordinates[0][0],fit.coordinates[0].at(-1));assert.equal(polygon.coordinates[0].length,5);
});
test('point editor branch switch keeps each draft and bounds native handles after zoom',()=>{
 const f=editorFixture(line());let first=[...f.markers][0];first.ll={lng:.1,lat:.2};first.events.drag();
 f.editor.index=1;f.editor.refresh();assert.equal(f.editor.coordinates().length,2);
 f.editor.index=0;f.editor.refresh();assert.deepEqual(Array.from(f.editor.coordinates()[0]),[.1,.2]);f.editor.destroy();
});
for(const kind of ['drawing','natural'])for(const ok of [true,false])test(kind+' direct form save flushes active points before request; '+(ok?'success closes form':'failure retains draft'),async()=>{
 const main=fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.2b9385b0203b.js'),'utf8');
 const form=kind==='drawing'?'editDrawingForm':'editNaturalFeatureForm',panel=kind==='drawing'?'drawingForm':'naturalFeatureForm',geo=kind==='drawing'?'drawingGeoJson':'nfGeometry';
 const a=main.indexOf("    document.getElementById('"+form+"').addEventListener('submit'"),b=main.indexOf(kind==='drawing'?"    document.getElementById('cancelDrawingBtn')":"    // naturalFeatureForm 삭제",a);
 const fields=new Map();const get=id=>{if(!fields.has(id))fields.set(id,{value:'',style:{display:'block'},addEventListener(n,fn){this[n]=fn;}});return fields.get(id);};
 const initial=line(),edited={type:'LineString',coordinates:[[1,2],[3,4]]};get(geo).value=JSON.stringify(initial);
 const entries=kind==='drawing'?{drawingMongoId:'id',drawingName:'강',drawingType:'river',drawingColor:'#fff',drawingLineWidth:'1.5',drawingPathLabel:'',drawingPathLabelSize:'13',drawingStartYear:'100'}:{nfMongoId:'id',nfName:'강',nfStartYear:'100'};
 Object.entries(entries).forEach(([id,value])=>get(id).value=value);
 const requests=[],alerts=[],updates=[];
 const context=vm.createContext({window:{_is3dMode:true,_finishGlobePointEdit(save){assert.equal(save,true);get(geo).value=JSON.stringify(edited);},_3dRefreshLayers(){}},document:{getElementById:get},API_BASE_URL:'/api',token:'fixture',layerVisibility:{rivers:true},naturalFeatures:[{_id:'id',geometry:initial}],getCurrentYearMonth:()=>({year:100,month:1}),updateMap(){},updateDrawingInMemory:async(id,data)=>updates.push(data),handleApiError:()=>false,alert:m=>alerts.push(m),fetch:async(url,options)=>{requests.push({url,...options});return {ok};}});
 vm.runInContext(main.slice(a,b),context);await get(form).submit({preventDefault(){}});
 assert.equal(requests.length,1);assert.deepEqual(JSON.parse(requests[0].body)[kind==='drawing'?'geojson':'geometry'],edited);
 assert.deepEqual(JSON.parse(get(geo).value),edited);
 assert.equal(get(panel).style.display,ok?'none':'block');assert.equal(alerts.length,ok?0:1);assert.equal(context.window._is3dMode,true);
 if(kind==='drawing')assert.equal(updates.length,ok?1:0);
});
