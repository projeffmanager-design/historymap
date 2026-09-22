#!/usr/bin/env node
// Build a compact, deterministic analysis boundary file from the map's existing tile export.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),tileDir=path.join(root,'public','tiles');
const index=JSON.parse(fs.readFileSync(path.join(tileDir,'index.json'),'utf8'));
const features=new Map();
function polygonParts(geometry){return geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?(geometry.coordinates||[]):[];}
function append(base,extra){const parts=[...polygonParts(base),...polygonParts(extra)];return parts.length===1?{type:'Polygon',coordinates:parts[0]}:{type:'MultiPolygon',coordinates:parts};}
function capRing(ring){
  if(!Array.isArray(ring)||ring.length<=152)return ring;
  const closed=ring.length>1&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1];
  const last=closed?ring.length-1:ring.length,step=Math.ceil(last/150),out=[];
  for(let i=0;i<last;i+=step)out.push(ring[i]);
  if(last&&out.at(-1)!==ring[last-1])out.push(ring[last-1]);
  if(closed&&out.length)out.push(out[0]);return out;
}
function capCoords(coords,depth=0){if(!Array.isArray(coords))return coords;if(depth>=1&&Array.isArray(coords[0])&&typeof coords[0][0]==='number')return capRing(coords);return coords.map(c=>capCoords(c,depth+1));}
for(const tile of index.tiles||[]){
  const collection=JSON.parse(fs.readFileSync(path.join(tileDir,tile.filename),'utf8'));
  for(const feature of collection.features||[]){
    const p=feature.properties||{},id=String(p._id||feature.id||'');if(!id||!polygonParts(feature.geometry).length)continue;
    const known=features.get(id);
    if(!known)features.set(id,{_id:id,name:p.name||'영토',name_ko:p.name_ko,geometry:feature.geometry,bbox:p.bbox,level:p.level,country:p.country_id||p.country||null});
    else known.geometry=append(known.geometry,feature.geometry);
  }
}
const output=[...features.values()].sort((a,b)=>a._id.localeCompare(b._id)).map(r=>({...r,geometry:{type:r.geometry.type,coordinates:capCoords(r.geometry.coordinates)}}));
fs.writeFileSync(path.join(root,'public','power-regions.json'),JSON.stringify(output));
console.log(JSON.stringify({regions:output.length,bytes:fs.statSync(path.join(root,'public','power-regions.json')).size,sourceUpdatedAt:index.updated_at}));
