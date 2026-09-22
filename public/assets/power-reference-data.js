/* Descriptive references only: never included in the power score. */
(function (root) {
  'use strict';
  const profiles = [
    { names:['고려'], from:918,to:1392,
      weapons:[],
      products:[
        {icon:'🏺',name:'청자',status:'문헌·유물 근거',source:'https://encykorea.aks.ac.kr/Article/E0056611'},
        {icon:'📜',name:'고려지·종이',status:'문헌 근거',source:'https://encykorea.aks.ac.kr/Article/E0052996'},
        {icon:'🪵',name:'나전칠기·세공품',status:'문헌·유물 근거',source:'https://encykorea.aks.ac.kr/Article/E0003424'},
        {icon:'🧵',name:'비단',status:'지역·시기별 생산량 검증 필요'},
        {icon:'🐎',name:'말',status:'지역·시기별 사육량 검증 필요'},
        {icon:'🛢️',name:'맹화유',status:'생산품 분류·사료 확인 필요'}
      ],events:[
        {from:1231,to:1259,name:'몽골의 고려 침입과 장기 항전',source:'https://encykorea.aks.ac.kr/Article/E0003424'},
        {from:1270,to:1273,name:'개경 환도와 삼별초 항쟁',source:'https://db.history.go.kr/goryeo/itemLevelKrList.do?parentId=kr_130r_0010_0120&types=r'},
        {from:1359,to:1361,name:'홍건적의 고려 침입',source:'https://encykorea.aks.ac.kr/Article/E0070273'}
      ] },
    { names:['조선'],from:1392,to:1897,
      weapons:[
        {name:'판옥선',branch:'해군',from:1550,to:1897,status:'주력 군선',source:'https://contents.history.go.kr/front/nh/view.do?levelId=nh_024_0040_0040_0050_0030'},
        {name:'거북선',branch:'해군',from:1592,to:1800,status:'운용 기록·규모는 시기별 확인',source:'https://contents.history.go.kr/mobile/km/view.do?levelId=km_014_0050_0030_0010_0010'}
      ],products:[],events:[
        {from:1592,to:1598,name:'임진왜란',source:'https://encykorea.aks.ac.kr/Article/E0047674'},
        {from:1627,to:1627,name:'정묘호란',source:'https://encykorea.aks.ac.kr/Article/E0050194'},
        {from:1636,to:1637,name:'병자호란',source:'https://encykorea.aks.ac.kr/Article/E0023151'},
        {from:1894,to:1896,name:'갑오개혁',source:'https://encykorea.aks.ac.kr/Article/E0000925'},
        {from:1897,to:1897,name:'대한제국 선포 · 조선 국호 변경',source:'https://encykorea.aks.ac.kr/Article/E0003256'}
      ] },
    { names:['일본'],from:1467,to:1650,
      weapons:[{name:'조총',branch:'육군',from:1543,to:1650,status:'임진왜란기 대량 운용',source:'https://encykorea.aks.ac.kr/Article/E0047674'}],products:[] },
    { names:['신라'],from:-57,to:935,weapons:[{name:'쇠뇌',branch:'육군',status:'시기·규모 사료 확인 필요'}],products:[] },
    { names:['백제'],from:-18,to:660,weapons:[{name:'군함',branch:'해군',status:'함종·수량 사료 확인 필요'}],products:[] },
    { names:['고구려'],from:-37,to:668,weapons:[{name:'개마무사·철기병',branch:'기병',status:'시기·규모 사료 확인 필요'},{name:'맥궁',branch:'원거리',status:'시기·규모 사료 확인 필요'}],products:[] }
  ];
  const plainName=name=>String(name||'').replace(/\([^)]*\)|（[^）]*）/g,'').trim();
  const overrides=new Map();
  function raw(name){
    const key=plainName(name);
    return overrides.get(key)||profiles.find(p=>p.names.includes(key))||null;
  }
  function lookup(name, year) {
    const profile=raw(name);
    if(!profile)return null;
    const from=profile.from??-5000,to=profile.to??2100;
    if(year<from||year>to)return null;
    return profile?{weapons:profile.weapons.filter(w=>(w.from==null||year>=w.from)&&(w.to==null||year<=w.to)),products:profile.products.filter(p=>(p.from==null||year>=p.from)&&(p.to==null||year<=p.to)),events:profile.events||[]}:null;
  }
  function eventsFor(name,from,to){
    const profile=raw(name);
    return (profile?.events||[]).filter(event=>event.from<=to&&event.to>=from);
  }
  function populationEffects(){
    return [...overrides.values()].flatMap(profile=>(profile.events||[]).filter(event=>Number.isFinite(event.percent)).map(event=>({...event,profile:profile.key,scope:event.scope||((event.territory_ids||[]).length?'territories':'country')})));
  }
  async function load(){
    const response=await fetch('/api/power-profile-overrides',{cache:'no-store'});
    if(!response.ok)throw Error('국가 상세 편집 자료를 불러오지 못했습니다.');
    const rows=await response.json();
    overrides.clear();
    for(const row of rows)overrides.set(row.key,row);
    return rows;
  }
  async function save(name,record,token){
    const key=plainName(name);
    const response=await fetch('/api/power-profile-overrides/'+encodeURIComponent(key),{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(record)});
    const result=await response.json();
    if(!response.ok)throw Error(result.message||'상세 자료 저장 실패');
    overrides.set(key,result.profile);
    return result.profile;
  }
  const api={lookup,eventsFor,populationEffects,raw,load,save};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PowerReferenceData=api;
})(typeof globalThis!=='undefined'?globalThis:this);
