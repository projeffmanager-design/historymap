// 영토(territories) 컬렉션의 완전 중복 제거
// 같은 name + start_year + end_year를 가진 레코드 중 첫 번째만 남기고 삭제
require('dotenv').config();
const { connectToDatabase } = require('../db');

async function removeDuplicates() {
    const { collections } = await connectToDatabase();
    
    try {
        console.log('🔍 중복 영토 검색 중...\n');
        
        // 완전 중복 찾기
        const duplicates = await collections.territories.aggregate([
            {
                $group: {
                    _id: {
                        name: '$name',
                        start_year: '$start_year',
                        end_year: '$end_year'
                    },
                    count: { $sum: 1 },
                    ids: { $push: '$_id' }
                }
            },
            {
                $match: { count: { $gt: 1 } }
            },
            {
                $sort: { count: -1 }
            }
        ]).toArray();
        
        console.log(`⚠️  발견된 중복 그룹: ${duplicates.length}개\n`);
        
        if (duplicates.length === 0) {
            console.log('✅ 중복이 없습니다!');
            process.exit(0);
        }
        
        // 삭제할 ID 목록 수집 (각 그룹에서 첫 번째를 제외한 나머지)
        let idsToDelete = [];
        
        console.log('📋 중복 제거 계획:\n');
        duplicates.forEach((item, index) => {
            const keepId = item.ids[0]; // 첫 번째는 유지
            const deleteIds = item.ids.slice(1); // 나머지는 삭제
            idsToDelete = idsToDelete.concat(deleteIds);
            
            console.log(`${index + 1}. "${item._id.name}" (${item._id.start_year}~${item._id.end_year || '현재'})`);
            console.log(`   - 총 ${item.count}개 → 1개 유지, ${deleteIds.length}개 삭제`);
            console.log(`   - 유지: ${keepId}`);
        });
        
        console.log(`\n💡 총 삭제 예정: ${idsToDelete.length}개`);
        console.log(`   현재: 387개 → 삭제 후: ${387 - idsToDelete.length}개\n`);
        
        // 확인 메시지 (자동 실행)
        console.log('🗑️  중복 레코드 삭제 중...\n');
        
        const deleteResult = await collections.territories.deleteMany({
            _id: { $in: idsToDelete }
        });
        
        console.log(`✅ 삭제 완료!`);
        console.log(`   - 삭제된 문서: ${deleteResult.deletedCount}개\n`);
        
        // 결과 확인
        const finalCount = await collections.territories.countDocuments({});
        console.log(`📊 최종 영토 개수: ${finalCount}개`);
        
        // 중복 재확인
        console.log('\n🔍 중복 재확인...');
        const remainingDuplicates = await collections.territories.aggregate([
            {
                $group: {
                    _id: {
                        name: '$name',
                        start_year: '$start_year',
                        end_year: '$end_year'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $match: { count: { $gt: 1 } }
            }
        ]).toArray();
        
        if (remainingDuplicates.length === 0) {
            console.log('✅ 모든 중복이 제거되었습니다!');
        } else {
            console.log(`⚠️  아직 ${remainingDuplicates.length}개의 중복 그룹이 남아있습니다.`);
        }
        
    } catch (error) {
        console.error('❌ 오류 발생:', error);
    } finally {
        process.exit(0);
    }
}

removeDuplicates();
