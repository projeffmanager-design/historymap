'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Memory = require('../public/map-memory');
const source = fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.2b9385b0203b.js'), 'utf8');
const feature = (id, x = 0) => ({ type:'Feature', properties:{ _id:id, country_id:'c' }, geometry:{ type:'Polygon', coordinates:[[[x,0],[x+1,0],[x+1,1],[x,1],[x,0]]] } });
function section(a,b) { const start=source.indexOf(a), end=source.indexOf(b,start); assert.ok(start>=0&&end>start); return source.slice(start,end); }

test('byte budgets evict least recently used entries, including replacements and oversized values', () => {
    const cache = new Memory.BudgetCache({maxBytes:300,maxEntries:3,weigh:()=>40});
    cache.set('a',{});cache.set('b',{});cache.get('a');cache.set('c',{});
    assert.equal(cache.has('a'),true);assert.equal(cache.has('b'),false);
    cache.set('a',{});assert.equal(cache.size,2);assert.ok(cache.bytes<=300);
    cache.weigh=()=>1000;cache.set('a',{});
    assert.equal(cache.has('a'),false);assert.ok(cache.bytes<=300);
    cache.clear();assert.equal(cache.bytes,0);
});

test('geometry byte estimates and streaming hashes never mutate holes, islands or shared coordinates', () => {
    const g={type:'MultiPolygon',coordinates:[[[[0,0],[2,0],[2,2],[0,0]],[[.2,.2],[.3,.2],[.3,.3],[.2,.2]]],[[[5,5],[6,5],[6,6],[5,5]]]]};
    const before=structuredClone(g), hash=Memory.geometryHash(g);
    assert.ok(Memory.estimateBytes(g)>100);assert.deepEqual(g,before);
    assert.equal(Memory.geometryHash(structuredClone(g)),hash);
    g.coordinates[0][0][0][0]=.1;assert.notEqual(Memory.geometryHash(g),hash);
});

test('a thousand timeline changes send one Worker clone and retain only the latest queued snapshot', () => {
    const sent=[],dropped=[];
    const queue=new Memory.LatestJobQueue({send:job=>sent.push(job.key),drop:job=>dropped.push(job.key),maxQueued:3});
    for(let i=0;i<1000;i++)queue.enqueue({key:String(i),features:[feature('a')]},'hierarchy');
    assert.deepEqual(sent,['0']);assert.equal(queue.stats().queued,1);assert.equal(dropped.length,998);
    queue.complete('0');assert.deepEqual(sent,['0','999']);queue.complete('999');
    assert.equal(queue.stats().active,0);
});

test('different countries also have a bounded queue and errors release active and queued payloads', () => {
    const dropped=[];const queue=new Memory.LatestJobQueue({send(){},drop:job=>dropped.push(job.key),maxQueued:4});
    for(let i=0;i<200;i++)queue.enqueue({key:String(i)},String(i));
    assert.equal(queue.stats().queued,4);queue.clear();
    assert.equal(dropped.length,200);assert.equal(queue.stats().queued,0);assert.equal(queue.stats().active,0);
    const fail=new Memory.LatestJobQueue({send(){throw Error('terminated');},drop:job=>dropped.push(job.key)});
    fail.enqueue({key:'failed'},'a');assert.equal(fail.stats().active,0);assert.equal(dropped.at(-1),'failed');
});

test('visible tiles, shared territory ownership and pinned edits survive byte eviction', () => {
    const tracker=new Memory.TileResidency({maxBytes:250,maxTiles:2});
    tracker.track('west',[feature('shared'),feature('edit')],200);
    tracker.track('middle',[feature('shared'),feature('middle')],200);
    tracker.track('east',[feature('east')],200);
    assert.deepEqual(tracker.prune(new Set(['east']),new Set(['edit'])),['middle']);
    assert.equal(tracker.retainedIds().has('shared'),true);assert.equal(tracker.retainedIds().has('edit'),true);
    assert.deepEqual(tracker.prune(new Set(['east'])),['west']);
    assert.equal(tracker.retainedIds().has('shared'),false);
    // The active viewport is never blanked to satisfy a cache budget.
    assert.deepEqual(tracker.prune(new Set(['east'])),[]);
});

function tileFixture() {
    const requests=[],pins=new Set(),territories=[];
    const context=vm.createContext({MapMemory:Memory,Map,Set,console,
        location:{hostname:'test.invalid'},_tileDeviceMode:'desktop',_tileContentVersion:'v1',_loadedTileFiles:new Set(),_loadingTileFiles:new Set(),allTerritoriesLoaded:false,
        _historyCountryOutlineCache:new Memory.BudgetCache({maxBytes:10000}),_simplifiedCoordsCache:new Map(),_dominantCountryCache:new Map(),_activeCastleTerritoryCache:new Map(),
        _historyOutlineQueue:null,territories,
        window:{_sessionMapCache:{territoriesById:new Map(),_evictionEnabled:false},_getTerritoryEditMemoryPins:()=>pins},
        fetch:async url=>{requests.push(url);const id=url.split('/').pop().split('?')[0];return{ok:true,json:async()=>({features:[feature(id),feature('shared')]})};}
    });
    vm.runInContext(section('      // Parsed coordinates have a byte budget;', '      // 뷰포트 bounds →')
        +section('      async function _fetchTile(', '      // feature 배열 →')
        +section('      function _mergeFeatures(', '      // 타일 인덱스 + 경로'),context);
    vm.runInContext('_tileResidency.maxTiles=2;_tileResidency.maxBytes=3000;_tileFeaturesMemCache.maxBytes=3000;',context);
    return{context,requests,pins,territories,
        async load(name){const features=await context._fetchTile({filename:name},'','/tiles','v1');context._mergeFeatures(features);},
        prune(name){return context._pruneTerritoryTiles([{filename:name}]);}};
}

test('panning through 100 regions stays bounded and an evicted region reloads with closed coordinates intact', async () => {
    const f=tileFixture();
    for(let i=0;i<100;i++) { await f.load('tile'+i);f.prune('tile'+i);assert.ok(f.context._loadedTileFiles.size<=2);assert.ok(f.territories.length<=3); }
    assert.equal(f.context._loadedTileFiles.has('tile0'),false);
    await f.load('tile0');f.prune('tile0');
    const t=f.territories.find(t=>t._id==='tile0');assert.ok(t);assert.deepEqual(t.coordinates,feature('tile0').geometry.coordinates);
    assert.equal(f.context.window._sessionMapCache.territoriesById.size,f.territories.length);
    assert.equal(f.requests.filter(url=>url.includes('/tile0?')).length,2);
    const stats=f.context.window._mapMemoryStats();assert.ok(stats.parsedTiles.estimatedBytes<=stats.parsedTiles.maxBytes);
});

test('a pinned unsaved boundary is neither removed nor changed by map cache cleanup', async () => {
    const f=tileFixture();await f.load('editing');const edit=f.territories.find(t=>t._id==='editing');
    edit.coordinates=structuredClone(edit.coordinates);edit.coordinates[0][0][0]=.25;
    const before=structuredClone(edit.coordinates);f.pins.add('editing');
    for(let i=0;i<12;i++){await f.load('other'+i);f.prune('other'+i);}
    assert.equal(f.territories.includes(edit),true);assert.deepEqual(edit.coordinates,before);
    assert.equal(f.context._loadedTileFiles.has('editing'),true);
});

test('dropping old requests clears callbacks and only posts the newest hierarchy after the active job', () => {
    const workers=[],calls=[];
    const context=vm.createContext({MapMemory:Memory,Map,console,
        Worker:class {constructor(){workers.push(this);}postMessage(job){calls.push(job);}terminate(){}},
        _historyCountryOutlineCache:new Memory.BudgetCache({maxBytes:10000}),_historyCountryOutlinePending:new Map(),
        _historyCountryOutlineWorker:null,_historyOutlineQueue:null
    });
    vm.runInContext(section('    function getHistoryCountryOutlineKey(', '    function mergeGlobeTerritoriesByCountry('),context);
    const dropped=[];
    for(let i=0;i<200;i++)context.requestHistoryTerritoryHierarchy([feature('a')],String(i),value=>{if(value===null)dropped.push(i);});
    assert.equal(calls.length,1);assert.equal(context._historyCountryOutlinePending.size,2);
    workers[0].onmessage({data:{key:'0',outline:{features:[feature('a')]}}});
    assert.equal(calls.length,2);assert.equal(calls[1].key,'199');assert.equal(context._historyCountryOutlinePending.size,1);
    workers[0].onerror({message:'failed'});assert.equal(context._historyCountryOutlinePending.size,0);
    assert.equal(context._historyOutlineQueue.stats().active,0);
});

test('main document and Worker load the shared budget policy before map code', () => {
    const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
    assert.ok(html.indexOf('/public/map-memory.js')<html.indexOf('/public/assets/generated/map-scripts.2b9385b0203b.js'));
    const worker=fs.readFileSync(require.resolve('../public/history-outline-worker.js'),'utf8');
    assert.match(worker,/importScripts\('\/public\/map-memory\.js/);
    assert.match(worker,/new MapMemory\.BudgetCache/);
});


test('a shared territory switches to retained tile coordinates while an unsaved edit stays pinned', async () => {
    const f=tileFixture();
    let n=0;
    f.context.fetch=async()=>({ok:true,json:async()=>({features:[feature('shared',n++ * 10)]})});
    vm.runInContext('_tileResidency.maxTiles=1;',f.context);
    await f.load('a');await f.load('b');f.prune('b');
    const t=f.territories.find(t=>t._id==='shared');
    assert.deepEqual(t.coordinates,feature('shared',10).geometry.coordinates);
    f.pins.add('shared');t.coordinates=structuredClone(t.coordinates);t.coordinates[0][0][0]=10.25;
    await f.load('c');f.prune('c');
    assert.equal(t.coordinates[0][0][0],10.25);
});


test('the real outline Worker keeps its cache bounded without changing the source geometry', () => {
    const turf=require('@turf/turf'),posted=[];
    const context=vm.createContext({MapMemory:Memory,turf,Map,console,importScripts(){},self:{postMessage:data=>posted.push(data)}});
    vm.runInContext(fs.readFileSync(require.resolve('../public/history-outline-worker.js'),'utf8'),context);
    vm.runInContext('cache.maxBytes=2500;',context);
    for(let i=0;i<40;i++){
        const features=[feature('a',i*.1),feature('b',i*.1+.5)],before=structuredClone(features);
        context.self.onmessage({data:{key:String(i),countryId:'c',features}});
        assert.deepEqual(features,before);assert.ok(posted.at(-1).outline?.geometry);
    }
    assert.ok(vm.runInContext('cache.bytes<=2500 && cache.size<16',context));
});


test('dense valid borders bypass quadratic repair, while crossing rings still take the repair path', () => {
    const turf=require('@turf/turf'),posted=[];let repairs=0;
    const context=vm.createContext({MapMemory:Memory,turf:{...turf,unkinkPolygon:(...args)=>{repairs++;return turf.unkinkPolygon(...args);}},
        Map,Set,WeakMap,console,importScripts(){},self:{postMessage:data=>posted.push(data)}});
    vm.runInContext(fs.readFileSync(require.resolve('../public/history-outline-worker.js'),'utf8'),context);
    const ring=Array.from({length:18000},(_,i)=>[Math.cos(i*Math.PI*2/18000),Math.sin(i*Math.PI*2/18000)]);ring.push(ring[0].slice());
    context.self.onmessage({data:{key:'dense',countryId:'c',mode:'hierarchy',features:[{type:'Feature',properties:{level:'city',country_id:'c'},geometry:{type:'Polygon',coordinates:[ring]}}]}});
    assert.equal(repairs,0);assert.equal(posted.at(-1).outline.features.length,1);
    assert.equal(posted.at(-1).outline.features[0].geometry.coordinates[0].length,ring.length);
    context.self.onmessage({data:{key:'crossing',countryId:'c',mode:'hierarchy',features:[{type:'Feature',properties:{level:'city',country_id:'c'},geometry:{type:'Polygon',coordinates:[[[0,0],[1,1],[0,1],[1,0],[0,0]]]}}]}});
    assert.ok(repairs>0);assert.ok(posted.at(-1).outline?.features.length>0);
});

test('hierarchy still masks overlaps and retains distant regions after repair memoization', () => {
    const turf=require('@turf/turf'),posted=[];
    const context=vm.createContext({MapMemory:Memory,turf,Map,Set,WeakMap,console,importScripts(){},self:{postMessage:data=>posted.push(data)}});
    vm.runInContext(fs.readFileSync(require.resolve('../public/history-outline-worker.js'),'utf8'),context);
    const a=feature('a',0),b=feature('b',.5),c=feature('c',10);
    a.properties={level:'country',country_id:'a'};b.properties={level:'province',country_id:'b'};c.properties={level:'city',country_id:'c'};
    context.self.onmessage({data:{key:'layers',countryId:'all',mode:'hierarchy',features:[a,b,c]}});
    const output=posted.at(-1).outline;
    assert.equal(output.features.length,3);
    const expected=turf.area(turf.union(turf.featureCollection([a,b,c])));
    assert.ok(Math.abs(turf.area(output)-expected)<expected*1e-8);
});


test('obsolete heavy Worker jobs are cancelled after a grace period without spawning a worker per click', () => {
    const sent=[],dropped=[],cancelled=[],timers=new Map();let nextTimer=0,now=0;
    const queue=new Memory.LatestJobQueue({send:job=>sent.push(job.key),drop:job=>dropped.push(job.key),
        cancelActive:job=>cancelled.push(job.key),now:()=>now,
        schedule:fn=>{timers.set(++nextTimer,fn);return nextTimer;},unschedule:id=>timers.delete(id)});
    queue.enqueue({key:'old-world'},'hierarchy');
    for(let i=0;i<1000;i++)queue.enqueue({key:'latest-'+i},'hierarchy');
    assert.deepEqual(sent,['old-world']);assert.equal(timers.size,1);
    now=1500;const [id,expire]=timers.entries().next().value;timers.delete(id);expire();
    assert.deepEqual(cancelled,['old-world']);assert.deepEqual(sent,['old-world','latest-999']);
    queue.complete('old-world');assert.equal(queue.stats().active,1);
    queue.complete('latest-999');assert.equal(queue.stats().active,0);assert.equal(timers.size,0);
    assert.equal(dropped.length,1000);
});
