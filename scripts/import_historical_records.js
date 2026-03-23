/**
 * import_historical_records.js
 * 
 * 한국사 원전 → MongoDB events 컬렉션 임포트
 * 
 * 대상:
 *   1. 고려사 XML   (kr_000.xml ~ kr_137.xml)
 *   2. 삼국유사 XML (sy_001.xml ~ sy_005.xml)
 *   3. 삼국사기 텍스트 (고구려, 백제, 신라본기) — tab-separated
 *   4. 고려사절요 XML (kj_*.xml) — 폴더 있을 경우 자동 감지
 *
 * 실행:
 *   node scripts/import_historical_records.js [--dry-run] [--source=all|goryeo|samgukusa|samgukyusa|goryeosajeolyo]
 *
 * 옵션:
 *   --dry-run        DB에 저장하지 않고 파싱 결과만 콘솔 출력
 *   --source=<name>  특정 사료만 임포트 (기본: all)
 *   --skip-existing  이미 DB에 있는 source 의 기존 데이터 삭제 안 함 (기본: 삭제 후 재삽입)
 *   --limit=<n>      테스트용: 각 소스별 최대 n개만 삽입
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { parseStringPromise } = require('xml2js');
const { connectToDatabase, collections } = require('../db');

// ──────────────────────────────────────────────
// CLI 인자 파싱
// ──────────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const SKIP_EXISTING = args.includes('--skip-existing');
const SOURCE    = (args.find(a => a.startsWith('--source=')) || '--source=all').split('=')[1];
const LIMIT_ARG = args.find(a => a.startsWith('--limit='));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : Infinity;

// ──────────────────────────────────────────────
// 경로 설정
// ──────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');

const GORYEO_DIR       = path.join(ROOT, '교육부 국사편찬위원회_한국사데이터베이스 정보_고려사 원문_20221103');
const SAMGUKYUSA_DIR   = path.join(ROOT, '교육부 국사편찬위원회_한국사데이터베이스 정보_삼국유사 원문_20221103');
const SAMGUKGI_FILES   = {
    goguryeo: path.join(ROOT, '고구려'),
    baekje:   path.join(ROOT, '백제'),
    silla:    path.join(ROOT, '신라본기'),
};
// 고려사절요 — 다운로드해서 넣었을 경우 자동 감지
const JEOLYO_CANDIDATES = [
    path.join(ROOT, '교육부 국사편찬위원회_한국사데이터베이스 정보_고려사절요 원문_20230518'),
    path.join(ROOT, '교육부 국사편찬위원회_한국사데이터베이스 정보_고려사절요 원문_20221103'),
    path.join(ROOT, '고려사절요'),
];
const JEOLYO_DIR = JEOLYO_CANDIDATES.find(p => fs.existsSync(p)) || null;

// ──────────────────────────────────────────────
// 헬퍼: dateOccured 문자열 → { year, month }
//   형식: "YYYY-MM-DDL0" 또는 "YYYY-MM-99L0" (99 = 미상)
// ──────────────────────────────────────────────
function parseHistoryDate(dateStr) {
    if (!dateStr) return null;
    // "0877-01-99L0" → 877, 1
    const m = dateStr.match(/^(-?\d+)-(\d{2})/);
    if (!m) return null;
    const year  = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    return {
        year,
        month: (month >= 1 && month <= 12) ? month : 1,
    };
}

// ──────────────────────────────────────────────
// 헬퍼: XML 텍스트 노드에서 순수 텍스트 추출
// ──────────────────────────────────────────────
function extractText(node) {
    if (!node) return '';
    if (typeof node === 'string') return node.trim();
    if (Array.isArray(node)) return node.map(extractText).join(' ').trim();
    if (node._) return node._.trim();
    if (node.$) return '';  // attributes only
    // 자식 노드 순회
    return Object.values(node).map(extractText).join(' ').trim();
}

// content → paragraph 텍스트 합치기 (XML paragraph 배열)
function extractParagraphs(contentNode) {
    if (!contentNode) return '';
    const paragraphs = contentNode.paragraph || [];
    const arr = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
    return arr.map(p => extractText(p)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

// ──────────────────────────────────────────────
// 고려사 / 고려사절요 XML 파싱
//   구조: level1 > level2 > level3 > level4 (실제 기사 단위)
//   날짜가 있는 가장 하위 노드를 추출 (재귀)
// ──────────────────────────────────────────────
async function parseGoryeoXml(filePath, sourceLabel, category) {
    const xml = fs.readFileSync(filePath, 'utf-8');
    let parsed;
    try {
        parsed = await parseStringPromise(xml, {
            explicitArray: true,
            mergeAttrs: false,
            charkey: '_',
        });
    } catch (e) {
        console.warn(`  ⚠️ XML 파싱 실패: ${path.basename(filePath)} — ${e.message}`);
        return [];
    }

    const results = [];

    /**
     * 노드에서 날짜+제목+본문을 가진 "기사 항목"을 재귀 추출
     * @param {object} node      현재 XML 노드
     * @param {number|null} inheritedYear  상위에서 내려온 연도 (없으면 null)
     * @param {number} inheritedMonth 상위에서 내려온 월
     */
    function extractEntries(node, inheritedYear, inheritedMonth) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            node.forEach(n => extractEntries(n, inheritedYear, inheritedMonth));
            return;
        }

        // front > biblioData 처리
        const fronts = node.front || [];
        let myYear = inheritedYear;
        let myMonth = inheritedMonth;
        let myTitle = '';
        let myDesc = '';

        for (const front of fronts) {
            const bds = front.biblioData || [];
            for (const bd of bds) {
                // 날짜 추출 — bd.date[0].dateOccured 또는 bd.dateOccured
                const dateNode = (bd.date || [])[0];
                if (dateNode) {
                    const dos = dateNode.dateOccured || [];
                    const lunar = dos.find(d => d.$ && d.$.type === '음' && d.$.date);
                    const any   = dos.find(d => d.$ && d.$.date);
                    const dateStr = (lunar || any)?.$.date || '';
                    const p = parseHistoryDate(dateStr);
                    if (p) { myYear = p.year; myMonth = p.month; }
                }
                // bdirectly dateOccured (연도만 있는 경우: <dateOccured date="0918">)
                const dos2 = bd.dateOccured || [];
                if (dos2.length > 0) {
                    const any2 = dos2.find(d => d.$ && d.$.date);
                    if (any2) {
                        const p = parseHistoryDate(any2.$.date);
                        if (p && myYear === null) { myYear = p.year; myMonth = p.month; }
                    }
                }
                // 제목
                const titleNode = (bd.title || [])[0];
                if (titleNode) {
                    const t = extractText((titleNode.mainTitle || [])[0]);
                    if (t && t.length > 1) myTitle = t;
                }
            }
        }

        // 본문 — node.text[0].content
        const textNodes = node.text || [];
        if (textNodes.length > 0) {
            const contentNode = (textNodes[0].content || [])[0];
            if (contentNode) myDesc = extractParagraphs(contentNode);
        }

        // 자식 레벨이 있는지 확인
        const childLevels = ['level2','level3','level4','level5'].filter(k => node[k] && node[k].length > 0);

        if (childLevels.length > 0) {
            // 자식이 있으면 재귀 (날짜·제목은 자식에게 전달)
            childLevels.forEach(k => {
                node[k].forEach(child => extractEntries(child, myYear, myMonth));
            });
        } else {
            // 리프 노드: 날짜 + 제목 있으면 기록
            if (myYear !== null && myTitle && myTitle.length > 1) {
                results.push({
                    year: myYear,
                    month: myMonth,
                    text: myTitle,          // validator required 필드
                    title: myTitle,
                    description: myDesc.substring(0, 500),
                    source: sourceLabel,
                    category,
                    tags: [],
                });
            }
        }
    }

    const root = parsed.level1 || parsed.item;
    if (!root) return results;

    // level2 배열부터 시작
    const level2List = root.level2 || [];
    for (const lv2 of level2List) {
        extractEntries(lv2, null, 1);
    }
    return results;
}

// ──────────────────────────────────────────────
// 삼국유사 XML 파싱
//   구조: item > level2 (왕력/기이 등) > level3 > level4 (실제 항목)
//     dateOccured[@date] → 날짜
//     mainTitle → 제목
//     content → 본문
// ──────────────────────────────────────────────
async function parseSamgukyusaXml(filePath) {
    const xml = fs.readFileSync(filePath, 'utf-8');
    let parsed;
    try {
        parsed = await parseStringPromise(xml, {
            explicitArray: true,
            mergeAttrs: false,
            charkey: '_',
        });
    } catch (e) {
        console.warn(`  ⚠️ XML 파싱 실패: ${path.basename(filePath)} — ${e.message}`);
        return [];
    }

    const results = [];

    // 재귀 순회: biblioData 안에 dateOccured + mainTitle + text 있으면 추출
    function traverse(node, parentTitle) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(n => traverse(n, parentTitle)); return; }

        // front > biblioData 에 mainTitle + date 있는지 확인
        const fronts = node.front || [];
        for (const front of fronts) {
            const biblioDatas = (front && front.biblioData) || [];
            for (const bd of biblioDatas) {
                const titleNodes = bd.title || [];
                const title = titleNodes.length > 0 ? extractText((titleNodes[0].mainTitle || [])[0]) : '';
                if (!title) continue;

                let year = null, month = 1;
                const dateNodes = bd.date || [];
                if (dateNodes.length > 0) {
                    const dos = dateNodes[0].dateOccured || [];
                    const lunar = dos.find(d => d.$ && d.$.type === '음' && d.$.date);
                    const any   = dos.find(d => d.$ && d.$.date);
                    const dateStr = (lunar || any)?.$.date || '';
                    const p = parseHistoryDate(dateStr);
                    if (p) { year = p.year; month = p.month; }
                }
                // dateOccured 가 biblioData 바로 아래에도 있을 수 있음
                if (year === null) {
                    const dos2 = bd.dateOccured || [];
                    const any2 = dos2.find(d => d.$ && d.$.date);
                    if (any2) {
                        const p = parseHistoryDate(any2.$.date);
                        if (p) { year = p.year; month = p.month; }
                    }
                }
                if (year === null) continue;

                // 본문 — 같은 level 의 text 노드
                const texts = node.text || [];
                let description = '';
                if (texts.length > 0) {
                    const contentNode = (texts[0].content || [])[0];
                    if (contentNode) description = extractParagraphs(contentNode);
                }

                results.push({
                    year,
                    month,
                    text: title,            // validator required 필드
                    title,
                    description: description.substring(0, 500),
                    source: '삼국유사(三國遺事)',
                    category: 'record',
                    tags: [],
                });
            }
        }

        // 자식 level 재귀
        ['level2','level3','level4','level5'].forEach(key => {
            if (node[key]) traverse(node[key], parentTitle);
        });
    }

    const root = parsed.item || parsed.level1;
    if (root) traverse(root, '');
    return results;
}

// ──────────────────────────────────────────────
// 삼국사기 텍스트 파싱 (tab-separated)
//   컬럼: 연도\t사건명\t출처\t내용
// ──────────────────────────────────────────────
function parseSamgukgiText(filePath, category) {
    const text = fs.readFileSync(filePath, 'utf-8');
    const lines = text.split('\n').filter(l => l.trim());
    const results = [];

    for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length < 2) continue;

        const yearRaw = parts[0].trim();
        const title   = (parts[1] || '').trim();
        const source  = (parts[2] || '').trim() || '삼국사기(三國史記)';
        const desc    = (parts[3] || '').trim();

        if (!yearRaw || !title) continue;

        // **bold** 마크다운 제거
        const cleanTitle = title.replace(/\*\*(.+?)\*\*/g, '$1');
        const cleanDesc  = desc.replace(/\*\*(.+?)\*\*/g, '$1');

        const year = parseInt(yearRaw, 10);
        if (isNaN(year)) continue;

        results.push({
            year,
            month: 1,
            text: cleanTitle,           // validator required 필드
            title: cleanTitle,
            description: cleanDesc.substring(0, 500),
            source: source.replace(/《|》/g, '').trim() || '삼국사기(三國史記)',
            category,
            tags: [],
        });
    }
    return results;
}

// ──────────────────────────────────────────────
// 고려사 텍스트 파일 파싱 (고려사 tab-separated)
// ──────────────────────────────────────────────
function parseGoryeoText(filePath) {
    return parseSamgukgiText(filePath, 'record').map(e => ({
        ...e,
        source: '고려사(高麗史)',
    }));
}

// ──────────────────────────────────────────────
// 중복 제거 헬퍼
//   같은 year + title 이면 중복으로 간주
// ──────────────────────────────────────────────
function dedup(events) {
    const seen = new Set();
    return events.filter(e => {
        const key = `${e.year}|${e.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ──────────────────────────────────────────────
// 메인 실행
// ──────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('══════════════════════════════════════════════');
    console.log('  한국사 원전 → events 컬렉션 임포트');
    console.log(`  모드: ${DRY_RUN ? '🔍 DRY-RUN (저장 안함)' : '💾 실제 저장'}`);
    console.log(`  소스: ${SOURCE}`);
    if (LIMIT < Infinity) console.log(`  제한: 소스별 최대 ${LIMIT}개`);
    console.log('══════════════════════════════════════════════');

    // ─── 1. 소스별 파싱 ───────────────────────────
    const allBatches = [];  // [{ sourceKey, label, events[] }]

    // ── 고려사 XML ─────────────────────────────────
    if (['all','goryeo'].includes(SOURCE) && fs.existsSync(GORYEO_DIR)) {
        console.log('\n📂 고려사 XML 파싱 중...');
        const files = fs.readdirSync(GORYEO_DIR)
            .filter(f => f.startsWith('kr_') && f.endsWith('.xml'))
            .sort();
        let events = [];
        for (const f of files) {
            const evts = await parseGoryeoXml(path.join(GORYEO_DIR, f), '고려사(高麗史)', 'record');
            events.push(...evts);
            process.stdout.write(`\r  ${f}: 누적 ${events.length}건`);
        }
        console.log('');
        events = dedup(events);
        console.log(`  ✅ 고려사 XML: ${events.length}건`);
        allBatches.push({ sourceKey: 'goryeo_xml', label: '고려사(高麗史) XML', events });
    }

    // ── 삼국유사 XML ──────────────────────────────
    if (['all','samgukyusa'].includes(SOURCE) && fs.existsSync(SAMGUKYUSA_DIR)) {
        console.log('\n📂 삼국유사 XML 파싱 중...');
        const files = fs.readdirSync(SAMGUKYUSA_DIR)
            .filter(f => f.startsWith('sy_') && f.endsWith('.xml'))
            .sort();
        let events = [];
        for (const f of files) {
            const evts = await parseSamgukyusaXml(path.join(SAMGUKYUSA_DIR, f));
            events.push(...evts);
            process.stdout.write(`\r  ${f}: 누적 ${events.length}건`);
        }
        console.log('');
        events = dedup(events);
        console.log(`  ✅ 삼국유사 XML: ${events.length}건`);
        allBatches.push({ sourceKey: 'samgukyusa_xml', label: '삼국유사(三國遺事) XML', events });
    }

    // ── 삼국사기 텍스트 (고구려·백제·신라) ──────────
    if (['all','samguksa'].includes(SOURCE)) {
        const samgukSources = [
            { key: 'goguryeo', label: '고구려', file: SAMGUKGI_FILES.goguryeo, category: 'record' },
            { key: 'baekje',   label: '백제',   file: SAMGUKGI_FILES.baekje,   category: 'record' },
            { key: 'silla',    label: '신라',   file: SAMGUKGI_FILES.silla,    category: 'record' },
        ];
        for (const src of samgukSources) {
            if (!fs.existsSync(src.file)) {
                console.log(`\n⚠️  ${src.label} 파일 없음: ${src.file}`);
                continue;
            }
            console.log(`\n📂 삼국사기 ${src.label} 텍스트 파싱 중...`);
            let events = parseSamgukgiText(src.file, src.category);
            events = dedup(events);
            console.log(`  ✅ 삼국사기 ${src.label}: ${events.length}건`);
            allBatches.push({ sourceKey: `samguksa_${src.key}`, label: `삼국사기(三國史記) ${src.label}본기`, events });
        }
    }

    // ── 고려사절요 XML (있을 경우) ────────────────
    if (['all','goryeosajeolyo'].includes(SOURCE)) {
        if (!JEOLYO_DIR) {
            console.log('\n⚠️  고려사절요 폴더 없음 (스킵)');
            console.log('   → data.go.kr에서 다운로드 후 다시 실행하세요');
            console.log('   → 예상 경로: 교육부 국사편찬위원회_한국사데이터베이스 정보_고려사절요 원문_20221103/');
        } else {
            console.log(`\n📂 고려사절요 XML 파싱 중: ${JEOLYO_DIR}`);
            const files = fs.readdirSync(JEOLYO_DIR)
                .filter(f => f.startsWith('kj_') && f.endsWith('.xml'))
                .sort();
            let events = [];
            for (const f of files) {
                const evts = await parseGoryeoXml(path.join(JEOLYO_DIR, f), '고려사절요(高麗史節要)', 'record');
                events.push(...evts);
                process.stdout.write(`\r  ${f}: 누적 ${events.length}건`);
            }
            console.log('');
            events = dedup(events);
            console.log(`  ✅ 고려사절요 XML: ${events.length}건`);
            allBatches.push({ sourceKey: 'goryeosajeolyo_xml', label: '고려사절요(高麗史節要) XML', events });
        }
    }

    // ─── 2. 통계 출력 ─────────────────────────────
    const total = allBatches.reduce((s, b) => s + b.events.length, 0);
    console.log('\n──────────────────────────────────────────────');
    console.log(`  파싱 완료: 총 ${total}건`);
    allBatches.forEach(b => {
        const lim = Math.min(b.events.length, LIMIT);
        console.log(`    • ${b.label}: ${b.events.length}건${LIMIT < Infinity ? ` (최대 ${lim}건 삽입)` : ''}`);
    });
    console.log('──────────────────────────────────────────────');

    if (total === 0) {
        console.log('\n⚠️  임포트할 데이터가 없습니다. 종료합니다.');
        process.exit(0);
    }

    // ─── 3. DRY-RUN: 샘플 출력 후 종료 ──────────
    if (DRY_RUN) {
        console.log('\n🔍 DRY-RUN 샘플 (배치별 최대 3건):\n');
        for (const b of allBatches) {
            console.log(`  ▶ ${b.label}`);
            b.events.slice(0, 3).forEach(e => {
                console.log(`    [${e.year}년 ${e.month}월] ${e.title}`);
                if (e.description) console.log(`      ${e.description.substring(0, 80)}...`);
            });
        }
        console.log('\n✅ DRY-RUN 완료. --dry-run 없이 실행하면 DB에 저장됩니다.');
        process.exit(0);
    }

    // ─── 4. DB 저장 ───────────────────────────────
    console.log('\n🔗 MongoDB 연결 중...');
    await connectToDatabase();
    console.log('  ✅ 연결 완료');

    let totalInserted = 0;

    for (const batch of allBatches) {
        const { sourceKey, label, events } = batch;
        const toInsert = events.slice(0, LIMIT);

        console.log(`\n💾 [${label}] 저장 중...`);

        // 기존 같은 source의 데이터 삭제 (skip-existing 아닐 때)
        if (!SKIP_EXISTING) {
            // events[0].source 로 정확히 매칭
            const sampleSource = events[0]?.source;
            if (sampleSource) {
                const del = await collections.sourceRecords.deleteMany({ source: sampleSource });
                if (del.deletedCount > 0) {
                    console.log(`  🗑️  기존 "${sampleSource}" 데이터 ${del.deletedCount}건 삭제`);
                }
            }
        }

        // 배치 삽입 (500건씩)
        const CHUNK = 500;
        let inserted = 0;
        for (let i = 0; i < toInsert.length; i += CHUNK) {
            const chunk = toInsert.slice(i, i + CHUNK).map(e => ({
                year: e.year,
                month: e.month,
                title: e.title || e.text || '',
                content: e.description || '',
                source: e.source || '',
                tags: e.tags || [],
            }));
            const result = await collections.sourceRecords.insertMany(chunk, { ordered: false });
            inserted += result.insertedCount;
            process.stdout.write(`\r  진행: ${inserted}/${toInsert.length}건`);
        }
        console.log(`\n  ✅ ${label}: ${inserted}건 삽입 완료`);
        totalInserted += inserted;
    }

    console.log('\n══════════════════════════════════════════════');
    console.log(`  🎉 임포트 완료: 총 ${totalInserted}건 DB 저장됨`);
    console.log('══════════════════════════════════════════════\n');
    process.exit(0);
}

main().catch(err => {
    console.error('\n❌ 오류 발생:', err);
    process.exit(1);
});
