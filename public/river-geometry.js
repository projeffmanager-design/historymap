/* Shared immutable geometry operations. Coordinates always use GeoJSON [lng, lat]. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RiverGeometry=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const clone=value=>JSON.parse(JSON.stringify(value));
function paths(value,path=[],out=[]){
 if(!value)return out;
 const push=(p,closed,label)=>out.push({path:p,closed,label});
 switch(value.type){
 case 'Feature':return paths(value.geometry,path.concat('geometry'),out);
 case 'FeatureCollection':value.features.forEach((g,i)=>paths(g,path.concat('features',i),out));break;
 case 'GeometryCollection':value.geometries.forEach((g,i)=>paths(g,path.concat('geometries',i),out));break;
 case 'LineString':push(path.concat('coordinates'),false,'줄기');break;
 case 'MultiLineString':value.coordinates.forEach((_,i)=>push(path.concat('coordinates',i),false,'줄기 '+(i+1)));break;
 case 'Polygon':value.coordinates.forEach((_,i)=>push(path.concat('coordinates',i),true,i?'구멍 '+i:'외곽'));break;
 case 'MultiPolygon':value.coordinates.forEach((rings,i)=>rings.forEach((_,j)=>push(path.concat('coordinates',i,j),true,'영역 '+(i+1)+' · '+(j?'구멍 '+j:'외곽'))));break;
 }return out;
}
function at(value,path){return path.reduce((v,key)=>v?.[key],value);}
function replace(value,path,points){const result=clone(value);let target=result;path.slice(0,-1).forEach(key=>target=target[key]);target[path.at(-1)]=clone(points);return result;}
const xy=p=>({x:p[0],y:p[1]});
function nearest(points,point,project=xy){
 const p=project(point);let best=null;
 for(let i=0;i<points.length-1;i++){
  const a=project(points[i]),b=project(points[i+1]),dx=b.x-a.x,dy=b.y-a.y;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  const d=Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);
  if(!best||d<best.distance)best={index:i,t,pos:i+t,distance:d,point:points[i].map((v,k)=>v+((points[i+1][k]??v)-v)*t)};
 }return best;
}
function range(points,start,end,project){
 const a=nearest(points,start,project),b=nearest(points,end,project);
 if(!a||!b||Math.abs(a.pos-b.pos)<1e-8)throw new Error('서로 다른 구간 양끝을 선택하세요.');
 const lo=a.pos<b.pos?a:b,hi=a.pos<b.pos?b:a;
 const line=[lo.point];for(let i=Math.floor(lo.pos)+1;i<hi.pos;i++)line.push(points[i].slice());line.push(hi.point);
 return {a,b,lo,hi,line:a.pos<b.pos?line:line.reverse()};
}
function replaceRange(points,start,end,line){
 const r=range(points,start,end);const replacement=r.a.pos<r.b.pos?line:line.slice().reverse();
 const next=points.slice(0,Math.ceil(r.lo.pos)).concat(clone(replacement),points.slice(Math.floor(r.hi.pos)+1));
 return next.filter((p,i)=>!i||p[0]!==next[i-1][0]||p[1]!==next[i-1][1]);
}
function bestBoundary(geometry,riverLine){
 let best=null;
 paths(geometry).filter(p=>p.closed).forEach(p=>{
  const ring=at(geometry,p.path),r=rangeSafe(ring,riverLine[0],riverLine.at(-1));if(!r)return;
  const forward=r.line;
  const endPos=r.b.pos,startPos=r.a.pos;
  let wrap;
  if(startPos<endPos)wrap=[r.a.point].concat(ring.slice(0,Math.ceil(startPos)).reverse(),ring.slice(Math.floor(endPos)+1,-1).reverse(),[r.b.point]);
  else wrap=[r.a.point].concat(ring.slice(Math.floor(startPos)+1,-1),ring.slice(0,Math.ceil(endPos)),[r.b.point]);
  [forward,wrap].forEach((line,index)=>{
   if(line.length<2)return;
   // Score both directions of shape distance so the long way around a territory cannot win.
   const sample=list=>list.filter((_,i)=>i%Math.max(1,Math.floor(list.length/100))===0);
   const avg=(a,b)=>sample(a).reduce((s,p)=>s+nearest(b,p).distance,0)/sample(a).length;
   const score=avg(line,riverLine)+avg(riverLine,line)+r.a.distance+r.b.distance;
   if(!best||score<best.score)best={line,score,path:p.path,complement:(index?forward:wrap).slice().reverse()};
  });
 });
 if(!best)throw new Error('가까운 영토 경계 구간을 찾지 못했습니다.');return best;
}
function fitBoundary(geometry,riverLine){
 const best=bestBoundary(geometry,riverLine),rest=best.complement;
 const guard=(a,b)=>{const length=Math.hypot(b[0]-a[0],b[1]-a[1]),t=length?Math.min(.2,.005/length):0;return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];};
 const points=clone(riverLine).concat([guard(rest[0],rest[1])],clone(rest.slice(1,-1)),[guard(rest.at(-1),rest.at(-2)),riverLine[0].slice()]);
 const clean=points.filter((p,i)=>!i||p[0]!==points[i-1][0]||p[1]!==points[i-1][1]);
 if(clean.length<4)throw new Error('맞출 경계 구간이 너무 짧습니다.');
 return {geometry:replace(geometry,best.path,clean),score:best.score};
}
function rangeSafe(...args){try{return range(...args);}catch(_){return null;}}
function validLine(points){return Array.isArray(points)&&points.length>=2&&points.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90)&&points.some(p=>p[0]!==points[0][0]||p[1]!==points[0][1]);}
return {clone,paths,at,replace,nearest,range,replaceRange,bestBoundary,fitBoundary,validLine};
});
