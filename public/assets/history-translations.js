/* Article translations use the same contribution review and merit records. */
(() => {
    'use strict';
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[char]));
    let options = { getUser:() => null, getToken:() => '', onApplied:() => {} };
    const richText = value => window.EntityTagTools?.renderText(value) ?? esc(value);
    const isMember = () => Boolean(options.getUser() && !options.getUser().isGuest && options.getUser().username !== '서긍');
    const isAdmin = () => isMember() && ['admin', 'superuser'].includes(options.getUser().role);
    const isOwn = proposal => {
        if (!isMember()) return false;
        const user = options.getUser();
        const ids = [user._id, user.userId, user.id, user.sub].filter(Boolean).map(String);
        return ids.length && proposal.userId ? ids.includes(String(proposal.userId)) : user.username === proposal.username;
    };
    const applied = record => record.translation?.content
        ? `<div class="history-approved-translation"><strong>🌐 번역 · ${esc(record.translation.translator)} 사관</strong>${record.translation.contributionId && isOwn({ userId:record.translation.translatorId, username:record.translation.translator }) ? `<button type="button" class="history-translation-edit-applied" data-translation-action="edit-applied" data-edit-proposal-id="${esc(record.translation.contributionId)}">수정</button>` : ''}<div>${richText(record.translation.content)}</div>${record.translation.evidence?.trim() ? `<small class="history-approved-translation-evidence">번역 근거·참고 자료: ${richText(record.translation.evidence)}</small>` : ''}</div>` : '';
    const eligible = (record, type) => type === 'source' ? Boolean(record.content)
        : Boolean(record.comment || Object.values(record.records || {}).some(value => value?.content));
    function markup(record, type) {
        if (!eligible(record, type)) return '';
        return `<section class="history-translations" data-target-type="${esc(type)}" data-target-id="${esc(record._id)}">
            <div class="history-translation-applied">${applied(record)}</div>
            <button type="button" class="history-translation-toggle" aria-expanded="false">🌐 번역제안</button>
            <div class="history-translation-panel" hidden></div></section>`;
    }
    async function request(url, init = {}) {
        const response = await fetch(url, { cache:'no-store', ...init, headers:{
            ...(init.method ? { 'Content-Type':'application/json', Authorization:`Bearer ${options.getToken()}` } : {}),
            ...init.headers
        } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || '요청을 처리하지 못했습니다.');
        return data;
    }
    const identity = widget => ({ type:widget.dataset.targetType, id:widget.dataset.targetId });
    const query = widget => new URLSearchParams({ targetType:widget.dataset.targetType, targetId:widget.dataset.targetId });
    function resultBadge(record, type) {
        return `<span class="history-translation-result-badge" data-target-type="${esc(type)}" data-target-id="${esc(record._id)}" hidden></span>`;
    }
    function paintCount(element, total, pending) {
        const badge = element.classList.contains('history-translation-result-badge');
        const button = badge ? element : element.querySelector('.history-translation-toggle');
        if (!button) return;
        const count = Math.max(0, Number(total) || 0);
        const waiting = Math.max(0, Number(pending) || 0);
        button.innerHTML = `🌐 번역제안${count ? ` <span class="history-translation-count">${count}</span>` : ''}${waiting ? ' <span class="history-translation-new">NEW</span>' : ''}`;
        button.title = `번역 제안 ${count}건${waiting ? ` · 검토 대기 ${waiting}건` : ''}`;
        if (badge) button.hidden = !count;
    }
    function showPanel(widget) {
        const panel = widget.querySelector('.history-translation-panel');
        panel.hidden = false;
        widget.querySelector('.history-translation-toggle').setAttribute('aria-expanded', 'true');
        if (!panel.children.length) panel.innerHTML = '<div class="history-translation-list"></div>' + (isMember()
            ? '<button type="button" data-translation-action="compose" aria-expanded="false">새 번역 제안 작성</button><div class="history-translation-composer" hidden></div>'
            : '<p class="history-translation-note">로그인한 사관은 번역을 제안할 수 있습니다.</p>');
    }
    async function hydrate(root) {
        const elements = [...root.querySelectorAll('.history-translations, .history-translation-result-badge')]
            .filter(element => !element.dataset.translationCountLoaded);
        elements.forEach(element => { element.dataset.translationCountLoaded = 'loading'; });
        await Promise.all(['source', 'history'].flatMap(type => {
            const group = elements.filter(element => element.dataset.targetType === type);
            const ids = [...new Set(group.map(element => element.dataset.targetId))];
            const batches = [];
            for (let offset = 0; offset < ids.length; offset += 40) {
                const chunk = ids.slice(offset, offset + 40);
                batches.push((async () => {
                    try {
                        const params = new URLSearchParams({ targetType:type, ids:chunk.join(',') });
                        const data = await request(`/api/translation-proposals/counts?${params}`);
                        await Promise.all(group.filter(element => chunk.includes(element.dataset.targetId)).map(async element => {
                            if (!element.isConnected) return;
                            const count = data.counts[element.dataset.targetId] || { total:0, pending:0 };
                            element.dataset.translationCountLoaded = 'true';
                            paintCount(element, count.total, count.pending);
                            if (count.pending && element.classList.contains('history-translations')) {
                                // Respect a panel the reader explicitly closed while counts were loading.
                                if (element.dataset.translationManuallyClosed === 'true') return;
                                showPanel(element);
                                for (let parent = element.parentElement; parent; parent = parent.parentElement) {
                                    if (parent.tagName === 'DETAILS') parent.open = true;
                                }
                                await loadProposals(element);
                            }
                        }));
                    } catch (_) {
                        group.filter(element => chunk.includes(element.dataset.targetId)).forEach(element => {
                            delete element.dataset.translationCountLoaded;
                        });
                    }
                })());
            }
            return batches;
        }));
    }
    function composer() {
        if (!isMember()) return '<p class="history-translation-note">로그인한 사관은 번역을 제안할 수 있습니다.</p>';
        return `<form class="history-translation-form">
            <label>번역문<textarea name="content" required maxlength="100000" rows="6" placeholder="@지명 또는 @인물명을 입력하고 검색 결과를 선택하세요."></textarea></label>
            <p class="history-translation-note">@로 지명·인물을 검색해 연결하거나 상세 화면에서 복사한 태그를 붙여넣을 수 있습니다.</p>
            <label>번역 근거·참고 자료 (선택)<textarea name="evidence" maxlength="2000" rows="2"></textarea></label>
            <p class="history-translation-note">${esc(options.getUser().username)} 사관의 이름으로 게시됩니다. 승인 후 기사 하단에 적용되며 공적점수에 반영됩니다.</p>
            <button type="submit">번역 제안 등록</button><p class="history-translation-message" role="status"></p>
        </form>`;
    }
    function savedMessage(widget, text) {
        const panel = widget.querySelector('.history-translation-panel');
        if (!panel.querySelector('.history-translation-save-note')) panel.insertAdjacentHTML('afterbegin', '<p class="history-translation-save-note history-translation-message" role="status"></p>');
        panel.querySelector('.history-translation-save-note').textContent = text;
    }
    function proposalMarkup(proposal) {
        const statuses = { pending:'검토 대기', reviewed:'검토 완료', approved:'승인', rejected:'반려' };
        const active = ['pending', 'reviewed'].includes(proposal.status);
        const tag = active ? 'article' : 'details';
        const heading = active ? 'div' : 'summary';
        return `<${tag} class="history-translation-proposal" data-proposal-id="${esc(proposal._id)}" data-proposal-revision="${Number(proposal.revision) || 0}">
            <${heading} class="history-translation-proposal-heading"><strong>${esc(proposal.username)} 사관</strong><span>${statuses[proposal.status] || esc(proposal.status)}</span></${heading}>
            <div class="history-translation-text">${richText(proposal.content)}</div>
            ${proposal.evidence ? `<div class="history-translation-evidence">참고: ${esc(proposal.evidence)}</div>` : ''}
            ${proposal.rejectComment || (proposal.status === 'rejected' && proposal.reviewComment) ? `<p>반려 사유: ${esc(proposal.rejectComment || proposal.reviewComment)}</p>` : ''}
            ${isOwn(proposal) ? '<div class="history-translation-author-actions"><button type="button" data-translation-action="edit">수정</button></div>' : ''}
            ${isAdmin() && active ? '<div class="history-translation-review"><button type="button" data-translation-action="approve">승인·번역 적용</button><button type="button" data-translation-action="reject-final">반려</button></div>' : ''}
        </${tag}>`;
    }
    async function loadProposals(widget, offset = 0) {
        const list = widget.querySelector('.history-translation-list');
        const params = query(widget);
        params.set('offset', String(offset));
        const data = await request(`/api/translation-proposals?${params}`);
        if (!widget.isConnected) return;
        widget._translationProposals ||= new Map();
        data.proposals.forEach(proposal => widget._translationProposals.set(String(proposal._id), proposal));
        paintCount(widget, data.total, data.pending);
        for (const badge of document.querySelectorAll('.history-translation-result-badge')) {
            if (badge.dataset.targetType === widget.dataset.targetType && badge.dataset.targetId === widget.dataset.targetId) paintCount(badge, data.total, data.pending);
        }
        if (!offset) list.innerHTML = '';
        list.querySelector('.history-translation-more')?.remove();
        list.insertAdjacentHTML('beforeend', data.proposals.map(proposalMarkup).join('') || '<p>아직 번역 제안이 없습니다.</p>');
        if (data.offset + data.proposals.length < data.total) {
            list.insertAdjacentHTML('beforeend', `<button type="button" class="history-translation-more" data-offset="${data.offset + data.proposals.length}">번역 제안 더 보기</button>`);
        }
    }
    async function refresh(target) {
        window.refreshActivityFeed?.();
        const widgets = [...document.querySelectorAll('.history-translations')].filter(widget =>
            widget.dataset.targetType === target.type && widget.dataset.targetId === target.id);
        options.onApplied(target);
        if (!widgets.length) return;
        const record = await request(`/api/${target.type === 'source' ? 'source-records' : 'history'}/${encodeURIComponent(target.id)}`);
        for (const widget of widgets) {
            if (!widget.isConnected) continue;
            widget.querySelector('.history-translation-applied').innerHTML = applied(record);
            if (widget.querySelector('.history-translation-list')) await loadProposals(widget);
        }
    }
    document.addEventListener('click', async event => {
        const button = event.target.closest('.history-translation-toggle, .history-translation-more, [data-translation-action]');
        const widget = button?.closest('.history-translations');
        if (!widget) return;
        event.stopPropagation();
        const panel = widget.querySelector('.history-translation-panel');
        try {
            if (button.classList.contains('history-translation-toggle')) {
                panel.hidden = !panel.hidden;
                widget.dataset.translationManuallyClosed = String(panel.hidden);
                button.setAttribute('aria-expanded', String(!panel.hidden));
                if (panel.hidden) return;
                showPanel(widget);
                await loadProposals(widget);
            } else if (button.classList.contains('history-translation-more')) {
                button.disabled = true;
                await loadProposals(widget, Number(button.dataset.offset));
            } else {
                let action = button.dataset.translationAction;
                if (action === 'compose') {
                    if (!isMember()) return;
                    const slot = panel.querySelector('.history-translation-composer');
                    const opening = slot.hidden;
                    if (opening && !slot.children.length) slot.innerHTML = composer();
                    slot.hidden = !opening;
                    button.setAttribute('aria-expanded', String(opening));
                    button.textContent = opening ? '작성창 닫기' : '새 번역 제안 작성';
                    if (opening) slot.querySelector('textarea').focus();
                    return;
                }
                if (action === 'edit-applied') {
                    showPanel(widget);
                    widget.dataset.translationManuallyClosed = 'false';
                    let item = await request(`/api/translation-proposals/${encodeURIComponent(button.dataset.editProposalId)}`, {
                        headers:{ Authorization:`Bearer ${options.getToken()}` }
                    });
                    await loadProposals(widget);
                    item = [...widget._translationProposals.values()].find(value => isOwn(value) && ['pending', 'reviewed'].includes(value.status)) || item;
                    let entry = widget.querySelector(`[data-proposal-id="${item._id}"]`);
                    if (!entry) {
                        widget._translationProposals.set(String(item._id), item);
                        widget.querySelector('.history-translation-list').insertAdjacentHTML('afterbegin', proposalMarkup(item));
                        entry = widget.querySelector(`[data-proposal-id="${item._id}"]`);
                    }
                    if (entry.tagName === 'DETAILS') entry.open = true;
                    entry.querySelector('[data-translation-action="edit"]').click();
                    return;
                }
                const proposal = button.closest('[data-proposal-id]');
                if (action === 'cancel-edit') {
                    proposal.querySelector('.history-translation-edit-form')?.remove();
                    proposal.querySelectorAll('[data-edit-hidden]').forEach(element => {
                        element.hidden = false;
                        delete element.dataset.editHidden;
                    });
                    return;
                }
                if (action === 'edit') {
                    const item = widget._translationProposals?.get(proposal.dataset.proposalId);
                    if (!item || !isOwn(item)) return;
                    if (!proposal.querySelector('.history-translation-edit-form')) {
                        proposal.querySelector('.history-translation-proposal-heading').insertAdjacentHTML('afterend', `
                            <form class="history-translation-edit-form" data-edit-proposal-id="${esc(item._id)}" data-revision="${Number(item.revision) || 0}">
                                <label>번역문 수정<textarea name="content" required maxlength="100000" rows="6">${esc(item.content)}</textarea></label>
                                <label>번역 근거·참고 자료 수정<textarea name="evidence" maxlength="2000" rows="2">${esc(item.evidence || '')}</textarea></label>
                                <p class="history-translation-note">${item.status === 'approved' ? '승인본은 유지되며 수정안을 새로 검토·승인받습니다.' : '수정하면 검토 대기 상태로 돌아갑니다.'} @로 연결한 지명·인물 태그도 유지됩니다.</p>
                                <div class="history-translation-edit-actions"><button type="submit">수정 저장</button><button type="button" data-translation-action="cancel-edit">취소</button></div>
                                <p class="history-translation-message" role="status"></p>
                            </form>`);
                        proposal.querySelectorAll('.history-translation-text, .history-translation-evidence, .history-translation-author-actions, .history-translation-review').forEach(element => {
                            element.hidden = true;
                            element.dataset.editHidden = 'true';
                        });
                    }
                    proposal.querySelector('.history-translation-edit-form textarea').focus();
                    return;
                }
                if (action === 'reject-final') {
                    if (!proposal.querySelector('.history-translation-rejection')) {
                        proposal.insertAdjacentHTML('beforeend', '<div class="history-translation-rejection"><label>반려 사유<textarea rows="2" maxlength="2000" required></textarea></label><button type="button" data-translation-action="reject-submit">반려 확정</button></div>');
                    }
                    proposal.querySelector('.history-translation-rejection textarea').focus();
                    return;
                }
                const reason = proposal.querySelector('.history-translation-rejection textarea');
                const comment = action === 'reject-submit' ? reason.value.trim() : '';
                if (action === 'reject-submit') {
                    if (!comment) { reason.reportValidity(); return; }
                    action = 'reject-final';
                }
                button.disabled = true;
                const result = await request(`/api/contributions/${encodeURIComponent(proposal.dataset.proposalId)}/${action}`, {
                    method:'PUT', body:JSON.stringify({ comment, revision:Number(proposal.dataset.proposalRevision) || 0 })
                });
                await refresh(result.translationTarget || identity(widget));
            }
        } catch (error) {
            let message = panel.querySelector('.history-translation-error');
            if (!message) {
                message = document.createElement('p');
                message.className = 'history-translation-error';
                message.setAttribute('role', 'alert');
                panel.prepend(message);
            }
            message.textContent = error.message;
        } finally { if (button.isConnected) button.disabled = false; }
    }, true);
    document.addEventListener('submit', async event => {
        const form = event.target.closest('.history-translation-form, .history-translation-edit-form');
        if (!form) return;
        event.preventDefault();
        event.stopPropagation();
        if (!isMember()) return;
        const widget = form.closest('.history-translations');
        const button = form.querySelector('[type="submit"]');
        const message = form.querySelector('[role="status"]');
        button.disabled = true;
        try {
            const fields = new FormData(form);
            const editId = form.dataset?.editProposalId;
            const result = await request(editId ? `/api/translation-proposals/${encodeURIComponent(editId)}` : '/api/translation-proposals', { method:editId ? 'PUT' : 'POST', body:JSON.stringify({
                targetType:widget.dataset.targetType, targetId:widget.dataset.targetId,
                content:window.serializeEntityMentionsForField?.(form.elements.content) ?? String(fields.get('content') || ''),
                evidence:String(fields.get('evidence') || ''), ...(editId ? { revision:Number(form.dataset.revision) || 0 } : {})
            }) });
            if (editId) {
                await refresh({ ...identity(widget), year:result.contribution?.year });
                savedMessage(widget, result.message);
                return;
            }
            form.reset();
            form.elements.content.dispatchEvent(new Event('input', { bubbles:true }));
            window.refreshActivityFeed?.();
            message.textContent = result.message;
            await loadProposals(widget);
            const slot = widget.querySelector('.history-translation-composer');
            slot.hidden = true;
            slot.innerHTML = '';
            const composeButton = widget.querySelector('[data-translation-action="compose"]');
            composeButton.setAttribute('aria-expanded', 'false');
            composeButton.textContent = '새 번역 제안 작성';
            savedMessage(widget, result.message);
        } catch (error) { message.textContent = error.message; }
        finally { button.disabled = false; }
    }, true);
    window.addEventListener('message', event => {
        if (event.origin !== location.origin || event.data?.type !== 'contributionReviewed' || !event.data.translationTarget) return;
        refresh(event.data.translationTarget).catch(console.error);
    });
    window.HistoryTranslations = { markup, resultBadge, hydrate, refresh, configure:config => { options = { ...options, ...config }; } };
})();
