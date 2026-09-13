// ── BGM 플레이어 (서버에서 목록 자동 로드 + 셔플 재생) ──────────────
(function () {
  var audio = new Audio();
  audio.preload = 'auto';
  var savedVolume = parseFloat(localStorage.getItem('bgmVolume'));
  audio.volume = Number.isFinite(savedVolume) ? Math.min(1, Math.max(0, savedVolume)) : 0.4;
  var playing = false;
  var muted   = localStorage.getItem('bgmMuted') === 'true';
  audio.muted = muted;
  var TRACKS = [], trackNames = [], queue = [], cursor = 0, currentIdx = -1;

  /* ── 유틸 ── */
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function updateToggleBtn() {
    var pauseSvg = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    var playSvg  = '<polygon points="5,3 19,12 5,21"/>';
    var icon = document.getElementById('bgm-play-icon');
    if (icon) icon.innerHTML = playing ? pauseSvg : playSvg;
    var miniIcon = document.getElementById('bgm-mini-play-icon');
    if (miniIcon) miniIcon.innerHTML = playing ? pauseSvg : playSvg;
  }

  function updateMuteBtn() {
    var mutedSvg   = '<polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
    var unmutedSvg = '<polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
    var icon = document.getElementById('bgm-vol-icon');
    if (icon) icon.innerHTML = muted ? mutedSvg : unmutedSvg;
    var miniIcon = document.getElementById('bgm-mini-vol-icon');
    if (miniIcon) miniIcon.innerHTML = muted ? mutedSvg : unmutedSvg;
  }

  function showTrackName() {
    var name = trackNames[currentIdx] || '';
    var el1 = document.getElementById('bgm-track-name');
    var el2 = document.getElementById('bgm-mini-title');
    if (el1) el1.textContent = name;
    if (el2) el2.textContent = name;
  }

  function playNext() {
    if (TRACKS.length === 0) return;
    if (cursor >= queue.length) {
      var last = queue[queue.length - 1];
      do { queue = shuffle(TRACKS.map(function(_, i){ return i; })); }
      while (TRACKS.length > 1 && queue[0] === last);
      cursor = 0;
    }
    currentIdx = queue[cursor++];
    audio.src = TRACKS[currentIdx];
    showTrackName();
    if (playing) audio.play().catch(function(){});
  }

  audio.addEventListener('ended', playNext);

  /* ── 초기화: 서버에서 목록 불러오기 ── */
  function init() {
    fetch('/api/bgm-list').then(function(r){ return r.json(); }).then(function(data) {
      TRACKS     = data.tracks || [];
      trackNames = data.names  || [];
      if (TRACKS.length === 0) { console.warn('[BGM] mp3 없음'); return; }
      queue  = shuffle(TRACKS.map(function(_, i){ return i; }));
      cursor = 0;
      // 트랙 로드 (재생은 사용자 인터랙션 후)
      currentIdx = queue[cursor++];
      audio.src  = TRACKS[currentIdx];
      showTrackName();
      // 자동재생 시도
      audio.play().then(function(){ playing = true; updateToggleBtn(); }).catch(function(){
        function onFirst() {
          if (!playing) { audio.play().then(function(){ playing = true; updateToggleBtn(); }).catch(function(){}); }
          document.removeEventListener('click',   onFirst);
          document.removeEventListener('keydown', onFirst);
        }
        document.addEventListener('click',   onFirst);
        document.addEventListener('keydown', onFirst);
      });
    }).catch(function(e){ console.warn('[BGM] 목록 로드 실패:', e); });
  }

  /* ── 버튼 바인딩 ── */
  document.addEventListener('DOMContentLoaded', function() {
    init();
    updateMuteBtn();

    function bindClick(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); }

    function doToggle() {
      if (playing) { audio.pause(); playing = false; }
      else { audio.play().catch(function(){}); playing = true; }
      updateToggleBtn();
    }
    function doMute() {
      muted = !muted;
      audio.muted = muted;
      localStorage.setItem('bgmMuted', String(muted));
      // voice(해설) 오디오도 함께 음소거 동기화
      if (window._voiceAudio) window._voiceAudio.muted = muted;
      updateMuteBtn();
    }
    function doNext() { var was = playing; audio.pause(); playNext(); if (was) { playing = true; audio.play().catch(function(){}); } updateToggleBtn(); }

    bindClick('bgm-toggle-btn',  doToggle);
    bindClick('bgm-next-btn',    doNext);
    bindClick('bgm-mute-btn',    doMute);
    bindClick('bgm-mini-toggle', doToggle);
    bindClick('bgm-mini-mute',   doMute);

    var volSlider = document.getElementById('bgm-volume');
    if (volSlider) {
      volSlider.value = String(audio.volume);
      volSlider.addEventListener('input', function(){
        audio.volume = parseFloat(this.value);
        localStorage.setItem('bgmVolume', String(audio.volume));
      });
    }
  });

  /* ── 전역 노출 ── */
  window.bgmPlayer = {
    audio: audio,
    playNext: playNext,
    pause:  function(){ audio.pause(); playing = false; updateToggleBtn(); },
    resume: function(){ audio.play().catch(function(){}); playing = true; updateToggleBtn(); },
    getCurrentName: function(){ return trackNames[currentIdx] || ''; },
    getList: function(){ return trackNames.slice(); }
  };
})();

(function() {
  var _layer = null;
  var _on = false, _busy = false;
  var _data = [];
  var _currentYear = 1000;
  window._3dPopulationMarkers = window._3dPopulationMarkers || [];

  function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  }
  function getMap() {
    if (typeof map !== 'undefined' && map) return map;
    if (window.map) return window.map;
    var el = document.getElementById('map');
    return el && el._leaflet_map ? el._leaflet_map : null;
  }

  // 연도에 맞는 인구값 추출
  function getPopForYear(doc, year) {
    var eraStart = doc.era_start != null ? doc.era_start : -9999;
    var eraEnd   = doc.era_end   != null ? doc.era_end   :  9999;
    if (year < eraStart - 50) return 0;
    if (year > eraEnd   + 50) return 0;
    if (!doc.pop_by_year || Object.keys(doc.pop_by_year).length === 0) {
      return doc.est_population || 0;
    }
    var years = Object.keys(doc.pop_by_year).map(Number).sort(function(a, b) { return a - b; });
    var best = null;
    for (var i = 0; i < years.length; i++) {
      if (years[i] <= year) best = years[i];
      else break;
    }
    return best !== null ? (doc.pop_by_year[best] || 0) : 0;
  }

  // 호구수 포맷 (인구 ÷ 5 = 호구 추정)
  function popToHousehold(pop) {
    var h = Math.round(pop / 5);
    if (h >= 10000000) return (h / 10000000).toFixed(1) + '천만호';
    if (h >= 1000000)  return (h / 1000000).toFixed(1)  + '백만호';
    if (h >= 10000)    return (h / 10000).toFixed(0)     + '만호';
    if (h >= 1000)     return (h / 1000).toFixed(1)      + '천호';
    return h.toLocaleString() + '호';
  }

  function clear3dPopulation() {
    (window._3dPopulationMarkers || []).forEach(function(marker) {
      try { marker.remove(); } catch (e) {}
    });
    window._3dPopulationMarkers = [];
  }

  // Leaflet 호구수 레이어와 같은 값·색상·크기로 MapLibre HTML 마커를 만든다.
  function build3dPopulation(year) {
    clear3dPopulation();
    if (!_on || !window._is3dMode || !window.mlMap3d || !window.maplibregl) return;

    var mlMap = window.mlMap3d;
    var active = _data.filter(function(d) { return getPopForYear(d, year) > 0; });
    if (!active.length) return;
    var allValues = [];
    _data.forEach(function(d) {
      Object.values(d.pop_by_year || {}).forEach(function(value) {
        var numeric = Number(value);
        if (Number.isFinite(numeric)) allValues.push(numeric);
      });
      var estimate = Number(d.est_population || 0);
      if (Number.isFinite(estimate)) allValues.push(estimate);
    });
    var fixedMax = Math.max.apply(null, allValues.concat([1]));

    active.forEach(function(d) {
      var coords = d.location && d.location.coordinates;
      var lat = coords ? Number(coords[1]) : Number(d.lat);
      var lng = coords ? Number(coords[0]) : Number(d.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      var pop = getPopForYear(d, year);
      var ratio = Math.max(0, pop / fixedMax);
      var radius = Math.max(4, ratio * 55);
      var diameter = Math.max(12, radius * 2);
      var color = ratio > 0.15 ? '#ef4444'
                : ratio > 0.08 ? '#f97316'
                : ratio > 0.04 ? '#eab308' : '#3b82f6';
      var fontSize = Math.max(8, Math.min(13, Math.round(ratio * 60 + 7)));
      var el = document.createElement('div');
      el.dataset.ml3dPriority = '2';
      el.style.cssText = 'position:relative;width:' + diameter + 'px;height:' + diameter
        + 'px;border-radius:50%;background:' + color + '40;border:1px solid ' + color
        + '80;box-sizing:border-box;pointer-events:none;overflow:visible;';
      el.innerHTML = '<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);'
        + 'color:' + color + ';font-size:' + fontSize + 'px;font-weight:700;white-space:nowrap;'
        + 'text-shadow:0 1px 3px rgba(0,0,0,.95);line-height:1;">'
        + popToHousehold(pop) + '</div>';
      var marker = new maplibregl.Marker({ element: el, anchor: 'center', occludedOpacity: 0 })
        .setLngLat([lng, lat]).addTo(mlMap);
      window._3dPopulationMarkers.push(marker);
    });
  }

  window._refresh3dPopulation = function() {
    var ym = typeof getCurrentYearMonth === 'function' ? getCurrentYearMonth() : null;
    build3dPopulation(ym ? ym.year : _currentYear);
  };
  window._refreshPopulationForTime = function(year) {
    _currentYear = Number(year);
    if (_on && _data.length) buildLayer(_currentYear);
  };

  // 호구수 버블 + 숫자 레이어 생성
  function buildLayer(year) {
    var m = getMap();
    if (!m) return;
    if (_layer) { try { m.removeLayer(_layer); } catch(e){} _layer = null; }

    var active = _data.filter(function(d) { return getPopForYear(d, year) > 0; });
    if (!active.length) return;

    var FIXED_MAX = Math.max.apply(null,
      _data.map(function(d) {
        return Math.max.apply(null, Object.values(d.pop_by_year || {'0': 0}).map(Number));
      })
    );

    _layer = L.layerGroup();
    active.forEach(function(d) {
      // GeoJSON: coordinates = [lng, lat]
      var coords = d.location && d.location.coordinates;
      var lat = coords ? coords[1] : d.lat;
      var lng = coords ? coords[0] : d.lng;
      if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;

      var pop    = getPopForYear(d, year);
      var ratio  = pop / FIXED_MAX;
      var radius = Math.max(4, ratio * 55);

      // 색상: 인구 밀도에 따라
      var color = ratio > 0.15 ? '#ef4444'
                : ratio > 0.08 ? '#f97316'
                : ratio > 0.04 ? '#eab308'
                :                '#3b82f6';

      // 반투명 버블
      L.circleMarker([lat, lng], {
        radius:      radius,
        fillColor:   color,
        fillOpacity: 0.25,
        color:       color,
        weight:      1,
        opacity:     0.5,
      }).addTo(_layer);

      // 중앙 호구수 텍스트 아이콘
      var txt   = popToHousehold(pop);
      var fsize = Math.max(8, Math.min(13, Math.round(ratio * 60 + 7)));
      var icon  = L.divIcon({
        html: '<div style="color:' + color + ';font-size:' + fsize + 'px;font-weight:700;'
            + 'text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap;'
            + 'transform:translate(-50%,-50%);line-height:1">' + txt + '</div>',
        className: '',
        iconSize:   [1, 1],
        iconAnchor: [0, 0],
        popupAnchor:[0, -radius],
      });
      L.marker([lat, lng], { icon: icon, interactive: false }).addTo(_layer);
    });

    if (_on) _layer.addTo(m);
    build3dPopulation(year);
  }

  // 슬라이더 연동
  function hookSlider() {
    var slider = document.getElementById('combinedSlider');
    if (!slider) { setTimeout(hookSlider, 500); return; }
    slider.addEventListener('input', function() {
      if (!_on || !_data.length) return;
      var ym = typeof getCurrentYearMonth === 'function' ? getCurrentYearMonth() : null;
      var year = ym ? ym.year : null;
      if (year !== null && year !== _currentYear) {
        _currentYear = year;
        buildLayer(_currentYear);
      }
    });
  }
  hookSlider();

  window.togglePopHeat = async function(btn) {
    var m = getMap();
    if (!m) { return; }

    if (!_data.length) {
      if (_busy) return;
      _busy = true;
      if (btn) btn.textContent = '⏳';
      try {
        var res = await fetch('/api/resources?type=population', {
          headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        _data = await res.json();
        var ym = typeof getCurrentYearMonth === 'function' ? getCurrentYearMonth() : null;
        _currentYear = ym ? ym.year : 1000;
        buildLayer(_currentYear);
      } catch(e) {
        if (btn) btn.textContent = '호구수';
        _busy = false; return;
      }
      _busy = false;
    }

    _on = !_on;
    if (_on) {
      _layer && _layer.addTo(m);
      build3dPopulation(_currentYear);
      if (btn) { btn.classList.add('active'); btn.textContent = '호구수 ●'; }
    } else {
      _layer && m.removeLayer(_layer);
      clear3dPopulation();
      if (btn) { btn.classList.remove('active'); btn.textContent = '호구수'; }
    }
  };

})();

(function() {
  var _goldLayer = null, _ironLayer = null;
  var _goldOn = false, _ironOn = false;
  var _goldData = [], _ironData = [];
  var _loaded = false, _busy = false;

  function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  }
  function getMap() {
    if (typeof map !== 'undefined' && map) return map;
    if (window.map) return window.map;
    var el = document.getElementById('map');
    return el && el._leaflet_map ? el._leaflet_map : null;
  }

  function makePopup(d, type) {
    var icon  = type === 'gold' ? '🧈' : '🪨';
    var label = type === 'gold' ? '금 산지' : '철광 산지';
    return '<div style="min-width:180px;font-size:12px">'
      + '<div style="font-weight:700;font-size:13px;margin-bottom:6px">'
      + icon + ' ' + (d.name || '') + '</div>'
      + '<div style="color:#888;font-size:10px;margin-bottom:4px">' + label + ' — ' + (d.major ? '대형 ★' : '일반') + '</div>'
      + (d.description ? '<div style="color:#6b9fc0;font-size:10px;margin-top:4px;border-top:1px solid #2a3a4a;padding-top:4px">📜 ' + d.description + '</div>' : '')
      + (d.hist  ? '<div style="color:#6b9fc0;font-size:10px;margin-top:3px">📜 ' + d.hist  + '</div>' : '')
      + (d.strat ? '<div style="color:#f87171;font-size:10px;margin-top:3px">⚔️ ' + d.strat + '</div>' : '')
      + '<div style="margin-top:7px;text-align:right;display:flex;gap:5px;justify-content:flex-end"><button class="resource-edit-btn" onclick="rcOpenMarkerEdit(\'' + d._id + '\')" style="padding:2px 9px;background:#1a4a7a;border:none;border-radius:4px;color:#90c0f0;font-size:11px;cursor:pointer;">&#x270F;&#xFE0F; \ud3b8\uc9d1</button><button class="resource-edit-btn" onclick="rcDeleteMarker(\'' + d._id + '\',\'resources\')" style="padding:2px 9px;background:#5a2020;border:none;border-radius:4px;color:#f08080;font-size:11px;cursor:pointer;">\ud3b8\uc81c</button></div>'
      + '</div>';
  }

  var GOLD_ICON_URL = '/public/assets/ui/resource-gold.png';

  function makeGoldIcon(major) {
    var size = major ? 17 : 12;
    return L.icon({
      iconUrl:    GOLD_ICON_URL,
      iconSize:   [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor:[0, -size / 2],
    });
  }

  function makeEmojiIcon(emoji, major) {
    var size = major ? 13 : 10;
    return L.divIcon({
      html: '<span style="font-size:' + size + 'px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">' + emoji + '</span>',
      className: '',
      iconSize:   [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor:[0, -size / 2],
    });
  }

  function buildLayers() {
    _goldLayer = L.layerGroup();
    _goldData.forEach(function(d) {
      L.marker([d.lat, d.lng], { icon: makeGoldIcon(d.major) })
        .bindPopup(makePopup(d, 'gold')).addTo(_goldLayer);
    });

    _ironLayer = L.layerGroup();
    _ironData.forEach(function(d) {
      L.marker([d.lat, d.lng], { icon: makeEmojiIcon('🪨', d.major) })
        .bindPopup(makePopup(d, 'iron')).addTo(_ironLayer);
    });
  }

  async function loadData() {
    if (_loaded) return true;
    if (_busy)   return false;
    _busy = true;
    try {
      var r1 = await fetch('/api/resources?type=gold',  { headers: {'Authorization': 'Bearer ' + getToken()} });
      var r2 = await fetch('/api/resources?type=iron',  { headers: {'Authorization': 'Bearer ' + getToken()} });
      _goldData = await r1.json();
      _ironData = await r2.json();
      buildLayers();
      _loaded = true;
      console.log('[자원] 금:' + _goldData.length + '개 / 철:' + _ironData.length + '개');
    } catch(e) {
      console.error('[자원] 로드 오류:', e);
      _busy = false; return false;
    }
    _busy = false; return true;
  }

  window.toggleGold = async function(btn) {
    var m = getMap();
    if (!m || !await loadData()) return;
    _goldOn = !_goldOn;
    if (_goldOn) {
      _goldLayer.addTo(m);
      if (btn) { btn.classList.add('active'); btn.textContent = '🧈금산지 ●'; }
      var cb = document.getElementById('menu-layer-gold');
      if (cb) cb.checked = true;
      // 3D 노출: 데이터 등록 후 갱신
      window._resourceData = window._resourceData || {};
      window._resourceData.gold = _goldData.map(function(d){ return Object.assign({}, d, {_resType:'gold', _emoji:'🧈', _imgUrl: GOLD_ICON_URL, _boltSize: d.major ? 26 : 16}); });
    } else {
      m.removeLayer(_goldLayer);
      if (btn) { btn.classList.remove('active'); btn.textContent = '🧈금산지'; }
      var cb = document.getElementById('menu-layer-gold');
      if (cb) cb.checked = false;
      if (window._resourceData) delete window._resourceData.gold;
    }
    if (window._refresh3dResources) window._refresh3dResources();
  };

  window.toggleIron = async function(btn) {
    var m = getMap();
    if (!m || !await loadData()) return;
    _ironOn = !_ironOn;
    if (_ironOn) {
      _ironLayer.addTo(m);
      if (btn) { btn.classList.add('active'); btn.textContent = '🪨철광산지 ●'; }
      var cb = document.getElementById('menu-layer-iron');
      if (cb) cb.checked = true;
      window._resourceData = window._resourceData || {};
      window._resourceData.iron = _ironData.map(function(d){ return Object.assign({}, d, {_resType:'iron', _emoji:'🪨', _boltSize: d.major ? 24 : 15}); });
    } else {
      m.removeLayer(_ironLayer);
      if (btn) { btn.classList.remove('active'); btn.textContent = '🪨철광산지'; }
      var cb = document.getElementById('menu-layer-iron');
      if (cb) cb.checked = false;
      if (window._resourceData) delete window._resourceData.iron;
    }
    if (window._refresh3dResources) window._refresh3dResources();
  };
})();

// ════════════════════════════════════════════════════════
// 🌾 농작물 레이어
// ════════════════════════════════════════════════════════
(function() {
  var _data    = [];
  var _layer   = null;
  var _on      = false;
  var _loaded  = false;
  var _busy    = false;

  // 작물 종류별 이모티콘
  var CROP_EMOJI = {
    rice:     '🌾',
    wheat:    '🌿',
    millet:   '🌽',
    barley:   '🍺',
    sorghum:  '🎋',
    hemp:     '🪢',
    mulberry: '🍃',
    mixed:    '🌱',
  };

  // annual_yield_ton 기준 아이콘 크기 (8~26px)
  var Y_MIN = 5880, Y_MAX = 213360;
  function yieldToSize(y) {
    var ratio = Math.max(0, Math.min(1, (y - Y_MIN) / (Y_MAX - Y_MIN)));
    return Math.round(8 + ratio * 18); // 8px ~ 26px
  }

  function makeCropIcon(d) {
    var emoji = CROP_EMOJI[d.crop_type] || '🌱';
    var size  = yieldToSize(d.annual_yield_ton || 0);
    return L.divIcon({
      html: '<span title="' + (d.name_ko||d.name) + '" style="font-size:' + size + 'px;line-height:1;display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))">' + emoji + '</span>',
      className: '',
      iconSize:   [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor:[0, -size / 2],
    });
  }

  function makePopup(d) {
    var emoji = CROP_EMOJI[d.crop_type] || '🌱';
    var yieldFmt = d.annual_yield_ton ? d.annual_yield_ton.toLocaleString() + ' 톤' : '-';
    var areaFmt  = d.area_km2         ? d.area_km2.toLocaleString()         + ' km²' : '-';
    return '<div style="min-width:170px;font-size:12px">'
      + '<div style="font-weight:700;font-size:13px;margin-bottom:5px">' + emoji + ' ' + (d.name_ko || '') + ' <span style="color:#888;font-size:11px">(' + (d.name||'') + ')</span></div>'
      + '<div style="color:#aaa;font-size:10px;margin-bottom:5px">' + (d.region||'') + ' — ' + (d.crop_type_ko||d.crop_type) + '</div>'
      + '<table style="font-size:11px;border-collapse:collapse;width:100%">'
      + '<tr><td style="color:#888;padding:1px 4px 1px 0">생산량</td><td style="font-weight:600;color:#4ade80">' + yieldFmt + '</td></tr>'
      + '<tr><td style="color:#888;padding:1px 4px 1px 0">경작 면적</td><td>' + areaFmt + '</td></tr>'
      + '<tr><td style="color:#888;padding:1px 4px 1px 0">생산성</td><td>' + (d.productivity||'-') + ' / 10</td></tr>'
      + '</table>'
      + (d.era_note ? '<div style="color:#6b9fc0;font-size:10px;margin-top:5px;border-top:1px solid #2a3a4a;padding-top:4px">📜 ' + d.era_note + '</div>' : '')
      + '<div style="margin-top:7px;text-align:right;display:flex;gap:5px;justify-content:flex-end"><button class="resource-edit-btn" onclick="rcOpenCropEdit(\'' + d._id + '\')" style="padding:2px 9px;background:#1a4a7a;border:none;border-radius:4px;color:#90c0f0;font-size:11px;cursor:pointer;">&#x270F;&#xFE0F; \ud3b8\uc9d1</button><button class="resource-edit-btn" onclick="rcDeleteMarker(\'' + d._id + '\',\'crops\')" style="padding:2px 9px;background:#5a2020;border:none;border-radius:4px;color:#f08080;font-size:11px;cursor:pointer;">\ud3b8\uc81c</button></div>'
      + '</div>';
  }

  function buildLayer() {
    _layer = L.layerGroup();
    _data.forEach(function(d) {
      L.marker([d.lat, d.lng], { icon: makeCropIcon(d) })
        .bindPopup(makePopup(d))
        .addTo(_layer);
    });
  }

  function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  }

  async function loadData() {
    if (_loaded) return true;
    if (_busy)   return false;
    _busy = true;
    try {
      var r = await fetch('/api/crops', { headers: { 'Authorization': 'Bearer ' + getToken() } });
      _data = await r.json();
      buildLayer();
      _loaded = true;
      console.log('[농작물] ' + _data.length + '개 로드');
    } catch(e) {
      console.error('[농작물] 로드 오류:', e);
      _busy = false;
      return false;
    }
    _busy = false;
    return true;
  }

  function getMap() { return window.map || null; }

  window.toggleCrops = async function(btn) {
    var m = getMap();
    if (!m || !await loadData()) return;
    _on = !_on;
    if (_on) {
      _layer.addTo(m);
      if (btn) { btn.classList.add('active'); btn.textContent = '🌾농작물 ●'; }
      var cb = document.getElementById('menu-layer-crops');
      if (cb) cb.checked = true;
      window._resourceData = window._resourceData || {};
      window._resourceData.crops = _data.map(function(d){ return Object.assign({}, d, {_resType:'crops', _emoji: (({rice:'🌾',wheat:'🌿',millet:'🌽',barley:'🍺',sorghum:'🎋',hemp:'🪢',mulberry:'🍃'})[d.crop_type]||'🌱')}); });
    } else {
      m.removeLayer(_layer);
      if (btn) { btn.classList.remove('active'); btn.textContent = '🌾농작물'; }
      var cb = document.getElementById('menu-layer-crops');
      if (cb) cb.checked = false;
      if (window._resourceData) delete window._resourceData.crops;
    }
    if (window._refresh3dResources) window._refresh3dResources();
  };
})();

// ════════════════════════════════════════════════════════
// 🐎 말 산지 레이어
// ════════════════════════════════════════════════════════
(function() {
  var _data   = [];
  var _layer  = null;
  var _on     = false;
  var _loaded = false;
  var _busy   = false;

  // annual_horses 기준 아이콘 크기 (9px ~ 28px)
  var H_MIN = 3000, H_MAX = 200000;
  function horsesToSize(h) {
    var ratio = Math.max(0, Math.min(1, (h - H_MIN) / (H_MAX - H_MIN)));
    return Math.round(11 + ratio * 23);
  }

  // 동물별 이모지
  var ANIMAL_EMOJI = { horse:'🐎', buffalo:'🐃', monkey:'🐒', camel:'🐪' };
  var ANIMAL_LABEL = { horse:'말', buffalo:'물소', monkey:'원숭이', camel:'낙타' };

  function makeAnimalIcon(d) {
    var size = horsesToSize(d.annual_horses || d.annual_count || H_MIN);
    var emoji = ANIMAL_EMOJI[d.resource_type] || '🐎';
    return L.divIcon({
      html: '<span style="font-size:' + size + 'px;line-height:1;display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))">' + emoji + '</span>',
      className: '',
      iconSize:   [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor:[0, -size / 2],
    });
  }

  function makePopup(d) {
    var label = ANIMAL_LABEL[d.resource_type] || '동물';
    var emoji = ANIMAL_EMOJI[d.resource_type] || '🐾';
    var popup = '<div style="min-width:190px;font-size:12px">'
      + '<div style="font-weight:700;font-size:13px;margin-bottom:4px">' + emoji + ' ' + (d.name_ko || d.name || '') + '</div>'
      + '<div style="color:#aaa;font-size:10px;margin-bottom:5px">' + (d.name !== d.name_ko ? d.name + ' — ' : '') + (d.region||'') + ' · ' + label + '</div>'
      + '<table style="font-size:11px;border-collapse:collapse;width:100%">';
    if (d.resource_type === 'horse') {
      var stars = '★'.repeat(d.quality || 0) + '☆'.repeat(10 - (d.quality || 0));
      popup += '<tr><td style="color:#888;padding:1px 4px 1px 0">품질</td><td style="color:#f59e0b;font-size:10px">' + stars + ' (' + (d.quality||'-') + '/10)</td></tr>'
        + '<tr><td style="color:#888;padding:1px 4px 1px 0">연간 공급</td><td style="font-weight:600;color:#4ade80">~' + ((d.annual_horses||0)).toLocaleString() + ' 두</td></tr>'
        + '<tr><td style="color:#888;padding:1px 4px 1px 0">품종</td><td>' + (d.breed||'-') + '</td></tr>'
        + (d.hist  ? '</table><div style="color:#6b9fc0;font-size:10px;margin-top:5px;border-top:1px solid #2a3a4a;padding-top:4px">📜 ' + d.hist + '</div>' : '</table>')
        + (d.strat ? '<div style="color:#f87171;font-size:10px;margin-top:3px">⚔️ ' + d.strat + '</div>' : '');
    } else {
      if (d.annual_count > 0) {
        popup += '<tr><td style="color:#888;padding:1px 4px 1px 0">추정 개체수</td><td style="font-weight:600;color:#4ade80">~' + (d.annual_count||0).toLocaleString() + '</td></tr>';
      }
      popup += '</table>' + (d.description ? '<div style="color:#6b9fc0;font-size:10px;margin-top:5px;border-top:1px solid #2a3a4a;padding-top:4px">📜 ' + d.description + '</div>' : '');
    }
    popup += '<div style="margin-top:7px;text-align:right;display:flex;gap:5px;justify-content:flex-end"><button class="resource-edit-btn" onclick="rcOpenMarkerEdit(\'' + d._id + '\')" style="padding:2px 9px;background:#1a4a7a;border:none;border-radius:4px;color:#90c0f0;font-size:11px;cursor:pointer;">✏️ 편집</button><button class="resource-edit-btn" onclick="rcDeleteMarker(\'' + d._id + '\',\'resources\')" style="padding:2px 9px;background:#5a2020;border:none;border-radius:4px;color:#f08080;font-size:11px;cursor:pointer;">삭제</button></div>';
    popup += '</div>';
    return popup;
  }

  function buildLayer() {
    _layer = L.layerGroup();
    _data.forEach(function(d) {
      L.marker([d.lat, d.lng], { icon: makeAnimalIcon(d) })
        .bindPopup(makePopup(d))
        .addTo(_layer);
    });
  }

  function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  }

  async function loadData() {
    if (_loaded) return true;
    if (_busy)   return false;
    _busy = true;
    try {
      var r = await fetch('/api/resources?type=horse,buffalo,monkey,camel', { headers: { 'Authorization': 'Bearer ' + getToken() } });
      _data = await r.json();
      buildLayer();
      _loaded = true;
      console.log('[동물서식지] ' + _data.length + '개 로드');
    } catch(e) {
      console.error('[동물서식지] 로드 오류:', e);
      _busy = false;
      return false;
    }
    _busy = false;
    return true;
  }

  function getMap() { return window.map || null; }

  window.toggleHorse = async function(btn) {
    var m = getMap();
    if (!m || !await loadData()) return;
    _on = !_on;
    if (_on) {
      _layer.addTo(m);
      if (btn) { btn.classList.add('active'); btn.textContent = '🐎동물서식지 ●'; }
      var cb = document.getElementById('menu-layer-horse');
      if (cb) cb.checked = true;
      window._resourceData = window._resourceData || {};
      var ANIMAL_EMOJI2 = { horse:'🐎', buffalo:'🐃', monkey:'🐒', camel:'🐪' };
      window._resourceData.horse = _data.map(function(d){ return Object.assign({}, d, {_resType:'horse', _emoji: ANIMAL_EMOJI2[d.resource_type]||'🐾'}); });
    } else {
      m.removeLayer(_layer);
      if (btn) { btn.classList.remove('active'); btn.textContent = '🐎동물서식지'; }
      var cb = document.getElementById('menu-layer-horse');
      if (cb) cb.checked = false;
      if (window._resourceData) delete window._resourceData.horse;
    }
    if (window._refresh3dResources) window._refresh3dResources();
  };
})();

// ================================================================
// [SALT] 소금 산지 레이어
// ================================================================
(function() {
  var _data   = [];
  var _layer  = null;
  var _on     = false;
  var _loaded = false;
  var _busy   = false;

  function getMap() { return window.map || null; }

  var TYPE_EMOJI = { sea: '🧂', lake: '🧊', well: '🪣', land: '🏜️' };

  function tonToSize(t) {
    var MIN = 60000, MAX = 1200000, S_MIN = 10, S_MAX = 30;
    var r = Math.max(0, Math.min(1, (t - MIN) / (MAX - MIN)));
    return Math.round(S_MIN + r * (S_MAX - S_MIN));
  }

  function buildLayer() {
    var m = getMap();
    if (!m) return;
    if (_layer) { try { m.removeLayer(_layer); } catch(e){} }
    _layer = L.layerGroup();

    _data.forEach(function(d) {
      var coords = d.location && d.location.coordinates;
      if (!coords) return;
      var lat = coords[1], lng = coords[0];
      if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;

      var st    = d.salt_type || 'sea';
      var emoji = TYPE_EMOJI[st] || TYPE_EMOJI['sea'];
      var size  = tonToSize(d.annual_ton || 100000);

      var icon = L.divIcon({
        html: '<div style="font-size:' + size + 'px;line-height:1;'
            + 'filter:drop-shadow(0 1px 2px rgba(0,0,0,0.7));'
            + 'transform:translate(-50%,-50%)">' + emoji + '</div>',
        className: '',
        iconSize:   [1, 1],
        iconAnchor: [0, 0],
      });

      var typeLabel = { sea:'\ud574\uc5fc', lake:'\ud638\uc218\uc5fc', well:'\uc815\uc5fc', land:'\uc554\uc5fc' }[st] || st;
      var popup = '<div style="min-width:180px;font-size:12px">'
        + '<b style="font-size:13px">' + d.name + '</b><br>'
        + '<span style="color:#aaa;font-size:10px">' + (d.region||'') + '</span><br>'
        + '\uc885\ub958: ' + typeLabel + (d.major ? ' \u2605\uc8fc\uc694' : '') + '<br>'
        + '\uc5f0\uac04 \uc0dd\uc0b0(\uc0c1\ub300): ' + (d.annual_ton || 0).toLocaleString() + 't<br>'
        + (d.description ? '<div style="color:#6b9fc0;font-size:10px;margin-top:4px;border-top:1px solid #2a3a4a;padding-top:4px">📜 ' + d.description + '</div>' : '')
        + '<div style="margin-top:7px;text-align:right;display:flex;gap:5px;justify-content:flex-end"><button class="resource-edit-btn" onclick="rcOpenMarkerEdit(\'' + d._id + '\')" style="padding:2px 9px;background:#1a4a7a;border:none;border-radius:4px;color:#90c0f0;font-size:11px;cursor:pointer;">&#x270F;&#xFE0F; \ud3b8\uc9d1</button><button class="resource-edit-btn" onclick="rcDeleteMarker(\'' + d._id + '\',\'resources\')" style="padding:2px 9px;background:#5a2020;border:none;border-radius:4px;color:#f08080;font-size:11px;cursor:pointer;">\ud3b8\uc81c</button></div>'
        + '</div>';

      L.marker([lat, lng], { icon: icon }).bindPopup(popup).addTo(_layer);
    });
  }

  window.toggleSalt = async function(btn) {
    var m = getMap();
    console.log('[SALT] toggleSalt called, map=', !!m, '_loaded=', _loaded, '_on=', _on);
    if (!m) { console.error('[SALT] map 없음'); return; }

    if (!_loaded && !_busy) {
      _busy = true;
      if (btn) btn.textContent = '\u23F3';
      try {
        var res = await fetch('/api/resources?type=salt', {
          headers: { 'Authorization': 'Bearer ' + (typeof getToken === 'function' ? getToken() : '') }
        });
        console.log('[SALT] fetch status=', res.status);
        _data   = await res.json();
        console.log('[SALT] data length=', _data.length, '첫번째=', _data[0] && _data[0].name);
        _loaded = true;
        buildLayer();
        console.log('[SALT] buildLayer done, _layer=', !!_layer);
      } catch(e) {
        console.error('[SALT] 오류:', e);
        if (btn) btn.textContent = 'salt err';
        _busy = false; return;
      }
      _busy = false;
    }

    _on = !_on;
    console.log('[SALT] _on ->', _on, '_layer=', !!_layer);
    if (_on) {
      if (_layer) _layer.addTo(m);
      if (btn) { btn.classList.add('active'); btn.textContent = '🧂 소금'; }
      var cb = document.getElementById('menu-layer-salt');
      if (cb) cb.checked = true;
      window._resourceData = window._resourceData || {};
      window._resourceData.salt = _data.map(function(d){
        var size = tonToSize(d.annual_ton || 100000);
        var st = d.salt_type || 'sea';
        var emoji = TYPE_EMOJI[st] || '🧂';
        return Object.assign({}, d, {_resType:'salt', _emoji: emoji, _boltSize: size});
      });
    } else {
      if (_layer) try { m.removeLayer(_layer); } catch(e){}
      if (btn) { btn.classList.remove('active'); btn.textContent = '🧂 소금'; }
      var cb = document.getElementById('menu-layer-salt');
      if (cb) cb.checked = false;
      if (window._resourceData) delete window._resourceData.salt;
    }
    if (window._refresh3dResources) window._refresh3dResources();
  };
})();

// [SILK] 비단 산지 레이어
// ================================================================
(function() {
  var _data   = [];
  var _layer  = null;
  var _on     = false;
  var _loaded = false;
  var _busy   = false;

  function getMap() { return window.map || null; }

  var SILK_IMG_URL = '/public/assets/ui/resource-silk.png';
  var SILK_SERICULTURE_IMG_URL = '/public/assets/ui/resource-sericulture.png';

  function boltToSize(b) {
    var MIN = 80000, MAX = 1200000, S_MIN = 10, S_MAX = 30;
    var r = Math.max(0, Math.min(1, (b - MIN) / (MAX - MIN)));
    return Math.round(S_MIN + r * (S_MAX - S_MIN));
  }

  function buildLayer() {
    var m = getMap();
    if (!m) return;
    if (_layer) { try { m.removeLayer(_layer); } catch(e){} }
    _layer = L.layerGroup();

    _data.forEach(function(d) {
      var coords = d.location && d.location.coordinates;
      if (!coords) return;
      var lat = coords[1], lng = coords[0];
      if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;

      var st   = d.silk_type || 'sericulture';
      var size = boltToSize(d.annual_bolt || 100000);
      var icon;

      if (st === 'sericulture') {
        // 양잠 — 전용 이미지
        icon = L.divIcon({
          html: '<img src="' + SILK_SERICULTURE_IMG_URL + '" style="width:' + size + 'px;height:' + size + 'px;'
              + 'object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.7));'
              + 'transform:translate(-50%,-50%);display:block;">',
          className: '', iconSize: [1, 1], iconAnchor: [0, 0],
        });
      } else if (st === 'weaving') {
        // 직조 — 비단 이미지
        icon = L.divIcon({
          html: '<img src="' + SILK_IMG_URL + '" style="width:' + size + 'px;height:' + size + 'px;'
              + 'object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.7));'
              + 'transform:translate(-50%,-50%);display:block;">',
          className: '', iconSize: [1, 1], iconAnchor: [0, 0],
        });
      } else {
        // 교역거점 — 🏺 이모지
        icon = L.divIcon({
          html: '<div style="font-size:' + size + 'px;line-height:1;'
              + 'filter:drop-shadow(0 1px 2px rgba(0,0,0,0.7));'
              + 'transform:translate(-50%,-50%)">🏺</div>',
          className: '', iconSize: [1, 1], iconAnchor: [0, 0],
        });
      }

      var typeLabel = { sericulture:'양잠', weaving:'직조', trade:'교역거점' }[st] || st;
      var popup = '<div style="min-width:180px;font-size:12px">'
        + '<b style="font-size:13px">' + d.name + '</b><br>'
        + '<span style="color:#aaa;font-size:10px">' + (d.region||'') + '</span><br>'
        + '종류: ' + typeLabel + (d.major ? ' ★주요' : '') + '<br>'
        + '연간 생산(상대): ' + (d.annual_bolt || 0).toLocaleString() + '필<br>'
        + (d.description ? '<div style="color:#6b9fc0;font-size:10px;margin-top:4px;border-top:1px solid #2a3a4a;padding-top:4px">📜 ' + d.description + '</div>' : '')
        + '<div style="margin-top:7px;text-align:right;display:flex;gap:5px;justify-content:flex-end"><button class="resource-edit-btn" onclick="rcOpenMarkerEdit(\'' + d._id + '\')" style="padding:2px 9px;background:#1a4a7a;border:none;border-radius:4px;color:#90c0f0;font-size:11px;cursor:pointer;">&#x270F;&#xFE0F; \ud3b8\uc9d1</button><button class="resource-edit-btn" onclick="rcDeleteMarker(\'' + d._id + '\',\'resources\')" style="padding:2px 9px;background:#5a2020;border:none;border-radius:4px;color:#f08080;font-size:11px;cursor:pointer;">\ud3b8\uc81c</button></div>'
        + '</div>';

      L.marker([lat, lng], { icon: icon }).bindPopup(popup).addTo(_layer);
    });
  }

  window.toggleSilk = async function(btn) {
    var m = getMap();
    if (!m) { console.error('[SILK] map 없음'); return; }

    if (!_loaded && !_busy) {
      _busy = true;
      if (btn) btn.textContent = '⏳';
      try {
        var res = await fetch('/api/resources?type=silk', {
          headers: { 'Authorization': 'Bearer ' + (typeof getToken === 'function' ? getToken() : '') }
        });
        _data   = await res.json();
        _loaded = true;
        buildLayer();
      } catch(e) {
        console.error('[SILK] 오류:', e);
        if (btn) btn.textContent = 'silk err';
        _busy = false; return;
      }
      _busy = false;
    }

    _on = !_on;
    if (_on) {
      if (_layer) _layer.addTo(m);
      if (btn) { btn.classList.add('active'); btn.textContent = '🧵비단'; }
      var cb = document.getElementById('menu-layer-silk');
      if (cb) cb.checked = true;
      window._resourceData = window._resourceData || {};
      window._resourceData.silk = _data.map(function(d){
        var st = d.silk_type || 'sericulture';
        var imgUrl = st === 'sericulture' ? SILK_SERICULTURE_IMG_URL : (st === 'weaving' ? SILK_IMG_URL : null);
        var size = boltToSize(d.annual_bolt || 100000);
        return Object.assign({}, d, {_resType:'silk', _emoji:'🧵', _imgUrl: imgUrl, _boltSize: size});
      });
    } else {
      if (_layer) try { m.removeLayer(_layer); } catch(e){}
      if (btn) { btn.classList.remove('active'); btn.textContent = '🧵비단'; }
      var cb = document.getElementById('menu-layer-silk');
      if (cb) cb.checked = false;
      if (window._resourceData) delete window._resourceData.silk;
    }
    if (window._refresh3dResources) window._refresh3dResources();
  };
})();


