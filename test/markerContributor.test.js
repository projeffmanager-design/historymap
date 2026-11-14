'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {ObjectId}=require('mongodb');
const {validateContributorUpdate,createContributorMemberSearch}=require('../lib/markerContributor');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'public/assets/marker-contributor.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const mapScript=fs.readFileSync(path.join(root,'public/assets/generated/map-scripts.2b9385b0203b.js'),'utf8');
const oldId='111111111111111111111111',newId='222222222222222222222222';
const toObjectId=id=>ObjectId.isValid(id)?new ObjectId(id):null;
const response=()=>({statusCode:200,status(code){this.statusCode=code;return this;},set(){},json(body){this.body=body;return this;}});
function matches(row,query){
 return Object.entries(query).every(([key,condition])=>{
  if(key==='$or')return condition.some(item=>matches(row,item));
  const value=key.split('.').reduce((object,field)=>object?.[field],row);
  if(condition instanceof RegExp)return typeof value==='string'&&condition.test(value);
  if(condition&&typeof condition==='object'&&'$ne'in condition)return value!==condition.$ne;
  return String(value)===String(condition);
 });
}
function apiFixture(){
 const members=[
  {_id:new ObjectId(oldId),username:'관리자',position:'관리자'},
  {_id:new ObjectId(newId),username:'메칸더V',position:'사관',historianProfile:{displayName:'역사 연구자'},email:'private@example.test',password:'private-hash'},
  {_id:new ObjectId('333333333333333333333333'),username:'휴면 연구자',isActive:false},
  {_id:new ObjectId('444444444444444444444444'),username:'게스트 연구자',isGuest:true},
  {_id:new ObjectId('555555555555555555555555'),username:'삭제 연구자',deleted:true}
 ];
 const record={_id:'marker',name:'백록파',createdBy:'관리자',createdByUserId:oldId,originContributionId:'source-record',lat:20,lng:110,history:[]};
 const calls=[],memberQueries=[];
 const users={
  async findOne(query,options){memberQueries.push({query,options});return members.find(row=>matches(row,query))||null;},
  find(query,options){memberQueries.push({query,options});let rows=members.filter(row=>matches(row,query));return {sort(){return this;},limit(limit){rows=rows.slice(0,limit);return this;},toArray:async()=>rows};}
 };
 const collections={users,castle:{async findOne(){return structuredClone(record);},async updateOne(filter,update){calls.push({filter,update});Object.assign(record,update.$set);return {matchedCount:1,modifiedCount:1,acknowledged:true};}}};
 let handler;
 const verifyToken=()=>{};
 const context={app:{put(url,auth,fn){assert.equal(url,'/api/castle/:id');handler=fn;}},verifyToken,validateContributorUpdate,toObjectId:id=>id==='marker'?'marker':toObjectId(id),collections,
  hasSameCastleDuplicateIdentity:()=>true,findDuplicateCastleCandidate:async()=>null,syncCastleHistoricalRelations:async()=>{},
  patchCastleInStaticFile:(op,data)=>calls.push({patch:op,data}),logCRUD(){},logActivity:async()=>{},console:{log(){},warn(){},error(){}}};
 const start=server.indexOf("        app.put('/api/castle/:id',");const end=server.indexOf('        // 지도에서 선택한 여러 성에',start);assert.ok(start>=0&&end>start);
 vm.runInNewContext(server.slice(start,end),context);
 const searchHandler=createContributorMemberSearch({collections});
 return {record,calls,handler,members,memberQueries,collections,searchHandler,
  async save(body,role='admin'){const res=response();await handler({params:{id:'marker'},body,user:{role,username:'관리자',userId:oldId}},res);return res;},
  async search(q,role='admin'){const res=response();await searchHandler({query:{q},user:{role}},res);return res;}
 };
}
function fixture(fetchImpl){
 const elements=new Map(),tasks=[],requests=[];
 function element(id){
  if(!elements.has(id))elements.set(id,{value:'',textContent:'',style:{},dataset:{},attributes:{},disabled:false,children:[],handlers:{},
   focus(){this.focused=true;},setAttribute(name,value){this.attributes[name]=value;},appendChild(child){this.children.push(child);},
   set innerHTML(value){this.children=[];},addEventListener(event,handler){this.handlers[event]=handler;},contains(target){return target===this||this.children.includes(target);}});
  return elements.get(id);
 }
 let counter=0;
 const context=vm.createContext({document:{getElementById:element,createElement:()=>element('row-'+counter++),addEventListener(){}},window:{},console,AbortController,
  setTimeout:fn=>tasks.push(fn),clearTimeout(){},localStorage:{getItem:()=> 'test-token'},sessionStorage:{getItem:()=>null},
  fetch:async(url,options)=>{requests.push({url,options});return fetchImpl?fetchImpl(url,options):{ok:true,json:async()=>[{_id:newId,username:'메칸더V',displayName:'역사 연구자',position:'사관'}]};}});
 vm.runInContext(source,context);
 const form=context.window.markerContributorForm;
 return {get:element,context,form,requests,tasks,
  async type(text){element('castleCreatedByInput').value=text;element('castleCreatedByInput').handlers.input();await tasks.at(-1)?.();},
  choose(){element('castleContributorResults').children[0].handlers.click();}};
}
const castle={_id:'marker',createdBy:'관리자',createdByUserId:oldId};
const admin={role:'admin'};

test('member search matches username and activity name and only returns safe identity fields',async()=>{
 const api=apiFixture();
 for(const q of ['메칸더','역사 연구']){
  const res=await api.search(q);assert.equal(res.statusCode,200);assert.equal(res.body.length,1);assert.equal(res.body[0]._id,newId);
  assert.deepEqual(Object.keys(res.body[0]).sort(),['_id','displayName','position','username']);
  assert.equal(JSON.stringify(res.body).includes('private'),false);
 }
 assert.equal(api.memberQueries[0].options.projection.password,undefined);
 assert.equal(api.memberQueries[0].options.projection.email,undefined);
});

test('member search excludes inactive, guest and deleted members, escapes regex and rejects non-admins',async()=>{
 const api=apiFixture();assert.equal((await api.search('연구자')).body.length,1);
 assert.equal((await api.search('.*')).body.length,0);assert.deepEqual((await api.search('')).body,[]);
 assert.equal((await api.search('메칸더','user')).statusCode,403);
 for(const id of ['333333333333333333333333','444444444444444444444444','555555555555555555555555'])assert.equal((await api.save({createdByUserId:id})).statusCode,404);
});

test('only administrators see the member picker and unchanged attribution does not affect ordinary saves',()=>{
 for(const role of ['admin','superuser','user','사관']){
  const f=fixture();f.form.populate(castle,{role});assert.equal(f.get('castleCreatedByInput').disabled,!['admin','superuser'].includes(role));
  assert.equal(f.get('castleContributorPicker').style.display,['admin','superuser'].includes(role)?'block':'none');
  const body={desc:'설명'};assert.equal(f.form.apply(body,'marker',{role}),null);assert.equal('createdByUserId'in body,false);
 }
});

test('typing a name alone cannot change attribution; selecting a result adds only the selected member ID to Save',async()=>{
 const f=fixture();f.form.populate(castle,admin);await f.type('메칸더');
 const arbitrary={};assert.match(f.form.apply(arbitrary,'marker',admin),/검색 결과/);assert.equal('createdBy'in arbitrary,false);
 const row=f.get('castleContributorResults').children[0];assert.match(row.textContent,/메칸더V.*역사 연구자.*사관/);
 f.choose();const body={};assert.equal(f.form.apply(body,'marker',admin),null);assert.equal(body.createdByUserId,newId);assert.equal('createdBy'in body,false);
 assert.match(f.get('castleContributorSelected').textContent,/선택한 회원: 메칸더V/);
 const different={};f.form.apply(different,'other',admin);assert.equal('createdByUserId'in different,false);
 const creating={};f.form.apply(creating,null,admin);assert.equal('createdByUserId'in creating,false);
});

test('editing the selected text clears selection and keyboard navigation can select the member',async()=>{
 const f=fixture();f.form.populate(castle,admin);await f.type('메칸더');f.choose();
 await f.type('다른 이름');assert.match(f.form.apply({},'marker',admin),/검색 결과/);
 const row=f.get('castleContributorResults').children[0];
 f.get('castleCreatedByInput').handlers.keydown({key:'ArrowDown',preventDefault(){}});assert.equal(row.focused,true);
 row.handlers.keydown({key:'Enter',preventDefault(){}});const body={};f.form.apply(body,'marker',admin);assert.equal(body.createdByUserId,newId);
});

test('old search responses and old result clicks cannot overwrite another object or a new query',async()=>{
 const pending=[];const f=fixture(()=>new Promise(resolve=>pending.push(resolve)));f.form.populate(castle,admin);
 const first=f.type('이전');const second=f.type('메칸더');
 pending[1]({ok:true,json:async()=>[{_id:newId,username:'메칸더V'}]});await second;
 pending[0]({ok:true,json:async()=>[{_id:oldId,username:'오래된 회원'}]});await first;
 assert.match(f.get('castleContributorResults').children[0].textContent,/메칸더V/);
 const stale=f.get('castleContributorResults').children[0];f.form.populate({_id:'other',createdBy:'다른 기여자'},admin);stale.handlers.click();
 assert.equal(f.get('castleCreatedByInput').value,'다른 기여자');
 f.form.clear();assert.equal(f.get('castleCreatedByRow').style.display,'none');assert.equal(f.get('castleCreatedByInput').disabled,true);
});

test('no matches and API failures are visible and the typed value remains available for correction',async()=>{
 const f=fixture(async()=>({ok:true,json:async()=>[]}));f.form.populate(castle,admin);await f.type('없는 회원');
 assert.match(f.get('castleContributorStatus').textContent,/일치하는 회원이 없습니다/);
 f.context.fetch=async()=>({ok:false});await f.type('실패');assert.match(f.get('castleContributorStatus').textContent,/실패/);assert.equal(f.get('castleCreatedByInput').value,'실패');
});

test('server resolves the selected member authoritatively and saves name and ID together without changing evidence or scores',async()=>{
 for(const role of ['admin','superuser']){
  const api=apiFixture(),f=fixture();f.form.populate(api.record,{role});await f.type('메칸더');f.choose();
  const body={desc:'설명도 수정'};f.form.apply(body,'marker',{role});body.createdBy='위조된 이름';
  const res=await api.save(body,role);assert.equal(res.statusCode,200);assert.equal(res.body.castle.createdBy,'메칸더V');assert.equal(res.body.castle.createdByUserId,newId);
  assert.equal(api.record.originContributionId,'source-record');assert.equal(api.record.lat,20);assert.equal(api.record.lng,110);
  assert.equal(api.calls.find(call=>call.patch).data.createdByUserId,newId);
  assert.equal(api.members[1].username,'메칸더V');assert.equal('approvedCount'in api.members[1],false);
 }
});

test('server rejects free-text names, malformed IDs, missing or no-longer-active members and non-admin spoofing',async()=>{
 const api=apiFixture();
 for(const body of [{createdBy:'메칸더V'},{createdByUserId:null},{createdByUserId:'invalid'},{createdByUserId:[]},{createdByUserId:{}}])assert.equal((await api.save(body)).statusCode,400);
 assert.equal((await api.save({createdByUserId:'666666666666666666666666'})).statusCode,404);
 for(const role of ['user','사관'])for(const body of [{createdBy:'사칭'},{createdByUserId:newId}])assert.equal((await api.save(body,role)).statusCode,403);
 assert.equal(api.calls.length,0);
 api.members[1].isActive=false;assert.equal((await api.save({createdByUserId:newId})).statusCode,404);assert.equal(api.calls.length,0);
 assert.equal((await api.save({desc:'일반 수정'},'user')).statusCode,200);
});

test('authenticated HTTP search, result selection and the existing marker PUT form one complete flow',async t=>{
 const express=require('express'),app=express(),api=apiFixture();app.use(express.json());
 const verifyAdmin=(req,res,next)=>{if(req.headers.authorization!=='Bearer test-token')return res.status(401).json({message:'로그인 필요'});req.user=admin;next();};
 const route=server.split('\n').find(line=>line.includes("app.get('/api/admin/contributor-members',"));assert.ok(route);
 vm.runInNewContext(route,{app,verifyAdmin,createContributorMemberSearch,collections:api.collections});
 app.put('/api/castle/:id',verifyAdmin,api.handler);
 const listener=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});t.after(()=>new Promise(resolve=>listener.close(resolve)));
 const base=`http://127.0.0.1:${listener.address().port}`;
 assert.equal((await fetch(base+'/api/admin/contributor-members?q=member')).status,401);
 const f=fixture((url,options)=>fetch(base+url,options));f.form.populate(castle,admin);await f.type('역사 연구');f.choose();
 const body={};f.form.apply(body,'marker',admin);
 const res=await fetch(base+'/api/castle/marker',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer test-token'},body:JSON.stringify(body)});
 assert.equal(res.status,200);const updated=(await res.json()).castle;assert.equal(updated.createdBy,'메칸더V');assert.equal(updated.createdByUserId,newId);
});

test('the picker is in the editor and saving refreshes only the currently open object label',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/id="castleContributorResults"/);assert.match(html,/aria-controls="castleContributorResults"/);
 assert.ok(html.indexOf('/public/assets/marker-contributor.js')<html.indexOf('/public/assets/generated/map-scripts.2b9385b0203b.js'));
 assert.match(mapScript,/markerContributorForm\?\.populate\(castle, currentUser\)/);assert.match(mapScript,/markerContributorForm\?\.apply\(data, editingCastleKey, currentUser\)/);
 const f=fixture(),meta=f.get('odp-meta');let label=null;meta.querySelector=()=>label;meta.appendChild=child=>{label=child;};
 f.context.window._currentDetailCastleId='marker';f.form.syncDetail({_id:'marker',createdBy:'메칸더V'});assert.equal(label.textContent,'✍️ 메칸더V');
 f.context.window._currentDetailCastleId='other';f.form.syncDetail({_id:'marker',createdBy:'다른 사람'});assert.equal(label.textContent,'✍️ 메칸더V');
});
