const { MongoClient, ObjectId } = require('mongodb');
const { execSync } = require('child_process');
const fs = require('fs');

async function main() {
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const db = client.db('realhistory');
    const col = db.collection('territories');

    // 현재 DB의 모든 _id 목록
    const existing = await col.find({}, { projection: { _id: 1 } }).toArray();
    const existingIds = new Set(existing.map(d => d._id.toString()));
    console.log(`현재 DB territories: ${existingIds.size}개`);

    // 19f466a에서 변경된 타일 파일 목록 가져오기
    const changedFiles = execSync('git show 19f466a --name-only', { cwd: '/Users/jeffhwang/Documents/KoreaHistory', encoding: 'utf8' })
        .split('\n')
        .filter(f => f.startsWith('public/tiles/'));
    
    console.log(`변경된 타일 파일: ${changedFiles.length}개`);

    // e626752 커밋에서 territories 추출
    const allTerritories = {};
    for (const tileFile of changedFiles) {
        try {
            const content = execSync(`git show e626752:${tileFile}`, { 
                cwd: '/Users/jeffhwang/Documents/KoreaHistory', 
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            });
            const data = JSON.parse(content);
            for (const feature of data.features || []) {
                const props = feature.properties || {};
                const _id = props._id;
                if (_id && !allTerritories[_id]) {
                    allTerritories[_id] = { geometry: feature.geometry, properties: props };
                }
            }
        } catch (e) {}
    }
    console.log(`e626752에서 추출된 unique territories: ${Object.keys(allTerritories).length}개`);

    // DB에 없는 것들만 삽입
    const toInsert = [];
    for (const [_id, data] of Object.entries(allTerritories)) {
        if (!existingIds.has(_id)) {
            const props = data.properties;
            const doc = {
                _id: new ObjectId(_id),
                name: props.name || '',
                name_en: props.name_en || null,
                name_ko: props.name_ko || null,
                type: props.type || 'Polygon',
                level: props.level || 'country',
                country: props.country || null,
                country_id: props.country_id ? new ObjectId(props.country_id) : null,
                start_year: props.start_year !== undefined ? props.start_year : -5000,
                end_year: props.end_year !== undefined ? props.end_year : 3000,
                geometry: data.geometry
            };
            toInsert.push(doc);
        }
    }
    console.log(`DB에 없는 territories: ${toInsert.length}개`);
    for (const t of toInsert.slice(0, 20)) {
        console.log(`  ${t._id} | ${t.name} | name_ko=${t.name_ko}`);
    }

    if (toInsert.length > 0) {
        const result = await col.insertMany(toInsert);
        console.log(`✅ 삽입 완료: ${result.insertedCount}개`);
    }

    // 결과 확인
    const newCount = await col.countDocuments();
    console.log(`DB territories 최종: ${newCount}개`);

    await client.close();
}

main().catch(console.error);
