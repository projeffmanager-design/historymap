// Exercise the real legacy layer IIFE with a minimal map adapter, without a browser or DB.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const model=require('../public/assets/power-model');
const source=fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.eb32f757b6b4.js'),'utf8');
const start=source.indexOf('(function() {\n  var _layer = null;');
const end=source.indexOf('\n})();',start)+6;
assert.ok(start>=0&&end>start);
let shown=null,currentYear=1100,population=500,fail=false;
const map={removeLayer:layer=>{if(shown===layer)shown=null;}};
const attach=value=>({addTo:layer=>{layer.items.push(value);}});
const events={};
const sandbox={console,Number,Math,Object,Array,String,Promise,NationalPowerModel:model,
  document:{getElementById:()=>null},setTimeout:()=>{},map,
  getCurrentYearMonth:()=>({year:currentYear,month:1}),
  addEventListener:(name,fn)=>{events[name]=fn;},
  L:{layerGroup:()=>({items:[],addTo(){shown=this;return this;}}),circleMarker:(_,options)=>attach(options),divIcon:options=>options,marker:(_,options)=>attach(options)},
  NationalPower:{populationLayer:async year=>{if(fail)throw new Error('fixture failure');return year===1100?[{name:'territory',lat:1,lng:1,pop_by_year:{1100:population}}]:[];}}
};
sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(source.slice(start,end),sandbox);
const button={classList:{add(){},remove(){}},textContent:''};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  await sandbox.togglePopHeat(button);
  assert.ok(shown);
  assert.ok(shown.items.some(item=>item.icon?.html.includes('100호')),'500 people must display 100 estimated households');
  population=1000;events['national-power-data']();await flush();
  assert.ok(shown.items.some(item=>item.icon?.html.includes('200호')),'manual changes must refresh the same layer');
  sandbox._refreshPopulationForTime(1900);await flush();
  assert.equal(shown,null,'missing years must clear old labels');
  sandbox._refreshPopulationForTime(1100);await flush();
  assert.ok(shown);
  await sandbox.togglePopHeat(button);assert.equal(shown,null);
  fail=true;await sandbox.togglePopHeat(button);assert.equal(shown,null);
  assert.equal(button.textContent,'호구수 오류');
  console.log('Population layer: shared totals, manual refresh, empty-year clearing and failure handling passed');
})();
