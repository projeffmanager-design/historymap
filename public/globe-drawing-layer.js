/* Previously saved drawing types on the default map, using their original records for editing. */
(function(root){
'use strict';
const idOf=value=>String(value?._id?.$oid||value?._id||'');
function featuresFor(records,year,visibility={}){
 const features=[];
 for(const record of records||[]){
  if(!['general','arrow','mountain'].includes(record.type))continue;
  if(year<(record.start_year??record.startYear??-Infinity)||year>(record.end_year??record.endYear??Infinity))continue;
  if(record.type==='mountain'&&visibility.natural===false||record.type==='arrow'&&visibility.relic===false)continue;
  const feature=record.geojson,geometry=feature?.geometry||feature;if(!geometry?.coordinates)continue;
  const color=record.color||'#3388ff',properties={drawing_id:idOf(record),name:record.name||'',kind:record.type,color,width:Math.min(20,Math.max(.5,Number(record.line_width)||1.5)),path_label:record.path_label||'',label_size:Math.min(48,Math.max(8,Number(record.path_label_size)||13)),hidden_line:record.hide_path_line===true?1:0,tip:0};
  let display=geometry;
  // Legacy Leaflet circles were stored as a Point plus a radius in metres.
  if(geometry.type==='Point'&&Number(feature.properties?.radius)>0)display=root.GlobeDrawingTool.circle(geometry.coordinates,Number(feature.properties.radius));
  features.push({type:'Feature',geometry:display,properties});
  if(record.type==='arrow'){
   const lines=geometry.type==='LineString'?[geometry.coordinates]:geometry.type==='MultiLineString'?geometry.coordinates:[];
   for(const line of lines){if(line.length<2)continue;const end=line.at(-1),previous=line.at(-2),bearing=Math.atan2((end[0]-previous[0])*Math.cos(end[1]*Math.PI/180),end[1]-previous[1])*180/Math.PI;
    features.push({type:'Feature',geometry:{type:'Point',coordinates:end},properties:{...properties,tip:1,bearing}});}
  }
 }
 return {type:'FeatureCollection',features};
}
class GlobeDrawingLayer{
 constructor(){this.identities=new WeakMap();this.serial=0;this.states=new WeakMap();}
 identity(value){if(!value||typeof value!=='object')return 0;if(!this.identities.has(value))this.identities.set(value,++this.serial);return this.identities.get(value);}
 key(records,year,visibility={}){return year+':'+[visibility.natural!==false,visibility.relic!==false]+':'+records.filter(r=>['general','arrow','mountain'].includes(r.type)).map(r=>[this.identity(r),this.identity(r.geojson?.geometry?.coordinates||r.geojson?.coordinates),r.name,r.type,r.color,r.line_width,r.path_label,r.path_label_size,r.hide_path_line,r.start_year,r.end_year].join('/')).join('|');}
 render(map,records,year,visibility,onSelect){
  const id='globe-extra-drawings',key=this.key(records,year,visibility);let state=this.states.get(map);
  if(state?.key===key&&map.getSource(id))return;
  const data=featuresFor(records,year,visibility);
  if(map.getSource(id))map.getSource(id).setData(data);else map.addSource(id,{type:'geojson',data});
  const add=layer=>{if(!map.getLayer(layer.id))map.addLayer({...layer,source:id});};
  add({id:id+'-fill',type:'fill',filter:['==','$type','Polygon'],paint:{'fill-color':['get','color'],'fill-opacity':.24}});
  add({id:id+'-line',type:'line',filter:['all',['!=','$type','Point'],['==','hidden_line',0]],paint:{'line-color':['get','color'],'line-width':['get','width'],'line-opacity':.9},layout:{'line-cap':'round','line-join':'round'}});
  add({id:id+'-point',type:'circle',filter:['all',['==','$type','Point'],['==','tip',0]],paint:{'circle-color':['get','color'],'circle-radius':6,'circle-stroke-color':'#fff','circle-stroke-width':1.5}});
  add({id:id+'-hit',type:'line',filter:['all',['!=','$type','Point'],['==','hidden_line',0]],paint:{'line-width':14,'line-opacity':0}});
  add({id:id+'-label',type:'symbol',filter:['all',['!=','$type','Point'],['!=','path_label','']],layout:{'symbol-placement':'line','text-field':['get','path_label'],'text-font':['Open Sans Regular'],'text-size':['get','label_size'],'text-allow-overlap':true},paint:{'text-color':['get','color'],'text-halo-color':'#17212b','text-halo-width':1.5}});
  if(!map.hasImage('drawing-arrow-head')){
   const cv=document.createElement('canvas');cv.width=cv.height=32;const ctx=cv.getContext('2d');ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(16,1);ctx.lineTo(30,30);ctx.lineTo(16,23);ctx.lineTo(2,30);ctx.closePath();ctx.fill();map.addImage('drawing-arrow-head',ctx.getImageData(0,0,32,32),{sdf:true});
  }
  add({id:id+'-arrow',type:'symbol',filter:['==','tip',1],layout:{'icon-image':'drawing-arrow-head','icon-size':.65,'icon-rotate':['get','bearing'],'icon-rotation-alignment':'map','icon-allow-overlap':true},paint:{'icon-color':['get','color']}});
  if(!state){state={};this.states.set(map,state);
   map.on('click',event=>{if(!state.onSelect||!map.getSource(id))return;const layers=['-hit','-fill','-point','-arrow'].map(s=>id+s).filter(id=>map.getLayer(id));const hit=map.queryRenderedFeatures(event.point,{layers})[0];if(!hit)return;const record=state.records.find(record=>idOf(record)===String(hit.properties.drawing_id));if(record)state.onSelect(record,event);});
  }
  state.key=key;state.records=records;state.onSelect=onSelect;
 }
}
GlobeDrawingLayer.featuresFor=featuresFor;root.GlobeDrawingLayer=GlobeDrawingLayer;
})(window);
