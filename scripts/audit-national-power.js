// Read-only audit. Never seeds, updates or deletes database documents.
require('dotenv').config({quiet:true});
const {MongoClient}=require('mongodb');
const {build}=require('../public/assets/power-model');
const staticRegions=require('../public/power-regions.json');
(async()=>{
  const client=new MongoClient(process.env.MONGO_URI,{serverSelectionTimeoutMS:10000,socketTimeoutMS:20000});
  try{
    await client.connect();const db=client.db('realhistory');console.log('Read-only database connected');
    if(process.argv.includes('--metadata-only')){
      const summary=await db.collection('territories').aggregate([{$match:{hidden:{$ne:true}}},{$group:{_id:null,count:{$sum:1},totalBytes:{$sum:{$bsonSize:'$$ROOT'}},largestBytes:{$max:{$bsonSize:'$$ROOT'}}}}],{maxTimeMS:20000}).toArray();
      console.log(JSON.stringify({readOnly:true,geometryDownloaded:false,summary},null,2));return;
    }
    // Geometry documents are large (about 60 MB in the current DB).  The map's
    // generated boundary bundle is the canonical read-only audit surface; only
    // small, mutable statistical fields are read from MongoDB.
    const [territoryMeta,resources,markers]=await Promise.all([
      db.collection('territories').find({hidden:{$ne:true}},{maxTimeMS:20000}).project({_id:1,name:1,level:1,country:1,population_series:1,modern_population:1,population_scale:1,population_overrides:1,production_series:1}).toArray().then(rows=>{console.log('Territory metadata read: '+rows.length);return rows;}),
      db.collection('resources').find({resource_type:{$in:['population','iron','horse','salt','silk','gold']}},{maxTimeMS:20000}).toArray().then(rows=>{console.log('Resources read: '+rows.length);return rows;}),
      db.collection('castle').find({},{maxTimeMS:20000}).project({_id:1,name:1,lat:1,lng:1,location:1,'history.name':1,'history.start_year':1,'history.end_year':1,'history.start_month':1,'history.end_month':1,'history.place_type':1,'history.is_capital':1,place_type:1,built:1,destroyed:1,is_natural_feature:1,is_label:1,is_military_flag:1,is_battle:1,hidden:1}).toArray().then(rows=>{console.log('Markers read: '+rows.length);return rows;})
    ]);
    const metaById=new Map(territoryMeta.map(t=>[String(t._id),t]));
    const regions=staticRegions.map(boundary=>{
      const meta=metaById.get(String(boundary._id));
      if(!meta)return null;
      return {...boundary,...meta,id:String(boundary._id),countryId:'audit',geometry:boundary.geometry};
    }).filter(t=>t&&['Polygon','MultiPolygon'].includes(t.geometry?.type));
    console.log('Static boundaries matched: '+regions.length+' / '+territoryMeta.length);
    // One synthetic owner allows checking spatial coverage without inventing historical borders.
    const results=[1100,1500,1800].map(year=>{
      const result=build({countries:[{id:'audit',name:'공간 연결 검사 (국가 아님)'}],regions,resources,markers,year});
      return {year,regions:regions.length,withPopulation:result.regions.filter(r=>r.population!==null).length,missing:result.stats.regionsMissing,
        linkedPopulation:result.nations[0]?.population,markers:result.nations[0]?.settlementCount,castles:result.nations[0]?.castleCount,cities:result.nations[0]?.cityCount,
        unassignedPopulation:result.issues.filter(i=>i.type==='population'&&/폴리곤 없음|지역 ID/.test(i.reason)).length,
        missingExamples:result.regions.filter(r=>r.population===null).slice(0,10).map(r=>({id:r.id,name:r.name,reason:r.populationReason}))};
    });
    console.log(JSON.stringify({readOnly:true,populationPoints:resources.filter(r=>r.resource_type==='population').length,registeredMarkers:markers.length,results},null,2));
  }catch(error){console.error('Read-only audit failed:',error.name,error.code||'');process.exitCode=1;}
  finally{await client.close();}
})();
