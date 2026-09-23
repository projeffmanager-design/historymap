(function () {
    'use strict';

    const SOURCE_ID = 'historian-contributions-3d';
    const HALO_ID = 'historian-contributions-3d-halo';
    const POINT_ID = 'historian-contributions-3d-point';
    const LABEL_ID = 'historian-contributions-3d-label';
    let records = [];
    let loadPromise = null;
    let activeMap = null;
    let renderRetryTimer = null;

    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));

    function isEnabled() {
        return document.getElementById('menu-layer-contributions')?.checked === true;
    }

    function featureCollection() {
        return {
            type: 'FeatureCollection',
            features: records.filter(record => {
                const lat = Number(record.lat), lng = Number(record.lng);
                return ['pending', 'reviewed'].includes(record.status)
                    && record.category !== 'historical_record'
                    && Number.isFinite(lat) && Number.isFinite(lng);
            }).map(record => ({
                type: 'Feature',
                id: String(record._id),
                geometry: { type:'Point', coordinates:[Number(record.lng), Number(record.lat)] },
                properties: {
                    id: String(record._id),
                    title: String(record.name || record.title || '사관 제출 사료'),
                    description: String(record.description || record.content || ''),
                    username: String(record.username || '알 수 없음'),
                    status: record.status,
                    statusLabel: record.status === 'reviewed' ? '1차 검토 완료' : '검토 대기',
                    shortLabel: record.status === 'reviewed' ? '검토완료' : '검토대기'
                }
            }))
        };
    }

    function removeLayers(map = window.mlMap3d) {
        const toggle = document.getElementById('menu-layer-contributions');
        if (toggle) toggle.dataset.rendered3d = '0';
        if (!map?.getStyle?.()) return;
        [LABEL_ID, POINT_ID, HALO_ID].forEach(id => {
            if (map.getLayer(id)) map.removeLayer(id);
        });
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    }

    function render() {
        const map = window.mlMap3d;
        if (!map?.getStyle?.()) return;
        if (!isEnabled()) {
            removeLayers(map);
            return;
        }
        const data = featureCollection();
        const toggle = document.getElementById('menu-layer-contributions');
        if (toggle) {
            toggle.dataset.rendered3d = String(data.features.length);
            toggle.title = data.features.length
                ? `3D 지도에 대기·검토 사료 마커 ${data.features.length}건 표시 중`
                : '좌표가 지정된 대기·검토 사료가 없습니다.';
        }
        try {
            if (map.getSource(SOURCE_ID)) {
                map.getSource(SOURCE_ID).setData(data);
                return;
            }
            map.addSource(SOURCE_ID, { type:'geojson', data });
        } catch (error) {
            // 3D 지도가 스타일을 교체하는 짧은 구간에는 source 추가가 실패할 수 있다.
            // 완전 로드 여부만 기다리면 벡터 타일 로딩 중 영구 누락될 수 있어 재시도한다.
            clearTimeout(renderRetryTimer);
            renderRetryTimer = setTimeout(render, 250);
            return;
        }
        map.addLayer({
            id:HALO_ID, type:'circle', source:SOURCE_ID,
            paint:{
                'circle-radius':['interpolate',['linear'],['zoom'],1,9,7,17],
                'circle-color':['match',['get','status'],'reviewed','#43d17a','#ffb13b'],
                'circle-opacity':0.2,
                'circle-blur':0.65
            }
        });
        map.addLayer({
            id:POINT_ID, type:'circle', source:SOURCE_ID,
            paint:{
                'circle-radius':['interpolate',['linear'],['zoom'],1,5,7,8],
                'circle-color':['match',['get','status'],'reviewed','#27ae60','#f39c12'],
                'circle-stroke-color':'#fff3cf',
                'circle-stroke-width':2,
                'circle-opacity':0.98
            }
        });
        map.addLayer({
            id:LABEL_ID, type:'symbol', source:SOURCE_ID, minzoom:3,
            layout:{
                'text-field':['concat','사관 사료 · ',['get','title']],
                'text-size':['interpolate',['linear'],['zoom'],3,10,8,13],
                'text-offset':[0,1.15],
                'text-anchor':'top',
                'text-allow-overlap':false
            },
            paint:{
                'text-color':'#fff1c7',
                'text-halo-color':'rgba(12,14,20,.96)',
                'text-halo-width':1.5
            }
        });
        bindMapEvents(map);
    }

    function bindMapEvents(map) {
        if (map.__historianContributionEventsBound) return;
        map.__historianContributionEventsBound = true;
        map.on('mouseenter', POINT_ID, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', POINT_ID, () => { map.getCanvas().style.cursor = ''; });
        map.on('click', POINT_ID, event => {
            const feature = event.features?.[0];
            if (!feature) return;
            const p = feature.properties || {};
            const container = document.createElement('div');
            container.style.cssText = 'min-width:220px;max-width:300px;color:#18202a;font:12px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;';
            container.innerHTML = `<strong style="display:block;margin-bottom:5px;font-size:14px;">📜 ${escapeHtml(p.title)}</strong><div style="margin-bottom:6px;color:#536170;">${escapeHtml(p.description || '내용 없음')}</div><div style="font-size:11px;color:#6c7782;">제출자 ${escapeHtml(p.username)} · ${escapeHtml(p.statusLabel)}</div>`;
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = '제출 사료 상세·검토';
            button.style.cssText = 'width:100%;margin-top:8px;padding:6px;border:0;border-radius:5px;background:#283b50;color:white;font-weight:700;cursor:pointer;';
            button.addEventListener('click', () => window.open(`/ranking.html?tab=contributions&contributionId=${encodeURIComponent(p.id)}`, 'rankingWindow'));
            container.appendChild(button);
            new window.maplibregl.Popup({ closeButton:true, maxWidth:'320px' })
                .setLngLat(feature.geometry.coordinates)
                .setDOMContent(container)
                .addTo(map);
        });
    }

    async function loadAndRender(force = false) {
        if (!isEnabled()) return removeLayers();
        if (!loadPromise || force) {
            loadPromise = fetch(`/api/contributions?_=${Date.now()}`, { cache:'no-store' })
                .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
                .then(data => { records = Array.isArray(data) ? data : []; })
                .catch(error => { console.warn('[사관 사료 3D] 목록 로드 실패:', error); records = []; });
        }
        await loadPromise;
        render();
    }

    function attachToMap() {
        const map = window.mlMap3d;
        if (!map || map === activeMap) return;
        activeMap = map;
        map.on('load', () => { if (isEnabled()) loadAndRender(); });
        map.on('style.load', () => { if (isEnabled()) loadAndRender(); });
        if (isEnabled()) loadAndRender();
    }

    document.getElementById('menu-layer-contributions')?.addEventListener('change', event => {
        if (event.currentTarget.checked) loadAndRender(true);
        else removeLayers();
    });
    window.refreshContribution3dMarkers = () => loadAndRender(true);
    setInterval(attachToMap, 500);
})();
