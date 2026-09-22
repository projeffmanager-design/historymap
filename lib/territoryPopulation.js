'use strict';

// Strict payload for the dedicated adjustment endpoint. No geometry/ownership writes.
function validateAdjustment(body) {
  if (!body || !['value','multiplier','reset'].includes(body.mode)) throw new Error('보정 방식을 확인하세요.');
  const {start_year:start,end_year:end,revision}=body;
  if (![start,end].every(Number.isInteger) || start < -5000 || end > 2100 || start > end) throw new Error('적용 기간은 -5000~2100년 사이여야 합니다.');
  if (!Number.isInteger(revision) || revision < 0) throw new Error('자료 버전을 확인하세요.');
  if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length>1000) throw new Error('보정 사유를 1~1000자로 입력하세요.');
  const adjustment={mode:body.mode,start_year:start,end_year:end,reason:body.reason.trim()};
  if(body.mode!=='reset'){
    const key=body.mode==='value'?'value':'multiplier',value=body[key];
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>(key==='value'?1e10:100))throw new Error('유효한 보정값을 입력하세요.');
    if(key==='value'&&!Number.isInteger(value))throw new Error('인구는 정수로 입력하세요.');
    adjustment[key]=value;
  }
  return {revision,adjustment};
}
function createAdjustmentHandler({collection,toObjectId,invalidate,log=console.error}) {
  return async (req,res) => {
    const _id=toObjectId(req.params.id);
    if(!_id)return res.status(400).json({message:'잘못된 영토 ID입니다.'});
    let input;
    try{input=validateAdjustment(req.body);}
    catch(error){return res.status(400).json({message:error.message});}
    try{
      const filter={_id,...(input.revision===0?{$or:[{population_revision:0},{population_revision:{$exists:false}}]}:{population_revision:input.revision})};
      const adjustment={...input.adjustment,created_at:new Date().toISOString(),actor_id:String(req.user.userId||'')};
      const result=await collection.updateOne(filter,{$push:{population_overrides:adjustment},$inc:{population_revision:1}});
      if(!result.matchedCount)return res.status(409).json({message:'영토가 없거나 다른 관리자가 수정했습니다. 새로고침 후 다시 시도하세요.'});
      invalidate();
      res.json({ok:true,adjustment,revision:input.revision+1});
    }catch(error){log('영토 인구 보정 실패:',error);res.status(500).json({message:'인구 보정을 저장하지 못했습니다.'});}
  };
}
module.exports={validateAdjustment,createAdjustmentHandler};
