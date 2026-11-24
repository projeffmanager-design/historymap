'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(require.resolve('../public/globe-drawing-tool.js'),'utf8');
const main=fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.2b9385b0203b.js'),'utf8');
function element(){return {style:{},children:[],attrs:{},setAttribute(k,v){this.attrs[k]=v;},appendChild(c){this.children.push(c);},remove(){this.removed=true;}};}
function fixture(options={}) {
    const sources=new Map(),layers=new Map(),events=new Map(),keys=new Map(),results=[],canvas={style:{cursor:'grab'}};
    let enabled=options.enabled??true,permission=true;
    const map={getCanvas:()=>canvas,getSource:id=>sources.get(id),getLayer:id=>layers.get(id),
        addSource(id,s){sources.set(id,{data:s.data,setData(d){this.data=d;}});},addLayer(l){layers.set(l.id,l);},removeSource:id=>sources.delete(id),removeLayer:id=>layers.delete(id),
        on:(name,fn)=>events.set(name,fn),off:(name,fn)=>{if(events.get(name)===fn)events.delete(name);},
        doubleClickZoom:{isEnabled:()=>enabled,enable:()=>{enabled=true;},disable:()=>{enabled=false;}}};
    const context=vm.createContext({window:{},document:{createElement:element,body:element(),addEventListener:(key,fn)=>keys.set(key,fn),removeEventListener:(key,fn)=>{if(keys.get(key)===fn)keys.delete(key);}}});
    vm.runInContext(code,context);
    const tool=new context.window.GlobeDrawingTool({map,start:{lng:127,lat:38},isAllowed:()=>permission,onFinish:feature=>results.push(feature),...options});
    const click=(lng,lat,detail=1)=>events.get('click')?.({lngLat:{lng,lat},originalEvent:{detail},preventDefault(){}});
    const key=(value,input=false)=>keys.get('keydown')?.({key:value,target:{closest:()=>input},preventDefault(){},stopPropagation(){}});
    return {tool,map,sources,layers,events,keys,results,click,key,canvas,enabled:()=>enabled,setPermission:v=>permission=v};
}
test('new river begins at the context-menu coordinate, appends clicks and finishes without writing data',()=>{
    const f=fixture();assert.equal(f.enabled(),false);assert.equal(f.canvas.style.cursor,'crosshair');
    f.tool.finish(true);assert.equal(f.results.length,0);assert.match(f.tool.status.textContent,/2개/);
    f.click(127.1,38.1);f.click(127.2,38.2);f.key('Enter');
    assert.deepEqual(JSON.parse(JSON.stringify(f.results[0])),{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[127,38],[127.1,38.1],[127.2,38.2]]}});
    assert.equal(f.enabled(),true);assert.equal(f.canvas.style.cursor,'grab');assert.equal(f.sources.size,0);assert.equal(f.layers.size,0);assert.equal(f.events.size,0);assert.equal(f.keys.size,0);
    f.tool.finish(true);assert.equal(f.results.length,1);
});
test('undo, duplicate clicks and double click keep exactly the intended points',()=>{
    const f=fixture();f.click(128,39);f.click(128,39);assert.equal(f.tool.points.length,2);
    f.key('Backspace');assert.equal(f.tool.points.length,1);f.click(129,40);f.click(130,41,2);
    f.events.get('dblclick')({preventDefault(){}});assert.equal(f.results[0].geometry.coordinates.length,2);
});
test('polygon closes its ring and invalid or intersecting drafts remain recoverable',()=>{
    const turf=require('@turf/turf');const f=fixture({validate:g=>{if(turf.kinks(g).features.length)throw Error('교차');}});
    f.tool.kind='Polygon';f.click(128,38);f.tool.finish(true);assert.equal(f.results.length,0);
    f.click(129,38);f.tool.finish(true);assert.match(f.tool.status.textContent,/면적/);
    f.tool.undo();f.click(128,39);f.tool.finish(true);
    const ring=f.results[0].geometry.coordinates[0];assert.deepEqual(Array.from(ring[0]),Array.from(ring.at(-1)));assert.equal(ring.length,4);
    const x=fixture({validate:()=>{throw Error('교차');}});x.tool.kind='Polygon';x.click(128,38);x.click(128,39);x.tool.finish(true);
    assert.match(x.tool.status.textContent,/교차/);assert.equal(x.results.length,0);assert.equal(x.tool.closed,false);x.key('Escape');assert.equal(x.results[0],null);
});
test('cancel and lost privileges clean up drafts and preserve disabled double-click zoom',()=>{
    const f=fixture({enabled:false});f.click(128,39);f.key('Escape');assert.equal(f.results[0],null);assert.equal(f.enabled(),false);assert.equal(f.sources.size,0);
    const g=fixture();g.setPermission(false);g.click(128,39);assert.equal(g.results[0],null);assert.equal(g.tool.closed,true);
});
test('typing in form fields never completes or erases a drawing',()=>{
    const f=fixture();f.click(128,39);f.key('Backspace',true);f.key('Enter',true);f.key('Escape',true);
    assert.equal(f.tool.points.length,2);assert.equal(f.tool.closed,false);assert.equal(f.results.length,0);f.tool.finish(false);
});
function bridge(role='admin'){
    const fields={drawingForm:{style:{display:'none'}},drawingName:{focus(){}},drawingType:{value:''},'territory-geom-edit-bar':{classList:{contains:()=>false}}};
    let options;const opened=[],messages=[];
    const context=vm.createContext({currentUser:role?{role}:null,isDrawing:false,openDrawingForm:feature=>opened.push(feature),showToast:message=>messages.push(message),turf:require('@turf/turf'),
        document:{getElementById:id=>fields[id]},window:{_is3dMode:true,mlMap3d:{},MapRuntime:{canRefreshStyle:()=>true},GlobeDrawingTool:class{constructor(o){options=o;}finish(){options.onFinish(null);}}}});
    const start=main.indexOf('    // 새 도형도 기본 지도에서'),end=main.indexOf('    // 영토 편집기는',start);assert.ok(start>=0&&end>start);vm.runInContext(main.slice(start,end),context);
    return {context,fields,opened,messages,options:()=>options};
}
test('menu bridge opens the same-map draft, then the existing save form with the original coordinates',()=>{
    const f=bridge();f.context.window._openGlobeDrawingTool({lng:127,lat:38});assert.equal(f.context.isDrawing,true);assert.equal(f.context.window._vertexEditMode,true);
    const feature={type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[127,38],[128,39]]}};
    f.options().onFinish(feature);assert.equal(f.opened[0],feature);assert.equal(f.fields.drawingType.value,'river');assert.equal(f.context.isDrawing,false);assert.equal(f.context.window._vertexEditMode,false);
});
test('bridge preserves unsaved forms and active editors, and rechecks privilege on completion',()=>{
    for(const role of [null,'user','guest']){const f=bridge(role);f.context.window._openGlobeDrawingTool({});assert.equal(f.options(),undefined);}
    const pending=bridge();pending.fields.drawingForm.style.display='block';pending.context.window._openGlobeDrawingTool({});assert.equal(pending.options(),undefined);
    const active=bridge();active.context.window._vertexEditMode=true;active.context.window._openGlobeDrawingTool({});assert.equal(active.options(),undefined);
    const stale=bridge();stale.context.window._openGlobeDrawingTool({});stale.context.currentUser={role:'user'};stale.options().onFinish({geometry:{type:'LineString'}});assert.equal(stale.opened.length,0);
});

test('a newly drawn river area also opens as river so the default map renders its fill',()=>{
 const f=bridge();f.context.window._openGlobeDrawingTool({lng:127,lat:38});
 f.options().onFinish({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[127,38],[128,38],[128,39],[127,38]]]}});
 assert.equal(f.fields.drawingType.value,'river');
});
