// 영토(territories) 컬렉션의 name 필드에서 "중국 " 접두사 제거
require('dotenv').config();
const { connectToDatabase } = require('../db');

async function removeChinesePrefix() {
    const { collections } = await connectToDatabase();
    
    try {
        console.log('🔍 "중국 " 접두사가 있는 영토 검색 중...');
        
        // "중국 "으로 시작하는 모든 영토 찾기
        const territoriesWithPrefix = await collections.territories.find({
            name: /^중국 /
        }).toArray();
        
        console.log(`📋 발견된 영토: ${territoriesWithPrefix.length}개`);
        
        if (territoriesWithPrefix.length === 0) {
            console.log('✅ "중국 " 접두사가 있는 영토가 없습니다.');
            process.exit(0);
        }
        
        // 각 영토의 이름을 출력
        console.log('\n변경될 영토 목록:');
        territoriesWithPrefix.forEach(territory => {
            const newName = territory.name.replace(/^중국 /, '');
            console.log(`  "${territory.name}" → "${newName}"`);
        });
        
        console.log('\n🔄 "중국 " 접두사 제거 중...');
        
        // 일괄 업데이트
        const bulkOps = territoriesWithPrefix.map(territory => ({
            updateOne: {
                filter: { _id: territory._id },
                update: {
                    $set: {
                        name: territory.name.replace(/^중국 /, '')
                    }
                }
            }
        }));
        
        const result = await collections.territories.bulkWrite(bulkOps);
        
        console.log(`\n✅ 완료!`);
        console.log(`   - 수정된 문서: ${result.modifiedCount}개`);
        console.log(`   - 매칭된 문서: ${result.matchedCount}개`);
        
        // 결과 확인
        console.log('\n🔍 변경 결과 확인:');
        const updatedTerritories = await collections.territories.find({
            _id: { $in: territoriesWithPrefix.map(t => t._id) }
        }).toArray();
        
        updatedTerritories.forEach(territory => {
            console.log(`  ✓ ${territory.name}`);
        });
        
    } catch (error) {
        console.error('❌ 오류 발생:', error);
    } finally {
        process.exit(0);
    }
}

removeChinesePrefix();
