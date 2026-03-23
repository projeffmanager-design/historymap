'use strict';
const { parseStringPromise } = require('xml2js');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

async function main() {
    // ── 고려사 kr_001.xml 샘플링 ──
    const xml = fs.readFileSync(
        path.join(ROOT, '교육부 국사편찬위원회_한국사데이터베이스 정보_고려사 원문_20221103', 'kr_001.xml'),
        'utf-8'
    );
    const parsed = await parseStringPromise(xml, { explicitArray: true, mergeAttrs: false, charkey: '_' });

    let count = 0, totalDescBytes = 0, withDesc = 0;
    function traverse(node) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(traverse); return; }
        const fronts = node.front || [];
        const texts  = node.text  || [];
        if (fronts.length > 0 && texts.length > 0) {
            const content = (texts[0].content || [])[0];
            if (content) {
                const ps = content.paragraph || [];
                const arr = Array.isArray(ps) ? ps : [ps];
                const desc = arr.map(p => typeof p === 'string' ? p : (p._ || '')).join(' ').trim();
                if (desc.length > 0) {
                    totalDescBytes += Buffer.byteLength(desc.substring(0, 500), 'utf8');
                    withDesc++;
                }
            }
            count++;
        }
        ['level2','level3','level4'].forEach(k => { if (node[k]) traverse(node[k]); });
    }
    traverse(parsed.level1);

    const avgDesc = withDesc > 0 ? Math.round(totalDescBytes / withDesc) : 300;

    // ── 각 소스별 건수 (dry-run 결과) ──
    const sources = [
        { name: '고려사(高麗史) XML',           count: 24598 },
        { name: '삼국유사(三國遺事) XML',        count: 146   },
        { name: '삼국사기 고구려본기',           count: 196   },
        { name: '삼국사기 백제본기',             count: 173   },
        { name: '삼국사기 신라본기',             count: 507   },
        { name: '고려사절요(미보유-미래 추가용)',  count: 0     },
    ];
    const total = sources.reduce((s, x) => s + x.count, 0);

    // BSON 도큐먼트 1건 = _id(12) + year(4) + month(1) + title(평균 60B) + source(40B) + category(10B) + tags(5B) + bson오버헤드(30B) + description(avgDesc)
    const bsonFixed = 12 + 4 + 1 + 60 + 40 + 10 + 5 + 30;
    const bsonPerDoc = bsonFixed + avgDesc;

    const dataBytes  = total * bsonPerDoc;
    const idxBytes   = total * (12 + 4 + 4);  // _id 인덱스 + year 인덱스
    const totalBytes = dataBytes + idxBytes;

    console.log('');
    console.log('══════════════════════════════════════════════');
    console.log('  📊 MongoDB 용량 추정 보고서');
    console.log('══════════════════════════════════════════════');
    console.log('');
    console.log('  [파싱 샘플 기준]');
    console.log(`  kr_001.xml 기사 수     : ${count}건`);
    console.log(`  평균 description 크기  : ${avgDesc} bytes (한자 UTF-8)`);
    console.log(`  도큐먼트 1건 평균 BSON : ${bsonPerDoc} bytes`);
    console.log('');
    console.log('  [소스별 건수]');
    sources.forEach(s => {
        if (s.count > 0) console.log(`    • ${s.name}: ${s.count.toLocaleString()}건`);
    });
    console.log(`    ────────────────────────────────`);
    console.log(`    합계: ${total.toLocaleString()}건`);
    console.log('');
    console.log('  [용량 추정]');
    console.log(`    데이터 영역  : ${(dataBytes  / 1024 / 1024).toFixed(1)} MB`);
    console.log(`    인덱스 영역  : ${(idxBytes   / 1024 / 1024).toFixed(1)} MB`);
    console.log(`    합계         : ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
    console.log(`    (압축 후 ~50%): ${(totalBytes / 1024 / 1024 / 2).toFixed(1)} MB`);
    console.log('');
    console.log('  [MongoDB Atlas Free Tier 512MB 대비]');
    const pct = (totalBytes / 1024 / 1024 / 512 * 100).toFixed(1);
    console.log(`    사용 비율: ${pct}%`);
    console.log('');

    // ── 원본 파일 크기 ──
    const gDir = path.join(ROOT, '교육부 국사편찬위원회_한국사데이터베이스 정보_고려사 원문_20221103');
    let gSize = 0;
    fs.readdirSync(gDir).filter(f => f.endsWith('.xml')).forEach(f => { gSize += fs.statSync(path.join(gDir, f)).size; });
    const sDir = path.join(ROOT, '교육부 국사편찬위원회_한국사데이터베이스 정보_삼국유사 원문_20221103');
    let sSize = 0;
    fs.readdirSync(sDir).filter(f => f.endsWith('.xml')).forEach(f => { sSize += fs.statSync(path.join(sDir, f)).size; });
    let tSize = 0;
    ['고구려','백제','신라본기','고려사'].forEach(f => {
        try { tSize += fs.statSync(path.join(ROOT, f)).size; } catch (e) {}
    });

    console.log('  [원본 파일 크기]');
    console.log(`    고려사 XML 138개     : ${(gSize/1024/1024).toFixed(1)} MB`);
    console.log(`    삼국유사 XML 5개     : ${(sSize/1024).toFixed(0)} KB`);
    console.log(`    삼국사기 텍스트 3개  : ${(tSize/1024).toFixed(0)} KB`);
    console.log('');
    console.log('  → 원본(47.5MB)의 약 30% 압축 저장됨 (본문 500자 제한 효과)');
    console.log('══════════════════════════════════════════════');
    console.log('');
}

main().catch(console.error);
