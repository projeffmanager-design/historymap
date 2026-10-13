(function() {
    'use strict';

    let _captionRAF = null;       // requestAnimationFrame ID
    let _captionScrollY = 0;      // 현재 렌더 위치 (lerp 적용)
    let _captionTargetY = 0;      // 목표 스크롤 위치
    let _captionScrollSpeed = 0.2; // px/frame (목표가 증가하는 속도)
    let _captionActive = false;
    let _captionPaused = false;

    // 자막 패널 표시 여부 (레이어 컨트롤에서 제어 가능하도록 전역 노출)
    window._historyCaptionVisible = false; // 기본 OFF

    function getCaptionPanel() { return document.getElementById('history-caption-panel'); }
    function getCaptionInner() { return document.getElementById('history-caption-inner'); }

    // ── 한자 비율 체크: 한자가 50% 이상이면 true (한문 전용 텍스트) ──
    function isChineseOnly(text) {
        if (!text) return true;
        const chineseChars = (text.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g) || []).length;
        const totalChars = text.replace(/\s/g, '').length;
        return totalChars > 0 && (chineseChars / totalChars) > 0.5;
    }

    // ── 중국 정사(25사) + 중국 선진·편년 출처 목록 — 자막에서 제외 ──
    const CAPTION_EXCLUDE_SOURCES = new Set([
        // 선진·편년·유서
        '관자(管子)', '전국책(戰國策)', '죽서기년(竹書紀年)',
        '자치통감(資治通鑑)', '통전(通典)', '당회요(唐會要)',
        '책부원귀(册府元龜)', '태평어람(太平御覽)', '오대회요(五代會要)',
        '五代會要', '天地瑞祥志', '太平廣記',
        // 중국 정사 25사
        '사기(史記)', '한서(漢書)', '후한서(後漢書)', '삼국지(三國志)',
        '진서(晉書)', '송서(宋書)', '남제서(南齊書)', '양서(梁書)',
        '진서(陳書)', '위서(魏書)', '북제서(北齊書)', '주서(周書)',
        '수서(隋書)', '남사(南史)', '북사(北史)',
        '구당서(舊唐書)', '신당서(新唐書)',
        '구오대사(舊五代史)', '신오대사(新五代史)',
        '송사(宋史)', '요사(遼史)', '금사(金史)', '원사(元史)', '명사(明史)',
    ]);

    // ── 텍스트 수집: 한국어 내용만 추출 (한자 50% 이상 제외) ──
    function buildCaptionLines(year, historyRecords, sourceRecords) {
        const lines = [];

        // 연도 헤더
        const yearLabel = year <= 0
            ? `기원전 ${Math.abs(year)}년`
            : `서기 ${year}년`;
        lines.push({ type: 'year', text: yearLabel });

        // history 기록 — 한국어만
        historyRecords.forEach(r => {
            if (r.event_name && !isChineseOnly(r.event_name))
                lines.push({ type: 'title', text: r.event_name });
            if (r.records?.korean?.content && !isChineseOnly(r.records.korean.content))
                lines.push({ type: 'body', text: r.records.korean.content });
        });

        // source_records — 중국 25사·중국 편년 제외, chinese_original 제외, 한자 50% 이상 제외
        sourceRecords.forEach(r => {
            if (r.content_type === 'chinese_original') return;
            if (CAPTION_EXCLUDE_SOURCES.has(r.source)) return; // ← 중국 25사 제외
            if (r.title && !isChineseOnly(r.title))
                lines.push({ type: 'title', text: r.title });
            if (r.content && !isChineseOnly(r.content))
                lines.push({ type: 'body', text: r.content });
        });

        return lines;
    }

    // ── DOM 빌드 ──
    function buildCaptionDOM(lines) {
        const inner = getCaptionInner();
        if (!inner) return;
        inner.innerHTML = '';

        lines.forEach(line => {
            const el = document.createElement('div');
            if (line.type === 'year') {
                el.className = 'history-caption-year';
                el.textContent = '── ' + line.text + ' ──';
            } else if (line.type === 'title') {
                el.className = 'history-caption-item';
                el.style.fontWeight = 'bold';
                el.style.fontSize = '15px';
                el.textContent = line.text;
            } else {
                el.className = 'history-caption-item';
                // 3줄씩 끊기: 긴 내용은 줄바꿈
                const maxLen = 60;
                if (line.text.length > maxLen) {
                    // 문장 단위로 자르기
                    const chunks = [];
                    let remaining = line.text;
                    while (remaining.length > maxLen) {
                        // 마침표/쉼표 기준으로 자르기
                        let cut = remaining.lastIndexOf('。', maxLen);
                        if (cut < 20) cut = remaining.lastIndexOf(',', maxLen);
                        if (cut < 20) cut = remaining.lastIndexOf(' ', maxLen);
                        if (cut < 20) cut = maxLen;
                        chunks.push(remaining.slice(0, cut + 1).trim());
                        remaining = remaining.slice(cut + 1).trim();
                    }
                    if (remaining) chunks.push(remaining);
                    el.textContent = chunks.join('\n');
                } else {
                    el.textContent = line.text;
                }
            }
            inner.appendChild(el);
        });

        // 맨 아래에 여백용 빈 블록 추가 (끝까지 스크롤되도록)
        const spacer = document.createElement('div');
        spacer.style.height = '80px';
        inner.appendChild(spacer);
    }

    // ── 스크롤 애니메이션 ──
    function startScroll() {
        if (_captionRAF) cancelAnimationFrame(_captionRAF);
        _captionScrollY = 0;
        _captionTargetY = 0;
        _captionActive = true;

        const inner = getCaptionInner();
        const panel = getCaptionPanel();
        if (!inner || !panel) return;

        // 총 스크롤 가능 거리 (빌드 직후라 scrollHeight가 아직 0일 수 있어 rAF 1회 후 갱신)
        let totalH = inner.scrollHeight;
        const viewH = panel.clientHeight || 120;
        const fadeTop = 36;    // 상단 fade 구간 (px) — 강하게
        const fadeBot = 36;    // 하단 fade 구간 (px) — 강하게

        function applyFade() {
            const items = inner.querySelectorAll('.history-caption-item, .history-caption-year');
            const isYearEl = el => el.classList.contains('history-caption-year');
            items.forEach(item => {
                const itemTop    = item.offsetTop - _captionScrollY;
                const itemBottom = itemTop + item.offsetHeight;

                // 상단 fade (3차 곡선 — 급격히 사라짐)
                let aTop = 1;
                if (itemBottom <= 0) {
                    aTop = 0;
                } else if (itemTop < fadeTop) {
                    const t = Math.max(0, Math.min(1, itemBottom / fadeTop));
                    aTop = t * t * t; // 3차
                }

                // 하단 fade (아이템이 viewH 근처에서 사라짐)
                let aBot = 1;
                const distFromBottom = viewH - itemTop;
                if (distFromBottom < fadeBot && distFromBottom >= 0) {
                    const t = Math.max(0, Math.min(1, distFromBottom / fadeBot));
                    aBot = t * t * t; // 3차
                } else if (distFromBottom < 0) {
                    aBot = 0;
                }

                const a = Math.min(aTop, aBot);
                if (isYearEl(item)) {
                    item.style.color       = `rgba(220,200,160,${a.toFixed(3)})`;
                    item.style.textShadow  = `0 0 6px rgba(0,0,0,${a.toFixed(3)}), 0 0 10px rgba(0,0,0,${(a*0.8).toFixed(3)})`;
                } else {
                    item.style.color       = `rgba(255,255,255,${a.toFixed(3)})`;
                    item.style.textShadow  = `0 0 6px rgba(0,0,0,${a.toFixed(3)}), 0 0 12px rgba(0,0,0,${(a*0.9).toFixed(3)}), 0 2px 4px rgba(0,0,0,${(a*0.8).toFixed(3)})`;
                }
            });
        }

        function tick() {
            if (!_captionActive) return;
            if (!_captionPaused) {
                totalH = inner.scrollHeight; // 매 프레임 갱신 (초기 0 방지)
                const maxScroll = Math.max(0, totalH - viewH + 40);

                // 목표 위치를 조금씩 전진
                _captionTargetY += _captionScrollSpeed;

                // 끝에 도달 → 처음으로 순간 이동 (끊김 없이)
                if (_captionTargetY >= maxScroll) {
                    _captionTargetY = 0;
                    _captionScrollY = 0;
                }

                // lerp: 현재 위치가 목표를 부드럽게 따라감 (끊김 없는 easing)
                _captionScrollY += (_captionTargetY - _captionScrollY) * 0.05;

                inner.style.transform = `translateY(${-_captionScrollY.toFixed(2)}px)`;
                applyFade();
            }
            _captionRAF = requestAnimationFrame(tick);
        }
        _captionRAF = requestAnimationFrame(tick);
    }

    function stopScroll() {
        _captionActive = false;
        if (_captionRAF) {
            cancelAnimationFrame(_captionRAF);
            _captionRAF = null;
        }
    }

    // ── 외부에서 호출되는 메인 함수 ──
    window.updateHistoryCaption = function(year, historyRecords, sourceRecords) {
        const panel = getCaptionPanel();
        const inner = getCaptionInner();
        if (!panel || !inner) return;

        // layerVisibility가 존재하면 그것만을 기준으로 삼는다. OR 조건을 사용하면
        // 저장 설정이 false여도 fallback 기본값 때문에 자막이 다시 나타난다.
        const isVisible = typeof layerVisibility !== 'undefined'
            ? layerVisibility.captionPanel === true
            : window._historyCaptionVisible === true;
        if (!isVisible) {
            panel.style.display = 'none';
            stopScroll();
            return;
        }

        stopScroll();

        const lines = buildCaptionLines(year, historyRecords, sourceRecords);
        if (lines.length <= 1) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'flex';
        buildCaptionDOM(lines);

        // 빌드 후 레이아웃 계산을 위해 한 프레임 대기
        requestAnimationFrame(() => {
            const viewH = panel.clientHeight || 120;
            // 첫 줄이 패널 맨 아래에서 올라오도록 inner 상단에 viewH 패딩 추가
            const inner2 = getCaptionInner();
            if (inner2) inner2.style.paddingTop = viewH + 'px';
            inner.style.transform = 'translateY(0px)';
            startScroll();
        });
    };

    // ── 자막 표시/숨김 토글 ──
    window.toggleHistoryCaption = function(visible) {
        window._historyCaptionVisible = visible;
        // layerVisibility가 접근 가능하면 동기화
        if (typeof layerVisibility !== 'undefined') layerVisibility.captionPanel = visible;
        if (typeof persistBrowserPanelConfiguration === 'function') persistBrowserPanelConfiguration();
        const panel = getCaptionPanel();
        if (!panel) return;
        if (!visible) {
            panel.style.display = 'none';
            stopScroll();
        }
    };

})();

// =====================================================================
// 🖼️ castleForm 이미지 업로드 함수 (GitHub)
// =====================================================================
// =====================================================================
// 🔍 이미지 라이트박스
// =====================================================================
function openLightbox(src) {
    if (!src || src === window.location.href) return;
    const lb  = document.getElementById('img-lightbox');
    const img = document.getElementById('img-lightbox-img');
    if (!lb || !img) return;
    img.src = src;
    lb.classList.add('open');
    document.addEventListener('keydown', _lightboxKeyHandler);
}
function closeLightbox() {
    const lb = document.getElementById('img-lightbox');
    if (lb) lb.classList.remove('open');
    document.removeEventListener('keydown', _lightboxKeyHandler);
}
function _lightboxKeyHandler(e) { if (e.key === 'Escape') closeLightbox(); }

// =====================================================================
// 🖼️ 장수 사진 업로드 (파일 선택 + 붙여넣기)
// =====================================================================
async function uploadGeneralPhoto(fileArg) {
    const fileInput = document.getElementById('generalPhotoFile');
    const file = fileArg || (fileInput && fileInput.files[0]);
    const msgEl = document.getElementById('generalPhotoUploadMsg');
    const urlInput = document.getElementById('generalPhoto');
    if (!file) return alert('파일을 선택하거나 붙여넣으세요.');
    if (msgEl) { msgEl.style.display = 'block'; msgEl.style.color = '#7fcf9f'; msgEl.textContent = '업로드 중…'; }
    try {
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        const tok = localStorage.getItem('token') || sessionStorage.getItem('token');
        const res = await fetch('/api/admin/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
            body: JSON.stringify({ filename: file.name || 'general_photo.jpg', contentBase64: base64, mimeType: file.type || 'image/jpeg' })
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.message || '업로드 실패'); }
        const { url } = await res.json();
        if (urlInput) urlInput.value = url;
        if (msgEl) { msgEl.style.color = '#7fcf9f'; msgEl.textContent = '✅ 업로드 완료!'; }
        _previewGeneralPhoto(url);
        if (fileInput) fileInput.value = '';
    } catch (e) {
        if (msgEl) { msgEl.style.color = '#cf8080'; msgEl.textContent = '❌ ' + e.message; }
    }
}

function _previewGeneralPhoto(url) {
    url = url || document.getElementById('generalPhoto')?.value?.trim();
    const thumb    = document.getElementById('generalPhotoThumb');
    const thumbImg = document.getElementById('generalPhotoThumbImg');
    if (!url || !thumb || !thumbImg) return;
    thumbImg.src = url;
    thumb.style.display = '';
}

// 붙여넣기 영역에 paste 이벤트 연결 (DOM 준비 후)
document.addEventListener('DOMContentLoaded', function() {
    const pasteArea = document.getElementById('generalPhotoPasteArea');
    if (pasteArea) {
        pasteArea.addEventListener('paste', function(e) {
            const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        const msgEl = document.getElementById('generalPhotoUploadMsg');
                        if (msgEl) { msgEl.style.display = 'block'; msgEl.style.color = '#7fcf9f'; msgEl.textContent = '이미지 감지됨 — 업로드 중…'; }
                        uploadGeneralPhoto(file);
                    }
                    break;
                }
            }
        });
    }
});

async function uploadCastlePhoto(mode) {
    // mode: undefined → castlePhotoFile / 'natural' → naturalPhotoFile
    const fileInput = document.getElementById(mode === 'natural' ? 'naturalPhotoFile' : 'castlePhotoFile');
    const msgEl = document.getElementById('castlePhotoUploadMsg');
    const urlInput = document.getElementById(mode === 'natural' ? 'naturalPhotoProxy' : 'castlePhoto');
    if (!fileInput || !fileInput.files[0]) return alert('파일을 선택하세요.');
    const file = fileInput.files[0];
    if (msgEl) { msgEl.style.display = 'block'; msgEl.style.color = '#7fcf9f'; msgEl.textContent = '업로드 중…'; }
    try {
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        const tok = localStorage.getItem('token') || sessionStorage.getItem('token');
        const res = await fetch('/api/admin/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
            body: JSON.stringify({ filename: file.name, contentBase64: base64, mimeType: file.type })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || '업로드 실패');
        }
        const { url } = await res.json();
        if (urlInput) urlInput.value = url;
        document.getElementById('castlePhoto').value = url;
        if (msgEl) { msgEl.style.color = '#7fcf9f'; msgEl.textContent = '✅ 업로드 완료!'; }
        const thumb = document.getElementById('castlePhotoThumb');
        const thumbImg = document.getElementById('castlePhotoThumbImg');
        if (thumb && thumbImg) { thumbImg.src = url; thumb.style.display = ''; }
        if (fileInput) fileInput.value = '';
    } catch (e) {
        if (msgEl) { msgEl.style.color = '#cf8080'; msgEl.textContent = '❌ ' + e.message; }
    }
}

// URL 입력값을 서버 경유로 GitHub에 업로드 (403 외부 이미지 우회)
async function uploadCastlePhotoFromUrl() {
    const urlInput = document.getElementById('castlePhoto');
    const msgEl = document.getElementById('castlePhotoUploadMsg');
    const sourceUrl = urlInput?.value?.trim();
    if (!sourceUrl) return alert('이미지 URL을 먼저 입력하세요.');
    // 이미 raw.githubusercontent.com이면 그냥 사용
    if (sourceUrl.includes('raw.githubusercontent.com')) {
        _previewCastlePhoto();
        return;
    }
    if (msgEl) { msgEl.style.display = 'block'; msgEl.style.color = '#7fcf9f'; msgEl.textContent = '서버에서 이미지 가져오는 중…'; }
    try {
        const tok = localStorage.getItem('token') || sessionStorage.getItem('token');
        const ext = sourceUrl.split('?')[0].split('.').pop().toLowerCase().replace(/[^a-z]/g,'') || 'jpg';
        const res = await fetch('/api/admin/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
            body: JSON.stringify({ sourceUrl, filename: `image.${ext}` })
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.message || '업로드 실패'); }
        const { url } = await res.json();
        urlInput.value = url;
        if (msgEl) { msgEl.style.color = '#7fcf9f'; msgEl.textContent = '✅ GitHub에 저장 완료!'; }
        const thumb = document.getElementById('castlePhotoThumb');
        const thumbImg = document.getElementById('castlePhotoThumbImg');
        if (thumb && thumbImg) { thumbImg.src = url; thumb.style.display = ''; }
    } catch (e) {
        if (msgEl) { msgEl.style.color = '#cf8080'; msgEl.textContent = '❌ ' + e.message; }
    }
}

function _previewCastlePhoto() {
    const url = document.getElementById('castlePhoto').value.trim();
    const thumb = document.getElementById('castlePhotoThumb');
    const thumbImg = document.getElementById('castlePhotoThumbImg');
    if (!url) return;
    if (thumb && thumbImg) { thumbImg.src = url; thumb.style.display = url ? '' : 'none'; }
}

// =====================================================================
// 🎙️ castleForm 음성 관리 함수
// =====================================================================
let _castleFormVoiceId = null;

async function loadCastleVoiceSection(castleId) {
    const sec = document.getElementById('castleVoiceSection');
    const statusEl = document.getElementById('castleVoiceStatus');
    const playerEl = document.getElementById('castleVoicePlayer');
    const audioEl = document.getElementById('castleVoiceAudioEl');
    const delBtn = document.getElementById('castleVoiceDeleteBtn');
    const msgEl = document.getElementById('castleVoiceUploadMsg');
    if (!sec) return;
    sec.style.display = '';
    statusEl.textContent = '확인 중…';
    if (msgEl) { msgEl.style.display = 'none'; msgEl.textContent = ''; }
    if (playerEl) playerEl.style.display = 'none';
    if (delBtn) delBtn.style.display = 'none';
    _castleFormVoiceId = null;
    try {
        const res = await fetch(`/api/voice?id=${castleId}`);
        if (res.ok) {
            const data = await res.json();
            statusEl.textContent = '✅ 음성 등록됨';
            if (audioEl) audioEl.src = data.audio_url;
            if (playerEl) playerEl.style.display = '';
            if (delBtn) delBtn.style.display = 'inline-block';
            // voice doc _id 조회 (삭제용)
            const tok = localStorage.getItem('token') || sessionStorage.getItem('token');
            if (tok) {
                const allRes = await fetch('/api/admin/voice', { headers: { 'Authorization': `Bearer ${tok}` } });
                if (allRes.ok) {
                    const list = await allRes.json();
                    const found = list.find(v => v.castle_id === castleId);
                    if (found) _castleFormVoiceId = found._id;
                }
            }
        } else if (res.status === 404) {
            statusEl.textContent = '등록된 음성 없음';
        } else {
            statusEl.textContent = '조회 실패';
        }
    } catch {
        statusEl.textContent = '조회 실패';
    }
}

async function castleFormUploadVoice() {
    const castleId = editingCastleKey;
    const fileInput = document.getElementById('castleVoiceFile');
    const msgEl = document.getElementById('castleVoiceUploadMsg');
    if (!castleId) return alert('저장된 마커에서만 사용 가능합니다.');
    if (!fileInput || !fileInput.files[0]) return alert('파일을 선택하세요.');
    const file = fileInput.files[0];
    const tok = localStorage.getItem('token') || sessionStorage.getItem('token');
    msgEl.style.display = 'block';
    msgEl.style.color = '#7fcf9f';
    msgEl.textContent = '업로드 중…';
    try {
        // 파일을 base64로 읽어 서버에 전송 → 서버가 Vercel Blob에 업로드 (CORS 우회)
        const audioBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        const res = await fetch('/api/admin/voice/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
            body: JSON.stringify({
                castle_id: castleId,
                audioBase64,
                filename: file.name,
                contentType: file.type || 'audio/mpeg',
                speaker: '사관'
            })
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.message || '업로드 실패'); }
        msgEl.textContent = '✅ 등록 완료!';
        if (fileInput) fileInput.value = '';
        await loadCastleVoiceSection(castleId);
    } catch (e) {
        msgEl.style.color = '#cf8080';
        msgEl.textContent = '❌ ' + e.message;
    }
}

async function castleFormDeleteVoice() {
    if (!_castleFormVoiceId) return alert('음성 ID를 찾을 수 없습니다.');
    if (!confirm('이 음성을 삭제하시겠습니까?')) return;
    const tok = localStorage.getItem('token') || sessionStorage.getItem('token');
    const res = await fetch(`/api/admin/voice/${_castleFormVoiceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tok}` }
    });
    if (res.ok) {
        await loadCastleVoiceSection(editingCastleKey);
    } else {
        alert('삭제 실패');
    }
}
