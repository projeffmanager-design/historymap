'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm');
function fixture(source,countries,payload=[],year=1205,month=1){
 const panel={innerHTML:''},fields={yearInput:{value:String(year)},monthInput:{value:String(month)},'map-king-list':panel};
 const context=vm.createContext({countries,kings:{},console,toRawImageUrl:value=>value,document:{getElementById:id=>fields[id]}});
 const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,`Missing ${start}`);return source.slice(a,b);};
 vm.runInContext([
  section('    function isCountryActiveAt(', '    function resolveTerritoryDisplayCountryId('),
  section('    function getCountryInfo(', '    // 🚩 [핵심 수정] 시간 계산'),
  section('    function yearMonthToTotalMonths(', '    // 지도 항목의 유효 기간'),
  section('    function normalizeHistoryNumber(', '    function sortHistoryByStart('),
  section('function getEffectiveCountryInfo(', '\nfunction getCountryInfoById('),
  section('function getKingByYear(', '    /** 🚩 한줄평 클릭 팝업 */'),
  section('    function applyKingsPayload(', '    function loadKingsPayloadCache(')
 ].join('\n'),context);
 context.applyKingsPayload(payload);
 return {context,panel,render(y=year,m=month){fields.yearInput.value=String(y);fields.monthInput.value=String(m);context.updateKingLabel(y,m);return panel.innerHTML;}};
}
module.exports=fixture;
