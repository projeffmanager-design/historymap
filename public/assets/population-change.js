/* Detect changes in the displayed aggregate; never infer historical causation. */
(function(root){
  'use strict';
  function analyze(points,countryId,eventLookup=()=>[]){
    const results=[];
    for(let index=1;index<points.length;index++){
      const previous=points[index-1].nations.find(n=>n.id===countryId);
      const current=points[index].nations.find(n=>n.id===countryId);
      if(!previous?.population||current?.population==null)continue;
      const change=current.population-previous.population;
      const fraction=-change/previous.population;
      if(change>=-5000||fraction<.18)continue;
      const before=new Set((points[index-1].regionAudit||[]).filter(r=>r.countryId===countryId&&r.population!=null).map(r=>r.id));
      const after=new Set((points[index].regionAudit||[]).filter(r=>r.countryId===countryId&&r.population!=null).map(r=>r.id));
      const lost=[...before].filter(id=>!after.has(id));
      const next=points[index+1]?.nations.find(n=>n.id===countryId);
      const rebounded=next?.population>=previous.population*.9;
      const reason=lost.length?`영토 귀속·연결 지역 ${lost.length}곳 감소로 집계 대상이 변경됨`:rebounded?'다음 시점에 대부분 회복 — 입력값·집계 방식 확인 필요':'인구 추정치 급감 — 원자료와 영토 귀속 확인 필요';
      results.push({index,fromYear:points[index-1].year,year:points[index].year,previous:previous.population,current:current.population,change,fraction,lostRegions:lost.length,rebounded,reason,events:eventLookup(points[index-1].year,points[index].year)||[]});
    }
    return results;
  }
  const api={analyze};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PopulationChange=api;
})(typeof globalThis!=='undefined'?globalThis:this);
