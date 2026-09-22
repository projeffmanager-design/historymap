const assert=require('node:assert/strict');
const {createAdjustmentHandler}=require('../lib/territoryPopulation');
const valid={mode:'value',value:100,start_year:100,end_year:200,revision:0,reason:'test'};
(async()=>{
  let writes=[],invalidations=0,matched=1,fail=false;
  const handler=createAdjustmentHandler({
    collection:{updateOne:async(filter,update)=>{if(fail)throw new Error('fixture');writes.push({filter,update});return {matchedCount:matched};}},
    toObjectId:id=>id==='valid-id'?id:null,invalidate:()=>invalidations++,log:()=>{}
  });
  async function call(body,id='valid-id'){
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(payload){this.payload=payload;return this;}};
    await handler({params:{id},body,user:{userId:'admin-fixture'}},res);return res;
  }
  assert.equal((await call(valid,'bad-id')).statusCode,400);
  assert.equal((await call({...valid,value:-1})).statusCode,400);
  assert.equal(writes.length,0);
  const success=await call(valid);
  assert.equal(success.statusCode,200);
  assert.equal(success.payload.revision,1);
  assert.equal(invalidations,1);
  assert.deepEqual(writes[0].update.$inc,{population_revision:1});
  assert.equal(writes[0].update.$push.population_overrides.actor_id,'admin-fixture');
  assert.equal(writes[0].update.$set,undefined,'do not overwrite source population or ownership');
  assert.ok(writes[0].filter.$or,'first update accepts a missing revision');
  matched=0;
  assert.equal((await call({...valid,revision:1})).statusCode,409);
  assert.equal(invalidations,1,'conflict must not report a successful refresh');
  assert.equal(writes[1].filter.population_revision,1);
  matched=1;
  assert.equal((await call({...valid,mode:'reset',revision:1})).payload.adjustment.mode,'reset');
  fail=true;
  assert.equal((await call(valid)).statusCode,500);
  console.log('Territory population API: validation, append-only history, revision conflict, reset and failure tests passed');
})();
