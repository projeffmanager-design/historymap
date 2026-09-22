'use strict';

const YEAR_MIN=-2700,YEAR_MAX=2100,MAX_ROWS=1000,MAX_POPULATION=1e10;
function validatePopulationImport(body){
  if(!body||!Array.isArray(body.rows)||!body.rows.length||body.rows.length>MAX_ROWS)throw new Error('인구 행은 1~1000개여야 합니다.');
  const seen=new Set();
  const rows=body.rows.map((row,index)=>{
    if(!row||typeof row.id!=='string'||!/^[a-f\d]{24}$/i.test(row.id))throw new Error(`${index+1}행 영토 ID가 올바르지 않습니다.`);
    if(seen.has(row.id))throw new Error(`${index+1}행 영토 ID가 중복되었습니다.`);seen.add(row.id);
    if(!Number.isInteger(row.revision)||row.revision<0)throw new Error(`${index+1}행 자료 버전이 올바르지 않습니다.`);
    const values={};
    for(const [rawYear,rawValue] of Object.entries(row.values||{})){
      const year=Number(rawYear),value=Number(rawValue);
      if(!Number.isInteger(year)||year<YEAR_MIN||year>YEAR_MAX)throw new Error(`${index+1}행 연도 ${rawYear}가 범위를 벗어났습니다.`);
      if(!Number.isInteger(value)||value<0||value>MAX_POPULATION)throw new Error(`${index+1}행 ${year}년 인구가 올바르지 않습니다.`);
      values[String(year)]=value;
    }
    const clear=[...new Set(row.clear||[])].map(Number);
    if(clear.some(year=>!Number.isInteger(year)||year<YEAR_MIN||year>YEAR_MAX))throw new Error(`${index+1}행 삭제 연도가 올바르지 않습니다.`);
    if(!Object.keys(values).length&&!clear.length)throw new Error(`${index+1}행에 변경할 인구값이 없습니다.`);
    const source=typeof row.source==='string'?row.source.trim().slice(0,1000):'';
    if(Object.keys(values).length&&!source)throw new Error(`${index+1}행 새 인구값의 출처·추정 근거가 없습니다.`);
    const confidence=row.confidence===''||row.confidence==null?null:Number(row.confidence);
    if(confidence!==null&&(!Number.isFinite(confidence)||confidence<0||confidence>1))throw new Error(`${index+1}행 신뢰도는 0~1이어야 합니다.`);
    return {id:row.id,revision:row.revision,values,clear,source,confidence};
  });
  const signatures=new Map();
  for(const row of rows){
    const entries=Object.entries(row.values).sort((a,b)=>Number(a[0])-Number(b[0]));
    if(entries.length<8||entries.every(([,value])=>value===0))continue;
    const signature=JSON.stringify(entries);
    signatures.set(signature,(signatures.get(signature)||0)+1);
  }
  if([...signatures.values()].some(count=>count>=10))throw new Error('서로 다른 영토 10개 이상에 동일한 인구 시계열이 입력되었습니다. 지역별 산출 근거를 확인하세요.');
  return {dryRun:body.dry_run!==false,rows};
}
module.exports={validatePopulationImport,YEAR_MIN,YEAR_MAX};
