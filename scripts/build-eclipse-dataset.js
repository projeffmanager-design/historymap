#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const NASA_CSV = 'https://eclipse.gsfc.nasa.gov/eclipse_besselian_from_mysqldump2.csv';
const NASA_PATH = 'https://eclipse.gsfc.nasa.gov/SEsearch/eclipse-path-data.js.php';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data', 'eclipses');
const START_YEAR = Number.parseInt(process.env.ECLIPSE_START_YEAR || '-56', 10); // 57 BCE (astronomical year)
const END_YEAR = Number.parseInt(process.env.ECLIPSE_END_YEAR || '935', 10);
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.ECLIPSE_CONCURRENCY || '6', 10));
const SPACING = '0.5';

function parseCsv(text) {
    const rows = [];
    let row = [], value = '', quoted = false;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (char === '"') {
            if (quoted && text[i + 1] === '"') { value += '"'; i += 1; }
            else quoted = !quoted;
        } else if (char === ',' && !quoted) {
            row.push(value); value = '';
        } else if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && text[i + 1] === '\n') i += 1;
            row.push(value); value = '';
            if (row.some(cell => cell !== '')) rows.push(row);
            row = [];
        } else value += char;
    }
    if (value || row.length) { row.push(value); rows.push(row); }
    const headers = rows.shift();
    return rows.map(cells => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

function numeric(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
}

function eclipseId(row) {
    const year = Number(row.year);
    const sign = year < 0 ? '-' : '+';
    return `${sign}${String(Math.abs(year)).padStart(4, '0')}${String(row.month).padStart(2, '0')}${String(row.day).padStart(2, '0')}`;
}

function typeLabel(type) {
    return ({ T: '개기일식', A: '금환일식', H: '혼성일식', P: '부분일식' })[String(type).charAt(0)] || type;
}

function eventFromRow(row) {
    const year = Number(row.year);
    return {
        id: eclipseId(row), year, month: Number(row.month), day: Number(row.day),
        time_tdt: row.td_ge, type: typeLabel(row.eclipse_type), type_code: row.eclipse_type,
        saros: Number(row.saros), gamma: numeric(row.gamma), magnitude: numeric(row.magnitude),
        greatest: { lat: numeric(row.lat_dd_ge), lng: numeric(row.lng_dd_ge) },
        path_width_km: numeric(row.path_width), duration: row.central_duration,
        delta_t_seconds: numeric(row.dt), catalog_number: Number(row.cat_no),
        source: 'NASA Five Millennium Canon of Solar Eclipses',
        source_url: `https://eclipse.gsfc.nasa.gov/SEsearch/SEsearchmap.php?Ecl=${encodeURIComponent(eclipseId(row))}`
    };
}

function parseCoordinateArray(source, variable) {
    const match = source.match(new RegExp(`(?:const|var)\\s+${variable}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
    if (!match) return [];
    return [...match[1].matchAll(/lat:\s*(-?\d+(?:\.\d+)?),\s*lng:\s*(-?\d+(?:\.\d+)?)/g)]
        .map(item => [Number(item[2]), Number(item[1])])
        .filter((coordinate, index, all) => index === 0 || coordinate[0] !== all[index - 1][0] || coordinate[1] !== all[index - 1][1]);
}

function splitAntimeridian(coordinates) {
    const parts = [];
    let part = [];
    coordinates.forEach(coordinate => {
        if (part.length && Math.abs(coordinate[0] - part[part.length - 1][0]) > 180) {
            if (part.length > 1) parts.push(part);
            part = [];
        }
        part.push(coordinate);
    });
    if (part.length > 1) parts.push(part);
    return parts;
}

function featuresFromPath(source, event) {
    const definitions = [
        ['northernLimitCoords', 'north'], ['centralLimitCoords', 'center'], ['southernLimitCoords', 'south']
    ];
    return definitions.flatMap(([variable, boundary]) => splitAntimeridian(parseCoordinateArray(source, variable)).map((coordinates, index) => ({
        type: 'Feature',
        id: `${event.id}:${boundary}:${index}`,
        properties: { ...event, boundary, name: `${event.year}-${String(event.month).padStart(2, '0')}-${String(event.day).padStart(2, '0')} ${event.type}` },
        geometry: { type: 'LineString', coordinates }
    })));
}

async function fetchText(url, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'KoreaHistory eclipse dataset builder' } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.text();
        } catch (error) {
            lastError = error;
            if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 500));
        }
    }
    throw lastError;
}

async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    async function run() {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await worker(items[index], index);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return results;
}

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`[eclipse] NASA catalog download: ${START_YEAR}..${END_YEAR}`);
    const rows = parseCsv(await fetchText(NASA_CSV)).filter(row => Number(row.year) >= START_YEAR && Number(row.year) <= END_YEAR);
    const byYear = new Map();
    rows.forEach(row => {
        const year = Number(row.year);
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year).push(row);
    });

    let completed = 0;
    await mapLimit([...byYear.entries()], CONCURRENCY, async ([year, yearRows]) => {
        const events = yearRows.map(eventFromRow);
        const central = yearRows.filter(row => !String(row.eclipse_type).startsWith('P'));
        const pathFeatures = (await mapLimit(central, 2, async row => {
            const event = eventFromRow(row);
            const query = `${NASA_PATH}?Ecl=${encodeURIComponent(event.id)}&Spc=${SPACING}`;
            try { return featuresFromPath(await fetchText(query), event); }
            catch (error) { console.warn(`[eclipse] path failed ${event.id}: ${error.message}`); return []; }
        })).flat();
        const output = {
            type: 'FeatureCollection', year, events, features: pathFeatures,
            attribution: "Eclipse Predictions by Fred Espenak and Jean Meeus (NASA's GSFC)",
            generated_at: new Date().toISOString()
        };
        fs.writeFileSync(path.join(OUTPUT_DIR, `${year}.geojson`), `${JSON.stringify(output)}\n`);
        completed += 1;
        if (completed % 25 === 0 || completed === byYear.size) console.log(`[eclipse] ${completed}/${byYear.size} years`);
    });

    const indexPath = path.join(OUTPUT_DIR, 'index.json');
    let previousYears = [];
    if (fs.existsSync(indexPath)) {
        try { previousYears = JSON.parse(fs.readFileSync(indexPath, 'utf8')).years || []; } catch (_) { previousYears = []; }
    }
    const yearCounts = new Map(previousYears.map(entry => [Number(entry.year), Number(entry.count)]));
    byYear.forEach((entries, year) => yearCounts.set(year, entries.length));
    const mergedYears = [...yearCounts.entries()].sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year, count }));
    const index = {
        start_year: mergedYears[0]?.year ?? START_YEAR,
        end_year: mergedYears[mergedYears.length - 1]?.year ?? END_YEAR,
        event_count: mergedYears.reduce((sum, entry) => sum + entry.count, 0),
        years: mergedYears,
        source: NASA_CSV,
        attribution: "Eclipse Predictions by Fred Espenak and Jean Meeus (NASA's GSFC)"
    };
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    console.log(`[eclipse] complete: ${rows.length} events in ${byYear.size} years`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
