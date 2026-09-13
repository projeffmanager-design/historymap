(function() {
    let _mcCurrentCastleId = null;
    let _mcCurrentCastleName = '';

    // ──────────────────────────────────────────────────────────────
    // 🔭 주변 탐색 모달
    // ──────────────────────────────────────────────────────────────
    let _nearbyCenter = { lat: 0, lng: 0, name: '' };

    // ── 우측 패널 탭 전환 ──
    window.odpSwitchTab = function(tab) {
        const historyContent = document.getElementById('odp-tab-content-history');
        const nearbyContent  = document.getElementById('odp-tab-content-nearby');
        const tabHistory     = document.getElementById('odp-tab-history');
        const tabNearby      = document.getElementById('odp-tab-nearby');
        if (!historyContent || !nearbyContent) return;

        if (tab === 'nearby') {
            historyContent.style.display = 'none';
            nearbyContent.style.display  = '';
            if (tabHistory) { tabHistory.style.borderBottomColor = 'transparent'; tabHistory.style.color = '#5a7888'; }
            if (tabNearby)  { tabNearby.style.borderBottomColor  = '#c8a850';     tabNearby.style.color  = '#c8a850'; }
        } else {
            nearbyContent.style.display  = 'none';
            historyContent.style.display = '';
            if (tabHistory) { tabHistory.style.borderBottomColor = '#c8a850'; tabHistory.style.color = '#c8a850'; }
            if (tabNearby)  { tabNearby.style.borderBottomColor  = 'transparent'; tabNearby.style.color  = '#5a7888'; }
            // 역사기록 탭으로 돌아가면 레이더 + 거리선 제거
            if (typeof clearRadarLayers === 'function') clearRadarLayers();
            if (typeof clearDistanceLine === 'function') clearDistanceLine();
        }
    };

    // ── 거리 직선 레이어 (SVG 직접 DOM 삽입 방식) ──────────────────
    let _distanceLayers = [];
    let _distanceLineGroup = null;
    let _distanceLineCoords = null; // { fromLat, fromLng, toLat, toLng, km, ri }
    let _distanceMoveHandler = null;
    let _distanceZoomHandler = null;
    let _distance3dMarkers = []; // MapLibre 3D 모드용 출발/도착 마커

    function clearDistanceLine() {
        _distanceLayers.forEach(l => { try { map.removeLayer(l); } catch(e){} });
        _distanceLayers = [];
        if (_distanceLineGroup) {
            try { map.removeLayer(_distanceLineGroup); } catch(e){}
            _distanceLineGroup = null;
        }
        const old = document.getElementById('_distanceSvgOverlay');
        if (old) old.remove();
        if (_distanceMoveHandler) { map.off('move zoom', _distanceMoveHandler); _distanceMoveHandler = null; }
        if (_distanceZoomHandler) { map.off('zoomend moveend', _distanceZoomHandler); _distanceZoomHandler = null; }
        _distanceLineCoords = null;
        // 3D 마커 제거
        _distance3dMarkers.forEach(mk => { try { mk.remove(); } catch(e){} });
        _distance3dMarkers = [];
        // 3D 라인 레이어 제거
        const _m = window.mlMap3d;
        if (_m) {
            ['_distance-line', '_distance-line-bg'].forEach(id => { if (_m.getLayer(id)) _m.removeLayer(id); });
            if (_m.getSource('_distance-line')) _m.removeSource('_distance-line');
        }
    }

    // 🚀 거리 카드 계산 헬퍼 — km와 km/h 기준으로 소요 시간 계산
    // 하루 이동 가능 시간: 기마 8h, 도보 8~10h
    function _calcTravelTime(km, kmPerHour, hoursPerDay) {
        const totalHours = km / kmPerHour;
        if (totalHours < 1) {
            const mins = Math.round(totalHours * 60 / 10) * 10; // 10분 단위 반올림
            return mins <= 10 ? '30분 이내' : `약 ${mins}분`;
        }
        if (totalHours < hoursPerDay) {
            // 당일 도착 — 시간+분 표시
            const h = Math.floor(totalHours);
            const m = Math.round((totalHours - h) * 60 / 10) * 10;
            return m === 0 ? `약 ${h}시간` : m === 60 ? `약 ${h+1}시간` : `약 ${h}시간 ${m}분`;
        }
        // 하루 이상 — 일 단위
        const days = totalHours / hoursPerDay;
        const whole = Math.floor(days);
        const frac  = days - whole;
        if (frac >= 0.8) return `약 ${whole + 1}일`;
        if (frac >= 0.4) return `약 ${whole}일 반`;
        return whole <= 1 ? '약 1일' : `약 ${whole}일`;
    }

    // 구버전 호환용 (주변 목록에서 사용)
    function _calcTravelDays(ri, riPerDay) {
        const km = ri * 0.435;
        // riPerDay → km/h 역산: 기마 100리/일(8h)=5.4km/h, 도보 70리/일(9h)=3.4km/h 등
        // 단순하게 리/일×0.435/하루시간으로 환산
        const hoursPerDay = riPerDay >= 100 ? 8 : 9;
        const kmph = (riPerDay * 0.435) / hoursPerDay;
        return _calcTravelTime(km, kmph, hoursPerDay);
    }

    function _renderDistanceSvg() {
        if (!_distanceLineCoords) return;
        const { fromLat, fromLng, toLat, toLng, km, ri, fromName, toName } = _distanceLineCoords;

        const p1 = map.latLngToContainerPoint([fromLat, fromLng]);
        const p2 = map.latLngToContainerPoint([toLat, toLng]);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;

        let svg = document.getElementById('_distanceSvgOverlay');
        const mapContainer = map.getContainer();
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = '_distanceSvgOverlay';
            svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:visible;';
            mapContainer.appendChild(svg);
        }

        // ── 이동 수단별 소요 시간 계산 (통상 이동 기준) ─────────────
        // 기마대 통상 행군: 시속 6km, 하루 8시간
        const horseDays = _calcTravelTime(km, 6, 8);
        // 보병대 통상 행군: 시속 3.75km, 하루 9시간 (군장 포함)
        const footDays  = _calcTravelTime(km, 3.75, 9);

        // 인근 강 탐색: 두 지점의 중간 근처 naturalFeatures 중 river 타입
        let riverName = null;
        if (typeof naturalFeatures !== 'undefined' && naturalFeatures.length) {
            const midLat = (fromLat + toLat) / 2;
            const midLng = (fromLng + toLng) / 2;
            const riverFeature = naturalFeatures.find(f => {
                if (f.type !== 'river') return false;
                if (!f.lat || !f.lng) return false;
                // 경로 중간 지점 근방 3도(~330km) 이내
                const dlat = f.lat - midLat, dlng = f.lng - midLng;
                return Math.sqrt(dlat*dlat + dlng*dlng) < 3.0;
            });
            if (riverFeature) riverName = riverFeature.name || null;
        }
        // 선박: 강까지 도보(10%) + 수운(80%) + 목적지까지 도보(10%) 복합 추정
        // 직선거리를 실제 강 경로로 이동한다고 가정한 근사치
        const _boatWalkKm  = km * 0.10; // 강 접근/이탈 도보 구간
        const _boatRiverKm = km * 0.80; // 수운 구간
        const _boatWalkH   = (_boatWalkKm * 2) / 3.75;          // 왕복 도보 시간
        const _boatRiverH  = _boatRiverKm / 6;                  // 수운 시간 (6km/h)
        const _boatTotalH  = _boatWalkH + _boatRiverH;
        // 하루 이동 가능 시간: 수운 10h + 도보 포함 실질 9h로 복합 계산
        const boatDays = _calcTravelTime(_boatTotalH * (km / (_boatTotalH || 1)), 6, 9); // 등가 km/h 환산
        // 더 직관적인 방법: 총 시간으로 직접 포맷
        const _boatFormatted = (() => {
            const h = _boatTotalH;
            const dayH = 9; // 하루 9시간 이동
            if (h < 1) { const m = Math.round(h * 60 / 10) * 10; return m <= 10 ? '30분 이내' : `약 ${m}분`; }
            if (h < dayH) { const wh = Math.floor(h); const wm = Math.round((h - wh) * 60 / 10) * 10; return wm === 0 ? `약 ${wh}시간` : wm === 60 ? `약 ${wh+1}시간` : `약 ${wh}시간 ${wm}분`; }
            const days = h / dayH; const whole = Math.floor(days); const frac = days - whole;
            if (frac >= 0.8) return `약 ${whole+1}일`; if (frac >= 0.4) return `약 ${whole}일 반`; return whole <= 1 ? '약 1일' : `약 ${whole}일`;
        })();

        // ── 카드 레이아웃 계산 ───────────────────────────────────────
        const headerText = `${fromName || '출발'} → ${toName || '도착'}`;
        const distText   = `${km} km · ${ri}리`;
        // 한글/CJK는 ~13px, 나머지는 ~7.5px로 너비 추정
        const _estW = s => [...s].reduce((w, c) => w + (/[\u1100-\u9FFF]/.test(c) ? 13 : 7.5), 0);
        const minW    = 180;
        const boxW    = Math.min(Math.max(_estW(headerText) + 40, minW), 240); // 최대 240px로 제한
        const rowH    = 20;
        const rows    = 3; // 기마대 + 보병대 + 선박 (항상 3행)
        const boxH    = 32 + rowH * rows + 28; // 헤더+거리+구분선 영역 + 행들 + 주석
        const boxX    = -(boxW / 2);
        const boxY    = -(boxH / 2);
        const lx      = boxX + 14;
        const rx      = -lx;

        // ── 카드 위치: 출발지 마커 바로 아래 (화면 경계 clamp) ──────
        // cardMx/cardMy 는 카드 중심 좌표 (SVG translate 기준)
        const _cw = mapContainer.clientWidth  || window.innerWidth;
        const _ch = mapContainer.clientHeight || window.innerHeight;
        const _padX = boxW / 2 + 8;
        const _padY = boxH / 2 + 8;
        // 출발 마커 바로 아래: 카드 상단이 출발 마커 하단(+14px)에 오도록
        const _rawCardMx = p1.x;
        const _rawCardMy = p1.y + 14 + boxH / 2; // center Y = top + boxH/2
        const cardMx = Math.min(Math.max(_rawCardMx, _padX), _cw - _padX);
        const cardMy = Math.min(Math.max(_rawCardMy, _padY), _ch - _padY);

        // ── 행 Y 좌표 ────────────────────────────────────────────────
        const y0    = boxY + 18;       // 헤더
        const y1    = y0 + 18;         // 거리 값
        const ySep  = y1 + 10;         // 구분선
        const y2    = ySep + rowH;     // 기마대
        const y3    = y2 + rowH;       // 보병대
        const y4    = y3 + rowH;       // 선박
        const yNote = y4 + rowH - 2;   // 주석

        const boatRow = `
          <text x="${lx}" y="${y4}" dominant-baseline="central"
            font-size="11" fill="#7ab8cc" font-family="'Noto Serif KR',sans-serif">🚢 선박${riverName ? ` <tspan font-size="9.5" fill="rgba(120,180,210,0.65)">(${riverName})</tspan>` : ''} <tspan font-size="9" fill="rgba(160,160,140,0.55)">복합추정</tspan></text>
          <text x="${rx}" y="${y4}" dominant-baseline="central" text-anchor="end"
            font-size="11" font-weight="700" fill="#a8d8ee" font-family="sans-serif">${_boatFormatted}</text>`;

        svg.innerHTML = `
          <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"
            stroke="rgba(0,0,0,0.55)" stroke-width="4" stroke-linecap="round"/>
          <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"
            stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-dasharray="9 5" stroke-linecap="round"/>
          <circle cx="${p1.x}" cy="${p1.y}" r="5" fill="rgba(255,220,80,0.9)" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>
          <circle cx="${p2.x}" cy="${p2.y}" r="5" fill="rgba(120,190,220,0.9)" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>

          <g transform="translate(${cardMx},${cardMy})">
            <rect x="${boxX-1}" y="${boxY-1}" width="${boxW+2}" height="${boxH+2}" rx="11" ry="11"
              fill="none" stroke="rgba(180,210,230,0.15)" stroke-width="1.5"/>
            <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="10" ry="10"
              fill="rgba(8,14,22,0.94)" stroke="rgba(255,255,255,0.22)" stroke-width="0.8"/>

            <text x="0" y="${y0}" dominant-baseline="central" text-anchor="middle"
              font-size="12.5" font-weight="700" fill="rgba(230,230,230,0.95)"
              font-family="'Noto Serif KR','Nanum Myeongjo',sans-serif">${headerText}</text>

            <text x="0" y="${y1}" dominant-baseline="central" text-anchor="middle"
              font-size="15" font-weight="900" fill="#ffe87a"
              font-family="sans-serif" letter-spacing="0.5">${distText}</text>

            <line x1="${boxX+12}" y1="${ySep}" x2="${-boxX-12}" y2="${ySep}"
              stroke="rgba(255,255,255,0.1)" stroke-width="0.8"/>

            <!-- 기마대 -->
            <text x="${lx}" y="${y2}" dominant-baseline="central"
              font-size="11" fill="rgba(210,200,170,0.9)" font-family="'Noto Serif KR',sans-serif">🐴 기마대 <tspan font-size="9" fill="rgba(160,160,140,0.55)">6km/h</tspan></text>
            <text x="${rx}" y="${y2}" dominant-baseline="central" text-anchor="end"
              font-size="11" font-weight="700" fill="rgba(255,215,100,0.95)" font-family="sans-serif">${horseDays}</text>

            <!-- 보병대 -->
            <text x="${lx}" y="${y3}" dominant-baseline="central"
              font-size="11" fill="rgba(200,210,195,0.85)" font-family="'Noto Serif KR',sans-serif">🪖 보병대 <tspan font-size="9" fill="rgba(160,160,140,0.55)">3.75km/h</tspan></text>
            <text x="${rx}" y="${y3}" dominant-baseline="central" text-anchor="end"
              font-size="11" font-weight="700" fill="rgba(170,220,170,0.95)" font-family="sans-serif">${footDays}</text>

            <!-- 선박 (강 경유 시) -->
            ${boatRow}

            <text x="0" y="${yNote}" dominant-baseline="central" text-anchor="middle"
              font-size="9.5" fill="rgba(140,155,165,0.6)" font-family="sans-serif"
            ># 1리≒435m · 통상이동 기준</text>
          </g>
        `;
    }

    function drawDistanceLine(fromLat, fromLng, toLat, toLng, fromName, toName) {
        clearDistanceLine();

        const R = 6371;
        const dLat = (toLat - fromLat) * Math.PI / 180;
        const dLng = (toLng - fromLng) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(fromLat*Math.PI/180)*Math.cos(toLat*Math.PI/180)*Math.sin(dLng/2)**2;
        const km = +(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1);
        const ri = Math.round(km * 1000 / 435);

        _distanceLineCoords = { fromLat, fromLng, toLat, toLng, km, ri,
            fromName: fromName || '', toName: toName || '' };

        const _m = window.mlMap3d;
        if (window._is3dMode && _m) {
            // ── 3D 모드: SVG 오버레이 없이 MapLibre만 사용 ──

            // 소요 시간 계산 (SVG와 동일 로직)
            const horseDays3d = _calcTravelTime(km, 6, 8);
            const footDays3d  = _calcTravelTime(km, 3.75, 9);
            const _bwk = km * 0.10, _brk = km * 0.80;
            const _bth = (_bwk * 2) / 3.75 + _brk / 6;
            const boatDays3d = (() => {
                const h = _bth, dH = 9;
                if (h < 1) { const m = Math.round(h*60/10)*10; return m<=10?'30분 이내':`약 ${m}분`; }
                if (h < dH) { const w=Math.floor(h),wm=Math.round((h-w)*60/10)*10; return wm===0?`약 ${w}시간`:wm===60?`약 ${w+1}시간`:`약 ${w}시간 ${wm}분`; }
                const d=h/dH,wh=Math.floor(d),fr=d-wh;
                return fr>=0.8?`약 ${wh+1}일`:fr>=0.4?`약 ${wh}일 반`:wh<=1?'약 1일':`약 ${wh}일`;
            })();

            // 출발 마커 (노란 점 + 글로우) — 카드도 여기에 자식으로 붙임
            const fromEl = document.createElement('div');
            fromEl.style.cssText = 'position:relative;width:16px;height:16px;border-radius:50%;background:rgba(255,210,40,1);border:2.5px solid rgba(255,255,255,0.9);box-shadow:0 0 14px 4px rgba(255,210,40,0.85),0 0 5px rgba(0,0,0,0.9);pointer-events:none;overflow:visible;';
            const fromLabel = document.createElement('div');
            fromLabel.style.cssText = 'position:absolute;bottom:20px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:11px;color:#ffe040;text-shadow:-1px -1px 0 #000,1px 1px 0 #000,0 0 6px #000;font-weight:bold;pointer-events:none;font-family:sans-serif;background:rgba(0,0,0,0.55);padding:1px 5px;border-radius:3px;';
            fromLabel.textContent = fromName || '출발';
            fromEl.appendChild(fromLabel);

            // 거리 카드 — fromEl 바로 아래에 절대 위치로 부착
            const cardEl = document.createElement('div');
            cardEl.style.cssText = 'position:absolute;top:22px;left:50%;transform:translateX(-50%);pointer-events:none;z-index:9999;white-space:nowrap;';
            cardEl.innerHTML = `
                <div style="background:rgba(6,10,18,0.96);border:1.5px solid rgba(255,200,60,0.6);border-radius:10px;
                    padding:10px 14px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.85),0 0 12px rgba(255,200,60,0.15);
                    font-family:'Noto Serif KR',sans-serif;min-width:160px;max-width:220px;white-space:normal;">
                  <div style="font-size:11px;font-weight:700;color:rgba(200,200,200,0.9);margin-bottom:3px;letter-spacing:0.3px;">
                    ${fromName||'출발'} <span style="color:#ff9900;">→</span> ${toName||'도착'}
                  </div>
                  <div style="font-size:16px;font-weight:900;color:#ffe040;margin-bottom:7px;letter-spacing:0.5px;text-shadow:0 0 8px rgba(255,220,0,0.5);">
                    ${km} km &nbsp;·&nbsp; ${ri}리
                  </div>
                  <div style="height:1px;background:rgba(255,200,60,0.2);margin-bottom:6px;"></div>
                  <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:3px;">
                    <span style="color:#e0d8b0;">🐴 기마대 <span style="font-size:9px;color:#7a7060;">6km/h</span></span>
                    <span style="color:#ffe870;font-weight:700;">${horseDays3d}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:3px;">
                    <span style="color:#c8d8c0;">🪖 보병대 <span style="font-size:9px;color:#7a7060;">3.75km/h</span></span>
                    <span style="color:#a0ee90;font-weight:700;">${footDays3d}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:10.5px;">
                    <span style="color:#80c0cc;">🚢 선박 <span style="font-size:9px;color:#607580;">복합추정</span></span>
                    <span style="color:#a0d8ee;font-weight:700;">${boatDays3d}</span>
                  </div>
                </div>`;
            fromEl.appendChild(cardEl);

            // 거리선 GeoJSON (배경 + 노란 점선) — 마커보다 먼저 추가 → 마커가 선 위에 표시
            const lineGeoJSON = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[fromLng, fromLat], [toLng, toLat]] } };
            _m.addSource('_distance-line', { type: 'geojson', data: lineGeoJSON });
            _m.addLayer({ id: '_distance-line-bg', type: 'line', source: '_distance-line',
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': 'rgba(0,0,0,0.7)', 'line-width': 7 } });
            _m.addLayer({ id: '_distance-line', type: 'line', source: '_distance-line',
                layout: { 'line-cap': 'butt', 'line-join': 'round' },
                paint: { 'line-color': 'rgba(255,220,40,0.95)', 'line-width': 2.5,
                         'line-dasharray': [10, 5] } });

            // 마커는 addTo 순서대로 DOM에 쌓임
            _distance3dMarkers.push(new maplibregl.Marker({ element: fromEl, anchor: 'center' }).setLngLat([fromLng, fromLat]).addTo(_m));
            _distance3dMarkers.push(new maplibregl.Marker({ element: toEl, anchor: 'center' }).setLngLat([toLng, toLat]).addTo(_m));
        } else {
            // ── 2D 모드: 기존 SVG 오버레이 ──
            _renderDistanceSvg();
            _distanceMoveHandler = () => _renderDistanceSvg();
            map.on('move zoom moveend zoomend', _distanceMoveHandler);
        }
    }
    // ────────────────────────────────────────────────────────────────

    // 결과 항목 클릭 → 패널 내 탭 유지한 채 해당 좌표+시대로 지도 이동
    window.goToNearbyItem = function(lat, lng, startYear, endYear, destName) {
        if (typeof map === 'undefined') return;

        // 중심 → 대상 직선 표시
        if (_nearbyCenter && (_nearbyCenter.lat || _nearbyCenter.lng)) {
            drawDistanceLine(_nearbyCenter.lat, _nearbyCenter.lng, lat, lng,
                _nearbyCenter.name || '', destName || '');
        }

        // ── 시대 이동 (yearInput + combinedSlider + updateUI 모두 동기화) ──
        if (startYear != null || endYear != null) {
            let targetYear;
            if (startYear != null && endYear != null) {
                targetYear = Math.round((startYear + endYear) / 2);
            } else {
                targetYear = startYear ?? endYear;
            }
            const targetMonth = 1;

            // combinedSlider 동기화
            const slider = document.getElementById('combinedSlider');
            if (slider && typeof yearMonthToTotalMonths === 'function') {
                slider.value = yearMonthToTotalMonths(targetYear, targetMonth);
            }

            // updateMap이 yearInput 세팅 + updateUI + 지도 갱신을 모두 처리함
            if (typeof updateMap === 'function') {
                updateMap(targetYear, targetMonth);
            } else {
                const yi = document.getElementById('yearInput');
                const mi = document.getElementById('monthInput');
                if (yi) yi.value = targetYear;
                if (mi) mi.value = targetMonth;
            }
        }

        // 중심점과 대상점 두 포인트가 모두 보이도록 지도 조정
        if (_nearbyCenter && (_nearbyCenter.lat || _nearbyCenter.lng)) {
            const bounds = L.latLngBounds(
                [_nearbyCenter.lat, _nearbyCenter.lng],
                [lat, lng]
            );
            // 여백 80px, 최대 줌 10 (너무 가까운 두 지점도 확대되지 않도록)
            if (window._is3dMode && window.mlMap3d) {
                const minLng = Math.min(_nearbyCenter.lng, lng) - 0.5;
                const maxLng = Math.max(_nearbyCenter.lng, lng) + 0.5;
                const minLat = Math.min(_nearbyCenter.lat, lat) - 0.3;
                const maxLat = Math.max(_nearbyCenter.lat, lat) + 0.3;
                window.mlMap3d.fitBounds([[minLng, minLat],[maxLng, maxLat]],
                    { padding: 80, maxZoom: 10, animate: true, duration: 800 });
            } else {
                map.fitBounds(bounds, { padding: [80, 80], maxZoom: 10, animate: true });
            }
        } else {
            if (window._is3dMode && window.mlMap3d) {
                window.mlMap3d.flyTo({ center: [lng, lat], zoom: Math.max(window.mlMap3d.getZoom(), 7), duration: 800 });
            } else {
                map.setView([lat, lng], Math.max(map.getZoom(), 7), { animate: true });
            }
        }
    };

    // ── 레이더 동심원 관리 ──────────────────────────────────────────
    let _radarLayers = [];
    let _radarTimers = [];
    let _radar3dLabelMarkers = []; // 3D 레이더 거리 라벨 마커 (별도 관리)
    let _radar3dTimers = []; // 3D pulse animation timers

    function clearRadarLayers() {
        _radarTimers.forEach(t => clearInterval(t));
        _radarTimers = [];
        _radarLayers.forEach(l => { try { map.removeLayer(l); } catch(e){} });
        _radarLayers = [];
        // 3D 레이더 정리
        _radar3dTimers.forEach(t => clearInterval(t));
        _radar3dTimers = [];
        const _m = window.mlMap3d;
        if (_m) {
            ['_radar-fill-1','_radar-fill-2','_radar-fill-3',
             '_radar-ring-1','_radar-ring-2','_radar-ring-3',
             '_radar-center'].forEach(id => { if (_m.getLayer(id)) _m.removeLayer(id); });
            ['_radar-src-1','_radar-src-2','_radar-src-3',
             '_radar-center-src'].forEach(id => { if (_m.getSource(id)) _m.removeSource(id); });
        }
        // 레이더 거리 라벨 마커 제거 (_distance3dMarkers에 push된 것 중 레이더용)
        // clearDistanceLine과 공유하는 배열이므로 별도 배열로 관리
        _radar3dLabelMarkers.forEach(mk => { try { mk.remove(); } catch(e){} });
        _radar3dLabelMarkers = [];
    }

    // GeoJSON 원 생성 헬퍼 (중심 lat/lng, 반지름 km, 64각형 근사)
    function _makeCircleGeoJSON(cLat, cLng, radiusKm, steps) {
        steps = steps || 64;
        const coords = [];
        for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * 2 * Math.PI;
            const dLat = (radiusKm / 111.32) * Math.cos(angle);
            const dLng = (radiusKm / (111.32 * Math.cos(cLat * Math.PI / 180))) * Math.sin(angle);
            coords.push([cLng + dLng, cLat + dLat]);
        }
        return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } };
    }

    function drawRadarCircles(lat, lng, radiusKm) {
        clearRadarLayers();

        const _is3d = window._is3dMode && window.mlMap3d;

        // ── 2D 모드: Leaflet 원 ──
        if (!_is3d) {
            const rings = [
                { frac: 1.0, color: '#ff9900', dash: '8 5',  weight: 2.5, baseOpacity: 0.9,  period: 2000 },
                { frac: 0.5, color: '#44bbff', dash: '5 4',  weight: 2.0, baseOpacity: 0.75, period: 2600 },
                { frac: 0.25,color: '#44ffcc', dash: '3 4',  weight: 1.8, baseOpacity: 0.60, period: 3200 },
            ];
            rings.forEach(({ frac, color, dash, weight, baseOpacity, period }) => {
                const r = radiusKm * 1000 * frac;
                const circle = L.circle([lat, lng], {
                    radius: r, color, weight, opacity: baseOpacity,
                    dashArray: dash, fillColor: color, fillOpacity: 0.06,
                    interactive: false, pane: 'shadowPane'
                }).addTo(map);
                _radarLayers.push(circle);
                const start = performance.now();
                const timer = setInterval(() => {
                    const t = (performance.now() - start) / period;
                    const opc = 0.3 + (baseOpacity - 0.3) * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
                    try { circle.setStyle({ opacity: opc, fillOpacity: opc * 0.08 }); } catch(e) {}
                }, 50);
                _radarTimers.push(timer);
            });
            const center = L.circleMarker([lat, lng], {
                radius: 7, color: '#ff9900', weight: 3, opacity: 1,
                fillColor: '#ffe080', fillOpacity: 1, interactive: false, pane: 'shadowPane'
            }).addTo(map);
            _radarLayers.push(center);
            const cStart = performance.now();
            _radarTimers.push(setInterval(() => {
                const t = (performance.now() - cStart) / 900;
                try { center.setRadius(5 + 4 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2))); } catch(e) {}
            }, 50));
            return;
        }

        // ── 3D 모드: MapLibre GeoJSON 전용 ──
        const _m = window.mlMap3d;
        const ringDefs = [
            { idx: 1, frac: 1.0,  strokeColor: '#ff9900', fillColor: '#ff9900', baseFillOp: 0.10, baseStrokeOp: 0.95, period: 2000, width: 3.5 },
            { idx: 2, frac: 0.5,  strokeColor: '#44bbff', fillColor: '#44bbff', baseFillOp: 0.07, baseStrokeOp: 0.80, period: 2600, width: 2.5 },
            { idx: 3, frac: 0.25, strokeColor: '#44ffcc', fillColor: '#44ffcc', baseFillOp: 0.05, baseStrokeOp: 0.65, period: 3200, width: 2.0 },
        ];

        ringDefs.forEach(({ idx, frac, strokeColor, fillColor, baseFillOp, baseStrokeOp, period, width }) => {
            const srcId  = `_radar-src-${idx}`;
            const ringId = `_radar-ring-${idx}`;
            const fillId = `_radar-fill-${idx}`;
            const geoData = _makeCircleGeoJSON(lat, lng, radiusKm * frac, 96);
            _m.addSource(srcId, { type: 'geojson', data: geoData });
            _m.addLayer({ id: fillId, type: 'fill', source: srcId,
                paint: { 'fill-color': fillColor, 'fill-opacity': baseFillOp } });
            _m.addLayer({ id: ringId, type: 'line', source: srcId,
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': strokeColor, 'line-width': width, 'line-opacity': baseStrokeOp,
                         'line-dasharray': idx === 1 ? [10, 4] : idx === 2 ? [6, 4] : [3, 4] } });

            // 거리 라벨 마커 (링 위 12시 방향)
            const labelLat = lat + (radiusKm * frac / 111.32);
            const labelLng = lng;
            const riVal = Math.round(radiusKm * frac * 1000 / 435);
            const labelEl = document.createElement('div');
            labelEl.style.cssText = 'pointer-events:none;white-space:nowrap;';
            labelEl.innerHTML = `<div style="background:rgba(0,0,0,0.75);border:1px solid ${strokeColor};border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;color:${strokeColor};text-shadow:none;font-family:sans-serif;">${radiusKm * frac}km · ${riVal}리</div>`;
            const labelMk = new maplibregl.Marker({ element: labelEl, anchor: 'bottom' })
                .setLngLat([labelLng, labelLat]).addTo(_m);
            _radar3dLabelMarkers.push(labelMk);

            // pulse animation
            const start3d = performance.now();
            const t3d = setInterval(() => {
                const tp = (performance.now() - start3d) / period;
                const wave = 0.5 + 0.5 * Math.sin(tp * Math.PI * 2);
                const so = 0.35 + (baseStrokeOp - 0.35) * wave;
                const fo = baseFillOp * 0.3 + baseFillOp * 0.7 * wave;
                try {
                    _m.setPaintProperty(ringId, 'line-opacity', so);
                    _m.setPaintProperty(fillId, 'fill-opacity', fo);
                } catch(e) {}
            }, 60);
            _radar3dTimers.push(t3d);
        });

        // 중심 글로우 원 (GeoJSON)
        const centerSrc = _makeCircleGeoJSON(lat, lng, radiusKm * 0.012, 32);
        _m.addSource('_radar-center-src', { type: 'geojson', data: centerSrc });
        _m.addLayer({ id: '_radar-center', type: 'fill', source: '_radar-center-src',
            paint: { 'fill-color': '#ffe080', 'fill-opacity': 0.95 } });

        // 중심 pulse (크기)
        const cStart3d = performance.now();
        const cT3d = setInterval(() => {
            const tp = (performance.now() - cStart3d) / 900;
            const scale = 0.009 + 0.007 * (0.5 + 0.5 * Math.sin(tp * Math.PI * 2));
            try { _m.getSource('_radar-center-src').setData(_makeCircleGeoJSON(lat, lng, radiusKm * scale, 32)); } catch(e) {}
        }, 60);
        _radar3dTimers.push(cT3d);
    }
    // ────────────────────────────────────────────────────────────────

    window.openNearbyModal = function(lat, lng, name) {
        _nearbyCenter = { lat, lng, name };
        // 모달 대신 우측 패널 탭으로 전환
        odpSwitchTab('nearby');
        refreshNearbyResults();
    };

    // ── 지명 검색으로 거리 재기 ──────────────────────────────────────
    window.searchNearbyPlace = async function() {
        const input = document.getElementById('nearbySearchInput');
        const resultBox = document.getElementById('nearbySearchResults');
        const query = input ? input.value.trim() : '';
        if (!query) return;

        resultBox.innerHTML = `<div style="color:#7ab8cc;font-size:11px;padding:4px 0;">검색 중...</div>`;

        // ── 1) DB 검색 (castles에서 이름 매칭) ──────────────────────
        const q = query.toLowerCase();
        const dbHits = (typeof castles !== 'undefined' ? castles : [])
            .filter(c => {
                if (!c.lat || !c.lng) return false;
                const n  = (c.name    || '').toLowerCase();
                const nk = (c.name_ko || '').toLowerCase();
                if (n.includes(q) || nk.includes(q)) return true;
                // history 배열 내 name도 검색
                if (Array.isArray(c.history)) {
                    return c.history.some(h => (h.name || '').toLowerCase().includes(q));
                }
                return false;
            })
            .slice(0, 8)
            .map(c => ({
                lat: c.lat, lng: c.lng,
                name: c.name || c.name_ko || '이름 없음',
                sub: '📚 DB (성·유적)',
                source: 'db'
            }));

        // ── 2) Nominatim 실지도 검색 (병렬로 요청) ──────────────────
        let nominatimHits = [];
        try {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=ko`;
            const res = await fetch(url, { headers: { 'Accept-Language': 'ko' } });
            const items = await res.json();
            nominatimHits = items.map(item => ({
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon),
                name: item.display_name.split(',')[0],
                sub: '🗺️ ' + item.display_name.split(',').slice(1, 3).join(',').trim(),
                source: 'map'
            }));
        } catch(e) { /* Nominatim 실패 시 무시 */ }

        // ── 3) 결과 렌더링: DB 섹션 먼저, 실지도 섹션 아래 ──────────
        const renderItem = (item) => {
            const safeName = item.name.replace(/'/g, "\\'");
            const borderColor = item.source === 'db' ? 'rgba(90,160,200,0.4)' : 'rgba(180,140,60,0.35)';
            return `<div onclick="selectNearbySearchResult(${item.lat},${item.lng},'${safeName}',this)"
                style="padding:5px 7px;margin-top:3px;border-radius:5px;cursor:pointer;
                       font-size:12px;color:#d0e4ec;border:1px solid transparent;transition:background 0.15s;"
                onmouseover="this.style.background='rgba(255,255,255,0.07)';this.style.borderColor='${borderColor}'"
                onmouseout="this.style.background='none';this.style.borderColor='transparent'">
                ${item.name}
                <span style="color:#5a7888;font-size:10px;margin-left:5px;">${item.sub}</span>
            </div>`;
        };

        const sectionTitle = (label, color) =>
            `<div style="color:${color};font-size:10px;font-weight:700;margin-top:8px;margin-bottom:2px;
                         padding-left:2px;letter-spacing:0.5px;opacity:0.8;">${label}</div>`;

        let html = '';
        if (dbHits.length) {
            html += sectionTitle('● 역사 DB', '#7ab8cc');
            html += dbHits.map(renderItem).join('');
        }
        if (nominatimHits.length) {
            html += sectionTitle('● 실지도 (OpenStreetMap)', '#c8a850');
            html += nominatimHits.map(renderItem).join('');
        }
        if (!html) {
            html = `<div style="color:#8fa0b0;font-size:11px;padding:4px 0;">검색 결과가 없습니다.</div>`;
        }

        resultBox.innerHTML = html;
    };

    window.selectNearbySearchResult = function(lat, lng, name, el) {
        // 선택 강조
        const box = document.getElementById('nearbySearchResults');
        if (box) box.querySelectorAll('div').forEach(d => d.style.border = '1px solid transparent');
        if (el) el.style.border = '1px solid rgba(90,160,200,0.5)';

        // 이 지점을 중심으로 거리선 그리기 (기존 _nearbyCenter → 이 지점)
        if (_nearbyCenter && (_nearbyCenter.lat || _nearbyCenter.lng)) {
            drawDistanceLine(_nearbyCenter.lat, _nearbyCenter.lng, lat, lng,
                _nearbyCenter.name || '', name);
        }
        // 두 포인트가 모두 보이도록 지도 조정
        if (_nearbyCenter && (_nearbyCenter.lat || _nearbyCenter.lng)) {
            const bounds = L.latLngBounds(
                [_nearbyCenter.lat, _nearbyCenter.lng],
                [lat, lng]
            );
            if (window._is3dMode && window.mlMap3d) {
                // 3D 모드: MapLibre 카메라를 두 점을 포함하는 영역으로 이동
                const minLng = Math.min(_nearbyCenter.lng, lng) - 0.5;
                const maxLng = Math.max(_nearbyCenter.lng, lng) + 0.5;
                const minLat = Math.min(_nearbyCenter.lat, lat) - 0.3;
                const maxLat = Math.max(_nearbyCenter.lat, lat) + 0.3;
                window.mlMap3d.fitBounds([[minLng, minLat],[maxLng, maxLat]],
                    { padding: 80, maxZoom: 10, animate: true, duration: 800 });
            } else {
                map.fitBounds(bounds, { padding: [80, 80], maxZoom: 10, animate: true });
            }
        } else {
            if (window._is3dMode && window.mlMap3d) {
                window.mlMap3d.flyTo({ center: [lng, lat], zoom: Math.max(window.mlMap3d.getZoom(), 6), duration: 800 });
            } else {
                map.setView([lat, lng], Math.max(map.getZoom(), 6), { animate: true });
            }
        }
    };
    // ────────────────────────────────────────────────────────────────

    window.refreshNearbyResults = async function() {
        const radius = document.getElementById('nearbyRadiusSelect').value;
        const type   = document.getElementById('nearbyTypeSelect').value;
        const body   = document.getElementById('nearbyResultBody');
        const spinner = document.getElementById('nearbyLoadingSpinner');

        spinner.style.display = 'inline';
        body.innerHTML = '';

        // 반경 변경 즉시 레이더 갱신
        if (_nearbyCenter) {
            drawRadarCircles(_nearbyCenter.lat, _nearbyCenter.lng, parseFloat(radius));
        }

        try {
            const url = `${API_BASE_URL}/nearby?lat=${_nearbyCenter.lat}&lng=${_nearbyCenter.lng}&radius=${radius}&type=${type}&limit=50`;
            const res  = await fetch(url);
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();

            const castles  = data.castles       || [];
            const contribs = data.contributions || [];

            if (castles.length === 0 && contribs.length === 0) {
                body.innerHTML = `<div style="color:#8fa0b0;font-size:13px;text-align:center;padding:40px 0;">
                    반경 ${radius}km 내에 데이터가 없습니다.</div>`;
                return;
            }

            // km → 리 변환 + 이동 수단 tooltip
            const fmtDist = km => {
                const ri = Math.round(km * 1000 / 435);
                const horse = _calcTravelTime(km, 6, 8);
                const foot  = _calcTravelTime(km, 3.75, 9);
                return `<span title="🐴 기마대 ${horse} · 🪖 보병대 ${foot} · 1리≒435m (통상 이동 기준)"
                    style="cursor:default;">${km} km <span style="color:#7a9aaa;font-size:10.5px;">(${ri}리)</span></span>`;
            };

            const sectionHtml = (title, color, items, renderFn) => {
                if (!items.length) return '';
                return `<div style="margin-bottom:18px;">
                    <div style="color:${color};font-weight:700;font-size:13px;margin-bottom:8px;
                                padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.07);">
                        ${title} <span style="font-weight:400;font-size:12px;color:#6a8090;">(${items.length}건)</span>
                    </div>
                    ${items.map(renderFn).join('')}
                </div>`;
            };

            const castleRow = c => {
                const sy = c.start_year ?? c.built_year ?? null;
                const ey = c.end_year   ?? c.destroyed_year ?? null;
                const yearLabel = sy != null
                    ? (ey != null ? `${sy < 0 ? `BC${Math.abs(sy)}` : sy}~${ey < 0 ? `BC${Math.abs(ey)}` : ey}` : `${sy < 0 ? `BC${Math.abs(sy)}` : sy}~`)
                    : '';
                const safeName = (c.name || '이름 없음').replace(/'/g, "\\'");
                const ri = Math.round(c.distanceKm * 1000 / 435);
                const horse = _calcTravelTime(c.distanceKm, 6, 8);
                const foot  = _calcTravelTime(c.distanceKm, 3.75, 9);
                return `
                <div onclick="goToNearbyItem(${c.lat},${c.lng},${sy ?? 'null'},${ey ?? 'null'},'${safeName}')"
                     style="display:flex;justify-content:space-between;align-items:center;
                            padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.04);
                            cursor:pointer;border-radius:4px;transition:background 0.15s;"
                     onmouseover="this.style.background='rgba(90,160,200,0.08)'"
                     onmouseout="this.style.background='none'">
                    <span style="color:#d8cfc4;font-size:13px;">🏯 ${c.name || '이름 없음'}
                        ${yearLabel ? `<span style="color:#5a7888;font-size:11px;margin-left:5px;">${yearLabel}</span>` : ''}
                    </span>
                    <span style="text-align:right;white-space:nowrap;margin-left:8px;line-height:1.5;">
                        <span style="color:#7ab8cc;font-size:12px;display:block;">${c.distanceKm} km · ${ri}리</span>
                        <span style="color:#a09070;font-size:10px;">🐴${horse} · 🚶${foot}</span>
                    </span>
                </div>`;
            };

            const catIcon = { geography:'🌄', oldmap:'🗺️', literature:'📜', other:'🔍' };
            const contribRow = c => {
                const sy = c.start_year ?? c.year ?? null;
                const ey = c.end_year   ?? null;
                const yearLabel = sy != null
                    ? (ey != null ? `${sy < 0 ? `BC${Math.abs(sy)}` : sy}~${ey}` : `${sy < 0 ? `BC${Math.abs(sy)}` : sy}년`)
                    : '';
                const safeName = (c.name || '이름 없음').replace(/'/g, "\\'");
                const ri2 = Math.round(c.distanceKm * 1000 / 435);
                const horse2 = _calcTravelTime(c.distanceKm, 6, 8);
                const foot2  = _calcTravelTime(c.distanceKm, 3.75, 9);
                return `
                <div onclick="goToNearbyItem(${c.lat},${c.lng},${sy ?? 'null'},${ey ?? 'null'},'${safeName}')"
                     style="display:flex;justify-content:space-between;align-items:center;
                            padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.04);
                            cursor:pointer;border-radius:4px;transition:background 0.15s;"
                     onmouseover="this.style.background='rgba(200,168,80,0.08)'"
                     onmouseout="this.style.background='none'">
                    <span style="color:#d8cfc4;font-size:13px;">
                        ${catIcon[c.category]||'📌'} ${c.name || '이름 없음'}
                        <span style="color:#6a8090;font-size:11px;margin-left:4px;">${c.category||''}</span>
                        ${yearLabel ? `<span style="color:#5a7868;font-size:11px;margin-left:4px;">${yearLabel}</span>` : ''}
                    </span>
                    <span style="text-align:right;white-space:nowrap;margin-left:8px;line-height:1.5;">
                        <span style="color:#c8a850;font-size:12px;display:block;">${c.distanceKm} km · ${ri2}리</span>
                        <span style="color:#a09070;font-size:10px;">🐴${horse2} · 🚶${foot2}</span>
                    </span>
                </div>`;
            };

            body.innerHTML =
                sectionHtml('🏯 주변 성/유적', '#7ab8cc', castles,  castleRow) +
                sectionHtml('📜 주변 사료',    '#c8a850', contribs, contribRow);

        } catch(e) {
            body.innerHTML = `<div style="color:#c86050;font-size:13px;padding:20px 0;">오류: ${e.message}</div>`;
        } finally {
            spinner.style.display = 'none';
        }
    };

    window.openMarkerCommentModal = function(castleId, castleName) {
        _mcCurrentCastleId = castleId;
        _mcCurrentCastleName = castleName;
        document.getElementById('mcModalMarkerName').textContent = castleName ? `— ${castleName}` : '';
        document.getElementById('mcCommentList').innerHTML = '<div id="mcLoadingMsg" style="color:#9aabbd;font-size:13px;text-align:center;padding:20px 0;">불러오는 중...</div>';
        document.getElementById('mcTextInput').value = '';
        document.getElementById('mcCharCount').textContent = '0';

        // 로그인 여부 및 게스트 여부에 따라 입력창 표시
        // 게스트는 의견 작성 불가
        const loggedIn = !!currentUser && !currentUser.isGuest;
        document.getElementById('mcInputArea').style.display = loggedIn ? 'block' : 'none';
        const loginNoticeEl = document.getElementById('mcLoginNotice');
        if (loggedIn) {
            if (loginNoticeEl) loginNoticeEl.style.display = 'none';
        } else {
            if (loginNoticeEl) {
                loginNoticeEl.style.display = 'block';
                if (currentUser && currentUser.isGuest) loginNoticeEl.textContent = '게스트 계정은 의견을 작성할 수 없습니다.';
                else loginNoticeEl.textContent = '의견을 작성하려면 로그인이 필요합니다.';
            }
        }

        document.getElementById('markerCommentModal').style.display = 'flex';
        loadMarkerComments();
    };

    window.closeMarkerCommentModal = function() {
        document.getElementById('markerCommentModal').style.display = 'none';
    };

    // 배경 클릭 시 닫기
    document.getElementById('markerCommentModal').addEventListener('click', function(e) {
        if (e.target === this) closeMarkerCommentModal();
    });

    // 글자수 카운트
    document.getElementById('mcTextInput').addEventListener('input', function() {
        document.getElementById('mcCharCount').textContent = this.value.length;
    });

    // Ctrl+Enter 등록
    document.getElementById('mcTextInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitMarkerComment();
    });

    async function loadMarkerComments() {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) {
            document.getElementById('mcCommentList').innerHTML = '<div style="color:#9aabbd;font-size:13px;text-align:center;padding:20px 0;">로그인 후 의견을 볼 수 있습니다.</div>';
            return;
        }
        try {
            const res = await fetch(`/api/marker-comments/${_mcCurrentCastleId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(res.status);
            const comments = await res.json();
            renderComments(comments);
        } catch (e) {
            document.getElementById('mcCommentList').innerHTML = '<div style="color:#e74c3c;font-size:13px;text-align:center;padding:20px 0;">의견을 불러오지 못했습니다.</div>';
        }
    }

    function renderComments(comments) {
        const list = document.getElementById('mcCommentList');
        if (!comments || comments.length === 0) {
            list.innerHTML = '<div style="color:#9aabbd;font-size:13px;text-align:center;padding:20px 0;">아직 의견이 없습니다. 첫 번째 의견을 남겨보세요!</div>';
            return;
        }
        const loggedIn = !!currentUser && !currentUser.isGuest;
        list.innerHTML = comments.map(c => {
            const date = new Date(c.created_at).toLocaleDateString('ko-KR', { year:'2-digit', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
            const canDelete = currentUser && (currentUser.username === c.author || currentUser.role === 'admin' || currentUser.role === 'superuser');
            const deleteBtn = canDelete ? `<button class="mc-delete-btn" onclick="deleteMarkerComment('${c._id}')">삭제</button>` : '';
            const replyBtn = loggedIn ? `<button class="mc-reply-btn" onclick="toggleReplyInput('${c._id}')">↩ 답글</button>` : '';

            // 답글 목록
            const replies = (c.replies || []).map(r => {
                const rDate = new Date(r.created_at).toLocaleDateString('ko-KR', { year:'2-digit', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
                const canDeleteR = currentUser && (currentUser.username === r.author || currentUser.role === 'admin' || currentUser.role === 'superuser');
                const delBtnR = canDeleteR ? `<button class="mc-delete-btn" onclick="deleteMarkerComment('${r._id}')">삭제</button>` : '';
                return `<div class="mc-reply-item" id="mc-item-${r._id}">
                    ${delBtnR}
                    <span class="mc-comment-author">↪ ${escapeHtml(r.author)}</span>
                    <span class="mc-comment-date">${rDate}</span>
                    <div class="mc-comment-text">${window.renderEntityLinkTokens ? window.renderEntityLinkTokens(r.text) : escapeHtml(r.text)}</div>
                </div>`;
            }).join('');

            const repliesHtml = replies ? `<div class="mc-replies" id="mc-replies-${c._id}">${replies}</div>` : `<div class="mc-replies" id="mc-replies-${c._id}"></div>`;

            // 답글 입력창 (처음엔 숨김)
            const replyInputHtml = loggedIn ? `
                <div class="mc-reply-input-area" id="mc-reply-input-${c._id}">
                    <textarea rows="2" maxlength="300" placeholder="답글을 입력하세요... (300자 이내)" id="mc-reply-text-${c._id}"></textarea>
                    <div class="mc-reply-submit-row">
                        <button class="mc-reply-cancel-btn" onclick="toggleReplyInput('${c._id}')">취소</button>
                        <button class="mc-reply-submit-btn" onclick="submitReply('${c._id}')">답글 등록</button>
                    </div>
                </div>` : '';

            return `<div class="mc-comment-item" id="mc-item-${c._id}">
                ${deleteBtn}
                <span class="mc-comment-author">${escapeHtml(c.author)}</span>
                <span class="mc-comment-date">${date}</span>
                ${replyBtn}
                <div class="mc-comment-text">${window.renderEntityLinkTokens ? window.renderEntityLinkTokens(c.text) : escapeHtml(c.text)}</div>
                ${repliesHtml}
                ${replyInputHtml}
            </div>`;
        }).join('');
    }

    window.toggleReplyInput = function(parentId) {
        const area = document.getElementById(`mc-reply-input-${parentId}`);
        if (!area) return;
        const isVisible = area.style.display === 'block';
        area.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            const ta = document.getElementById(`mc-reply-text-${parentId}`);
            if (ta) { ta.value = ''; ta.focus(); }
        }
    };

    window.submitReply = async function(parentId) {
        if (currentUser && currentUser.isGuest) { alert('게스트 계정은 답글을 작성할 수 없습니다.'); return; }
        const ta = document.getElementById(`mc-reply-text-${parentId}`);
        if (!ta) return;
        const text = ta.value.trim();
        if (!text) return;
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch('/api/marker-comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ castle_id: _mcCurrentCastleId, text, parent_id: parentId })
            });
            if (!res.ok) { const err = await res.json(); alert(err.message || '답글 등록 실패'); return; }
            const newReply = await res.json();
            // 답글 목록에 즉시 추가
            const repliesDiv = document.getElementById(`mc-replies-${parentId}`);
            if (repliesDiv) {
                const rDate = new Date(newReply.created_at).toLocaleDateString('ko-KR', { year:'2-digit', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
                const canDeleteR = currentUser && (currentUser.username === newReply.author || currentUser.role === 'admin' || currentUser.role === 'superuser');
                const delBtnR = canDeleteR ? `<button class="mc-delete-btn" onclick="deleteMarkerComment('${newReply._id}')">삭제</button>` : '';
                const div = document.createElement('div');
                div.className = 'mc-reply-item';
                div.id = `mc-item-${newReply._id}`;
                div.innerHTML = `${delBtnR}<span class="mc-comment-author">↪ ${escapeHtml(newReply.author)}</span><span class="mc-comment-date">${rDate}</span><div class="mc-comment-text">${window.renderEntityLinkTokens ? window.renderEntityLinkTokens(newReply.text) : escapeHtml(newReply.text)}</div>`;
                repliesDiv.appendChild(div);
            }
            toggleReplyInput(parentId);
        } catch (e) { alert('답글 등록 중 오류가 발생했습니다.'); }
    };

    window.submitMarkerComment = async function() {
        // 게스트는 클라이언트 레벨에서도 제출 차단
        if (currentUser && currentUser.isGuest) {
            alert('게스트 계정은 의견을 작성할 수 없습니다.');
            return;
        }
        const text = document.getElementById('mcTextInput').value.trim();
        if (!text) return;
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch('/api/marker-comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ castle_id: _mcCurrentCastleId, text })
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.message || '의견 등록 실패');
                return;
            }
            const data = await res.json();
            // +1P 토스트
            if (data.pointAwarded) showToast('💬 의견 등록 +1P 획득!', 'point');
            document.getElementById('mcTextInput').value = '';
            document.getElementById('mcCharCount').textContent = '0';
            await loadMarkerComments();
            // 로컬 카운트 갱신 및 배지 업데이트
            try {
                const id = String(_mcCurrentCastleId);
                window._commentCounts = window._commentCounts || {};
                window._commentCounts[id] = (window._commentCounts[id] || 0) + 1;
                const btnBadge = document.getElementById(`mc-btn-badge-${id}`);
                if (btnBadge) {
                    btnBadge.style.display = 'inline-block';
                    btnBadge.textContent = window._commentCounts[id] > 99 ? '99+' : window._commentCounts[id];
                }
                (allCastleMarkers || []).forEach(m => {
                    try { if (m && m._castleData && String(m._castleData._id) === id) placeBadgeOnMarker(m, id); } catch(e){}
                });
            } catch (e) { /* non-fatal */ }
            // 🚩 [추가] 액티비티 피드 즉시 갱신
            if (typeof window.refreshActivityFeed === 'function') window.refreshActivityFeed();
        } catch (e) {
            alert('의견 등록 중 오류가 발생했습니다.');
        }
    };

    window.deleteMarkerComment = async function(commentId) {
        if (!confirm('이 의견을 삭제할까요?')) return;
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        try {
            const res = await fetch(`/api/marker-comments/${commentId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) { alert('삭제 실패'); return; }
            const item = document.getElementById(`mc-item-${commentId}`);
            if (item) item.remove();
            // 루트 댓글이 모두 삭제됐으면 빈 메시지 표시
            const list = document.getElementById('mcCommentList');
            if (!list.querySelector('.mc-comment-item')) {
                list.innerHTML = '<div style="color:#9aabbd;font-size:13px;text-align:center;padding:20px 0;">아직 의견이 없습니다. 첫 번째 의견을 남겨보세요!</div>';
            }
            // 의견 삭제 후 카운트 갱신 — 전체 카운트를 다시 받아와서 뱃지 업데이트
            try {
                await fetchCommentCounts();
                const id = String(_mcCurrentCastleId);
                const btnBadge = document.getElementById(`mc-btn-badge-${id}`);
                if (btnBadge) {
                    const c = window._commentCounts && window._commentCounts[id] ? window._commentCounts[id] : 0;
                    btnBadge.style.display = c > 0 ? 'inline-block' : 'none';
                    btnBadge.textContent = c > 99 ? '99+' : (c || '');
                }
                (allCastleMarkers || []).forEach(m => {
                    try { if (m && m._castleData && String(m._castleData._id) === id) placeBadgeOnMarker(m, id); } catch(e){}
                });
            } catch (e) { /* ignore */ }
        } catch (e) {
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    function escapeHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

})();
