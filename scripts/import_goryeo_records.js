// 고려사 데이터를 파일에서 읽어서 history 컬렉션에 추가하는 스크립트

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './.env' });

const uri = process.env.MONGO_URI;

// 월 정보 추출 함수
function extractMonth(content) {
    const monthMap = {
        '정월': 1, '1월': 1,
        '2월': 2,
        '3월': 3,
        '4월': 4,
        '5월': 5,
        '6월': 6,
        '7월': 7,
        '8월': 8,
        '9월': 9,
        '10월': 10,
        '11월': 11,
        '12월': 12
    };
    
    for (const [key, value] of Object.entries(monthMap)) {
        if (content.includes(key)) {
            return value;
        }
    }
    return 1; // 기본값
}

async function importGoryeoRecords() {
    const client = new MongoClient(uri);
    
    try {
        await client.connect();
        console.log('MongoDB 연결 성공');
        
        const db = client.db('realhistory');
        const historyCollection = db.collection('history');
        
        // 파일 읽기
        const filePath = path.join(__dirname, '../고려사');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const lines = fileContent.split('\n').filter(line => line.trim());
        
        console.log(`총 ${lines.length}개의 기록을 처리합니다.\n`);
        
        let addedCount = 0;
        let skippedCount = 0;
        
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length !== 4) continue;
            
            const [yearStr, eventName, source, content] = parts;
            const year = parseInt(yearStr);
            const month = extractMonth(content);
            
            // 기존 데이터 확인 (중복 방지)
            const existing = await historyCollection.findOne({
                year: year,
                event_name: eventName
            });
            
            if (existing) {
                skippedCount++;
                if (skippedCount <= 5) {
                    console.log(`이미 존재: ${year}년 - ${eventName}`);
                }
            } else {
                const record = {
                    year: year,
                    month: month,
                    event_name: eventName,
                    records: {
                        korean: {
                            source: source,
                            content: content
                        }
                    }
                };
                
                await historyCollection.insertOne(record);
                addedCount++;
                if (addedCount <= 10) {
                    console.log(`추가 완료: ${year}년 ${month}월 - ${eventName}`);
                }
            }
        }
        
        console.log(`\n=== 작업 완료 ===`);
        console.log(`추가된 기록: ${addedCount}개`);
        console.log(`중복으로 건너뛴 기록: ${skippedCount}개`);
        console.log(`총 처리된 기록: ${addedCount + skippedCount}개`);
        
    } catch (error) {
        console.error('오류 발생:', error);
    } finally {
        await client.close();
    }
}

importGoryeoRecords();
