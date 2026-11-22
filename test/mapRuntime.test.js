'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {IdleLoop,DiagnosticTrail}=require('../public/map-runtime');
function clock(){let now=0,id=0;const pending=new Map();return {now:()=>now,schedule(fn,ms){const key=++id;pending.set(key,{fn,at:now+ms});return key;},cancel:key=>pending.delete(key),advance(ms){const end=now+ms;for(;;){const next=[...pending].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;pending.delete(next[0]);next[1].fn(now);}now=end;},pending};}
function fixture(){const c=clock(),frames=[],renders=[];let visible=true;const loop=new IdleLoop({draw:t=>frames.push(t),wakeRender:()=>renders.push(c.now()),visible:()=>visible,now:c.now,schedule:c.schedule,unschedule:c.cancel,request:fn=>c.schedule(fn,16),cancel:c.cancel});return {c,loop,frames,renders,visible:v=>visible=v};}
test('unattended eight-hour session stops decorations after 30 seconds and queues no more work',()=>{
 const f=fixture();f.loop.wake();f.c.advance(8*60*60*1000);assert.ok(f.frames.length>0&&f.frames.length<400);assert.equal(f.c.pending.size,0);assert.equal(f.loop.active(),false);
 const frames=f.frames.length;f.c.advance(8*60*60*1000);assert.equal(f.frames.length,frames);
});
test('input restarts a single loop; thousands of wake calls do not create parallel frame chains',()=>{
 const f=fixture();for(let i=0;i<10000;i++)f.loop.wake();assert.equal(f.c.pending.size,1);f.c.advance(31000);const frames=f.frames.length;
 f.loop.wake();f.c.advance(500);assert.ok(f.frames.length>frames);assert.equal(f.c.pending.size,1);
});
test('hidden tabs cancel both pending timer and animation frame, and resume on return',()=>{
 for(const elapsed of [0,80]){const f=fixture();f.loop.wake();f.c.advance(elapsed);assert.equal(f.c.pending.size,1);f.loop.setHidden(true);assert.equal(f.c.pending.size,0);f.c.advance(100000);assert.equal(f.frames.length,0);f.loop.setHidden(false);f.c.advance(200);assert.ok(f.frames.length>0);}
});
test('invisible globe does no drawing; destroying the loop releases all scheduled work',()=>{
 const f=fixture();f.visible(false);f.loop.wake();assert.equal(f.c.pending.size,0);f.visible(true);f.loop.wake();f.loop.destroy();f.c.advance(60000);assert.equal(f.frames.length,0);assert.equal(f.c.pending.size,0);
});
test('diagnostic trail is bounded across long sessions and reloads and ignores storage failures',()=>{
 let value;const storage={getItem:()=>value,setItem:(key,v)=>value=v};let now=0;
 const trail=new DiagnosticTrail({storage,now:()=>now});for(let i=0;i<10000;i++){now+=30000;trail.record({heapUsed:i,domNodes:10});}
 assert.equal(trail.report().samples.length,60);assert.ok(value.length<20000);
 const restored=new DiagnosticTrail({storage,now:()=>now+1});restored.record({heapUsed:5});assert.equal(restored.report().samples.length,60);assert.equal(restored.report().samples.at(-1).heapUsed,5);
 const broken=new DiagnosticTrail({storage:{getItem(){throw Error();},setItem(){throw Error();}}});assert.doesNotThrow(()=>broken.record({heapUsed:9}));
});
test('reports retain only aggregate numeric counters and version; no names, URLs or records',()=>{
 const trail=new DiagnosticTrail({storage:null});trail.record({heapUsed:12,user:'secret',url:'https://example.com',lat:37,lng:127,geometry:{coordinates:[1,2]}});
 const report=JSON.stringify(trail.report());assert.ok(!report.includes('secret'));assert.ok(!report.includes('example.com'));assert.ok(!report.includes('geometry'));assert.ok(!report.includes('lat'));assert.ok(!report.includes('lng'));
});
test('main integration delegates scheduling and gates WebGL twinkle instead of an endless RAF',()=>{
 const source=fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.2b9385b0203b.js'),'utf8');
 const start=source.indexOf('const drawStarBackdrop = timestamp =>'),end=source.indexOf('// 닫기 버튼 없음',start),section=source.slice(start,end);
 assert.ok(!section.includes('requestAnimationFrame(drawStarBackdrop)'));assert.match(section,/new MapRuntime.IdleLoop/);assert.match(source,/pitch < 15 \|\| !_starIdleLoop\?\.active\(\)/);
 assert.match(source,/visibilitychange.*setHidden\(document.hidden\)/);assert.match(source,/movestart',_wakeMapDecorations/);
});
test('browser scheduling APIs are called with their native receiver, never the loop instance',()=>{
 const pending=[];const native=function(fn){assert.equal(this?.draw,undefined);pending.push(fn);return pending.length;};
 const context=vm.createContext({module:{exports:{}},setTimeout:native,clearTimeout(){assert.equal(this?.draw,undefined);},requestAnimationFrame:native,cancelAnimationFrame(){assert.equal(this?.draw,undefined);}});
 vm.runInContext(fs.readFileSync(require.resolve('../public/map-runtime'),'utf8'),context);
 const loop=new context.module.exports.IdleLoop({draw(){}});loop.wake();assert.equal(pending.length,1);pending.shift()();assert.equal(pending.length,1);loop.destroy();
});
