'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const fixture=require('./helpers/kingListFixture');
const source=fs.readFileSync(require.resolve('../public/assets/generated/map-scripts.2b9385b0203b.js'),'utf8');
const songKing={_id:'ningzong',name:'영종 (寧宗) / 조확',start:1194,start_month:7,end:1224,end_month:8};
function data(){
 const ancient=[['zhou','서주(西周)',-1046,-771],['east','동주(東周)',-771,-256],['qi','남조 - 남제(南齊)',479,502],['liang','남조 - 남량(南梁)',502,557],['chen','남조 - 남진(南陳)',557,589],['jin','동진(東晉)',317,420],['han-late','후한(後漢)',25,220]].map(([_id,name,start,end])=>({_id,name,start,end}));
 const han={_id:'han',name:'한족(漢族)',start:-3000,end:1662,history:ancient.map(c=>({name:c.name,start_year:c.start,end_year:c.end})).concat([{name:'남송(南宋)',aliases:['南宋'],start_year:1127,end_year:1279}])};
 const goryeo={_id:'goryeo',name:'고려(高麗)',start:918,end:1392};
 return {countries:[han,...ancient,goryeo],payload:[{country_id:'han',kings:[songKing]},{country_id:'goryeo',kings:[{_id:'huijong',name:'희종',start:1204,end:1211}]}]};
}
test('merged historical aliases cannot attach Song Ningzong to ancient country rows',()=>{
 const d=data(),f=fixture(source,d.countries,d.payload),html=f.render();
 assert.equal((html.match(/영종/g)||[]).length,1);assert.match(html,/남송\(南宋\)/);assert.match(html,/고려\(高麗\)/);assert.match(html,/희종/);
 for(const c of d.countries.slice(1,-1)){assert.ok(!html.includes(c.name));assert.equal(f.context.getKingByYear(c,1205,1),null);assert.equal(f.context.getKingByYear(c.name,1205,1),null);}
 assert.equal(f.context.getKingByYear('han',1205,1).name,songKing.name);assert.equal(f.context.getKingByYear('南宋',1205,1).name,songKing.name);
});
test('exact base name wins over an earlier country historical alias, independent of array order',()=>{
 const d=data();for(const countries of [d.countries,d.countries.slice().reverse(),d.countries.slice().sort((a,b)=>a.start-b.start)]){
  const f=fixture(source,countries,d.payload);assert.equal(f.context.getCountryInfo('서주(西周)')._id,'zhou');assert.equal((f.render().match(/영종/g)||[]).length,1);
 }
});
test('country ID lookup remains correct while both an alias and exact country are active',()=>{
 const d=data();d.payload.push({country_id:'qi',kings:[{_id:'qi-own',name:'남제의 왕',start:490,end:502}]});d.payload[0].kings.push({_id:'han-500',name:'한족 통합 기록',start:490,end:502});
 const f=fixture(source,d.countries,d.payload,500);assert.equal(f.context.getKingByYear('남조 - 남제(南齊)',500,1)._id,'qi-own');assert.equal(f.context.getKingByYear(d.countries.find(c=>c._id==='qi'),500,1)._id,'qi-own');
});
test('reign start and end months are inclusive and an ended country never borrows a reigning king',()=>{
 const d=data(),f=fixture(source,d.countries,d.payload);
 assert.equal(f.context.getKingByYear('han',1194,6),null);assert.equal(f.context.getKingByYear('han',1194,7)._id,'ningzong');assert.equal(f.context.getKingByYear('han',1224,8)._id,'ningzong');assert.equal(f.context.getKingByYear('han',1224,9),null);
 const c={_id:'short',name:'짧은 국가',start:1200,start_month:3,end:1205,end_month:4};const g=fixture(source,[c],[{country_id:'short',kings:[{name:'군주',start:1190,end:1210}]}]);
 assert.equal(g.context.getKingByYear(c,1200,2),null);assert.ok(g.context.getKingByYear(c,1200,3));assert.ok(g.context.getKingByYear(c,1205,4));assert.equal(g.context.getKingByYear(c,1205,5),null);
});
test('ObjectId-shaped country IDs and legacy year fields work without mutating source data',()=>{
 const c={_id:{$oid:'object-country'},name:'국가',start:-100,end:null};const king={name:'군주',start_year:-1,start_month:12,end_year:1,end_month:1},before=JSON.stringify([c,king]);
 const f=fixture(source,[c],[{country_id:'object-country',kings:[king]}]);assert.equal(f.context.getKingByYear(c,-1,11),null);assert.ok(f.context.getKingByYear(c,-1,12));assert.ok(f.context.getKingByYear(c,1,1));assert.equal(f.context.getKingByYear(c,1,2),null);assert.equal(JSON.stringify([c,king]),before);
});
test('same-named contemporaneous rulers in distinct countries remain visible and duplicate payload rows collapse',()=>{
 const countries=[{_id:'a',name:'A국',start:100,end:200},{_id:'b',name:'B국',start:100,end:200}],a={_id:'a-king',name:'태조',start:100,end:200},b={_id:'b-king',name:'태조',start:100,end:200};
 const f=fixture(source,countries,[{country_id:'a',kings:[a,a]},{country_id:'a',kings:[a]},{country_id:'b',kings:[b]}],150);assert.equal((f.render().match(/class="king-item"/g)||[]).length,2);
});
test('missing reign start does not display an arbitrary monarch and blank end means open-ended',()=>{
 const c={_id:'a',name:'국가',start:1,end:null},f=fixture(source,[c],[{country_id:'a',kings:[{name:'미상'},{name:'현재 군주',start:200,end:''}]}],300);
 assert.equal(f.context.getKingByYear(c,300,1).name,'현재 군주');assert.match(f.render(),/현재/);assert.ok(!f.render().includes('미상'));
});
