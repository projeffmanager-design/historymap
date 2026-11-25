'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const sources=new Map(),layers=new Map(),images=new Set(),handlers={};let uploads=0;
 const document={createElement:()=>({width:0,height:0,getContext:()=>({beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},getImageData:()=>({data:[]})})})};
 const context=vm.createContext({window:{},document});
 for(const file of ['globe-drawing-tool','globe-drawing-layer'])vm.runInContext(fs.readFileSync(require.resolve('../public/'+file+'.js'),'utf8'),context);
 const map={getSource:id=>sources.get(id),getLayer:id=>layers.get(id),addSource(id,value){sources.set(id,{data:value.data,setData(data){uploads++;this.data=data;}});},addLayer:layer=>layers.set(layer.id,layer),hasImage:id=>images.has(id),addImage:id=>images.add(id),on:(name,fn)=>{handlers[name]=fn;},queryRenderedFeatures:()=>map.hits||[]};
 return {Layer:context.window.GlobeDrawingLayer,map,sources,layers,handlers,uploads:()=>uploads};
}
const record=(id,type,geometry,extra={})=>({_id:id,type,name:'검증 '+id,start_year:100,end_year:200,color:'#ff0000',geojson:{type:'Feature',properties:{},geometry},...extra});
test('generic points, polygons, mountains, arrowheads and legacy circles all produce visible geometry without Turf',()=>{
 const {Layer}=fixture();const records=[record('p','general',{type:'Point',coordinates:[127,38]}),record('a','general',{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}),record('m','mountain',{type:'LineString',coordinates:[[127,38],[128,39]]}),record('r','arrow',{type:'LineString',coordinates:[[127,38],[127,39]]})];
 const c=record('c','general',{type:'Point',coordinates:[127,38]});c.geojson.properties.radius=1000;records.push(c);
 const before=JSON.stringify(records),features=Layer.featuresFor(records,150,{}).features;assert.equal(features.length,6);assert.equal(features.find(f=>f.properties.drawing_id==='c').geometry.type,'Polygon');assert.equal(features.find(f=>f.properties.tip===1).properties.bearing,0);assert.equal(JSON.stringify(records),before);
 assert.equal(Layer.featuresFor(records,99,{}).features.length,0);assert.equal(Layer.featuresFor(records,201,{}).features.length,0);assert.equal(Layer.featuresFor(records,150,{natural:false,relic:false}).features.length,3);
});
test('drawings keep their full source for selection, update attributes and avoid uploads while panning',()=>{
 const f=fixture(),layer=new f.Layer(),r=record('line','general',{type:'LineString',coordinates:[[127,38],[128,39],[129,40]]}),records=[r];let selected;
 layer.render(f.map,records,150,{},value=>selected=value);for(let i=0;i<100;i++)layer.render(f.map,records,150,{},()=>{});assert.equal(f.uploads(),0);
 r.color='#00ff00';layer.render(f.map,records,150,{},value=>selected=value);assert.equal(f.uploads(),1);
 f.map.hits=[{properties:{drawing_id:'line'},geometry:{type:'LineString',coordinates:[[0,0],[1,1]]}}];f.handlers.click({point:{x:1,y:1}});assert.equal(selected,r);assert.equal(selected.geojson.geometry.coordinates.length,3);
 f.sources.clear();f.layers.clear();layer.render(f.map,records,150,{},()=>{});assert.ok(f.layers.has('globe-extra-drawings-line'));
});
