// scripts/optimize_castle_indexes.js
// 🚀 Castle 컬렉션 성능 최적화를 위한 인덱스 생성

require('dotenv').config();
const { connectToDatabase, collections } = require('../db');

async function optimizeCastleIndexes() {
    try {
        console.log('🔧 MongoDB 연결 중...');
        await connectToDatabase();
        
        console.log('📊 현재 인덱스 확인...');
        const existingIndexes = await collections.castle.indexes();
        const existingIndexNames = existingIndexes.map(idx => idx.name);
        console.log('현재 인덱스:', existingIndexNames);
        
        console.log('\n🚀 성능 최적화 인덱스 생성 시작...');
        
        // 헬퍼 함수: 인덱스 안전 생성
        async function createIndexSafely(indexSpec, options) {
            if (existingIndexNames.includes(options.name)) {
                console.log(`⏭️ ${options.name} - 이미 존재함`);
                return;
            }
            try {
                await collections.castle.createIndex(indexSpec, options);
                console.log(`✅ ${options.name} 생성 완료`);
            } catch (error) {
                if (error.code === 85) {
                    console.log(`⏭️ ${options.name} - 유사한 인덱스 존재`);
                } else {
                    throw error;
                }
            }
        }
        
        // 1. deleted 필드 인덱스 (필터링 최적화)
        await createIndexSafely(
            { deleted: 1 },
            { name: 'idx_deleted', background: true }
        );
        
        // 2. is_label 필드 인덱스 (라벨 필터링 최적화)
        await createIndexSafely(
            { is_label: 1 },
            { name: 'idx_is_label', background: true }
        );
        
        // 3. label_type 필드 인덱스 (타입 필터링 최적화)
        await createIndexSafely(
            { label_type: 1 },
            { name: 'idx_label_type', background: true }
        );
        
        // 4. 복합 인덱스: deleted + is_label (exclude_labels 쿼리 최적화)
        await createIndexSafely(
            { deleted: 1, is_label: 1 },
            { name: 'idx_deleted_is_label', background: true }
        );
        
        // 5. country_id 인덱스 (국가별 필터링 최적화)
        await createIndexSafely(
            { country_id: 1 },
            { name: 'idx_country_id', background: true }
        );
        
        console.log('\n📊 최종 인덱스 목록:');
        const finalIndexes = await collections.castle.indexes();
        finalIndexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });
        
        console.log('\n🎉 인덱스 최적화 완료!');
        console.log('💡 예상 효과: Castle API 응답 시간 11초 → 2~3초로 단축');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ 인덱스 생성 실패:', error);
        process.exit(1);
    }
}

optimizeCastleIndexes();
