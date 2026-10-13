(function() {
    'use strict';

    // 🚩 [추가] IIFE 스코프 내 JWT 파싱 헬퍼 (전역 parseJwt 미선언 대비)
    function parseJwt(t) {
        return typeof window.parseJwt === 'function' ? window.parseJwt(t) :
            (function(tk){ try { return JSON.parse(decodeURIComponent(atob(tk.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''))); } catch(e){ return null; } })(t);
    }

    const POLL_INTERVAL = 10000; // 채팅 포함이므로 10초 폴링

    const TYPE_CONFIG = {
        register:         { icon: '🎉' },
        submit:           { icon: '📋' },
        review:           { icon: '🔍' },
        review_reject:    { icon: '❌' },
        approve:          { icon: '🏆' },
        comment:          { icon: '💬' },
        rankup:           { icon: '⭐' },
        checkin:          { icon: '🏛️' },
        checkout:         { icon: '🌙' },
        guest_enter:      { icon: '🧳' },
        chat:             { icon: '💬' },
        notice:           { icon: '📢' },
        territory_create: { icon: '🗺️' },
        territory_update: { icon: '🗺️' },
        castle_create:    { icon: '🏯' },
        hero_create:      { icon: '👤' },
    };

    function e(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function buildMessage(log) {
        const actorName = log.actor || '알 수 없음';
        const actor  = log.actor
            ? `<a class="af-actor" href="/mypage.html?id=${encodeURIComponent(actorName)}" target="_blank" rel="opener" title="${e(actorName)} 사관 페이지">${e(actorName)}</a>`
            : `<span class="af-actor">${e(actorName)}</span>`;
        const pos    = log.actorPosition
            ? `<span style="color:rgba(205,182,144,0.78);font-size:10px;">[${e(log.actorPosition)}]</span> `
            : '';
        const extra  = log.extra || {};

        // 지명 링크: castle_id가 있으면 클릭 가능한 링크로, 없으면 일반 span
        const castleId = extra.castle_id || null;
        const target = log.targetName
            ? (castleId
                ? `<span class="af-target af-target-link" data-castle-id="${e(castleId)}">${e(log.targetName)}</span>`
                : `<span class="af-target">${e(log.targetName)}</span>`)
            : '';

        // 카테고리 한글 변환
        const CATEGORY_LABEL = {
            'historical_site': '역사유적',
            'historical_record': '사관기록',
            'natural_feature': '자연지형',
            'battle': '전투',
            'capital': '도읍',
            'geography': '지리',
            'hero': '인물',
        };
        const catLabel = extra.category ? (CATEGORY_LABEL[extra.category] || extra.category) : null;
        const catBadge = catLabel
            ? `<span style="font-size:9px;color:rgba(180,210,255,0.85);background:rgba(80,120,200,0.2);border-radius:3px;padding:0 4px;margin-left:3px;">${e(catLabel)}</span>`
            : '';

        // 검토 의견 (있을 경우)
        const renderedComment = window.renderEntityLinkTokens
            ? window.renderEntityLinkTokens(extra.comment || '')
            : e(extra.comment || '');
        const commentTxt = extra.comment
            ? `<div style="font-size:9.5px;color:rgba(220,200,160,0.85);margin-top:2px;padding-left:14px;font-style:italic;">"${renderedComment}"</div>`
            : '';

        switch (log.type) {
            case 'register':
                return `${pos}${actor} 사관으로 임관하셨습니다. 🎊`;
            case 'submit':
                return `${pos}${actor}님이 ${target ? target + ' ' : ''}기록을 제출하셨습니다.${catBadge}`;
            case 'review':
                return `${pos}${actor}님이 ${target ? target + ' ' : ''}검토를 완료하셨습니다.${catBadge}${commentTxt}`;
            case 'review_reject':
                return `${pos}${actor}님이 ${target ? target + ' ' : ''}기록을 <span style="color:#ff9980;">반려</span>하셨습니다.${catBadge}${commentTxt}`;
            case 'approve':
                if (extra.isNew === false) {
                    return `${pos}${actor}님이 ${target ? target + '의 ' : ''}검토를 승인하셨습니다.${catBadge}`;
                }
                return `${pos}${actor}님이 ${target ? target + '의 ' : ''}<span class="af-restore">복원에 성공</span>하셨습니다! 🎉${catBadge}`;
            case 'comment':
                return `${pos}${actor}님이 ${target ? target + '에 ' : ''}의견을 등록하셨습니다.`;
            case 'rankup': {
                const np = extra.newPosition ? extra.newPosition : (log.actorPosition || '');
                return `${pos}${actor}님이 <span class="af-special">${e(np)}</span>으로 승급하셨습니다! 🎊`;
            }
            case 'checkin': {
                const pts = extra.points ? extra.points : 0;
                const ptsTxt = pts > 0 ? ` 공적 <span class="af-restore">+${pts}점</span>` : '';
                return `${pos}${actor} 사관님께서 <span class="af-special">등청</span>하셨습니다.${ptsTxt}`;
            }
            case 'checkout':
                return `${pos}${actor} 사관님께서 <span class="af-special">퇴청</span>하셨습니다.`;
            case 'guest_enter':
                return `${pos}${actor}이 <span class="af-special">활동을 시작합니다.</span> 🧳`;
            case 'territory_create': {
                const cnt = extra.count || 1;
                if (target) {
                    return `${pos}${actor}님이 <span class="af-target">${e(log.targetName)}</span>을 <span class="af-restore">생성</span>하셨습니다. 🗺️`;
                }
                return `${pos}${actor}님이 지역 <span class="af-restore">${cnt}개</span>를 생성하셨습니다. 🗺️`;
            }
            case 'territory_update': {
                const cnt = extra.count || 1;
                if (target) {
                    return `${pos}${actor}님이 <span class="af-target">${e(log.targetName)}</span>을 <span class="af-special">수정</span>하셨습니다. 🗺️`;
                }
                return `${pos}${actor}님이 지역 <span class="af-special">${cnt}개</span>를 수정하셨습니다. 🗺️`;
            }
            case 'castle_create': {
                if (target) {
                    return `${pos}${actor}님이 ${target}을 <span class="af-restore">생성</span>하셨습니다.${catBadge} 🏯`;
                }
                return `${pos}${actor}님이 새 오브젝트를 <span class="af-restore">생성</span>하셨습니다.${catBadge} 🏯`;
            }
            case 'castle_update': {
                if (target) {
                    return `${pos}${actor}님이 ${target}을 <span class="af-special">수정</span>하셨습니다.${catBadge} 🏯`;
                }
                return `${pos}${actor}님이 지도 오브젝트를 <span class="af-special">수정</span>하셨습니다.${catBadge} 🏯`;
            }
            case 'hero_create': {
                if (target) {
                    return `${pos}${actor}님이 ${target}을 <span class="af-restore">생성</span>하셨습니다.${catBadge} 👤`;
                }
                return `${pos}${actor}님이 새 인물을 <span class="af-restore">생성</span>하셨습니다.${catBadge} 👤`;
            }
            default:
                return `${pos}${actor}님의 활동이 기록되었습니다.`;
        }
    }

    function _isAdminUser() {
        try {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            const payload = (typeof currentUser !== 'undefined' && currentUser)
                ? currentUser
                : (token ? parseJwt(token) : null);
            return !!payload && (payload.role === 'admin' || payload.role === 'superuser');
        } catch { return false; }
    }

    function relativeTime(dateStr) {
        const d = new Date(dateStr);
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const isSameDay = d.getFullYear() === now.getFullYear()
            && d.getMonth() === now.getMonth()
            && d.getDate() === now.getDate();
        if (isSameDay) {
            return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        return `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function renderNoticeTicker(logs) {
        const ticker = document.getElementById('activity-notice-ticker');
        const track = document.getElementById('activity-notice-ticker-track');
        if (!ticker || !track) return;
        const notices = (Array.isArray(logs) ? logs : [])
            .filter(log => log && log.type === 'notice' && log.extra && log.extra.text);
        if (!notices.length) {
            ticker.style.display = 'none';
            ticker.dataset.signature = '';
            track.textContent = '';
            return;
        }
        const signature = notices.map(log => String(log._id || '')).join('|');
        if (sessionStorage.getItem('_dismissedNoticeTickerSignature') === signature) {
            ticker.style.display = 'none';
            ticker.dataset.signature = signature;
            return;
        }
        ticker.style.display = 'flex';
        if (ticker.dataset.signature === signature) return;
        const noticeText = notices.map(log => String(log.extra.text).trim()).join('   ◆   ');
        ticker.dataset.signature = signature;
        track.innerHTML = window.renderEntityLinkTokens ? window.renderEntityLinkTokens(noticeText) : e(noticeText);
        track.style.animationDuration = `${Math.min(90, Math.max(18, 12 + noticeText.length * 0.18))}s`;
    }

    document.getElementById('activity-notice-ticker-close')?.addEventListener('click', () => {
        const ticker = document.getElementById('activity-notice-ticker');
        if (!ticker) return;
        if (ticker.dataset.signature) {
            sessionStorage.setItem('_dismissedNoticeTickerSignature', ticker.dataset.signature);
        }
        ticker.style.display = 'none';
    });

    function renderLogs(logs) {
        renderNoticeTicker(logs);
        const list = document.getElementById('activity-feed-list');
        if (!list) return;
        if (!logs || logs.length === 0) {
            list.innerHTML = '<div class="af-empty">아직 기록된 활동이 없습니다.</div>';
            return;
        }
        // 서버는 최신순(-1 정렬)으로 줌 → 그대로 렌더하면 column-reverse에 의해 최신이 아래에 표시됨
        list.innerHTML = logs.map(log => {
            if (log.type === 'notice') {
                const rawText = (log.extra && log.extra.text) ? log.extra.text : '';
                const text = window.renderEntityLinkTokens ? window.renderEntityLinkTokens(rawText) : e(rawText);
                const isAdmin = _isAdminUser();
                const delBtn = isAdmin
                    ? `<button class="af-notice-del" data-notice-id="${e(String(log._id))}" title="공지 삭제">&times;</button>`
                    : '';
                return `<div class="af-item af-notice">
                    <span class="af-icon">📢</span>
                    <span class="af-notice-text">${text}</span>
                    <span class="af-time">${relativeTime(log.createdAt)}</span>
                    ${delBtn}
                </div>`;
            }
            if (log.type === 'chat') {
                const chatActorName = log.actor || '?';
                const actor = log.actor
                    ? `<a class="af-actor" href="/mypage.html?id=${encodeURIComponent(chatActorName)}" target="_blank" rel="opener">${e(chatActorName)}</a>`
                    : `<span class="af-actor">?</span>`;
                const pos   = log.actorPosition
                    ? `<span style="color:rgba(205,182,144,0.78);font-size:9px;">[${e(log.actorPosition)}]</span> `
                    : '';
                const rawText = (log.extra && log.extra.text) ? log.extra.text : '';
                const text  = window.renderEntityLinkTokens ? window.renderEntityLinkTokens(rawText) : e(rawText);
                const privateIcon = log.extra?.private ? '🔒' : '💬';
                return `<div class="af-item af-chat">
                    <span class="af-icon">${privateIcon}</span>
                    <span class="af-chat-text">${pos}${actor}: ${text}</span>
                    <span class="af-time">${relativeTime(log.createdAt)}</span>
                </div>`;
            }
            const cfg = TYPE_CONFIG[log.type] || { icon: '📌' };
            // castle_id가 있으면 전체 항목을 클릭 가능하게 (comment 포함 모든 타입)
            const castleId = (log.extra && log.extra.castle_id) ? log.extra.castle_id : null;
            const clickableAttrs = castleId
                ? `data-clickable="1" data-castle-id="${castleId}" title="클릭하여 해당 장소 열기"`
                : '';
            return `<div class="af-item" ${clickableAttrs}>
                <span class="af-icon">${cfg.icon}</span>
                <span class="af-text">${buildMessage(log)}</span>
                <span class="af-time">${relativeTime(log.createdAt)}</span>
            </div>`;
        }).join('');
        // column-reverse 레이아웃에서 최신(맨 아래)이 보이도록 스크롤 맨 아래로
        const scroll = document.getElementById('activity-feed-scroll');
        if (scroll) scroll.scrollTop = scroll.scrollHeight;
    }

    async function fetchLogs() {
        try {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            // 일반 활동 100개와 별도로 최근 채팅 100개를 조회한다.
            const resp = await fetch('/api/activity-logs?limit=100&chatLimit=100', {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!resp.ok) return;
            const logs = await resp.json();
            if (!Array.isArray(logs)) return;
            renderLogs(logs);
        } catch (e) { /* 무시 */ }
    }

    // 채팅 전송
    async function sendChat(text) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) { alert('로그인 후 채팅 가능합니다.'); return; }
        try {
            const resp = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ message: text })
            });
            if (resp.ok) {
                await fetchLogs(); // 즉시 갱신
            } else {
                // Content-Type이 JSON인 경우만 파싱, 아니면 status 코드로 처리
                const ct = resp.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                    const d = await resp.json();
                    alert(d.message || `전송 실패 (${resp.status})`);
                } else {
                    alert(`전송 실패 (${resp.status})`);
                }
            }
        } catch(err) {
            console.warn('채팅 전송 오류:', err);
            alert('전송 중 오류가 발생했습니다.');
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        // 상단 손잡이를 위아래로 끌어 활동 소식 패널 높이를 조절한다.
        const activityPanel = document.getElementById('activity-feed-panel');
        const activityResizeHandle = document.getElementById('activity-feed-resize-handle');
        const activityHeightKey = 'koreamanri-activity-feed-height';
        const clampActivityHeight = value => Math.round(Math.min(
            Math.max(120, window.innerHeight - 140),
            Math.max(120, Number(value) || 180)
        ));
        const setActivityHeight = (value, persist = true) => {
            if (!activityPanel) return;
            const height = clampActivityHeight(value);
            activityPanel.style.height = `${height}px`;
            if (persist) localStorage.setItem(activityHeightKey, String(height));
        };
        setActivityHeight(localStorage.getItem(activityHeightKey) || 180, false);
        if (activityResizeHandle && activityPanel) {
            let resizeStartY = 0;
            let resizeStartHeight = 0;
            activityResizeHandle.addEventListener('pointerdown', event => {
                resizeStartY = event.clientY;
                resizeStartHeight = activityPanel.getBoundingClientRect().height;
                activityResizeHandle.setPointerCapture(event.pointerId);
                activityResizeHandle.classList.add('is-resizing');
                activityPanel.classList.add('is-resizing');
                event.preventDefault();
            });
            activityResizeHandle.addEventListener('pointermove', event => {
                if (!activityResizeHandle.hasPointerCapture(event.pointerId)) return;
                setActivityHeight(resizeStartHeight + resizeStartY - event.clientY, false);
            });
            const finishActivityResize = event => {
                if (activityResizeHandle.hasPointerCapture(event.pointerId)) activityResizeHandle.releasePointerCapture(event.pointerId);
                activityResizeHandle.classList.remove('is-resizing');
                activityPanel.classList.remove('is-resizing');
                setActivityHeight(activityPanel.getBoundingClientRect().height, true);
            };
            activityResizeHandle.addEventListener('pointerup', finishActivityResize);
            activityResizeHandle.addEventListener('pointercancel', finishActivityResize);
            activityResizeHandle.addEventListener('dblclick', () => setActivityHeight(180, true));
            window.addEventListener('resize', () => setActivityHeight(activityPanel.getBoundingClientRect().height, false));
        }

        fetchLogs();
        setInterval(fetchLogs, POLL_INTERVAL);

        // 활동 피드 클릭 이벤트 위임 (항목 전체 클릭 or 지명 링크 클릭 → 마커 이동)
        const feedScroll = document.getElementById('activity-feed-scroll');
        if (feedScroll) {
            feedScroll.addEventListener('click', function(e) {
                // 지명 링크(.af-target-link) 직접 클릭: 버블링 막고 해당 마커만 열기
                const targetLink = e.target.closest('.af-target-link[data-castle-id]');
                if (targetLink) {
                    e.stopPropagation();
                    _openFeedMarker(targetLink.dataset.castleId);
                    return;
                }
                // 항목 전체 클릭 (data-castle-id 있는 af-item)
                const item = e.target.closest('.af-item[data-castle-id]');
                if (!item) return;
                _openFeedMarker(item.dataset.castleId);
            });
        }

        async function _openFeedMarker(castleId) {
            // 1) 현재 렌더링된 마커에서 먼저 찾기
            const markerArr = (typeof allCastleMarkers !== 'undefined') ? allCastleMarkers : [];
            const m = markerArr.find(x => x && x._castleData && String(x._castleData._id) === castleId);
            if (m) {
                m.fire('click');
                return;
            }

            // 2) 렌더링되지 않은 경우 — 서버에서 직접 castle 정보를 가져와 패널 열기
            try {
                const tok = localStorage.getItem('token') || sessionStorage.getItem('token');
                const res = await fetch(`/api/castle/${castleId}`, {
                    headers: tok ? { 'Authorization': `Bearer ${tok}` } : {}
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const castle = await res.json();

                // 지도를 해당 위치로 이동
                if (typeof map !== 'undefined' && castle.lat != null && castle.lng != null) {
                    map.flyTo([castle.lat, castle.lng], Math.max(map.getZoom(), 8));
                }

                // 현재 슬라이더 연도의 history record 찾기
                let activeHistoryRecord = null;
                if (typeof getActiveHistoryInfo === 'function' && typeof yearMonthToTotalMonths === 'function') {
                    const yr = parseInt(document.getElementById('yearInput')?.value) || 400;
                    const mo = parseInt(document.getElementById('monthInput')?.value) || 1;
                    const totalMonths = yearMonthToTotalMonths(yr, mo);
                    activeHistoryRecord = getActiveHistoryInfo(castle.history || [], totalMonths);
                } else if (castle.history && castle.history.length > 0) {
                    activeHistoryRecord = castle.history[castle.history.length - 1];
                }

                // 국가 정보 찾기
                let countryInfo = null;
                const cArr = (typeof countries !== 'undefined') ? countries : [];
                if (activeHistoryRecord && activeHistoryRecord.country_id) {
                    countryInfo = cArr.find(c => String(c._id) === String(activeHistoryRecord.country_id)) || null;
                }

                // ODP 패널 열기
                if (typeof openDetailPanel === 'function') {
                    openDetailPanel(castle, activeHistoryRecord, countryInfo);
                } else {
                    alert('해당 마커를 현재 지도에서 찾을 수 없습니다.\n(지도 시간대를 이동하거나 페이지를 새로고침해 주세요.)');
                }
            } catch (err) {
                console.warn('[feed] _openFeedMarker 오류:', err);
                alert('해당 장소 정보를 불러올 수 없습니다.');
            }
        }

        // 로그인 여부에 따라 채팅 입력창 / 공지 입력창 표시
        function updateChatFormVisibility() {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            const chatForm = document.getElementById('activity-chat-form');
            if (chatForm) {
                if (!token) chatForm.style.display = 'none';
                else {
                    const payload = parseJwt(token);
                    chatForm.style.display = (payload && payload.isGuest) ? 'none' : '';
                }
            }
            // 공지 입력창: admin/superuser에게만 표시
            const noticeForm = document.getElementById('activity-notice-form');
            if (noticeForm) noticeForm.style.display = _isAdminUser() ? '' : 'none';
        }
        updateChatFormVisibility();
        // storage 이벤트 감지 (다른 탭 로그인/아웃)
        window.addEventListener('storage', updateChatFormVisibility);
        // 주기적으로도 체크 (같은 탭 내 로그인)
        setInterval(updateChatFormVisibility, 3000);

        // 공지 전송
        async function sendNotice(text) {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            if (!token) return;
            try {
                const resp = await fetch('/api/notice', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ message: text })
                });
                if (resp.ok) {
                    await fetchLogs();
                } else {
                    const ct = resp.headers.get('content-type') || '';
                    const d = ct.includes('application/json') ? await resp.json() : {};
                    alert(d.message || `공지 등록 실패 (${resp.status})`);
                }
            } catch (err) {
                console.warn('공지 전송 오류:', err);
                alert('공지 전송 중 오류가 발생했습니다.');
            }
        }

        const noticeSendBtn = document.getElementById('activity-notice-send');
        const noticeInput   = document.getElementById('activity-notice-input');
        async function doSendNotice() {
            const text = (window.serializeEntityMentionsForField
                ? window.serializeEntityMentionsForField(noticeInput)
                : noticeInput?.value)?.trim();
            if (!text) return;
            noticeInput.value = '';
            noticeInput.disabled = true;
            if (noticeSendBtn) noticeSendBtn.disabled = true;
            await sendNotice(text);
            noticeInput.disabled = false;
            if (noticeSendBtn) noticeSendBtn.disabled = false;
            noticeInput.focus();
        }
        if (noticeSendBtn) noticeSendBtn.addEventListener('click', doSendNotice);
        if (noticeInput) {
            noticeInput.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); doSendNotice(); }
            });
        }

        // 공지 삭제 (×버튼 — 이벤트 위임)
        const feedList = document.getElementById('activity-feed-list');
        if (feedList) {
            feedList.addEventListener('click', async function(ev) {
                const delBtn = ev.target.closest('.af-notice-del[data-notice-id]');
                if (!delBtn) return;
                ev.stopPropagation();
                if (!confirm('이 공지를 삭제하시겠습니까?')) return;
                const id = delBtn.dataset.noticeId;
                const token = localStorage.getItem('token') || sessionStorage.getItem('token');
                try {
                    const resp = await fetch(`/api/notice/${id}`, {
                        method: 'DELETE',
                        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                    });
                    if (resp.ok) await fetchLogs();
                    else alert('공지 삭제 실패');
                } catch (err) { alert('공지 삭제 중 오류'); }
            });
        }

        // 전송 버튼
        const sendBtn = document.getElementById('activity-chat-send');
        const chatInput = document.getElementById('activity-chat-input');
        async function doSend() {
            const text = (window.serializeEntityMentionsForField
                ? window.serializeEntityMentionsForField(chatInput)
                : chatInput?.value)?.trim();
            if (!text) return;
            chatInput.value = '';
            chatInput.disabled = true;
            if (sendBtn) sendBtn.disabled = true;
            await sendChat(text);
            chatInput.disabled = false;
            if (sendBtn) sendBtn.disabled = false;
            chatInput.focus();
        }
        if (sendBtn) sendBtn.addEventListener('click', doSend);
        if (chatInput) {
            chatInput.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); doSend(); }
            });
        }

        // ✕ 닫기 버튼
        const closeBtn = document.getElementById('activity-feed-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                const panel = document.getElementById('activity-feed-panel');
                if (panel) panel.style.display = 'none';
                const cb = document.getElementById('menu-layer-activity-feed');
                if (cb) { cb.checked = false; cb.dispatchEvent(new Event('change')); }
            });
        }

    });

    window.refreshActivityFeed = function() { fetchLogs(); };

    // 🍞 전역 토스트 알림
    window.showToast = function(msg, type = 'info', duration = 2800) {
        const colors = { success: '#4caf82', info: '#7ab8cc', warn: '#c8a84b', point: '#d4af37' };
        const bg = colors[type] || colors.info;
        const el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);
            background:${bg};color:#0e0c08;font-size:14px;font-weight:700;
            padding:10px 22px;border-radius:24px;box-shadow:0 4px 18px rgba(0,0,0,0.45);
            z-index:99999;opacity:0;transition:opacity 0.25s,transform 0.25s;pointer-events:none;white-space:nowrap;`;
        document.body.appendChild(el);
        requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateX(-50%) translateY(0)'; });
        setTimeout(() => {
            el.style.opacity = '0'; el.style.transform = 'translateX(-50%) translateY(10px)';
            setTimeout(() => el.remove(), 280);
        }, duration);
    };
})();
