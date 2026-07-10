/**
 * seed_all_kings_as_heroes_from_db.js
 *
 * Convert every ruler stored in the kings collection into heroes and place
 * each ruler at that country's capital for the start of the reign.
 *
 * Usage:
 *   node seed_all_kings_as_heroes_from_db.js --dry-run
 *   node seed_all_kings_as_heroes_from_db.js
 */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

throw new Error('heroes 컬렉션은 더 이상 사용하지 않습니다. 인물 데이터는 kings.kings[]에 hero_type/type으로 저장하세요.');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'realhistory';
const DRY_RUN = process.argv.includes('--dry-run');

function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

function totalMonths(year, month = 1) {
  return Number(year) * 12 + (Number(month || 1) - 1);
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseKingName(rawName) {
  let raw = cleanText(rawName);
  raw = raw.replace(/^\d+\s*대\s*/u, '').trim();

  const parts = raw.split('/').map(cleanText).filter(Boolean);
  const titlePart = parts[0] || raw;
  const personalPart = parts.length > 1 ? parts[parts.length - 1] : '';

  const zhMatch = raw.match(/[（(]([^）)]+)[）)]/);
  const nameZh = zhMatch && /[\u4e00-\u9fff]/.test(zhMatch[1]) ? zhMatch[1].trim() : '';

  const cleanParen = (value) => cleanText(value.replace(/[（(][^）)]*[）)]/g, ''));
  const title = cleanParen(titlePart) || raw;
  const personal = cleanParen(personalPart);
  const nameKo = personal || title;

  return { nameKo, nameZh, title };
}

function buildCapitalIndex(capitalMarkers) {
  const rows = [];
  const isCapitalLikeHistory = (history) =>
    !!history && (
      history.is_capital ||
      history.place_type === 'capital' ||
      history.place_type === 'hwangseong'
    );

  for (const castle of capitalMarkers) {
    for (const history of (castle.history || [])) {
      if (!isCapitalLikeHistory(history) || !history.country_id) continue;
      rows.push({
        countryId: history.country_id,
        start: history.start_year ?? castle.start_year ?? castle.built_year ?? -9999,
        startMonth: history.start_month || 1,
        end: history.end_year ?? castle.end_year ?? castle.destroyed_year ?? null,
        endMonth: history.end_month || castle.destroyed_month || 12,
        name: history.name || castle.name,
        lat: castle.lat,
        lng: castle.lng,
        source: 'history',
      });
    }

    if (castle.is_capital && castle.country_id) {
      rows.push({
        countryId: castle.country_id,
        start: castle.start_year ?? castle.built_year ?? -9999,
        startMonth: castle.built_month || 1,
        end: castle.end_year ?? castle.destroyed_year ?? null,
        endMonth: castle.destroyed_month || 12,
        name: castle.name,
        lat: castle.lat,
        lng: castle.lng,
        source: 'marker',
      });
    }
  }

  return rows
    .filter(row => Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)))
    .sort((a, b) => totalMonths(a.start, a.startMonth) - totalMonths(b.start, b.startMonth));
}

function buildPlaceIndex(markers) {
  const rows = [];

  for (const castle of markers) {
    for (const history of (castle.history || [])) {
      if (!history || !history.country_id) continue;
      rows.push({
        countryId: history.country_id,
        start: history.start_year ?? castle.start_year ?? castle.built_year ?? -9999,
        startMonth: history.start_month || 1,
        end: history.end_year ?? castle.end_year ?? castle.destroyed_year ?? null,
        endMonth: history.end_month || castle.destroyed_month || 12,
        name: history.name || castle.name,
        lat: castle.lat,
        lng: castle.lng,
        source: 'fallback-history',
      });
    }

    if (castle.country_id) {
      rows.push({
        countryId: castle.country_id,
        start: castle.start_year ?? castle.built_year ?? -9999,
        startMonth: castle.built_month || 1,
        end: castle.end_year ?? castle.destroyed_year ?? null,
        endMonth: castle.destroyed_month || 12,
        name: castle.name,
        lat: castle.lat,
        lng: castle.lng,
        source: 'fallback-marker',
      });
    }
  }

  return rows
    .filter(row => Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)))
    .sort((a, b) => totalMonths(a.start, a.startMonth) - totalMonths(b.start, b.startMonth));
}

function findCapital(capitalRows, placeRows, countryId, reignStart) {
  const target = totalMonths(reignStart, 1);
  let candidates = capitalRows.filter(row => sameId(row.countryId, countryId));
  let usedFallback = false;

  if (!candidates.length) {
    candidates = placeRows.filter(row => sameId(row.countryId, countryId));
    usedFallback = true;
  }

  if (!candidates.length) return null;

  const active = candidates.find(row => {
    const start = totalMonths(row.start, row.startMonth);
    const end = row.end == null ? Infinity : totalMonths(row.end, row.endMonth);
    return start <= target && target <= end;
  });
  if (active) return { ...active, usedFallback };

  const nearest = candidates
    .map(row => ({ row, distance: Math.abs(totalMonths(row.start, row.startMonth) - target) }))
    .sort((a, b) => a.distance - b.distance)[0].row;
  return { ...nearest, usedFallback };
}

function countryName(country, fallbackId) {
  return country?.name || `국가 ${String(fallbackId)}`;
}

async function main() {
  if (!MONGO_URI) throw new Error('MONGO_URI 환경 변수가 없습니다.');

  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  await client.connect();
  const db = client.db(DB_NAME);

  const countries = await db.collection('countries').find({}).toArray();
  const countryMap = new Map(countries.map(country => [String(country._id), country]));
  const kingsDocs = await db.collection('kings').find({}).toArray();
  const markerProjection = {
    name: 1,
    lat: 1,
    lng: 1,
    country_id: 1,
    is_capital: 1,
    built_year: 1,
    built_month: 1,
    destroyed_year: 1,
    destroyed_month: 1,
    start_year: 1,
    end_year: 1,
    history: 1,
  };
  const allMarkers = await db.collection('castle').find({}, { projection: markerProjection }).toArray();
  const capitalRows = buildCapitalIndex(allMarkers);
  const placeRows = buildPlaceIndex(allMarkers);

  const heroes = db.collection('heroes');
  const heroPositions = db.collection('hero_positions');
  const now = new Date();

  let seen = 0;
  let created = 0;
  let skipped = 0;
  let noCapital = 0;
  let fallbackPlaces = 0;
  const missingCapitalCountries = new Map();

  for (const kingsDoc of kingsDocs) {
    const country = countryMap.get(String(kingsDoc.country_id));
    const faction = countryName(country, kingsDoc.country_id);
    const factionColor = country?.color || '#c8860a';

    for (const king of (kingsDoc.kings || [])) {
      seen++;
      if (!king.name || king.start == null) {
        skipped++;
        continue;
      }

      const startYear = Number(king.start);
      const endYear = king.end == null ? (country?.end ?? startYear) : Number(king.end);
      const { nameKo, nameZh, title } = parseKingName(king.name);
      const sourceKingId = king._id ? new ObjectId(String(king._id)) : null;

      const duplicateConditions = [
        { name_ko: nameKo, birth_year: startYear, faction },
        { name_ko: nameKo, birth_year: startYear },
      ];
      if (sourceKingId) duplicateConditions.unshift({ source_king_id: sourceKingId });

      const existing = await heroes.findOne({
        $or: duplicateConditions,
      }, { projection: { _id: 1 } });

      if (existing) {
        skipped++;
        continue;
      }

      const capital = findCapital(capitalRows, placeRows, kingsDoc.country_id, startYear);
      if (!capital) {
        noCapital++;
        missingCapitalCountries.set(faction, (missingCapitalCountries.get(faction) || 0) + 1);
        skipped++;
        continue;
      }
      if (capital.usedFallback) fallbackPlaces++;

      if (DRY_RUN) {
        created++;
        continue;
      }

      const heroDoc = {
        name_ko: nameKo,
        name_zh: nameZh,
        birth_year: startYear,
        death_year: endYear,
        title,
        description: king.summary || `${faction}의 군주. 재위 ${startYear}~${endYear}.`,
        faction,
        faction_color: factionColor,
        avatar_url: '',
        illustration_url: '',
        vote_count: 0,
        source: 'kings_collection',
        source_country_id: kingsDoc.country_id,
        source_king_id: sourceKingId,
        createdAt: now,
        updatedAt: now,
      };

      const result = await heroes.insertOne(heroDoc);
      await heroPositions.insertOne({
        hero_id: result.insertedId,
        start_year: startYear,
        end_year: endYear,
        year: startYear,
        type: 'REIGN',
        event_title: `${title} 즉위`,
        location_name: capital.name,
        geometry: {
          type: 'Point',
          coordinates: [Number(capital.lng), Number(capital.lat)],
        },
        source_text: capital.usedFallback
          ? `${faction} 왕 데이터 → ${capital.name} 배치 (명시 수도 기록 없음, 국가 지명 보정)`
          : `${faction} 왕 데이터 → ${capital.name} 수도 배치`,
        createdAt: now,
        updatedAt: now,
      });

      created++;
    }
  }

  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    kingsSeen: seen,
    heroesCreated: created,
    skipped,
    noCapital,
    fallbackPlaces,
    missingCapitalCountries: Array.from(missingCapitalCountries.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20),
  }, null, 2));

  await client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
