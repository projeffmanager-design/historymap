'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),G=require('../public/river-geometry');
const source=fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.844fdec57596.js'),'utf8');
function fixture(){
 const nodes=new Map(),messages=[],saved=[];const element=id=>{if(!nodes.has(id))nodes.set(id,{style:{},classList:{toggle(){}},remove(){},set textContent(v){if(id==='territory-geom-edit-msg')messages.push(v);},get textContent(){return messages.at(-1);}});return nodes.get(id);};
 const context=vm.createContext({window:{RiverGeometry:G,RiverBoundaryBridge:{async save(...args){saved.push(args);}}},document:{readyState:'loading',addEventListener(){},getElementById:element,querySelectorAll:()=>[]},localStorage:{getItem:()=> 'token'},sessionStorage:{getItem:()=>null},console});
 const expose=`
 window.testRiver={set(geometry,links=[]){_tgEditId='territory-a';_tgEditMode=true;_tgOriginalGeom=JSON.parse(JSON.stringify(geometry));_tgEditedGeometry=geometry;_tgRiverLinks=links;_tg3dSetGeometry=function(){};_tg3dRefreshMarkers=function(){};},start:_tgRiverStart,apply:_tgRiverApply,save:_tgRiverSave,clear:_tgRiverClear,state(){return {geometry:_tgEditedGeometry,links:_tgRiverLinks,draft:_tgRiverDraft,saving:_tgSaving,pick:_tgRiverPick};}};
`;
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,expose+'})();'),context);
 const territory={type:'MultiPolygon',coordinates:[[[[0,0],[1,0],[2,0],[3,0],[3,2],[0,2],[0,0]],[[.5,.5],[1,.5],[1,1],[.5,.5]]],[[[5,5],[6,5],[6,6],[5,5]]]]};
 const river={source:'drawing',id:'river-a',record:{type:'river',name:'강'},geometry:{type:'Feature',properties:{keep:true},geometry:{type:'MultiLineString',coordinates:[[[-1,0],[0,.02],[1,.04],[2,.02],[3,0],[4,0]],[[8,8],[9,9]]]}}};
 context.window.testRiver.set(G.clone(territory));
 const link={source:'drawing',river_id:'river-a',path:['geometry','coordinates',0],start:[0,.02],end:[3,0],direction:'territory'};
 return {api:context.window.testRiver,context,territory,river,link,saved,messages};
}
const plain=x=>JSON.parse(JSON.stringify(x));
test('forward fit changes only territory preview, preserving holes/islands, with a persisted link draft',()=>{
 const f=fixture(),oldRiver=G.clone(f.river);f.api.apply(f.river,f.link);const s=f.api.state();
 assert.notDeepEqual(plain(s.geometry),f.territory);assert.deepEqual(plain(s.geometry.coordinates[0][1]),f.territory.coordinates[0][1]);assert.deepEqual(plain(s.geometry.coordinates[1]),f.territory.coordinates[1]);
 assert.deepEqual(f.river,oldRiver);assert.equal(f.saved.length,0);assert.equal(s.links.length,1);assert.equal(s.links[0].source,'drawing');assert.ok(s.links[0].link_id);
 // Reapplying a saved link refreshes it instead of appending another.
 f.api.apply(f.river,s.links[0]);assert.equal(f.api.state().links.length,1);
});
test('reverse fit stages only selected river branch and saves geometry plus manual binding',async()=>{
 const f=fixture(),before=G.clone(f.river),link={...f.link,direction:'river'};
 f.api.apply(f.river,link);let s=f.api.state();assert.deepEqual(plain(s.geometry),f.territory);assert.ok(s.draft);
 assert.deepEqual(plain(s.draft.geometry.geometry.coordinates[1]),before.geometry.geometry.coordinates[1]);assert.deepEqual(f.river,before);assert.equal(f.saved.length,0);
 await f.api.save();assert.equal(f.saved.length,1);assert.equal(f.saved[0][2][0].territory_id,'territory-a');assert.equal(f.saved[0][2][0].direction,'river');assert.equal(f.api.state().draft,null);
});
test('failed river save preserves draft, releases busy controls and can retry once',async()=>{
 const f=fixture();f.api.apply(f.river,{...f.link,direction:'river'});
 f.context.window.RiverBoundaryBridge.save=async()=>{throw new Error('test offline');};await f.api.save();
 assert.ok(f.api.state().draft);assert.equal(f.api.state().saving,false);assert.match(f.messages.at(-1),/test offline/);
 f.context.window.RiverBoundaryBridge.save=async(...args)=>f.saved.push(args);await f.api.save();assert.equal(f.saved.length,1);assert.equal(f.api.state().draft,null);
});
test('missing or moved river branch fails without changing territory or writing data',()=>{
 const f=fixture();assert.throws(()=>f.api.apply(f.river,{...f.link,path:['geometry','coordinates',9]}),/줄기/);
 assert.throws(()=>f.api.apply(f.river,{...f.link,start:[80,70],end:[81,70]}));assert.deepEqual(plain(f.api.state().geometry),f.territory);assert.equal(f.saved.length,0);
});

test('direction buttons switch immediately and repeated button cancels without duplicate handlers',()=>{
 const f=fixture(),handlers=new Set(),sources=new Map(),layers=new Map();
 f.context.window.RiverBoundaryBridge.show=()=>{};
 f.context.window.mlMap3d={on(n,h){handlers.add(h);},off(n,h){handlers.delete(h);},getCanvas:()=>({style:{}}),getLayer:id=>layers.get(id),removeLayer:id=>layers.delete(id),getSource:id=>sources.get(id),removeSource:id=>sources.delete(id),addSource(id,v){sources.set(id,{setData(){}});},addLayer(l){layers.set(l.id,l);}};
 f.api.start('territory');assert.equal(f.api.state().pick.direction,'territory');assert.equal(handlers.size,1);
 f.api.start('river');assert.equal(f.api.state().pick.direction,'river');assert.equal(handlers.size,1);
 f.api.start('river');assert.equal(f.api.state().pick,null);assert.equal(handlers.size,0);assert.equal(f.context.window._territoryRiverPickActive,false);
});
