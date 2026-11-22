'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {GeometryIndex,SpeedMetrics}=require('../public/map-runtime');
const source=fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.2b9385b0203b.js'),'utf8');
function section(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start);return source.slice(start,end);}
function legacy(ring,lat,lng){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[0]>lng)!==(b[0]>lng)&&lat<(b[1]-a[1])*(lng-a[0])/(b[0]-a[0])+a[1])inside=!inside;}return inside;}
function circle(count,x=127,y=38){const ring=Array.from({length:count},(_,i)=>{const angle=i/count*Math.PI*2;return [x+Math.cos(angle),y+Math.sin(angle)];});ring.push(ring[0].slice());return ring;}
test('indexed ray checks match the previous algorithm for dense, concave, boundary and island points',()=>{
 const index=new GeometryIndex();let seed=71;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const rings=[circle(4096),[[0,0],[3,0],[3,3],[2,1],[1,3],[0,3],[0,0]],[[0,0],[1,0],[1,1],[0,1],[0,0]]];
 for(const ring of rings){const geometry={type:'Polygon',coordinates:[ring]},p=index.prepare(geometry).polygons[0],b=p.bounds;
  const points=ring.filter((_,i)=>i%Math.max(1,Math.floor(ring.length/25))===0).concat(Array.from({length:1500},()=>[b.minLng-.1+random()*(b.maxLng-b.minLng+.2),b.minLat-.1+random()*(b.maxLat-b.minLat+.2)]));
  for(const [lng,lat] of points)assert.equal(index.contains(p,lat,lng),legacy(ring,lat,lng));
 }
});
test('geometry metadata reuses original coordinates and remains fresh after explicit edit invalidation',()=>{
 const geometry={type:'MultiPolygon',coordinates:[[[[0,0],[2,0],[2,2],[0,2],[0,0]],[[.5,.5],[1,.5],[1,1],[.5,.5]]],[[[10,10],[11,10],[11,11],[10,10]]]]},before=structuredClone(geometry),index=new GeometryIndex();
 const prepared=index.prepare(geometry);assert.equal(prepared.polygons.length,2);assert.equal(prepared.polygons[0].ring,geometry.coordinates[0][0]);assert.equal(index.prepare({...geometry}),prepared);assert.equal(index.builds,1);assert.deepEqual(geometry,before);
 geometry.coordinates[0][0][1]=[3,0];index.clear();assert.notEqual(index.prepare(geometry),prepared);assert.equal(index.prepare(geometry).polygons[0].bounds.maxLng,3);
});
test('dense polygon point queries inspect a small candidate set without simplifying its vertices',()=>{
 const ring=circle(20000),index=new GeometryIndex(),p=index.prepare({type:'Polygon',coordinates:[ring]}).polygons[0];assert.equal(p.ring.length,20001);
 const before=index.edgeChecks;for(let i=0;i<100;i++)index.contains(p,38,126.5+i/100);
 assert.ok(index.edgeChecks-before<20000*100/10);
 const retained=p.bins.reduce((sum,bin)=>sum+bin.length,0);assert.ok(retained<ring.length*8);
});
test('pathological long zigzag edges cannot create an excessive index',()=>{
 const ring=Array.from({length:1024},(_,i)=>[i%2?10:0,i/100]);ring.push(ring[0]);const index=new GeometryIndex(),p=index.prepare({type:'Polygon',coordinates:[ring]}).polygons[0];assert.equal(p.bins,null);assert.equal(index.contains(p,2,3),legacy(ring,2,3));
});
test('frame history memo preserves reverse priority, month boundaries and immediately sees edits next frame',()=>{
 const context=vm.createContext({yearMonthToTotalMonths:(year,month)=>year*12+month,normalizeHistoryNumber:(v,f)=>v==null||v===''?f:Number.parseInt(v,10)});
 vm.runInContext(section('    function getActiveHistoryInfo(', '    /** 연도와 월'),context);
 const fn=context.getActiveHistoryInfo,history=[{start_year:100,end_year:200,name:'old'},{start_year:150,start_month:5,end_year:160,end_month:4,name:'new'}];
 fn._frameMemo={month:150*12+5,values:new WeakMap()};const first=fn(history,150*12+5);assert.equal(first.record,history[1]);assert.equal(fn(history,150*12+5),first);assert.equal(fn(history,150*12+4).record,history[0]);
 fn._frameMemo=undefined;history[1].end_year=149;assert.equal(fn(history,150*12+5).record,history[0]);
 fn._frameMemo={month:999*12+1,values:new WeakMap()};assert.equal(fn(history,999*12+1),null);assert.equal(fn._frameMemo.values.has(history),true);
});
test('speed samples stay bounded and finish records once, including disabled production mode',()=>{
 let now=0;const metrics=new SpeedMetrics({now:()=>now,maxSamples:3}),span=metrics.start('map');now=5;span.phase('geometry');now=9;span.finish();span.finish();assert.deepEqual(metrics.samples.map(x=>[x.name,x.ms]),[['map:geometry',5],['map',9]]);
 for(let i=0;i<100;i++)metrics.record('one',i);assert.equal(metrics.samples.length,3);assert.equal(new SpeedMetrics({enabled:false}).start('off'),null);
});
test('globe update skips hidden Leaflet overlays and no longer copies unused hierarchy rings',()=>{
 const body=section("        _mapTiming?.phase('territories');", "        _mapTiming?.phase('overlays');");assert.match(body,/if \(!window\._is3dMode && window\._prefer2dEditing === true\)/);assert.ok(body.indexOf('if (!window._is3dMode && window._prefer2dEditing === true)')<body.indexOf('riverLayerGroup.clearLayers()'));
 assert.ok(!source.includes('_3d_pushRings'));assert.match(source,/_territoryGeometryIndex\?\.clear\(\)/);assert.match(source,/finally \{getActiveHistoryInfo\._frameMemo=_previousHistoryMemo/);
});
test('stable geometry identities and worker size estimates are reused and cleared after editing',()=>{
 const index=new GeometryIndex(),geometry={type:'Polygon',coordinates:[circle(2000)]};let weights=0;
 const first=index.identity(geometry),weigh=()=>++weights*100;
 for(let i=0;i<100;i++){assert.equal(index.identity({...geometry}),first);assert.equal(index.weight({...geometry},weigh),100);}
 assert.equal(weights,1);index.clear();assert.notEqual(index.identity(geometry),first);assert.equal(index.weight(geometry,weigh),200);
});

test('outline cache keys track ownership, styles and explicit same-reference geometry edits',()=>{
 const context=vm.createContext({window:{},MapRuntime:require('../public/map-runtime')});
 vm.runInContext(section('    function getHistoryCountryOutlineKey(', '    function ensureHistoryCountryOutlineWorker('),context);
 const f={id:'a',properties:{country_id:'c',level:'city',fillColor:'#123',color_key:'c1'},geometry:{type:'Polygon',coordinates:[circle(300)]}};
 const key=()=>context.getHistoryCountryOutlineKey([f],'all');let previous=key();assert.equal(key(),previous);
 for(const [property,value] of [['country_id','d'],['fillColor','#456'],['color_key','c2']]){f.properties[property]=value;const next=key();assert.notEqual(next,previous);previous=next;}
 context.window._territoryGeometryIndex.clear();assert.notEqual(key(),previous);
});
test('same-count territory replacement advances the globe cache version',()=>{
 const context=vm.createContext({window:{_3dTerritoryData:{city:[{}]}},_lastTerritoryDataRef:null,_territoryDataVersion:0});
 const code=section('                const _td = window._3dTerritoryData;', '                const _lodMode = getLodMode(mlMap);');
 const version=()=>vm.runInContext('{'+code+';_territoryDataVersion;}',context);
 assert.equal(version(),1);assert.equal(version(),1);context.window._3dTerritoryData={city:[{}]};assert.equal(version(),2);
});

test('pending background tiles never stall year refresh after historical sources exist',()=>{
 const {canRefreshStyle}=require('../public/map-runtime');
 assert.equal(canRefreshStyle({isStyleLoaded:()=>false,getSource:()=>undefined}),false);
 assert.equal(canRefreshStyle({isStyleLoaded:()=>true}),true);
 assert.equal(canRefreshStyle({isStyleLoaded:()=>false,getSource:id=>id==='territories-country'?{}:undefined}),true);
 const body=section('            function _refreshLayersThrottled()', '            // updateMap() 완료 후 자동 호출');
 assert.match(body,/MapRuntime.canRefreshStyle\(mlMap\)/);assert.match(body,/once\('style.load'/);
});
