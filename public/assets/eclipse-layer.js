(function () {
    'use strict';

    const SOURCE_ID = 'eclipse-data';
    const FILL_ID = 'eclipse-layer';
    const GLOW_ID = 'eclipse-glow';
    const LINE_ID = 'eclipse-outline';
    const CENTER_ID = 'eclipse-centerline';
    const HALO_ID = 'eclipse-maximum-halo';
    const POINT_ID = 'eclipse-maximum-point';
    const LABEL_ID = 'eclipse-label';
    const PANEL_ID = 'eclipse-comparison-panel';
    const emptyCollection = () => ({ type: 'FeatureCollection', features: [] });
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
    let enabled = true;
    let requestController = null;
    let lastKey = '';
    let cachedData = emptyCollection();
    let pendingRenderTimer = null;
    let recordMomentsPromise = null;
    let eclipseFocusPopup = null;
    let dismissedPanelYear = null;

    function removeMapLibreLayer() {
        const globe = window.mlMap3d;
        if (!globe || !globe.getStyle?.()) return;
        [LABEL_ID, POINT_ID, HALO_ID, CENTER_ID, LINE_ID, GLOW_ID, FILL_ID].forEach(id => {
            if (globe.getLayer(id)) globe.removeLayer(id);
        });
        if (globe.getSource(SOURCE_ID)) globe.removeSource(SOURCE_ID);
    }

    function clear() {
        clearTimeout(pendingRenderTimer);
        removeMapLibreLayer();
        document.getElementById(PANEL_ID)?.remove();
    }

    function ensureComparisonStyles() {
        if (document.getElementById('eclipse-comparison-styles')) return;
        const style = document.createElement('style');
        style.id = 'eclipse-comparison-styles';
        style.textContent = `
            #${PANEL_ID}{position:fixed;right:14px;top:82px;z-index:2720;width:min(330px,calc(100vw - 28px));max-height:46vh;overflow:auto;padding:12px 13px;border:1px solid rgba(242,196,91,.42);border-radius:12px;background:linear-gradient(150deg,rgba(10,13,20,.94),rgba(28,22,12,.9));box-shadow:0 12px 34px rgba(0,0,0,.48),inset 0 1px rgba(255,236,174,.08);backdrop-filter:blur(12px);color:#efe5cc;font:12px/1.48 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
            #${PANEL_ID} .ec-head{display:flex;align-items:center;gap:8px;margin-bottom:9px;color:#ffe29a;font-weight:800;letter-spacing:.02em}#${PANEL_ID} .ec-head-title{flex:1;min-width:0}#${PANEL_ID} .ec-nav{display:flex;gap:4px}#${PANEL_ID} .ec-nav button{display:grid;place-items:center;width:26px;height:24px;padding:0;border:1px solid rgba(242,196,91,.38);border-radius:6px;background:rgba(0,0,0,.25);color:#f0cf7c;font:700 17px/1 Arial,sans-serif;cursor:pointer}#${PANEL_ID} .ec-nav button:hover,#${PANEL_ID} .ec-nav button:focus-visible{border-color:#f2c45b;background:rgba(180,126,36,.22);color:#fff0bd;outline:none}#${PANEL_ID} .ec-nav button:disabled{opacity:.25;cursor:default}#${PANEL_ID} .ec-orbit{width:18px;height:18px;border:1px solid #f4c85b;border-radius:50%;box-shadow:0 0 12px rgba(244,200,91,.5);position:relative}#${PANEL_ID} .ec-orbit:after{content:"";position:absolute;width:7px;height:7px;border-radius:50%;background:#05070b;box-shadow:0 0 0 2px #ffe29a;left:5px;top:5px}
            #${PANEL_ID} .ec-section{margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,226,154,.14)}#${PANEL_ID} .ec-title{font-size:10px;color:#c8a957;text-transform:uppercase;letter-spacing:.12em;margin-bottom:5px}#${PANEL_ID} .ec-row{display:block;width:100%;box-sizing:border-box;padding:6px 7px;margin:4px 0;border:0;border-left:2px solid #f2c45b;border-radius:7px;background:rgba(255,255,255,.045);color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background .16s,border-color .16s,transform .16s}#${PANEL_ID} .ec-row:hover,#${PANEL_ID} .ec-row:focus-visible{background:rgba(242,196,91,.13);border-left-color:#ffe29a;transform:translateX(2px);outline:none}#${PANEL_ID} .ec-record{border-left-color:#79bfff}#${PANEL_ID} .ec-record:hover,#${PANEL_ID} .ec-record:focus-visible{background:rgba(80,164,235,.13);border-left-color:#a9d8ff}#${PANEL_ID} .ec-meta{color:#aeb8c8;font-size:10px;margin-top:2px}#${PANEL_ID} .ec-original{color:#d7dce5;margin-top:3px;font-family:"Noto Serif KR",serif}#${PANEL_ID} .ec-note{margin-top:8px;color:#8f98a8;font-size:9px;line-height:1.4}
            #${PANEL_ID} .ec-nav .ec-close{margin-left:3px;color:#f4e8cc;border-color:rgba(244,232,204,.5)}
            @media(max-width:700px){#${PANEL_ID}{top:56px;right:8px;width:260px;max-height:34vh;padding:9px}}
        `;
        document.head.appendChild(style);
    }

    function renderComparisonPanel(data, year) {
        document.getElementById(PANEL_ID)?.remove();
        const events = data.events || [];
        const records = data.historical_records || [];
        if (!enabled || dismissedPanelYear === year || (!events.length && !records.length)) return;
        ensureComparisonStyles();
        const panel = document.createElement('aside');
        panel.id = PANEL_ID;
        const eventRows = events.map((event, index) => {
            const matched = event.calendar_alignment === 'sexagenary_day_exact' && event.timeline_month;
            const dateLabel = matched
                ? `음력 ${escapeHtml(event.timeline_month)}월 · 율리우스력 ${escapeHtml(event.julian_year)}-${String(event.julian_month).padStart(2, '0')}-${String(event.julian_day).padStart(2, '0')} · ${escapeHtml(event.sexagenary_day || '')}`
                : `율리우스력 ${escapeHtml(event.julian_year ?? event.year)}-${String(event.julian_month ?? event.month).padStart(2, '0')}-${String(event.julian_day ?? event.day).padStart(2, '0')} · 음력 월 미확정`;
            return `<button type="button" class="ec-row ec-event" data-eclipse-event-index="${index}" title="지도에서 이 일식의 최대식 지점 보기"><b>${dateLabel} · ${escapeHtml(event.type)}</b><div class="ec-meta">식분 ${escapeHtml(event.magnitude ?? '-')} · 사로스 ${escapeHtml(event.saros ?? '-')} · 최대식 ${escapeHtml(event.greatest?.lat ?? '-')}°, ${escapeHtml(event.greatest?.lng ?? '-')}°</div></button>`;
        }).join('');
        const statusLabel = { recorded: '관측 기록', total_recorded: '개기 기록', obscured: '기상으로 미관측', predicted_not_observed: '예측·불발' };
        const recordRows = records.map((record, index) => `<button type="button" class="ec-row ec-record" data-eclipse-record-index="${index}" title="역사 패널에서 이 사료 보기"><b>${escapeHtml(record.month || '?')}월 · ${escapeHtml(record.title)}</b><div class="ec-meta">${escapeHtml(record.source)} · ${escapeHtml(statusLabel[record.status] || record.status)}</div><div class="ec-original">${escapeHtml(record.original_content)}</div></button>`).join('');
        panel.innerHTML = `<div class="ec-head"><span class="ec-orbit"></span><span class="ec-head-title">${year <= 0 ? `B.C. ${escapeHtml(Math.abs(year))}` : `A.D. ${escapeHtml(year)}`} 사서연도 일식 대조</span><span class="ec-nav"><button type="button" data-eclipse-prev title="이전 일식 사료" aria-label="이전 일식 사료">‹</button><button type="button" data-eclipse-next title="다음 일식 사료" aria-label="다음 일식 사료">›</button></span></div><div class="ec-section"><div class="ec-title">NASA 계산 · 사서연도 정렬 · ${events.length}건</div>${eventRows || '<div class="ec-meta">계산 일식 없음</div>'}</div><div class="ec-section"><div class="ec-title">한국 사료(삼국사기·고려사) · ${records.length}건</div>${recordRows || '<div class="ec-meta">해당 연도 기록 없음</div>'}</div><div class="ec-note">지도: 밝은 점선은 중앙선, 양옆의 선은 개기·금환 관측대 경계입니다. 부분일식 전체 가시 범위는 포함되지 않습니다.<br>타임슬라이더 연·월은 사서의 음력 기준입니다. 간지일이 일치한 계산 일식만 음력 월을 확정하고, 나머지는 율리우스 원 날짜를 보존해 표시합니다.</div>`;
        document.body.appendChild(panel);
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'ec-close';
        closeButton.textContent = '×';
        closeButton.title = '일식 대조 창 닫기';
        closeButton.setAttribute('aria-label', '일식 대조 창 닫기');
        closeButton.addEventListener('click', () => {
            dismissedPanelYear = year;
            panel.remove();
        });
        panel.querySelector('.ec-nav').appendChild(closeButton);
        bindComparisonLinks(panel, events, records);
        bindRecordNavigation(panel, year);
    }

    function bindComparisonLinks(panel, events, records) {
        panel.querySelectorAll('[data-eclipse-record-index]').forEach(button => {
            button.addEventListener('click', () => {
                const record = records[Number(button.dataset.eclipseRecordIndex)];
                if (!record?.id || typeof window.openLinkedHistoryRecord !== 'function') return;
                window.openLinkedHistoryRecord({
                    id: String(record.id),
                    type: 'source',
                    year: Number(record.year),
                    month: Number(record.month) || 1,
                    title: record.title || ''
                });
            });
        });
        panel.querySelectorAll('[data-eclipse-event-index]').forEach(button => {
            button.addEventListener('click', () => focusEclipseEvent(events[Number(button.dataset.eclipseEventIndex)]));
        });
    }

    function focusEclipseEvent(event) {
        const globe = window.mlMap3d;
        const lat = Number(event?.greatest?.lat);
        const lng = Number(event?.greatest?.lng);
        if (!globe || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
        globe.flyTo({ center:[lng, lat], zoom:Math.max(globe.getZoom(), 4.5), duration:1100, essential:true });
        eclipseFocusPopup?.remove?.();
        if (!window.maplibregl?.Popup) return;
        const julianDate = `${event.julian_year ?? event.year}-${String(event.julian_month ?? event.month).padStart(2, '0')}-${String(event.julian_day ?? event.day).padStart(2, '0')}`;
        eclipseFocusPopup = new window.maplibregl.Popup({ closeButton:true, closeOnClick:true, maxWidth:'280px', className:'ml3d-popup' })
            .setLngLat([lng, lat])
            .setHTML(`<div style="color:#f4dfaa"><b>${escapeHtml(event.type || '일식')} 최대식 지점</b><div style="margin-top:4px;font-size:11px;color:#c7d0dd">율리우스력 ${escapeHtml(julianDate)} · 식분 ${escapeHtml(event.magnitude ?? '-')}<br>${escapeHtml(lat)}°, ${escapeHtml(lng)}°</div></div>`)
            .addTo(globe);
    }

    function loadRecordMoments() {
        if (!recordMomentsPromise) {
            recordMomentsPromise = fetch('/public/data/goryeo-eclipse-records.json', { cache:'force-cache' })
                .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
                .then(data => {
                    const unique = new Map();
                    (data.records || []).forEach(record => {
                        const year = Number(record.year), month = Number(record.month) || 1;
                        if (Number.isFinite(year)) unique.set(`${year}:${month}`, { year, month });
                    });
                    return [...unique.values()].sort((a, b) => a.year - b.year || a.month - b.month);
                }).catch(() => []);
        }
        return recordMomentsPromise;
    }

    async function bindRecordNavigation(panel, renderedYear) {
        const previousButton = panel.querySelector('[data-eclipse-prev]');
        const nextButton = panel.querySelector('[data-eclipse-next]');
        if (!previousButton || !nextButton) return;
        previousButton.disabled = true;
        nextButton.disabled = true;
        const moments = await loadRecordMoments();
        if (!panel.isConnected || !moments.length) return;
        const current = readCurrentTime();
        const currentYear = Number.isFinite(current.year) ? current.year : Number(renderedYear);
        const currentValue = currentYear * 12 + (current.month || 1) - 1;
        const previous = [...moments].reverse().find(moment => moment.year * 12 + moment.month - 1 < currentValue);
        const next = moments.find(moment => moment.year * 12 + moment.month - 1 > currentValue);
        previousButton.disabled = !previous;
        nextButton.disabled = !next;
        const move = moment => {
            if (moment && typeof window.goToHistoricalTime === 'function') window.goToHistoricalTime(moment.year, moment.month);
        };
        previousButton.addEventListener('click', () => move(previous));
        nextButton.addEventListener('click', () => move(next));
    }

    function renderMapLibre(data, retryCount = 0) {
        const globe = window.mlMap3d;
        if (!globe?.getStyle?.() || !globe.isStyleLoaded?.()) {
            if (enabled && retryCount < 40) {
                clearTimeout(pendingRenderTimer);
                pendingRenderTimer = setTimeout(() => renderMapLibre(data, retryCount + 1), 250);
            }
            return;
        }
        removeMapLibreLayer();
        const eventPoints = (data.events || []).filter(event => Number.isFinite(event?.greatest?.lat) && Number.isFinite(event?.greatest?.lng)).map(event => ({
            type: 'Feature',
            id: `${event.id}:maximum`,
            properties: {
                ...event,
                label: event.timeline_month
                    ? `음력 ${event.timeline_month}월 · ${event.type}`
                    : `율리우스 ${event.julian_month ?? event.month}/${event.julian_day ?? event.day} · ${event.type}`,
                boundary: 'maximum'
            },
            geometry: { type: 'Point', coordinates: [event.greatest.lng, event.greatest.lat] }
        }));
        if (!data.features.length && !eventPoints.length) return;
        const displayData = { ...data, features: [...data.features, ...eventPoints] };
        globe.addSource(SOURCE_ID, { type: 'geojson', data: displayData });
        globe.addLayer({
            id: FILL_ID, type: 'fill', source: SOURCE_ID,
            paint: { 'fill-color': '#f5c451', 'fill-opacity': 0.08 }
        });
        globe.addLayer({
            id: GLOW_ID, type: 'line', source: SOURCE_ID,
            filter: ['==', ['get', 'boundary'], 'center'],
            paint: {
                'line-color': ['match', ['get', 'type'], '개기일식', '#7dd3fc', '혼성일식', '#c4b5fd', '#ffd166'],
                'line-width': ['interpolate', ['linear'], ['zoom'], 1, 10, 6, 24],
                'line-opacity': 0.18,
                'line-blur': 5
            }
        });
        globe.addLayer({
            id: LINE_ID, type: 'line', source: SOURCE_ID,
            filter: ['in', ['get', 'boundary'], ['literal', ['north', 'south']]],
            paint: {
                'line-color': ['match', ['get', 'type'], '개기일식', '#75dfff', '혼성일식', '#d1b6ff', '#ffd166'],
                'line-width': ['interpolate', ['linear'], ['zoom'], 1, 2.5, 6, 4],
                'line-opacity': 1,
                'line-dasharray': [3, 1.5]
            }
        });
        globe.addLayer({
            id: CENTER_ID, type: 'line', source: SOURCE_ID,
            filter: ['==', ['get', 'boundary'], 'center'],
            paint: {
                'line-color': '#fff4c2',
                'line-width': ['interpolate', ['linear'], ['zoom'], 1, 2, 6, 4],
                'line-opacity': 1,
                'line-dasharray': [2, 1.25]
            }
        });
        globe.addLayer({
            id: HALO_ID, type: 'circle', source: SOURCE_ID,
            filter: ['==', ['geometry-type'], 'Point'],
            paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 12, 6, 24],
                'circle-color': '#f5c451',
                'circle-opacity': 0.12,
                'circle-blur': 0.7
            }
        });
        globe.addLayer({
            id: POINT_ID, type: 'circle', source: SOURCE_ID,
            filter: ['==', ['geometry-type'], 'Point'],
            paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 4, 6, 7],
                'circle-color': '#090b10',
                'circle-stroke-color': '#ffe08a',
                'circle-stroke-width': 2,
                'circle-opacity': 0.96
            }
        });
        globe.addLayer({
            id: LABEL_ID, type: 'symbol', source: SOURCE_ID,
            filter: ['==', ['geometry-type'], 'Point'],
            layout: {
                'text-field': ['get', 'label'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 1, 10, 6, 13],
                'text-offset': [0, 1.35],
                'text-anchor': 'top',
                'text-allow-overlap': false
            },
            paint: {
                'text-color': '#fff4c2',
                'text-halo-color': 'rgba(4, 7, 12, 0.95)',
                'text-halo-width': 1.5,
                'text-halo-blur': 0.5
            }
        });
    }

    async function loadYearData(numericYear, signal) {
        try {
            const response = await fetch(`/api/eclipse?year=${numericYear}`, { signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (apiError) {
            if (apiError.name === 'AbortError') throw apiError;
            console.info('[eclipse] API를 사용할 수 없어 정적 GeoJSON으로 전환합니다.', apiError.message);
            let response = await fetch(`/public/data/eclipses/${numericYear}.geojson`, { signal });
            if (response.status === 404) response = await fetch('/public/data/eclipse-paths.geojson', { signal });
            if (!response.ok) throw new Error(`GeoJSON HTTP ${response.status}`);
            const collection = await response.json();
            let historicalRecords = [];
            try {
                const recordsResponse = await fetch('/public/data/goryeo-eclipse-records.json', { signal });
                if (recordsResponse.ok) {
                    const recordsData = await recordsResponse.json();
                    historicalRecords = (recordsData.records || []).filter(record => Number(record.year) === numericYear);
                }
            } catch (_) { /* API 경로 데이터만으로 계속 표시 */ }
            return {
                type: 'FeatureCollection',
                features: (collection.features || []).filter(feature => Number(feature?.properties?.year) === numericYear),
                events: (collection.events || []).filter(event => Number(event.year) === numericYear),
                historical_records: historicalRecords
            };
        }
    }

    async function update(year) {
        if (!enabled) return clear();
        const numericYear = Number.parseInt(year, 10);
        if (!Number.isFinite(numericYear)) return clear();
        const key = String(numericYear);
        if (key === lastKey) {
            // 같은 연도 안에서 월만 바뀌어도 이전/다음 사료 기준점은 달라진다.
            // 연간 GeoJSON은 다시 요청하지 않고 대조 패널의 탐색 버튼만 갱신한다.
            renderComparisonPanel(cachedData, numericYear);
            return;
        }
        requestController?.abort();
        requestController = new AbortController();
        try {
            const data = await loadYearData(numericYear, requestController.signal);
            if (!enabled) return;
            lastKey = key;
            cachedData = data;
            renderComparisonPanel(data, numericYear);
            renderMapLibre(data);
            if (!data.features.length) {
                console.info(`[eclipse] ${numericYear}년에는 중앙식 경로가 없습니다. 부분일식은 사건 목록에만 포함될 수 있습니다.`);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                lastKey = '';
                console.warn('일식 레이어를 불러오지 못했습니다.', error);
                clear();
            }
        }
    }

    function readCurrentTime() {
        const year = Number.parseInt(document.getElementById('yearInput')?.value, 10);
        const month = Number.parseInt(document.getElementById('monthInput')?.value, 10) || 1;
        return { year, month };
    }

    function setEnabled(value) {
        enabled = Boolean(value);
        if (enabled) dismissedPanelYear = null;
        lastKey = '';
        document.getElementById('menu-layer-eclipse')?.toggleAttribute('checked', enabled);
        const desktop = document.getElementById('menu-layer-eclipse');
        const mobile = document.getElementById('mobile-layer-eclipse');
        if (desktop) desktop.checked = enabled;
        if (mobile) mobile.checked = enabled;
        if (!enabled) return clear();
        const { year } = readCurrentTime();
        update(year);
    }

    function bindToggle(id) {
        document.getElementById(id)?.addEventListener('change', event => setEnabled(event.target.checked));
    }

    function restoreAfterStyleChange() {
        if (enabled) renderMapLibre(cachedData);
    }

    window.eclipseLayer = { update, clear, setEnabled, restoreAfterStyleChange, emptyCollection };
    document.addEventListener('DOMContentLoaded', () => {
        bindToggle('menu-layer-eclipse');
        bindToggle('mobile-layer-eclipse');
        setEnabled(document.getElementById('menu-layer-eclipse')?.checked !== false);
    });
})();
