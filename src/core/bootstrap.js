const HERO_LOG_LIMIT = 200;
const HERO_CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_HERO_IMAGE_URL = 'https://github.com/projeffmanager-design/img/blob/main/minister.png?raw=true';
const royalTypes = new Set(['emperor', 'king']);
let heroLayer = null;
let heroLayerVisible = true;
let heroRenderTimer = null;
let heroRenderSeq = 0;
let activeHeroRenderKey = null;
let pendingHeroRenderKey = null;
let renderedHeroKey = null;
let heroFetchController = null;
const heroClientCache = new Map();

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
  if (royalTypes.has(raw) || raw === 'general' || raw === 'civilian' || raw === 'brigand') return raw;
  const hint = `${value || ''} ${fallbackText || ''}`;
  if (/황제|천자|대제/.test(hint)) return 'emperor';
  if (/왕/.test(hint)) return 'king';
  if (/장군|대장군|총관/.test(hint)) return 'general';
  if (/문관|재상|상서|대신|승상|관리/.test(hint)) return 'civilian';
  if (/도적|적벽|강도|유민/.test(hint)) return 'brigand';
  return 'general';
}

function isRoyalHero(king) {
  const raw = String(king && (king.hero_type || king.type || king.role_type) || '').trim().toLowerCase();
  if (raw) return royalTypes.has(normalizeType(raw, king && (king.name || king.summary || king.title || '')));
  const hint = king && (king.name || king.summary || king.title || '');
  if (/장군|대장군|총관|문관|재상|상서|대신|승상|관리|도적|적벽|강도|유민/.test(hint)) return false;
  return true;
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
  const overlapsCapital = castleList.some((castle) => {
    if (!isCapitalLikeCastle(castle)) return false;
    const castleLat = Number(castle.lat);
    const castleLng = Number(castle.lng);
    return Number.isFinite(castleLat) && Number.isFinite(castleLng)
      && Math.abs(castleLat - lat) < 1e-7
      && Math.abs(castleLng - lng) < 1e-7;
  });

  if (!overlapsCapital || !leaflet || !leafletMap || typeof leafletMap.project !== 'function') {
    return [lat, lng];
  }

  const projected = leafletMap.project([lat, lng]);
  const shifted = leaflet.point(projected.x + getOverlapShiftPx(), projected.y);
  const result = leafletMap.unproject(shifted);
  return [result.lat, result.lng];
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
  const avatarInner = hero.avatar_url
    ? `<img src="${hero.avatar_url}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;object-position:top center;border:2px solid rgba(255,255,255,.85);display:block;" onerror="this.onerror=null;this.src='${DEFAULT_HERO_IMAGE_URL}'">`
    : `<img src="${DEFAULT_HERO_IMAGE_URL}" alt="" style="width:34px;height:34px;border-radius:50%;object-fit:cover;object-position:top center;border:2px solid rgba(255,255,255,.85);display:block;">`;

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

async function renderHeroPins(year, month) {
  const normalizedYear = parseInt(year, 10) || 0;
  const normalizedMonth = parseInt(month, 10) || 1;
  const renderKey = `${normalizedYear}:${normalizedMonth}`;
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
  layer.clearLayers();
  heroLog('layer-cleared', { year: normalizedYear, month: normalizedMonth, previousCount, seq });

  try {
    const url = `/api/heroes?year=${normalizedYear}&month=${normalizedMonth}`;
    const cached = heroClientCache.get(renderKey);
    let data;
    if (cached && Date.now() - cached.at < HERO_CLIENT_CACHE_TTL_MS) {
      data = cached.data;
      heroLog('fetch-cache-hit', { year: normalizedYear, month: normalizedMonth, count: Array.isArray(data) ? data.length : 0, seq });
    } else {
      heroLog('fetch-start', { year: normalizedYear, month: normalizedMonth, url, seq });
      heroFetchController = new AbortController();
      const currentController = heroFetchController;
      data = await fetch(url, {
        cache: 'no-cache',
        signal: currentController.signal,
      }).then(r => r.json());
      if (heroFetchController === currentController) heroFetchController = null;
      heroClientCache.set(renderKey, { at: Date.now(), data });
      if (heroClientCache.size > 80) {
        const firstKey = heroClientCache.keys().next().value;
        heroClientCache.delete(firstKey);
      }
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

    let added = 0;
    const skipped = { noCoords: 0, invalidCoords: 0 };
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
      const marker = leaflet.marker(getShiftedHeroLatLng(lat, lng), {
        icon: buildHeroIcon(hero),
        zIndexOffset: 10000,
      });
      marker.on('click', () => {
        if (window.heroSystem && typeof window.heroSystem.openSidebar === 'function') {
          window.heroSystem.openSidebar(hero._id);
        }
      });
      layer.addLayer(marker);
      added += 1;
    });

    heroLog('render-complete', {
      year: normalizedYear,
      month: normalizedMonth,
      received: Array.isArray(data) ? data.length : 0,
      added,
      skipped,
      layerCount: typeof layer.getLayers === 'function' ? layer.getLayers().length : null,
      domCount: document.querySelectorAll('.codex-direct-hero-icon').length,
      seq,
    });
    renderedHeroKey = renderKey;
    pendingHeroRenderKey = null;
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
  heroRenderTimer = setTimeout(() => {
    heroRenderTimer = null;
    heroLog('schedule-fire', { year: normalizedYear, month: normalizedMonth, key });
    renderHeroPins(normalizedYear, normalizedMonth);
  }, 120);
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

function bootHeroRenderer() {
  installHeroStyle();
  window.__codexClearHeroCache = () => {
    heroClientCache.clear();
    renderedHeroKey = null;
    pendingHeroRenderKey = null;
    activeHeroRenderKey = null;
  };
  window.__codexScheduleHeroPins = scheduleHeroPins;
  window.__codexForceHeroPins = renderHeroPins;
  window.__codexSetHeroLayerVisible = setHeroLayerVisible;
  window.__codexIsHeroLayerVisible = () => heroLayerVisible;
  syncInitialHeroLayerVisibility();
  patchGetKingByYear();
  bindTimelineFallback();
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
