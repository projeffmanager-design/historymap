const HERO_LOG_LIMIT = 200;
const HERO_CLIENT_CACHE_TTL_MS = 15 * 60 * 1000;
const HERO_BASE_STORAGE_KEY = 'codex_hero_base_dataset_v3';
const HERO_BASE_STORAGE_TTL_MS = 15 * 60 * 1000;
const HERO_TYPE_IMAGE_URLS = {
  emperor: 'https://github.com/projeffmanager-design/img/blob/main/emp.png?raw=true',
  king: 'https://github.com/projeffmanager-design/img/blob/main/king.png?raw=true',
  general: 'https://github.com/projeffmanager-design/img/blob/main/general.png?raw=true',
  civilian: 'https://github.com/projeffmanager-design/img/blob/main/mini.png?raw=true',
  brigand: 'https://github.com/projeffmanager-design/img/blob/main/thief.png?raw=true',
  khan: 'https://github.com/projeffmanager-design/img/blob/main/khan.png?raw=true',
  hojok: 'https://github.com/projeffmanager-design/img/blob/main/hojok.png?raw=true',
};
const DEFAULT_HERO_IMAGE_URL = HERO_TYPE_IMAGE_URLS.general;
const royalTypes = new Set(['emperor', 'king', 'khan']);
const knownHeroTypes = new Set([...royalTypes, 'general', 'civilian', 'brigand', 'hojok']);
let heroLayer = null;
let heroLayerVisible = true;
let heroRenderTimer = null;
let heroRenderSeq = 0;
let activeHeroRenderKey = null;
let pendingHeroRenderKey = null;
let renderedHeroKey = null;
let heroFetchController = null;
let heroViewportTimer = null;
let heroViewportRefreshBound = false;
const heroClientCache = new Map();
const heroPrefetchingKeys = new Set();
let heroCacheBust = 0;
let heroBaseDataset = null;
let heroBaseDatasetPromise = null;
let heroCapitalCoordinateCache = { source: null, length: 0, set: new Set() };

function heroLog(phase, detail = {}) {
  const entry = {
    at: new Date().toISOString(),
    phase,
    ...detail,
  };
  window.__codexHeroRenderLog = window.__codexHeroRenderLog || [];
  window.__codexHeroRenderLog.push(entry);
  if (window.__codexHeroRenderLog.length > HERO_LOG_LIMIT) {
    window.__codexHeroRenderLog.shift();
  }
  if (window.__codexHeroDebug) console.debug('[hero-render]', phase, entry);
  return entry;
}

function getLeaflet() {
  return window.L || (typeof L !== 'undefined' ? L : null);
}

function getMap() {
  return window.map || (typeof map !== 'undefined' ? map : null);
}

function getCurrentYearMonth() {
  return {
    year: parseInt(document.getElementById('yearInput')?.value, 10) || 0,
    month: parseInt(document.getElementById('monthInput')?.value, 10) || 1,
  };
}

function normalizeMonth(value, fallback = 1) {
  const month = parseInt(value, 10);
  return month >= 1 && month <= 12 ? month : fallback;
}

function normalizeType(value, fallbackText = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (knownHeroTypes.has(raw)) return raw;
  const hint = `${value || ''} ${fallbackText || ''}`;
  if (/황제|천자|대제/.test(hint)) return 'emperor';
  if (/칸|카간|可汗|汗/.test(hint)) return 'khan';
  if (/왕/.test(hint)) return 'king';
  if (/장군|대장군|총관/.test(hint)) return 'general';
  if (/문관|재상|상서|대신|승상|관리/.test(hint)) return 'civilian';
  if (/호족|족장|수장|토호|豪族/.test(hint)) return 'hojok';
  if (/도적|적벽|강도|유민/.test(hint)) return 'brigand';
  return 'general';
}

function isRoyalHero(king) {
  const raw = String(king && (king.hero_type || king.type || king.role_type) || '').trim().toLowerCase();
  if (raw) return royalTypes.has(normalizeType(raw, king && (king.name || king.summary || king.title || '')));
  const hint = king && (king.name || king.summary || king.title || '');
  if (/장군|대장군|총관|문관|재상|상서|대신|승상|관리|호족|족장|수장|토호|豪族|도적|적벽|강도|유민/.test(hint)) return false;
  return true;
}

function getHeroTypeImageUrl(hero) {
  const type = normalizeType(hero && (hero.hero_type || hero.type || hero.role_type), hero && (hero.name_ko || hero.name || hero.title || ''));
  return HERO_TYPE_IMAGE_URLS[type] || DEFAULT_HERO_IMAGE_URL;
}

function primeHeroTypeImages() {
  Object.values(HERO_TYPE_IMAGE_URLS).forEach((url) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  });
}

function installHeroStyle() {
  if (document.getElementById('codex-hero-pin-style')) return;
  const style = document.createElement('style');
  style.id = 'codex-hero-pin-style';
  style.textContent = [
    '.codex-direct-hero-icon { overflow: visible !important; z-index: 10000 !important; }',
    '.hero-pin-inner { filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.38)) !important; }',
    '.hero-pin-wrapper .hero-pin-svg > ellipse:nth-of-type(1) { fill: rgba(0, 0, 0, 0.18) !important; }',
    '.hero-pin-wrapper .hero-pin-svg > path { stroke-width: 1px !important; }',
    '.hero-pin-name { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9), 0 0 3px rgba(0, 0, 0, 0.8) !important; }',
  ].join('\n');
  document.head.appendChild(style);
}

function getHeroLayer() {
  const leaflet = getLeaflet();
  const leafletMap = getMap();
  if (!leaflet || !leafletMap) {
    heroLog('layer-not-ready', {
      hasLeaflet: !!leaflet,
      hasMap: !!leafletMap,
    });
    return null;
  }
  if (!heroLayer) {
    heroLayer = leaflet.layerGroup();
    heroLog('layer-created');
  }
  if (heroLayerVisible && !leafletMap.hasLayer(heroLayer)) {
    heroLayer.addTo(leafletMap);
    heroLog('layer-added-to-map');
  }
  return heroLayer;
}

function removeHeroLayerFromMap() {
  const leafletMap = getMap();
  if (heroLayer && leafletMap && leafletMap.hasLayer(heroLayer)) {
    leafletMap.removeLayer(heroLayer);
    heroLog('layer-removed-from-map');
  }
}

function clearLegacyHeroLayer() {
  if (window.heroSystem && typeof window.heroSystem.clearLegacyLayer === 'function') {
    window.heroSystem.clearLegacyLayer();
    heroLog('legacy-layer-cleared');
  }
}

function setHeroLayerVisible(visible) {
  heroLayerVisible = !!visible;
  heroLog('visibility-set', { visible: heroLayerVisible });
  if (!heroLayerVisible) {
    heroRenderSeq += 1;
    clearTimeout(heroRenderTimer);
    heroRenderTimer = null;
    pendingHeroRenderKey = null;
    activeHeroRenderKey = null;
    if (heroFetchController) {
      heroFetchController.abort();
      heroFetchController = null;
    }
    clearLegacyHeroLayer();
    removeHeroLayerFromMap();
    return;
  }

  const leafletMap = getMap();
  if (heroLayer && leafletMap && !leafletMap.hasLayer(heroLayer)) {
    heroLayer.addTo(leafletMap);
    heroLog('layer-added-to-map');
  }
  const { year, month } = getCurrentYearMonth();
  renderedHeroKey = null;
  scheduleHeroPins(year, month, false);
}

function syncInitialHeroLayerVisibility() {
  const menuCheckbox = document.getElementById('menu-layer-heroes');
  const toolbarButton = document.getElementById('heroLayerToggleBtn');
  if (menuCheckbox) {
    heroLayerVisible = menuCheckbox.checked;
  } else if (toolbarButton) {
    heroLayerVisible = toolbarButton.classList.contains('active');
  }
  heroLog('visibility-initialized', { visible: heroLayerVisible });
}

function getOverlapShiftPx() {
  return window.innerWidth < 768 ? 22 : 28;
}

function isCapitalLikeCastle(castle) {
  if (!castle) return false;
  if (castle.is_capital === true) return true;
  if (castle.place_type === 'capital' || castle.place_type === 'hwangseong') return true;
  return Array.isArray(castle.history) && castle.history.some(h => (
    h && (h.is_capital === true || h.place_type === 'capital' || h.place_type === 'hwangseong')
  ));
}

function getShiftedHeroLatLng(lat, lng) {
  const leaflet = getLeaflet();
  const leafletMap = getMap();
  const castleList = Array.isArray(window.castles)
    ? window.castles
    : (typeof castles !== 'undefined' && Array.isArray(castles) ? castles : []);
  const capitalCoordinates = getCapitalCoordinateSet(castleList);
  const overlapsCapital = capitalCoordinates.has(heroCoordinateKey(lat, lng));

  if (!overlapsCapital || !leaflet || !leafletMap || typeof leafletMap.project !== 'function') {
    return [lat, lng];
  }

  const projected = leafletMap.project([lat, lng]);
  const shifted = leaflet.point(projected.x + getOverlapShiftPx(), projected.y);
  const result = leafletMap.unproject(shifted);
  return [result.lat, result.lng];
}

function heroCoordinateKey(lat, lng) {
  return `${Number(lat).toFixed(7)}:${Number(lng).toFixed(7)}`;
}

function getCapitalCoordinateSet(castleList) {
  if (
    heroCapitalCoordinateCache.source === castleList &&
    heroCapitalCoordinateCache.length === castleList.length
  ) {
    return heroCapitalCoordinateCache.set;
  }

  const set = new Set();
  castleList.forEach((castle) => {
    if (!isCapitalLikeCastle(castle)) return;
    const castleLat = Number(castle.lat);
    const castleLng = Number(castle.lng);
    if (Number.isFinite(castleLat) && Number.isFinite(castleLng)) {
      set.add(heroCoordinateKey(castleLat, castleLng));
    }
  });
  heroCapitalCoordinateCache = { source: castleList, length: castleList.length, set };
  return set;
}

function isHeroInCurrentView(lat, lng) {
  const leafletMap = getMap();
  if (!leafletMap || typeof leafletMap.getBounds !== 'function') return true;
  try {
    const bounds = leafletMap.getBounds();
    const padded = typeof bounds.pad === 'function' ? bounds.pad(0.22) : bounds;
    return padded.contains([lat, lng]);
  } catch (_) {
    return true;
  }
}

function darken(hex, amount) {
  const safeHex = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#c8860a';
  const n = parseInt(safeHex.replace('#', ''), 16);
  const r = Math.max(0, (n >> 16) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function buildHeroIcon(hero) {
  const leaflet = getLeaflet();
  const baseColor = hero.faction_color && hero.faction_color !== '#c8860a'
    ? hero.faction_color
    : '#c8860a';
  const darkColor = darken(baseColor, 55);
  const uid = String(hero._id || Math.random()).replace(/[^a-z0-9]/gi, '').slice(-8);
  const defaultImageUrl = getHeroTypeImageUrl(hero);
  const avatarInner = hero.avatar_url
    ? `<img src="${hero.avatar_url}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;object-position:top center;border:2px solid rgba(255,255,255,.85);display:block;" onerror="this.onerror=null;this.src='${defaultImageUrl}'">`
    : `<img src="${defaultImageUrl}" alt="" style="width:34px;height:34px;border-radius:50%;object-fit:cover;object-position:top center;border:2px solid rgba(255,255,255,.85);display:block;">`;

  return leaflet.divIcon({
    className: 'codex-direct-hero-icon',
    html: `<div class="hero-pin-wrapper"><div class="hero-pin-inner">
      <svg class="hero-pin-svg" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="pg${uid}" cx="38%" cy="28%" r="65%">
            <stop offset="0%" stop-color="${baseColor}"/>
            <stop offset="100%" stop-color="${darkColor}"/>
          </radialGradient>
          <clipPath id="cp${uid}"><circle cx="20" cy="19" r="16"/></clipPath>
        </defs>
        <ellipse cx="20" cy="50" rx="4" ry="2" fill="rgba(0,0,0,.4)"/>
        <path d="M20,2 C10,2 2,10 2,20 C2,31 10,40 20,49 C30,40 38,31 38,20 C38,10 30,2 20,2 Z" fill="url(#pg${uid})" stroke="${darkColor}" stroke-width="1.2"/>
        <ellipse cx="14" cy="12" rx="5" ry="3.5" fill="rgba(255,255,255,.25)" transform="rotate(-15,14,12)"/>
        <circle cx="20" cy="19" r="16" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1"/>
        <foreignObject x="3" y="3" width="34" height="34" clip-path="url(#cp${uid})" style="border-radius:50%;overflow:hidden;">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:34px;height:34px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;">${avatarInner}</div>
        </foreignObject>
      </svg>
      <span class="hero-pin-name">${hero.name_ko || ''}</span>
    </div></div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 43],
    popupAnchor: [0, -44],
  });
}

function heroCacheKey(year, month) {
  return `${parseInt(year, 10) || 0}:${parseInt(month, 10) || 1}`;
}

function heroTotalMonths(year, month = 1) {
  return (parseInt(year, 10) || 0) * 12 + (normalizeMonth(month, 1) - 1);
}

function idToString(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value.$oid || value._id || value);
  return String(value);
}

function getStoredHeroBaseDataset() {
  try {
    const raw = localStorage.getItem(HERO_BASE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - parsed.at >= HERO_BASE_STORAGE_TTL_MS) return null;
    return parsed.data || null;
  } catch (_) {
    return null;
  }
}

function storeHeroBaseDataset(data) {
  try {
    localStorage.setItem(HERO_BASE_STORAGE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch (_) {}
}

function prepareHeroBaseDataset(base) {
  if (!base || base.__heroPrepared) return base;

  const figures = Array.isArray(base.figures) ? base.figures : [];
  const positions = Array.isArray(base.positions) ? base.positions : [];
  const capitals = Array.isArray(base.capitals) ? base.capitals : [];
  const figuresByCountry = new Map();
  const positionsByHero = new Map();
  const capitalEntriesByCountry = new Map();

  figures.forEach((hero) => {
    const countryId = idToString(hero.source_country_id || hero.country_id);
    const type = normalizeType(hero.hero_type || hero.type, hero.name_ko || hero.name || hero.title || '');
    const startYear = parseInt(hero?.start_year ?? hero?.birth_year ?? hero?.start, 10);
    const endRaw = hero?.end_year ?? hero?.death_year ?? hero?.end;
    hero.__countryId = countryId;
    hero.__heroType = type;
    hero.__startTotal = Number.isNaN(startYear) ? NaN : heroTotalMonths(startYear, hero.start_month || 1);
    hero.__endTotal = endRaw === null || endRaw === undefined || endRaw === ''
      ? Infinity
      : heroTotalMonths(endRaw, hero.end_month || 12);
    if (!countryId) return;
    if (!figuresByCountry.has(countryId)) figuresByCountry.set(countryId, []);
    figuresByCountry.get(countryId).push(hero);
  });

  positions.forEach((pos) => {
    const id = idToString(pos?.hero_id);
    const startYear = parseInt(pos?.start_year ?? pos?.year, 10);
    const endRaw = pos?.end_year;
    pos.__startTotal = Number.isNaN(startYear) ? NaN : heroTotalMonths(startYear, pos.start_month || 1);
    pos.__endTotal = endRaw === null || endRaw === undefined || endRaw === ''
      ? Infinity
      : heroTotalMonths(endRaw, pos.end_month || 12);
    if (!id) return;
    if (!positionsByHero.has(id)) positionsByHero.set(id, []);
    positionsByHero.get(id).push(pos);
  });

  const addCapitalEntry = (countryId, castle, record, rank) => {
    if (!countryId) return;
    const entry = {
      castle,
      record,
      rank,
      startTotal: rank,
      endTotal: record
        ? (record.end_year === null || record.end_year === undefined || record.end_year === ''
          ? Infinity
          : heroTotalMonths(record.end_year, record.end_month || 12))
        : (castle.destroyed_year === null || castle.destroyed_year === undefined || castle.destroyed_year === ''
          ? Infinity
          : heroTotalMonths(castle.destroyed_year, castle.destroyed_month || 12)),
    };
    if (!capitalEntriesByCountry.has(countryId)) capitalEntriesByCountry.set(countryId, []);
    capitalEntriesByCountry.get(countryId).push(entry);
  };

  capitals.forEach((castle) => {
    const history = Array.isArray(castle?.history) ? castle.history : [];
    history.forEach((record) => {
      if (!isCapitalHistoryRecord(record)) return;
      const countryId = idToString(record?.country_id || castle?.country_id);
      const startYear = parseInt(record.start_year, 10);
      if (Number.isNaN(startYear)) return;
      addCapitalEntry(countryId, castle, record, heroTotalMonths(startYear, record.start_month || 1));
    });
    if (!history.length && isCapitalLikeCastle(castle)) {
      const countryId = idToString(castle?.country_id);
      const startYear = parseInt(castle.built_year, 10);
      if (!Number.isNaN(startYear)) {
        addCapitalEntry(countryId, castle, null, heroTotalMonths(startYear, castle.built_month || 1));
      }
    }
  });

  Object.defineProperty(base, '__heroPrepared', {
    value: { figuresByCountry, positionsByHero, capitalEntriesByCountry },
    enumerable: false,
    configurable: true,
  });
  return base;
}

async function loadHeroBaseDataset(force = false) {
  if (!force && heroBaseDataset) return heroBaseDataset;
  if (!force) {
    const stored = getStoredHeroBaseDataset();
    if (stored) {
      heroBaseDataset = prepareHeroBaseDataset(stored);
      heroLog('base-storage-hit', {
        figures: Array.isArray(stored.figures) ? stored.figures.length : 0,
        positions: Array.isArray(stored.positions) ? stored.positions.length : 0,
      });
      return heroBaseDataset;
    }
  }
  if (!heroBaseDatasetPromise || force) {
    const bust = force || heroCacheBust ? `?v=${heroCacheBust || Date.now()}` : '';
    heroBaseDatasetPromise = fetch(`/api/heroes/base${bust}`, {
      cache: force || heroCacheBust ? 'no-store' : 'default',
    })
      .then((r) => {
        if (!r.ok) throw new Error(`heroes/base ${r.status}`);
        return r.json();
      })
      .then((data) => {
        heroClientCache.clear();
        storeHeroBaseDataset(data);
        heroBaseDataset = prepareHeroBaseDataset(data);
        heroLog('base-loaded', {
          figures: Array.isArray(data?.figures) ? data.figures.length : 0,
          positions: Array.isArray(data?.positions) ? data.positions.length : 0,
          capitals: Array.isArray(data?.capitals) ? data.capitals.length : 0,
        });
        return heroBaseDataset;
      })
      .finally(() => {
        heroBaseDatasetPromise = null;
      });
  }
  return heroBaseDatasetPromise;
}

function isFigureActiveAt(hero, year, month) {
  if (Number.isFinite(hero?.__startTotal) || hero?.__endTotal === Infinity) {
    const currentPrepared = heroTotalMonths(year, month);
    return hero.__startTotal <= currentPrepared && currentPrepared < hero.__endTotal;
  }
  const startYear = parseInt(hero?.start_year ?? hero?.birth_year ?? hero?.start, 10);
  if (Number.isNaN(startYear)) return false;
  const endRaw = hero?.end_year ?? hero?.death_year ?? hero?.end;
  const current = heroTotalMonths(year, month);
  const start = heroTotalMonths(startYear, hero?.start_month || 1);
  const end = endRaw === null || endRaw === undefined || endRaw === ''
    ? Infinity
    : heroTotalMonths(endRaw, hero?.end_month || 12);
  return start <= current && current < end;
}

function isHeroPositionActiveAt(pos, year, month) {
  if (Number.isFinite(pos?.__startTotal) || pos?.__endTotal === Infinity) {
    const currentPrepared = heroTotalMonths(year, month);
    return pos.__startTotal <= currentPrepared && currentPrepared <= pos.__endTotal;
  }
  const startYear = parseInt(pos?.start_year ?? pos?.year, 10);
  if (Number.isNaN(startYear)) return false;
  const endRaw = pos?.end_year;
  const current = heroTotalMonths(year, month);
  const start = heroTotalMonths(startYear, pos?.start_month || 1);
  const end = endRaw === null || endRaw === undefined || endRaw === ''
    ? Infinity
    : heroTotalMonths(endRaw, pos?.end_month || 12);
  return start <= current && current <= end;
}

function isCapitalHistoryRecord(record = {}) {
  return record.is_capital === true || record.place_type === 'capital' || record.place_type === 'hwangseong';
}

function isYearMonthRangeActive(startYear, startMonth, endYear, endMonth, year, month) {
  const parsedStart = parseInt(startYear, 10);
  if (Number.isNaN(parsedStart)) return false;
  const current = heroTotalMonths(year, month);
  const start = heroTotalMonths(parsedStart, startMonth || 1);
  const end = endYear === null || endYear === undefined || endYear === ''
    ? Infinity
    : heroTotalMonths(endYear, endMonth || 12);
  return start <= current && current <= end;
}

function getCurrentCapitalEntry(capitals, countryId, year, month) {
  const target = idToString(countryId);
  if (capitals && capitals.__entriesByCountry) {
    const current = heroTotalMonths(year, month);
    let best = null;
    (capitals.__entriesByCountry.get(target) || []).forEach((entry) => {
      if (entry.startTotal <= current && current <= entry.endTotal && (!best || entry.rank >= best.rank)) {
        best = entry;
      }
    });
    return best;
  }
  let best = null;
  (Array.isArray(capitals) ? capitals : []).forEach((castle) => {
    const history = Array.isArray(castle?.history) ? castle.history : [];
    history.forEach((record) => {
      const recordCountryId = idToString(record?.country_id || castle?.country_id);
      if (!recordCountryId || recordCountryId !== target || !isCapitalHistoryRecord(record)) return;
      if (!isYearMonthRangeActive(record.start_year, record.start_month, record.end_year, record.end_month, year, month)) return;
      const rank = heroTotalMonths(record.start_year, record.start_month || 1);
      if (!best || rank >= best.rank) best = { castle, record, rank };
    });
    if (!history.length && idToString(castle?.country_id) === target && isCapitalLikeCastle(castle)
      && isYearMonthRangeActive(castle.built_year, castle.built_month, castle.destroyed_year, castle.destroyed_month, year, month)) {
      const rank = heroTotalMonths(castle.built_year ?? -999999, castle.built_month || 1);
      if (!best || rank >= best.rank) best = { castle, record: null, rank };
    }
  });
  return best;
}

function buildHeroesFromBaseDataset(base, year, month) {
  prepareHeroBaseDataset(base);
  const prepared = base?.__heroPrepared || null;
  const figures = Array.isArray(base?.figures) ? base.figures : [];
  const capitals = Array.isArray(base?.capitals) ? base.capitals : [];
  const current = heroTotalMonths(year, month);
  const activeByCountry = new Map();
  figures.forEach((hero) => {
    const countryId = hero.__countryId || idToString(hero.source_country_id || hero.country_id);
    if (!countryId) return;
    if ((Number.isFinite(hero.__startTotal) || hero.__endTotal === Infinity)
      ? !(hero.__startTotal <= current && current < hero.__endTotal)
      : !isFigureActiveAt(hero, year, month)) return;
    if (!activeByCountry.has(countryId)) activeByCountry.set(countryId, []);
    activeByCountry.get(countryId).push(hero);
  });

  const result = [];
  activeByCountry.forEach((activeHeroes, countryId) => {
    let selectedRoyal = null;
    const visibleHeroes = [];
    activeHeroes.forEach((hero) => {
      const type = hero.__heroType || normalizeType(hero.hero_type || hero.type, hero.name_ko || hero.name || hero.title || '');
      if (!royalTypes.has(type)) {
        visibleHeroes.push(hero);
        return;
      }
      if (!selectedRoyal) {
        selectedRoyal = hero;
        return;
      }
      const heroStart = hero.__startTotal ?? heroTotalMonths(hero.start_year, hero.start_month || 1);
      const selectedStart = selectedRoyal.__startTotal ?? heroTotalMonths(selectedRoyal.start_year, selectedRoyal.start_month || 1);
      if (
        heroStart > selectedStart ||
        (heroStart === selectedStart && idToString(hero.source_ref_id || hero._id).localeCompare(idToString(selectedRoyal.source_ref_id || selectedRoyal._id)) > 0)
      ) {
        selectedRoyal = hero;
      }
    });
    if (selectedRoyal) visibleHeroes.push(selectedRoyal);

    const indexedCapitals = prepared ? { __entriesByCountry: prepared.capitalEntriesByCountry } : capitals;
    const capitalEntry = getCurrentCapitalEntry(indexedCapitals, countryId, year, month);
    visibleHeroes.forEach((hero) => {
      const type = hero.__heroType || normalizeType(hero.hero_type || hero.type, hero.name_ko || hero.name || hero.title || '');
      const nextHero = { ...hero };
      const capital = capitalEntry?.castle;
      if (royalTypes.has(type) && capital && Number.isFinite(Number(capital.lat)) && Number.isFinite(Number(capital.lng))) {
        nextHero.position = {
          hero_id: nextHero._id,
          year: nextHero.start_year,
          start_year: nextHero.start_year,
          end_year: nextHero.end_year,
          start_month: nextHero.start_month,
          end_month: nextHero.end_month,
          type: 'STAY',
          event_title: nextHero.title || nextHero.name_ko || '왕',
          location_name: capitalEntry?.record?.name || capital.name || nextHero.faction || '',
          geometry: { type: 'Point', coordinates: [Number(capital.lng), Number(capital.lat)] },
          source_kind: 'capital',
        };
      }
      const savedPositions = prepared?.positionsByHero.get(idToString(nextHero._id)) || [];
      let savedPosition = null;
      for (let i = 0; i < savedPositions.length; i += 1) {
        const pos = savedPositions[i];
        const isActive = (Number.isFinite(pos.__startTotal) || pos.__endTotal === Infinity)
          ? pos.__startTotal <= current && current <= pos.__endTotal
          : isHeroPositionActiveAt(pos, year, month);
        if (isActive) savedPosition = pos;
      }
      if (savedPosition && !royalTypes.has(type)) nextHero.position = savedPosition;
      result.push(nextHero);
    });
  });

  return result.sort((a, b) => (
    (a.sort_year ?? a.start_year ?? 0) - (b.sort_year ?? b.start_year ?? 0) ||
    (a.sort_month ?? a.start_month ?? 1) - (b.sort_month ?? b.start_month ?? 1) ||
    (a.sort_order ?? 0) - (b.sort_order ?? 0)
  ));
}

function getCachedHeroData(key) {
  const cached = heroClientCache.get(key);
  if (!cached || Date.now() - cached.at >= HERO_CLIENT_CACHE_TTL_MS) return null;
  return cached.data;
}

function setCachedHeroData(key, data) {
  heroClientCache.set(key, { at: Date.now(), data });
  if (heroClientCache.size > 240) {
    const firstKey = heroClientCache.keys().next().value;
    heroClientCache.delete(firstKey);
  }
}

async function fetchHeroData(year, month, signal) {
  const key = heroCacheKey(year, month);
  const cached = getCachedHeroData(key);
  if (cached) return { data: cached, cacheHit: true };
  const base = heroBaseDataset || getStoredHeroBaseDataset();
  if (base) {
    heroBaseDataset = prepareHeroBaseDataset(base);
    const data = buildHeroesFromBaseDataset(base, year, month);
    setCachedHeroData(key, data);
    return { data, cacheHit: true, localBase: true };
  }
  loadHeroBaseDataset().catch((err) => {
    heroLog('base-preload-error', { message: err?.message || String(err) });
  });
  const url = `/api/heroes?year=${parseInt(year, 10) || 0}&month=${parseInt(month, 10) || 1}`;
  const requestUrl = heroCacheBust ? `${url}&v=${heroCacheBust}` : url;
  const data = await fetch(requestUrl, {
    signal,
    cache: heroCacheBust ? 'no-store' : 'default',
  }).then(r => r.json());
  setCachedHeroData(key, data);
  return { data, cacheHit: false };
}

function renderHeroPinsImmediate(year, month) {
  if (!heroLayerVisible) return false;
  const normalizedYear = parseInt(year, 10) || 0;
  const normalizedMonth = parseInt(month, 10) || 1;
  const renderKey = heroCacheKey(normalizedYear, normalizedMonth);
  const leaflet = getLeaflet();
  const layer = getHeroLayer();
  if (!leaflet || !layer) return false;
  let data = getCachedHeroData(renderKey);
  if (!data) {
    const base = heroBaseDataset || getStoredHeroBaseDataset();
    if (!base) return false;
    heroBaseDataset = prepareHeroBaseDataset(base);
    data = buildHeroesFromBaseDataset(base, normalizedYear, normalizedMonth);
    setCachedHeroData(renderKey, data);
  }
  clearTimeout(heroRenderTimer);
  heroRenderTimer = null;
  const seq = ++heroRenderSeq;
  activeHeroRenderKey = renderKey;
  pendingHeroRenderKey = renderKey;
  clearLegacyHeroLayer();
  renderHeroDataToLayer(data, layer, leaflet, normalizedYear, normalizedMonth, seq, renderKey, {
    immediate: true,
    skipPrefetch: true,
  });
  heroLog('render-immediate', {
    year: normalizedYear,
    month: normalizedMonth,
    count: Array.isArray(data) ? data.length : 0,
    seq,
  });
  return true;
}

function renderHeroDataToLayer(data, layer, leaflet, normalizedYear, normalizedMonth, seq, renderKey, options = {}) {
  let added = 0;
  const skipped = { noCoords: 0, invalidCoords: 0, outOfView: 0 };
  const markers = [];
  data.forEach((hero) => {
    const coords = hero?.position?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      skipped.noCoords += 1;
      return;
    }
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      skipped.invalidCoords += 1;
      return;
    }
    if (!isHeroInCurrentView(lat, lng)) {
      skipped.outOfView += 1;
      return;
    }
    const marker = leaflet.marker(getShiftedHeroLatLng(lat, lng), {
      icon: buildHeroIcon(hero),
      zIndexOffset: 10000,
    });
    marker.on('click', () => {
      if (window.heroSystem && typeof window.heroSystem.openSidebar === 'function') {
        window.heroSystem.openSidebar(hero._id);
      }
    });
    markers.push(marker);
  });

  layer.clearLayers();
  const chunkSize = options.immediate ? (markers.length || 1) : (window.innerWidth < 768 ? 18 : 36);
  const addChunk = (index = 0) => {
    if (seq !== heroRenderSeq || renderKey !== activeHeroRenderKey || !heroLayerVisible) {
      heroLog('render-chunk-stale-discarded', { seq, renderKey, index });
      return;
    }
    markers.slice(index, index + chunkSize).forEach(marker => {
      layer.addLayer(marker);
      added += 1;
    });
    if (index + chunkSize < markers.length) {
      requestAnimationFrame(() => addChunk(index + chunkSize));
      return;
    }
    heroLog('render-complete', {
      year: normalizedYear,
      month: normalizedMonth,
      received: Array.isArray(data) ? data.length : 0,
      added,
      skipped,
      layerCount: typeof layer.getLayers === 'function' ? layer.getLayers().length : null,
      domCount: document.querySelectorAll('.codex-direct-hero-icon').length,
      seq,
      renderKey,
      chunkSize,
      immediate: !!options.immediate,
    });
    renderedHeroKey = renderKey;
    pendingHeroRenderKey = null;
    if (!options.skipPrefetch) prefetchAdjacentHeroData(normalizedYear, normalizedMonth);
  };
  addChunk(0);
}

function shiftYearMonth(year, month, delta) {
  let y = parseInt(year, 10) || 0;
  let m = parseInt(month, 10) || 1;
  m += delta;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return { year: y, month: m };
}

function prefetchAdjacentHeroData(year, month) {
  [-12, -1, 1, 12].forEach((delta) => {
    const next = shiftYearMonth(year, month, delta);
    const key = heroCacheKey(next.year, next.month);
    if (getCachedHeroData(key) || heroPrefetchingKeys.has(key)) return;
    heroPrefetchingKeys.add(key);
    fetchHeroData(next.year, next.month)
      .then(({ data, cacheHit }) => {
        heroLog('prefetch-done', { key, count: Array.isArray(data) ? data.length : 0, cacheHit });
      })
      .catch((err) => {
        heroLog('prefetch-error', { key, message: err?.message || String(err) });
      })
      .finally(() => {
        heroPrefetchingKeys.delete(key);
      });
  });
}

async function renderHeroPins(year, month) {
  const normalizedYear = parseInt(year, 10) || 0;
  const normalizedMonth = parseInt(month, 10) || 1;
  const renderKey = heroCacheKey(normalizedYear, normalizedMonth);
  const leaflet = getLeaflet();
  heroLog('render-start', {
    year: normalizedYear,
    month: normalizedMonth,
    key: renderKey,
    hasLeaflet: !!leaflet,
    hasMap: !!getMap(),
  });

  if (!heroLayerVisible) {
    clearLegacyHeroLayer();
    removeHeroLayerFromMap();
    heroLog('render-skip-hidden', { year: normalizedYear, month: normalizedMonth, key: renderKey });
    return;
  }

  clearLegacyHeroLayer();
  const layer = getHeroLayer();
  if (!layer || !leaflet) {
    setTimeout(() => renderHeroPins(normalizedYear, normalizedMonth), 300);
    return;
  }

  if (heroFetchController) {
    heroFetchController.abort();
    heroLog('fetch-abort-previous', { nextKey: renderKey });
  }

  const seq = ++heroRenderSeq;
  activeHeroRenderKey = renderKey;
  pendingHeroRenderKey = renderKey;
  const previousCount = typeof layer.getLayers === 'function' ? layer.getLayers().length : null;
  heroLog('render-layer-ready', { year: normalizedYear, month: normalizedMonth, previousCount, seq });

  try {
    const cachedData = getCachedHeroData(renderKey);
    let data = cachedData;
    if (cachedData) {
      heroLog('fetch-cache-hit', { year: normalizedYear, month: normalizedMonth, count: Array.isArray(data) ? data.length : 0, seq });
    } else {
      heroLog('fetch-start', { year: normalizedYear, month: normalizedMonth, seq });
      heroFetchController = new AbortController();
      const currentController = heroFetchController;
      ({ data } = await fetchHeroData(normalizedYear, normalizedMonth, currentController.signal));
      if (heroFetchController === currentController) heroFetchController = null;
    }
    heroLog('fetch-done', {
      year: normalizedYear,
      month: normalizedMonth,
      received: Array.isArray(data) ? data.length : 0,
      withPosition: Array.isArray(data)
        ? data.filter(h => h?.position?.geometry && Array.isArray(h.position.geometry.coordinates)).length
        : 0,
      sample: Array.isArray(data) ? data.slice(0, 5).map(h => h?.name_ko).filter(Boolean) : [],
      seq,
    });

    if (seq !== heroRenderSeq || renderKey !== activeHeroRenderKey) {
      heroLog('render-stale-discarded', { seq, activeSeq: heroRenderSeq, renderKey, activeHeroRenderKey });
      return;
    }
    if (!heroLayerVisible) {
      removeHeroLayerFromMap();
      heroLog('render-discarded-hidden', { seq, renderKey });
      return;
    }

    renderHeroDataToLayer(data, layer, leaflet, normalizedYear, normalizedMonth, seq, renderKey);
  } catch (err) {
    if (err?.name === 'AbortError') {
      heroLog('fetch-aborted', { year: normalizedYear, month: normalizedMonth, key: renderKey, seq });
      return;
    }
    pendingHeroRenderKey = null;
    heroLog('render-error', {
      year: normalizedYear,
      month: normalizedMonth,
      message: err?.message || String(err),
      stack: err?.stack || null,
    });
  }
}

function scheduleHeroPins(year, month, cacheOnly) {
  if (!heroLayerVisible) {
    heroLog('schedule-skip-hidden', { year, month });
    return;
  }
  if (cacheOnly) {
    heroLog('schedule-skip-cache-only', { year, month });
    return;
  }
  const current = getCurrentYearMonth();
  const normalizedYear = parseInt(year, 10) || current.year;
  const normalizedMonth = parseInt(month, 10) || current.month;
  const key = `${normalizedYear}:${normalizedMonth}`;
  const layerCount = heroLayer && typeof heroLayer.getLayers === 'function'
    ? heroLayer.getLayers().length
    : null;
  if (key === renderedHeroKey) {
    heroLog('schedule-skip-rendered-same', { year: normalizedYear, month: normalizedMonth, key, layerCount });
    return;
  }
  if (key === pendingHeroRenderKey || (heroRenderTimer && key === activeHeroRenderKey)) {
    heroLog('schedule-skip-pending-same', { year: normalizedYear, month: normalizedMonth, key });
    return;
  }
  activeHeroRenderKey = key;
  pendingHeroRenderKey = key;
  heroLog('schedule', { year: normalizedYear, month: normalizedMonth, key, cacheOnly: !!cacheOnly });
  clearTimeout(heroRenderTimer);
  const delay = getCachedHeroData(key) || heroBaseDataset || getStoredHeroBaseDataset() ? 0 : 70;
  heroRenderTimer = setTimeout(() => {
    heroRenderTimer = null;
    heroLog('schedule-fire', { year: normalizedYear, month: normalizedMonth, key });
    renderHeroPins(normalizedYear, normalizedMonth);
  }, delay);
}

function patchGetKingByYear() {
  if (window.__codexGetKingByYearPatched || typeof window.getKingByYear !== 'function') return;
  const original = window.getKingByYear;
  window.getKingByYear = function patchedGetKingByYear(countryName, year, month) {
    try {
      const country = typeof window.getCountryInfo === 'function' ? window.getCountryInfo(countryName) : null;
      const kingKey = country && country._id;
      const kingStore = typeof window.kings !== 'undefined' ? window.kings : null;
      const list = kingKey && kingStore && Array.isArray(kingStore[kingKey]) ? kingStore[kingKey] : null;
      if (!list || !list.length) return original.apply(this, arguments);
      const royalList = list.filter(isRoyalHero);
      if (!royalList.length) return null;
      const toMonths = typeof window.yearMonthToTotalMonths === 'function'
        ? (y, m) => window.yearMonthToTotalMonths(y, normalizeMonth(m, 1))
        : (y, m) => ((parseInt(y, 10) || 0) * 12) + (normalizeMonth(m, 1) - 1);
      const current = toMonths(year, month);
      return royalList.filter((king) => {
        const start = toMonths(king.start, king.start_month);
        const end = (king.end === null || king.end === undefined || isNaN(king.end))
          ? Infinity
          : toMonths(king.end, normalizeMonth(king.end_month, 12));
        return start <= current && current < end;
      }).sort((a, b) => (
        toMonths(a.start, a.start_month) - toMonths(b.start, b.start_month) ||
        String(a._id || '').localeCompare(String(b._id || ''))
      )).pop() || null;
    } catch (err) {
      heroLog('get-king-patch-error', { message: err?.message || String(err) });
      return original.apply(this, arguments);
    }
  };
  window.__codexGetKingByYearPatched = true;
  heroLog('get-king-patched');
}

function bindTimelineFallback() {
  if (window.__codexHeroTimelineFallbackBound) return;
  const scheduleFromInputs = () => {
    const { year, month } = getCurrentYearMonth();
    scheduleHeroPins(year, month, false);
  };
  ['yearInput', 'monthInput', 'combinedSlider'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', scheduleFromInputs);
  });
  window.__codexHeroTimelineFallbackBound = true;
  heroLog('timeline-fallback-bound');
}

function scheduleHeroViewportRefresh(reason) {
  if (!heroLayerVisible) return;
  clearTimeout(heroViewportTimer);
  heroViewportTimer = setTimeout(() => {
    const { year, month } = getCurrentYearMonth();
    renderedHeroKey = null;
    heroLog('viewport-refresh', { reason, year, month });
    scheduleHeroPins(year, month, false);
  }, 90);
}

function bindMapViewportRefresh() {
  if (heroViewportRefreshBound) return;
  const leafletMap = getMap();
  if (!leafletMap || typeof leafletMap.on !== 'function') {
    setTimeout(bindMapViewportRefresh, 300);
    return;
  }
  leafletMap.on('moveend', () => scheduleHeroViewportRefresh('moveend'));
  leafletMap.on('zoomend', () => scheduleHeroViewportRefresh('zoomend'));
  heroViewportRefreshBound = true;
  heroLog('viewport-refresh-bound');
}

function bootHeroRenderer() {
  installHeroStyle();
  primeHeroTypeImages();
  window.__codexClearHeroCache = () => {
    heroCacheBust = Date.now();
    heroClientCache.clear();
    heroPrefetchingKeys.clear();
    heroBaseDataset = null;
    heroBaseDatasetPromise = null;
    try { localStorage.removeItem(HERO_BASE_STORAGE_KEY); } catch (_) {}
    renderedHeroKey = null;
    pendingHeroRenderKey = null;
    activeHeroRenderKey = null;
  };
  window.__codexRefreshHeroPinsNow = async () => {
    window.__codexClearHeroCache();
    const { year, month } = getCurrentYearMonth();
    try {
      await loadHeroBaseDataset(true);
      if (!renderHeroPinsImmediate(year, month)) {
        await renderHeroPins(year, month);
      }
    } catch (err) {
      heroLog('refresh-now-base-error', { message: err?.message || String(err) });
      await renderHeroPins(year, month);
    }
  };
  window.__codexScheduleHeroPins = scheduleHeroPins;
  window.__codexForceHeroPins = renderHeroPins;
  window.__codexRenderHeroPinsImmediate = renderHeroPinsImmediate;
  window.__codexGetHeroDataForTime = async (year, month) => {
    const { data } = await fetchHeroData(year, month);
    return data;
  };
  window.__codexSetHeroLayerVisible = setHeroLayerVisible;
  window.__codexIsHeroLayerVisible = () => heroLayerVisible;
  syncInitialHeroLayerVisibility();
  patchGetKingByYear();
  bindTimelineFallback();
  bindMapViewportRefresh();
  loadHeroBaseDataset()
    .then(() => {
      const current = getCurrentYearMonth();
      renderHeroPinsImmediate(current.year, current.month) || scheduleHeroPins(current.year, current.month, false);
    })
    .catch((err) => heroLog('base-initial-load-error', { message: err?.message || String(err) }));
  const { year, month } = getCurrentYearMonth();
  scheduleHeroPins(year, month, false);
}

heroLog('module-loaded', {
  href: window.location.href,
  readyState: document.readyState,
  hasBackupRuntime: false,
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootHeroRenderer, { once: true });
} else {
  bootHeroRenderer();
}
