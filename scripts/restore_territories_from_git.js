/**
 * restore_territories_from_git.js
 * 
 * git에 저장된 이전 타일 파일에서 삭제된 영토들을 추출하여
 * 로컬 DB와 Atlas DB에 복원합니다.
 */
const { MongoClient } = require('mongodb');
const { execSync } = require('child_process');

const LOCAL_URI = 'mongodb://localhost:27017';
const ATLAS_URI = 'mongodb+srv://projeffmanager_db_user:Bv3Lres9O0L3Nrrz@realhistory.6vfgerd.mongodb.net/';
const LOCAL_DB = 'koreahistory';
const ATLAS_DB = 'realhistory';

async function main() {
    // 1. git에서 이전 index.json 읽기
    const indexRaw = execSync('git show HEAD:public/tiles/index.json', { 
        cwd: '/Users/jeffhwang/Documents/KoreaHistory',
        maxBuffer: 50 * 1024 * 1024 
    });
    const tileIndex = JSON.parse(indexRaw.toString());
    console.log(`📦 이전 타일 수: ${tileIndex.length}`);

    // 2. 모든 타일에서 영토 데이터 추출
    const allTerritories = new Map(); // name -> territory data
    let errorCount = 0;

    for (const tile of tileIndex) {
        try {
            const tileRaw = execSync(`git show HEAD:public/tiles/${tile.filename}`, {
                cwd: '/Users/jeffhwang/Documents/KoreaHistory',
                maxBuffer: 50 * 1024 * 1024
            });
            const tileData = JSON.parse(tileRaw.toString());
            
            if (tileData.features) {
                for (const feature of tileData.features) {
                    const name = feature.properties?.name;
                    if (name && !allTerritories.has(name)) {
                        allTerritories.set(name, feature);
                    }
                }
            }
        } catch (e) {
            errorCount++;
            // 일부 타일이 git에 없을 수 있음
        }
    }

    console.log(`📋 이전 타일에서 추출한 고유 영토: ${allTerritories.size}개 (오류: ${errorCount})`);

    // 3. 현재 DB의 영토 목록 가져오기
    const localClient = new MongoClient(LOCAL_URI);
    await localClient.connect();
    const localDb = localClient.db(LOCAL_DB);
    
    const currentTerritories = await localDb.collection('territories').find({}, { projection: { name: 1 } }).toArray();
    const currentNames = new Set(currentTerritories.map(t => t.name));
    console.log(`📍 현재 DB 영토: ${currentNames.size}개`);

    // 4. 삭제된 영토 찾기
    const missingTerritories = [];
    for (const [name, feature] of allTerritories) {
        if (!currentNames.has(name)) {
            missingTerritories.push({ name, feature });
        }
    }

    console.log(`\n🔍 삭제된 (복원 대상) 영토: ${missingTerritories.length}개`);
    missingTerritories.forEach(t => {
        const bbox = t.feature.properties?.bbox;
        const level = t.feature.properties?.level || '?';
        console.log(`  - ${t.name} (level: ${level})`);
    });

    if (missingTerritories.length === 0) {
        console.log('✅ 복원할 영토 없음');
        await localClient.close();
        return;
    }

    // 5. 타일 feature를 MongoDB document로 변환
    const docsToInsert = missingTerritories.map(({ name, feature }) => {
        const props = feature.properties || {};
        const doc = {
            name: name,
            geometry: feature.geometry,
            type: feature.geometry?.type || 'MultiPolygon'
        };
        
        // properties에서 필드 복원
        if (props.bbox) doc.bbox = props.bbox;
        if (props.level) doc.level = props.level;
        if (props.area) doc.area = props.area;
        
        return doc;
    });

    // 6. 로컬 DB에 삽입
    console.log(`\n📥 로컬 DB에 ${docsToInsert.length}개 영토 복원 중...`);
    const localResult = await localDb.collection('territories').insertMany(docsToInsert);
    console.log(`✅ 로컬 DB 삽입 완료: ${localResult.insertedCount}개`);

    // 7. Atlas DB에도 삽입
    console.log(`📥 Atlas DB에 ${docsToInsert.length}개 영토 복원 중...`);
    const atlasClient = new MongoClient(ATLAS_URI);
    await atlasClient.connect();
    const atlasDb = atlasClient.db(ATLAS_DB);
    
    // Atlas에도 같은 문서 삽입 (ObjectId는 새로 생성됨)
    const atlasResult = await atlasDb.collection('territories').insertMany(docsToInsert.map(d => ({...d})));
    console.log(`✅ Atlas DB 삽입 완료: ${atlasResult.insertedCount}개`);

    // 8. 최종 확인
    const finalLocalCount = await localDb.collection('territories').countDocuments();
    const finalAtlasCount = await atlasDb.collection('territories').countDocuments();
    console.log(`\n📊 최종 결과:`);
    console.log(`   로컬 DB: ${finalLocalCount}개`);
    console.log(`   Atlas DB: ${finalAtlasCount}개`);

    await localClient.close();
    await atlasClient.close();
}

main().catch(console.error);
