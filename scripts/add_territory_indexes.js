/**
 * 영토(territories) 컬렉션에 인덱스 추가
 * bbox 필드에 복합 인덱스를 추가하여 공간 쿼리 성능 향상
 */

const { MongoClient } = require('mongodb');
const { connectToDatabase } = require('../db');

async function addTerritoryIndexes() {
    try {
        const { db, collections } = await connectToDatabase();
        console.log('✅ MongoDB 연결 성공');
        
        const territories = collections.territories;
        
        // 1. 기존 인덱스 확인
        console.log('\n📊 기존 인덱스 목록:');
        const existingIndexes = await territories.indexes();
        existingIndexes.forEach(idx => {
            console.log(`  - ${idx.name}:`, JSON.stringify(idx.key));
        });
        
        // 2. bbox 복합 인덱스 추가 (공간 쿼리 최적화)
        console.log('\n🔧 bbox 복합 인덱스 추가 중...');
        try {
            await territories.createIndex({
                'bbox.minLat': 1,
                'bbox.maxLat': 1,
                'bbox.minLng': 1,
                'bbox.maxLng': 1
            }, {
                name: 'bbox_spatial',
                background: true
            });
            console.log('✅ bbox 복합 인덱스 추가 완료');
        } catch (err) {
            if (err.code === 85 || err.codeName === 'IndexOptionsConflict') {
                console.log('ℹ️  bbox 인덱스 이미 존재');
            } else {
                throw err;
            }
        }
        
        // 3. start/end 인덱스 추가 (시간 범위 쿼리 최적화)
        console.log('\n🔧 시간 범위 인덱스 추가 중...');
        try {
            await territories.createIndex({
                'start': 1,
                'end': 1
            }, {
                name: 'time_range',
                background: true
            });
            console.log('✅ 시간 범위 인덱스 추가 완료');
        } catch (err) {
            if (err.code === 85 || err.codeName === 'IndexOptionsConflict') {
                console.log('ℹ️  시간 범위 인덱스 이미 존재');
            } else {
                throw err;
            }
        }
        
        // 4. name 인덱스 추가 (이름 검색 최적화)
        console.log('\n🔧 이름 인덱스 추가 중...');
        try {
            await territories.createIndex({
                'name': 1
            }, {
                name: 'name_index',
                background: true
            });
            console.log('✅ 이름 인덱스 추가 완료');
        } catch (err) {
            if (err.code === 85 || err.codeName === 'IndexOptionsConflict') {
                console.log('ℹ️  이름 인덱스 이미 존재');
            } else {
                throw err;
            }
        }
        
        // 5. 최종 인덱스 목록 확인
        console.log('\n📊 최종 인덱스 목록:');
        const finalIndexes = await territories.indexes();
        finalIndexes.forEach(idx => {
            console.log(`  - ${idx.name}:`, JSON.stringify(idx.key));
        });
        
        // 6. 문서 수 확인
        const count = await territories.countDocuments();
        console.log(`\n📈 영토 문서 수: ${count.toLocaleString()}개`);
        
        console.log('\n🎉 인덱스 추가 완료!');
        console.log('💡 서버를 재시작하면 쿼리 속도가 크게 향상됩니다.');
        console.log('⚡ 예상 성능: 164초 → 2-5초 (30-80배 향상)');
        
    } catch (error) {
        console.error('❌ 오류 발생:', error);
    } finally {
        process.exit(0);
    }
}

addTerritoryIndexes();
