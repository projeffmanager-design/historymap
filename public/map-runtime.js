/* Pause decorative drawing while idle; retain a small, local-only crash diagnostic trail. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MapRuntime=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const counters=new Set(['heapUsed','heapLimit','parsedBytes','residentBytes','outlineBytes','workerQueued','workerActive','workerTimeouts','workerOversized','territories','markers','domNodes','decorativeFrames','hidden','globe','time']);
 class IdleLoop {
  constructor({draw,visible=()=>true,wakeRender=()=>{},idleMs=30000,intervalMs=80,now=Date.now,schedule=(fn,ms)=>setTimeout(fn,ms),unschedule=id=>clearTimeout(id),request=fn=>requestAnimationFrame(fn),cancel=id=>cancelAnimationFrame(id)}){
   Object.assign(this,{draw,visible,wakeRender,idleMs,intervalMs,now,schedule,unschedule,request,cancel});this.lastInput=-Infinity;this.timer=null;this.frame=null;this.hidden=false;this.destroyed=false;this.frames=0;
  }
  active(){return !this.destroyed&&!this.hidden&&this.visible()&&this.now()-this.lastInput<this.idleMs;}
  wake(){if(this.destroyed)return;this.lastInput=this.now();if(!this.active())return;this.wakeRender();this.queue();}
  queue(){if(!this.active()||this.timer!==null||this.frame!==null)return;this.timer=this.schedule(()=>{this.timer=null;if(!this.active())return;this.frame=this.request(t=>{this.frame=null;if(!this.active())return;this.frames++;this.draw(t);this.queue();});},this.intervalMs);}
  pause(){if(this.timer!==null)this.unschedule(this.timer);if(this.frame!==null)this.cancel(this.frame);this.timer=null;this.frame=null;}
  setHidden(hidden){this.hidden=hidden;if(hidden)this.pause();else this.wake();}
  destroy(){this.destroyed=true;this.pause();}
 }
 class DiagnosticTrail {
  constructor({storage,key='history-map-memory-diagnostics',maxSamples=60,version='idle-memory-20261122-1',now=Date.now}){
   Object.assign(this,{storage,key,maxSamples,version,now});this.session=String(now());this.samples=[];
   try{const saved=JSON.parse(storage?.getItem(key)||'null');if(Array.isArray(saved?.samples))this.samples=saved.samples.slice(-maxSamples).map(row=>this.clean(row)).filter(Boolean);}catch(_){}
  }
  clean(row){if(!row||typeof row!=='object')return null;const out={};for(const [key,value] of Object.entries(row))if(counters.has(key)&&typeof value==='number'&&Number.isFinite(value))out[key]=Math.max(0,value);else if(['session','version'].includes(key)&&typeof value==='string')out[key]=value.slice(0,80);return out;}
  record(numbers){const row=this.clean({...numbers,time:this.now(),session:this.session,version:this.version});this.samples.push(row);this.samples=this.samples.slice(-this.maxSamples);try{this.storage?.setItem(this.key,JSON.stringify({samples:this.samples}));}catch(_){}return row;}
  report(){return {version:this.version,samples:this.samples.map(row=>({...row}))};}
 }
 // Keeps original coordinate references. Only legacy outer-ring ownership tests use this index;
 // exact click/holes and editing continue through their existing geometry validators.
 class GeometryIndex {
  constructor(){this.cache=new WeakMap();this.builds=0;this.edgeChecks=0;this.nextIdentity=0;}
  clear(){this.cache=new WeakMap();}
  prepare(geometry){
   const coordinates=geometry?.coordinates;
   if(!Array.isArray(coordinates))return {polygons:[],centroid:null,bboxArea:0};
   const cached=this.cache.get(coordinates);if(cached?.type===geometry.type)return cached;
   const rings=geometry.type==='Polygon'?[coordinates[0]]:geometry.type==='MultiPolygon'?coordinates.map(p=>p?.[0]):[];
   let sumLat=0,sumLng=0,count=0,bboxArea=0;
   const polygons=[];
   for(const ring of rings){
    if(!Array.isArray(ring)||ring.length<3)continue;
    const bounds={minLat:Infinity,maxLat:-Infinity,minLng:Infinity,maxLng:-Infinity};
    for(const p of ring){sumLng+=p[0];sumLat+=p[1];count++;bounds.minLng=Math.min(bounds.minLng,p[0]);bounds.maxLng=Math.max(bounds.maxLng,p[0]);bounds.minLat=Math.min(bounds.minLat,p[1]);bounds.maxLat=Math.max(bounds.maxLat,p[1]);}
    bboxArea+=(bounds.maxLng-bounds.minLng)*(bounds.maxLat-bounds.minLat);
    const polygon={ring,bounds,bins:null};
    if(ring.length>256&&bounds.maxLng>bounds.minLng){
     const bins=Array.from({length:64},()=>[]),scale=63/(bounds.maxLng-bounds.minLng);let refs=0,tooLarge=false;
     const bucket=x=>Math.max(0,Math.min(63,Math.floor((x-bounds.minLng)*scale)));
     for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i][0],b=ring[j][0];if(a===b)continue;
      const lo=bucket(Math.min(a,b)),hi=bucket(Math.max(a,b));refs+=hi-lo+1;
      // Zigzag input must never create an unbounded acceleration structure.
      if(refs>ring.length*8){tooLarge=true;break;}
      for(let bin=lo;bin<=hi;bin++)bins[bin].push(i);
     }
     if(!tooLarge){polygon.bins=bins.map(bin=>Uint32Array.from(bin));polygon.scale=scale;}
    }
    polygons.push(polygon);
   }
   const prepared={identity:++this.nextIdentity,type:geometry.type,polygons,centroid:count?{lat:sumLat/count,lng:sumLng/count}:null,bboxArea};
   this.cache.set(coordinates,prepared);this.builds++;return prepared;
  }
  identity(geometry){return this.prepare(geometry).identity;}
  weight(geometry,estimate){const prepared=this.prepare(geometry);if(prepared.weight===undefined)prepared.weight=estimate(geometry);return prepared.weight;}
  contains(polygon,lat,lng){
   const {ring,bounds,bins}=polygon;
   if(lat<bounds.minLat||lat>bounds.maxLat||lng<bounds.minLng||lng>bounds.maxLng)return false;
   let inside=false;
   const check=i=>{const j=i===0?ring.length-1:i-1,a=ring[i],b=ring[j];this.edgeChecks++;if((a[0]>lng)!==(b[0]>lng)&&lat<(b[1]-a[1])*(lng-a[0])/(b[0]-a[0])+a[1])inside=!inside;};
   if(bins){const bin=Math.max(0,Math.min(63,Math.floor((lng-bounds.minLng)*polygon.scale)));for(const i of bins[bin])check(i);}
   else for(let i=0;i<ring.length;i++)check(i);
   return inside;
  }
 }

 // isStyleLoaded also waits for every background tile and glyph. Our sources
 // prove style.load has completed, even while unrelated tiles are still loading.
 function canRefreshStyle(map){return !!map&&(!!map.isStyleLoaded()||['country','province','city'].some(level=>!!map.getSource?.('territories-'+level)));}
 // Retain one small signature per live source, never a second coordinate tree.
 // The geometry identity changes after an editor invalidates the shared index.
 class SourceDataCache {
  constructor(geometryKey){this.geometryKey=geometryKey;this.sources=new WeakMap();this.uploads=0;this.skipped=0;}
  key(data){return JSON.stringify((data.features||[]).map(feature=>{
   const {geometry,...attributes}=feature;
   return [attributes,geometry?.type,this.geometryKey(geometry)];
  }));}
  remember(source,data){this.sources.set(source,this.key(data));this.uploads++;}
  write(source,data){
   const key=this.key(data);
   if(this.sources.get(source)===key){this.skipped++;return false;}
   source.setData(data);this.sources.set(source,key);this.uploads++;return true;
  }
 }
 class CameraGate {
  constructor(){this.previous=null;}
  changed(values){if(this.previous&&values.length===this.previous.length&&values.every((value,i)=>Object.is(value,this.previous[i])))return false;this.previous=values;return true;}
 }
 class SpeedMetrics {
  constructor({enabled=true,now=()=>performance.now(),emit=null,maxSamples=40}={}){Object.assign(this,{enabled,now,emit,maxSamples});this.samples=[];}
  record(name,ms,info={}){if(!this.enabled)return;const sample={name,ms:Math.round(ms*10)/10,...info};this.samples.push(sample);if(this.samples.length>this.maxSamples)this.samples.shift();this.emit?.(sample);}
  start(name,info={}){if(!this.enabled)return null;const start=this.now();let previous=start,done=false;return {phase:label=>{const time=this.now();this.record(name+':'+label,time-previous,info);previous=time;},finish:()=>{if(done)return;done=true;this.record(name,this.now()-start,info);}};}
 }
 return {IdleLoop,DiagnosticTrail,SpeedMetrics,GeometryIndex,canRefreshStyle,SourceDataCache,CameraGate};
});
