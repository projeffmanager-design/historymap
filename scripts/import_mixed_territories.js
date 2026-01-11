// 한중러는 행정구역(성/도), 나머지는 국가 단위로 임포트
require('dotenv').config();
const { MongoClient } = require('mongodb');
const axios = require('axios');
const turf = require('@turf/turf');

async function importMixedTerritories() {
    const client = new MongoClient(process.env.MONGO_URI);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const markersCollection = db.collection('castle'); // 단수형 'castle'
        const territoriesCollection = db.collection('territories');
        
        // 기존 territories 삭제
        await territoriesCollection.deleteMany({});
        console.log('🗑️  기존 territories 삭제 완료\n');
        
        // 모든 마커 가져오기
        const markers = await markersCollection.find({
            lat: { $exists: true },
            lng: { $exists: true }
        }).toArray();
        
        console.log(`📍 총 ${markers.length}개 마커\n`);
        
        // 좌표를 location 형태로 변환
        markers.forEach(m => {
            m.location = {
                type: 'Point',
                coordinates: [m.lng, m.lat]
            };
        });
        
        // ===== 1. 한국 행정구역 (도 단위) =====
        console.log('🇰🇷 한국 행정구역 다운로드 중...');
        const koreaResponse = await axios.get(
            'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-provinces-2018-geo.json'
        );
        
        const koreaProvinces = koreaResponse.data.features;
        console.log(`   ${koreaProvinces.length}개 한국 행정구역 발견`);
        
        // 한국 마커 필터링
        const koreaMarkers = markers.filter(m => 
            m.location.coordinates[1] >= 33 && 
            m.location.coordinates[1] <= 43 &&
            m.location.coordinates[0] >= 124 &&
            m.location.coordinates[0] <= 132
        );
        
        let koreaImported = 0;
        for (const province of koreaProvinces) {
            // 이 행정구역에 마커가 있는지 확인
            const hasMarkers = koreaMarkers.some(marker => {
                const point = turf.point(marker.location.coordinates);
                try {
                    return turf.booleanPointInPolygon(point, province);
                } catch (e) {
                    return false;
                }
            });
            
            if (hasMarkers) {
                await territoriesCollection.insertOne({
                    name: province.properties.name,
                    name_en: province.properties.name_en,
                    code: province.properties.code,
                    admin_level: 4,
                    type: 'province',
                    country: 'South Korea',
                    geometry: province.geometry,
                    properties: province.properties
                });
                koreaImported++;
            }
        }
        console.log(`   ✅ ${koreaImported}개 한국 행정구역 임포트 완료\n`);
        
        // ===== 2. 중국 행정구역 (성 단위) =====
        console.log('🇨🇳 중국 행정구역 다운로드 중...');
        const chinaResponse = await axios.get(
            'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson'
        );
        
        const allProvinces = chinaResponse.data.features;
        const chinaProvinces = allProvinces.filter(f => 
            f.properties.admin === 'China' || 
            f.properties.sovereignt === 'China' ||
            f.properties.adm0_a3 === 'CHN'
        );
        console.log(`   ${chinaProvinces.length}개 중국 행정구역 발견`);
        
        // 중국 마커 필터링 (대략적 범위)
        const chinaMarkers = markers.filter(m => 
            m.location.coordinates[1] >= 18 && 
            m.location.coordinates[1] <= 54 &&
            m.location.coordinates[0] >= 73 &&
            m.location.coordinates[0] <= 135
        );
        
        let chinaImported = 0;
        for (const province of chinaProvinces) {
            const hasMarkers = chinaMarkers.some(marker => {
                const point = turf.point(marker.location.coordinates);
                try {
                    return turf.booleanPointInPolygon(point, province);
                } catch (e) {
                    return false;
                }
            });
            
            if (hasMarkers) {
                await territoriesCollection.insertOne({
                    name: province.properties.name || province.properties.name_local,
                    name_en: province.properties.name,
                    admin_level: 4,
                    type: 'province',
                    country: 'China',
                    geometry: province.geometry,
                    properties: province.properties
                });
                chinaImported++;
            }
        }
        console.log(`   ✅ ${chinaImported}개 중국 행정구역 임포트 완료\n`);
        
        // ===== 3. 러시아 행정구역 (연해주 등 동부) =====
        console.log('🇷🇺 러시아 행정구역 다운로드 중...');
        const russiaResponse = await axios.get(
            'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'
        );
        
        // Natural Earth에서 러시아 행정구역 데이터 가져오기
        const russiaAdminResponse = await axios.get(
            'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson'
        );
        
        const russiaProvinces = russiaAdminResponse.data.features.filter(f => 
            f.properties.admin === 'Russia' || f.properties.sovereignt === 'Russia'
        );
        
        console.log(`   ${russiaProvinces.length}개 러시아 행정구역 발견`);
        
        // 러시아 동부 마커 필터링 (연해주, 사할린 등)
        const russiaMarkers = markers.filter(m => 
            m.location.coordinates[1] >= 41 && 
            m.location.coordinates[1] <= 70 &&
            m.location.coordinates[0] >= 120 &&
            m.location.coordinates[0] <= 180
        );
        
        let russiaImported = 0;
        for (const province of russiaProvinces) {
            const hasMarkers = russiaMarkers.some(marker => {
                const point = turf.point(marker.location.coordinates);
                try {
                    return turf.booleanPointInPolygon(point, province);
                } catch (e) {
                    return false;
                }
            });
            
            if (hasMarkers) {
                await territoriesCollection.insertOne({
                    name: province.properties.name,
                    name_en: province.properties.name,
                    admin_level: 4,
                    type: 'province',
                    country: 'Russia',
                    geometry: province.geometry,
                    properties: province.properties
                });
                russiaImported++;
            }
        }
        console.log(`   ✅ ${russiaImported}개 러시아 행정구역 임포트 완료\n`);
        
        // ===== 4. 나머지 국가들 (국가 단위) =====
        console.log('🌍 기타 국가들 다운로드 중...');
        const worldResponse = await axios.get(
            'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'
        );
        
        const allCountries = worldResponse.data.features;
        console.log(`   ${allCountries.length}개 국가 발견`);
        
        // 이미 처리한 국가 제외
        const processedCountries = ['South Korea', 'China', 'Russia', 'Korea, Republic of', 
                                    'Korea, Democratic People\'s Republic of'];
        
        let countriesImported = 0;
        for (const country of allCountries) {
            const countryName = country.properties.ADMIN || country.properties.NAME || country.properties.name;
            
            // 이름이 없으면 건너뛰기
            if (!countryName) {
                continue;
            }
            
            // 이미 행정구역으로 처리한 국가는 건너뛰기
            if (processedCountries.some(pc => countryName.includes(pc))) {
                continue;
            }
            
            // 이 국가에 마커가 있는지 확인
            const hasMarkers = markers.some(marker => {
                const point = turf.point(marker.location.coordinates);
                try {
                    return turf.booleanPointInPolygon(point, country);
                } catch (e) {
                    return false;
                }
            });
            
            if (hasMarkers) {
                await territoriesCollection.insertOne({
                    name: countryName,
                    name_en: countryName,
                    admin_level: 2,
                    type: 'country',
                    geometry: country.geometry,
                    properties: country.properties
                });
                countriesImported++;
            }
        }
        console.log(`   ✅ ${countriesImported}개 국가 임포트 완료\n`);
        
        // 최종 결과
        const total = await territoriesCollection.countDocuments();
        console.log(`\n🎉 임포트 완료!`);
        console.log(`📊 총 ${total}개 영토:`);
        console.log(`   - 한국 행정구역: ${koreaImported}개`);
        console.log(`   - 중국 행정구역: ${chinaImported}개`);
        console.log(`   - 러시아 행정구역: ${russiaImported}개`);
        console.log(`   - 기타 국가: ${countriesImported}개`);
        
        // 마커 분포 확인
        const territoriesWithMarkers = await territoriesCollection.find({}).toArray();
        console.log('\n📍 마커 분포:');
        
        for (const territory of territoriesWithMarkers) {
            const territoryMarkers = markers.filter(marker => {
                const point = turf.point(marker.location.coordinates);
                try {
                    return turf.booleanPointInPolygon(point, territory);
                } catch (e) {
                    return false;
                }
            });
            
            if (territoryMarkers.length > 0) {
                console.log(`   ${territory.name || territory.name_en}: ${territoryMarkers.length}개 마커`);
            }
        }
        
    } catch (error) {
        console.error('❌ 오류:', error);
        throw error;
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

importMixedTerritories();
