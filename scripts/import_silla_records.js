// 신라본기 데이터를 history 컬렉션에 추가하는 스크립트

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: './.env' });

const uri = process.env.MONGO_URI;

const sillaRecords = [
    {
        year: 443,
        month: 2,
        event_name: "가뭄",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[흉년] 봄 2월, 크게 가물었다."
            }
        }
    },
    {
        year: 444,
        month: 9,
        event_name: "왜구 동쪽 변방 침략",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[왜국의 침략] 가을 9월, 왜인들이 동쪽 변방을 침략하였다."
            }
        }
    },
    {
        year: 445,
        month: 8,
        event_name: "왜구 약탈",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[왜국의 침략] 가을 8월, 왜인들이 다시 침략하여 해변의 마을을 약탈하였다."
            }
        }
    },
    {
        year: 446,
        month: 2,
        event_name: "백제와 화친",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[백제와의 관계] 봄 2월, 백제와 화친하였다."
            }
        }
    },
    {
        year: 447,
        month: 4,
        event_name: "우박",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[천재지변] 여름 4월, 우박이 내렸다."
            }
        }
    },
    {
        year: 448,
        month: 9,
        event_name: "왜구 명활성 공격",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[왜국의 침략] 가을 9월, 왜인들이 명활성을 공격하였다."
            }
        }
    },
    {
        year: 449,
        month: 2,
        event_name: "백제와 화친",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[백제와의 관계] 봄 2월, 백제와 화친하였다."
            }
        }
    },
    {
        year: 450,
        month: 8,
        event_name: "왜구 동쪽 변방 침략",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[왜국의 침략] 가을 8월, 왜인들이 동쪽 변방을 침략하였다."
            }
        }
    },
    {
        year: 451,
        month: 2,
        event_name: "가뭄",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[흉년] 봄 2월, 크게 가물었다."
            }
        }
    },
    {
        year: 452,
        month: 7,
        event_name: "서리",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[천재지변] 가을 7월, 서리가 내렸다."
            }
        }
    },
    {
        year: 453,
        month: 9,
        event_name: "왜구 사도성 공격",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[왜국의 침략] 가을 9월, 왜인들이 사도성을 공격하였다."
            }
        }
    },
    {
        year: 454,
        month: 2,
        event_name: "백제와 화친",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[백제와의 관계] 봄 2월, 백제와 화친하였다."
            }
        }
    },
    {
        year: 455,
        month: 8,
        event_name: "왜구 침략",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[왜국의 침략] 가을 8월, 왜인들이 침략하였다."
            }
        }
    },
    {
        year: 456,
        month: 4,
        event_name: "우박",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[천재지변] 여름 4월, 우박이 내렸다."
            }
        }
    },
    {
        year: 457,
        month: 9,
        event_name: "왜구 동쪽 변방 침략",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[왜국의 침략] 가을 9월, 왜인들이 동쪽 변방을 침략하였다."
            }
        }
    },
    {
        year: 458,
        month: 3,
        event_name: "왕의 승하",
        records: {
            korean: {
                source: "《삼국사기(三國史記)》 신라본기",
                content: "[왕의 승하] 봄 3월, 왕이 돌아가셨다. **이사금원(尼師今園)**에 장사지냈다."
            }
        }
    }
];

async function importSillaRecords() {
    const client = new MongoClient(uri);
    
    try {
        await client.connect();
        console.log('MongoDB 연결 성공');
        
        const db = client.db('realhistory');
        const historyCollection = db.collection('history');
        
        // 기존 데이터 확인 (중복 방지)
        for (const record of sillaRecords) {
            const existing = await historyCollection.findOne({
                year: record.year,
                month: record.month,
                event_name: record.event_name
            });
            
            if (existing) {
                console.log(`이미 존재: ${record.year}년 ${record.month}월 - ${record.event_name}`);
            } else {
                await historyCollection.insertOne(record);
                console.log(`추가 완료: ${record.year}년 ${record.month}월 - ${record.event_name}`);
            }
        }
        
        console.log('\n신라본기 데이터 가져오기 완료!');
        
    } catch (error) {
        console.error('오류 발생:', error);
    } finally {
        await client.close();
    }
}

importSillaRecords();
