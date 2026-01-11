// 기존 영토는 그대로 두고 새로운 지역만 추가
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function addNewTerritories() {
    const MONGODB_URI = process.env.MONGO_URI;
    if (!MONGODB_URI) {
        console.error('❌ MONGO_URI 환경 변수가 설정되지 않았습니다.');
        return;
    }
    
    const client = new MongoClient(MONGODB_URI);
    
    try {
        await client.connect();
        console.log('✅ MongoDB 연결 성공\n');
        
        const db = client.db('realhistory');
        const collection = db.collection('territories');
        
        // 🚩 추가할 새로운 지역 정의
        const newRegions = [
            {
                name: 'Taklamakan Desert',
                name_ko: '타클라마칸 사막',
                name_type: 'Taklamakan Desert',
                type: 'admin_area',
                level: 'region',
                start: -3000,
                end: 3000,
                bounds: {
                    north: 41.5,
                    south: 37.0,
                    west: 77.0,
                    east: 90.0
                }
            },
            {
                name: 'Tibet',
                name_ko: '티베트',
                name_type: 'Tibet',
                type: 'admin_area',
                level: 'region',
                start: -3000,
                end: 3000,
                bounds: {
                    north: 36.5,
                    south: 27.0,
                    west: 78.5,
                    east: 99.0
                }
            },
            {
                name: 'India',
                name_ko: '인도',
                name_type: 'India',
                type: 'country',
                level: 'country',
                start: -3000,
                end: 3000,
                bounds: {
                    north: 35.5,
                    south: 8.0,
                    west: 68.0,
                    east: 97.5
                }
            },
            {
                name: 'Chita Oblast',
                name_ko: '치타주',
                name_type: 'Chita Oblast',
                type: 'admin_area',
                level: 'province',
                start: -3000,
                end: 3000,
                bounds: {
                    north: 57.0,
                    south: 49.0,
                    west: 109.0,
                    east: 122.0
                }
            },
            {
                name: 'Sakha Republic (Yakutia)',
                name_ko: '야쿠츠크(사하 공화국)',
                name_type: 'Sakha Republic (Yakutia)',
                type: 'admin_area',
                level: 'province',
                start: -3000,
                end: 3000,
                bounds: {
                    north: 73.0,
                    south: 56.0,
                    west: 105.0,
                    east: 162.0
                }
            },
            {
                name: 'Irkutsk Oblast',
                name_ko: '이르쿠츠크주(바이칼)',
                name_type: 'Irkutsk Oblast',
                type: 'admin_area',
                level: 'province',
                start: -3000,
                end: 3000,
                bounds: {
                    north: 60.0,
                    south: 51.0,
                    west: 99.0,
                    east: 120.0
                }
            },
            {
                name: 'Magadan Oblast',
                name_ko: '마가단주',
                name_type: 'Magadan Oblast',
                type: 'admin_area',
                level: 'province',
                start: -3000,
                end: 3000,
                bounds: {
                    north: 66.0,
                    south: 58.0,
                    west: 145.0,
                    east: 166.0
                }
            }
        ];
        
        console.log(`📍 추가할 지역: ${newRegions.length}개\n`);
        
        let addedCount = 0;
        let skippedCount = 0;
        
        for (const region of newRegions) {
            // 이미 존재하는지 확인
            const existing = await collection.findOne({ name_type: region.name_type });
            
            if (existing) {
                console.log(`⏭️  건너뜀: ${region.name_ko} (${region.name}) - 이미 존재함`);
                skippedCount++;
                continue;
            }
            
            // Bounding box로부터 간단한 사각형 폴리곤 생성
            const polygon = {
                type: 'Polygon',
                coordinates: [[
                    [region.bounds.west, region.bounds.north],
                    [region.bounds.east, region.bounds.north],
                    [region.bounds.east, region.bounds.south],
                    [region.bounds.west, region.bounds.south],
                    [region.bounds.west, region.bounds.north]
                ]]
            };
            
            const newTerritory = {
                name: region.name,
                name_ko: region.name_ko,
                name_type: region.name_type,
                type: region.type,
                level: region.level,
                start: region.start,
                end: region.end,
                geojson: {
                    type: 'Feature',
                    geometry: polygon,
                    properties: {
                        name: region.name,
                        name_ko: region.name_ko
                    }
                }
            };
            
            await collection.insertOne(newTerritory);
            console.log(`✅ 추가됨: ${region.name_ko} (${region.name})`);
            addedCount++;
        }
        
        console.log(`\n📊 결과:`);
        console.log(`  ✅ 추가: ${addedCount}개`);
        console.log(`  ⏭️  건너뜀: ${skippedCount}개`);
        console.log(`  📍 총 지역: ${addedCount + skippedCount}개`);
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await client.close();
        console.log('\n✅ MongoDB 연결 종료');
    }
}

addNewTerritories();
