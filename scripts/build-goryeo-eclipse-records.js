#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const inputPath = path.join(root, 'exports', 'source_records_translation_targets_2026-08-12.jsonl');
const outputPath = path.join(root, 'public', 'data', 'goryeo-eclipse-records.json');
// 타임슬라이더는 사서의 연·월을 기준으로 삼는다. 삼국사기와 고려사 계열의
// 일식 기사를 한 데이터셋으로 모으고 NASA의 율리우스력 날짜는 별도 교차표로 연결한다.
const sourcePattern = /^(?:삼국사기|고려사(?:절요)?)\(/;
const eclipsePattern = /日食|日蝕|日有食|일식/;
const stems = '甲乙丙丁戊己庚辛壬癸';
const branches = '子丑寅卯辰巳午未申酉戌亥';

function julianDayNumber(year, month, day) {
    let y = Number(year), m = Number(month);
    if (m <= 2) { y -= 1; m += 12; }
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + Number(day) - 1524;
}

function sexagenaryDay(year, month, day) {
    const index = ((julianDayNumber(year, month, day) + 49) % 60 + 60) % 60;
    return stems[index % 10] + branches[index % 12];
}

function extractSexagenaryDay(text) {
    const match = String(text || '').match(/([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])(?:朔|晦)?/);
    return match ? match[1] : null;
}

function historicalYearFromAstronomical(year) {
    // NASA 카탈로그는 year 0 = 1 BCE인 천문학적 연도 표기를 사용한다.
    return Number(year) > 0 ? Number(year) : Number(year) - 1;
}

const records = fs.readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean).flatMap(line => {
    try {
        const row = JSON.parse(line);
        const year = Number(row.year);
        if (year < -57 || year > 1392 || !sourcePattern.test(String(row.source || ''))) return [];
        if (!eclipsePattern.test(`${row.title || ''} ${row.original_content || ''}`)) return [];
        const text = `${row.title || ''} ${row.original_content || ''}`;
        const status = /不食|不果食|일어나지 않/.test(text) ? 'predicted_not_observed'
            : /不見|보이지 않|관측되지 않/.test(text) ? 'obscured'
            : /日食旣|개기일식/.test(text) ? 'total_recorded' : 'recorded';
        return [{
            id: String(row._id), year, month: Number(row.month) || null,
            source: row.source, title: row.title || '일식 기록',
            original_content: row.original_content || '', translation: row.translation || '', status,
            calendar: 'historical_lunisolar', sexagenary_day: extractSexagenaryDay(row.original_content)
        }];
    } catch (_) { return []; }
});

records.sort((a, b) => a.year - b.year || (a.month || 0) - (b.month || 0) || a.source.localeCompare(b.source, 'ko'));
// 간지일이 정확히 같은 계산 일식을 우선 연결한다. 음력 연말은 다음 율리우스년
// 1~2월이 될 수 있으므로 사서 연도와 그 다음 해까지 후보로 허용한다.
const eclipseDir = path.join(root, 'public', 'data', 'eclipses');
const events = [];
for (const name of fs.readdirSync(eclipseDir).filter(name => /^-?\d+\.geojson$/.test(name))) {
    try {
        const collection = JSON.parse(fs.readFileSync(path.join(eclipseDir, name), 'utf8'));
        for (const event of collection.events || []) {
            events.push({ ...event, historical_civil_year: historicalYearFromAstronomical(event.year), sexagenary_day: sexagenaryDay(event.year, event.month, event.day) });
        }
    } catch (_) { /* 손상된 연도 파일은 다음 빌드에서 복구 */ }
}

const matchesByEvent = new Map();
for (const record of records) {
    if (!record.sexagenary_day) continue;
    const candidates = events.filter(event => event.sexagenary_day === record.sexagenary_day
        && (event.historical_civil_year === record.year
            || (Number(record.month) >= 11 && event.historical_civil_year === record.year + 1)));
    if (!candidates.length) continue;
    const expectedSolarMonth = record.month ? ((record.month % 12) + 1) : null;
    candidates.sort((a, b) => {
        const score = event => expectedSolarMonth == null ? 0
            : Math.min(Math.abs(event.month - expectedSolarMonth), 12 - Math.abs(event.month - expectedSolarMonth));
        return score(a) - score(b);
    });
    const best = candidates[0];
    record.matched_eclipse_id = best.id;
    record.julian_date = { year:best.year, month:best.month, day:best.day };
    record.match_method = 'sexagenary_day_exact';
    if (!matchesByEvent.has(best.id)) matchesByEvent.set(best.id, []);
    matchesByEvent.get(best.id).push(record);
}

const matches = [...matchesByEvent.entries()].map(([eventId, linked]) => {
    const counts = new Map();
    linked.forEach(record => {
        const key = `${record.year}:${record.month || 0}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    const [selected] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const [timelineYear, timelineMonth] = selected.split(':').map(Number);
    const event = events.find(item => item.id === eventId);
    return {
        event_id:eventId, timeline_year:timelineYear, timeline_month:timelineMonth || null,
        julian_year:event.year, julian_month:event.month, julian_day:event.day,
        sexagenary_day:event.sexagenary_day, record_ids:linked.map(record => record.id),
        confidence:'sexagenary_day_exact'
    };
}).sort((a, b) => a.timeline_year - b.timeline_year || (a.timeline_month || 0) - (b.timeline_month || 0));

const output = {
    start_year: -57, end_year: 1392, count: records.length,
    calendar: 'historical_lunisolar', matched_eclipse_count:matches.length,
    note: 'timeline_year/month는 사서 음력, julian_date는 NASA 계산 날짜다. 간지일이 정확히 같은 경우만 자동 연결한다.',
    matches, records
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`[goryeo-eclipse] ${records.length} records written`);
