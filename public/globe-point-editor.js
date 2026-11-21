/* MapLibre point editing: one draft, all branches/rings retained, bounded visible handles. */
(function(root){
'use strict';
class GlobePointEditor {
 constructor(options){
  this.options=options;this.map=options.map;this.data=RiverGeometry.clone(options.geometry);this.parts=RiverGeometry.paths(this.data);this.index=0;this.markers=[];this.closed=false;
  if(!this.parts.length)throw new Error('편집할 선 또는 폴리곤이 없습니다.');
  this.id='globe-point-draft';this.adding=false;this.makeToolbar();
  this.click=e=>{if(!this.adding||e.originalEvent?.target?.closest?.('.maplibregl-marker'))return;const r=RiverGeometry.nearest(this.coordinates(),[e.lngLat.lng,e.lngLat.lat],p=>this.map.project(p));if(!r||r.distance>28){this.message('추가할 선 가까이를 클릭하세요.');return;}const pts=this.coordinates();pts.splice(r.index+1,0,r.point);this.setCoordinates(pts);this.forced=r.index+1;this.refresh();};
  this.move=()=>this.refreshHandles();this.map.on('click',this.click);this.map.on('moveend',this.move);
  this.map.addSource(this.id,{type:'geojson',data:this.preview()});
  this.map.addLayer({id:this.id,type:'line',source:this.id,paint:{'line-color':'#53d9ff','line-width':4,'line-dasharray':[2,1]}});
  this.refresh();this.focusPart();
 }
 coordinates(){return RiverGeometry.at(this.data,this.parts[this.index].path).map(p=>p.slice());}
 setCoordinates(points){const part=this.parts[this.index];if(part.closed)points[points.length-1]=points[0].slice();let target=this.data;part.path.slice(0,-1).forEach(k=>target=target[k]);target[part.path.at(-1)]=points;}
 preview(){return {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:this.coordinates()}};}
 message(text){this.status.textContent=text;}
 makeToolbar(){
  const bar=document.createElement('div');bar.id='globe-point-editor-toolbar';bar.style.cssText='position:fixed;top:112px;left:50%;transform:translateX(-50%);max-width:90vw;z-index:10020;background:#172a38;color:#fff;border:1px solid #d3b861;border-radius:6px;padding:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;box-shadow:0 3px 16px #0009';
  const title=document.createElement('strong');title.textContent='📍 기본 지도 포인트 편집';bar.appendChild(title);
  const select=document.createElement('select');select.setAttribute('aria-label','편집할 줄기 또는 영역');this.parts.forEach((part,i)=>{const option=document.createElement('option');option.value=i;option.textContent=(i+1)+'. '+part.label;select.appendChild(option);});select.onchange=()=>{this.index=Number(select.value);this.forced=null;this.refresh();this.focusPart();};bar.appendChild(select);
  const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;bar.appendChild(b);return b;};
  button('편집 구간 보기',()=>this.focusPart());
  this.addButton=button('➕ 점 추가 OFF',()=>{this.adding=!this.adding;this.addButton.textContent='➕ 점 추가 '+(this.adding?'ON':'OFF');this.map.getCanvas().style.cursor=this.adding?'crosshair':'';});
  button('편집 완료',()=>this.finish(true));button('편집 취소',()=>this.finish(false));
  this.status=document.createElement('span');this.status.style.width='100%';bar.appendChild(this.status);document.body.appendChild(bar);this.bar=bar;
 }
 refresh(){if(this.closed)return;this.map.getSource(this.id)?.setData(this.preview());this.refreshHandles();}
 refreshHandles(){
  if(this.closed)return;this.markers.forEach(m=>m.remove());this.markers=[];
  const points=this.coordinates(),part=this.parts[this.index],count=points.length-(part.closed?1:0),canvas=this.map.getCanvas(),width=canvas.clientWidth,height=canvas.clientHeight;
  const visible=[];for(let i=0;i<count;i++){const p=this.map.project(points[i]);if(p.x>=-16&&p.x<=width+16&&p.y>=-16&&p.y<=height+16)visible.push({i,p});}
  let last=null;const step=Math.max(1,Math.ceil(visible.length/240));
  visible.forEach(({i,p},n)=>{
   if(i!==this.forced&&(n%step||last&&Math.hypot(p.x-last.x,p.y-last.y)<16))return;last=p;
   const element=document.createElement('div');element.setAttribute('aria-label','포인트 '+(i+1));element.title='드래그로 이동 · Shift+클릭 또는 우클릭으로 삭제';element.style.cssText='width:12px;height:12px;border:2px solid white;border-radius:50%;background:#3498db;cursor:grab;box-shadow:0 1px 4px #0009';
   const marker=new maplibregl.Marker({element,draggable:true}).setLngLat(points[i]).addTo(this.map);this.markers.push(marker);
   marker.on('drag',()=>{const ll=marker.getLngLat(),next=this.coordinates();next[i]=[ll.lng,ll.lat].concat(next[i].slice(2));if(part.closed&&i===0)next[next.length-1]=next[0].slice();this.setCoordinates(next);this.map.getSource(this.id)?.setData(this.preview());});
   marker.on('dragend',()=>{this.forced=i;this.refresh();});
   const remove=e=>{e.preventDefault();e.stopPropagation();if(count<=(part.closed?3:2)){this.message('최소 '+(part.closed?3:2)+'개 포인트가 필요합니다.');return;}const next=this.coordinates();next.splice(i,1);if(part.closed)next[next.length-1]=next[0].slice();this.setCoordinates(next);this.forced=null;this.refresh();};
   element.addEventListener('contextmenu',remove);element.addEventListener('click',e=>{e.stopPropagation();if(e.shiftKey||e.ctrlKey)remove(e);});
  });
  this.message('마커를 드래그해 이동 · 점 추가 ON 후 선 클릭 · '+count+'개 포인트 중 '+this.markers.length+'개 표시 (확대하면 더 표시)');
 }
 focusPart(){
  if(!this.map.fitBounds)return;
  const bounds=this.coordinates().reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
  if(bounds.every(Number.isFinite))this.map.fitBounds([[bounds[0],bounds[1]],[bounds[2],bounds[3]]],{padding:80,maxZoom:14,duration:500});
 }
 value(){return RiverGeometry.clone(this.data);}
 finish(save){const value=save?this.value():null;this.destroy();this.options.onFinish?.(value);}
 destroy(){if(this.closed)return;this.closed=true;this.map.off('click',this.click);this.map.off('moveend',this.move);this.markers.forEach(m=>m.remove());this.markers=[];if(this.map.getLayer(this.id))this.map.removeLayer(this.id);if(this.map.getSource(this.id))this.map.removeSource(this.id);this.map.getCanvas().style.cursor='';this.bar.remove();}
}
root.GlobePointEditor=GlobePointEditor;
})(window);
