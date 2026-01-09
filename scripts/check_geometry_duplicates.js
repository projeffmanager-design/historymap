// 영토(territories) 컬렉션의 GeoJSON 좌표 기준 중복 확인
require('dotenv').config();
const { connectToDatabase } = require('../db');
const crypto = require('crypto');

async function checkGeometryDuplicates() {
    const { collections } = await connectToDatabase();
    
    try {
        console.log('🔍 GeoJSON 좌표 기준 중복 분석 시작...\n');
        
        const territories = await collections.territories.find({}).toArray();
        console.log(`📊 총 영토 개수: ${territories.length}개\n`);
        
        // GeoJSON을 문자열로 변환 후 해시값으로 중복 검사
        const geometryMap = new Map();
        
        territories.forEach(territory => {
            // GeoJSON을 정규화된 문자열로 변환 (공백 제거)
            const geoJsonStr = JSON.stringify(territory.geojson);
            const hash = crypto.createHash('md5').update(geoJsonStr).digest('hex');
            
            if (!geometryMap.has(hash)) {
                geometryMap.set(hash, []);
            }
            geometryMap.get(hash).push({
                _id: territory._id,
                name: territory.name,
                start_year: territory.start_year,
                end_year: territory.end_year
            });
        });
        
        // 중복 찾기 (같은 해시를 가진 그룹이 2개 이상)
        const duplicateGroups = [];
        geometryMap.forEach((group, hash) => {
            if (group.length > 1) {
                duplicateGroups.push({ hash, territories: group });
            }
        });
        
        console.log(`⚠️  동일한 좌표를 가진 중복 그룹: ${duplicateGroups.length}개\n`);
        
        if (duplicateGroups.length === 0) {
            console.log('✅ GeoJSON 좌표 기준 중복이 없습니다!');
        } else {
            console.log('📋 중복 그룹 상세:\n');
            
            let totalDuplicates = 0;
            duplicateGroups.forEach((group, index) => {
                console.log(`${index + 1}. 동일 좌표 그룹 (${group.territories.length}개):`);
                group.territories.forEach((t, i) => {
                    console.log(`   [${i + 1}] "${t.name}" (${t.start_year}~${t.end_year || '현재'})`);
                    console.log(`       ID: ${t._id}`);
                });
                console.log();
                totalDuplicates += (group.territories.length - 1);
            });
            
            console.log(`💡 삭제 가능한 중복 레코드: ${totalDuplicates}개`);
            console.log(`   현재: ${territories.length}개 → 삭제 후: ${territories.length - totalDuplicates}개`);
        }
        
        // 추가 분석: 다른 이름이지만 같은 좌표
        console.log('\n🔍 추가 분석: 다른 이름, 같은 좌표...');
        const differentNameSameGeometry = duplicateGroups.filter(group => {
            const names = new Set(group.territories.map(t => t.name));
            return names.size > 1;
        });
        
        if (differentNameSameGeometry.length > 0) {
            console.log(`⚠️  ${differentNameSameGeometry.length}개 그룹이 다른 이름으로 같은 좌표 사용:\n`);
            differentNameSameGeometry.forEach((group, index) => {
                const uniqueNames = [...new Set(group.territories.map(t => t.name))];
                console.log(`${index + 1}. 이름: ${uniqueNames.join(', ')}`);
                console.log(`   (같은 영토를 다른 이름으로 ${group.territories.length}개 저장)`);
            });
        } else {
            console.log('✅ 모든 중복은 같은 이름입니다.');
        }
        
    } catch (error) {
        console.error('❌ 오류 발생:', error);
    } finally {
        process.exit(0);
    }
}

checkGeometryDuplicates();
