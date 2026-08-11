const mentionState = new WeakMap();
const boundFields = new Set();
let heroPromise;
let countryPromise;

const esc = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

function eligible(field) {
  if (!field || field.dataset.entityMentionBound === '1') return false;
  if (field.matches('textarea,#activity-chat-input,#activity-notice-input')) {
    if (field.type === 'hidden' || getComputedStyle(field).display === 'none') return false;
    if (/json|url|sourceText/i.test(`${field.id} ${field.name} ${field.placeholder}`)) return false;
    return true;
  }
  return field.matches('[contenteditable="true"]');
}

function valueAndCaret(field) {
  if (field.matches('textarea,input')) return { value: field.value, caret: field.selectionStart || 0 };
  const selection = window.getSelection();
  if (!selection?.rangeCount || !field.contains(selection.anchorNode)) return { value: field.textContent || '', caret: -1 };
  const range = selection.getRangeAt(0).cloneRange();
  const prefix = range.cloneRange();
  prefix.selectNodeContents(field);
  prefix.setEnd(range.endContainer, range.endOffset);
  return { value: field.textContent || '', caret: prefix.toString().length };
}

function serializeLinks(value, links) {
  let serialized = String(value || '');
  links.forEach(({ marker, token }) => {
    const index = serialized.indexOf(marker);
    if (index >= 0) serialized = serialized.slice(0, index) + token + serialized.slice(index + marker.length);
  });
  return serialized;
}

window.serializeEntityMentionsForField = (field) => {
  const state = mentionState.get(field);
  return serializeLinks(field?.value ?? field?.textContent ?? '', state?.links || []);
};

function insertToken(field, start, end, marker, token, state) {
  if (field.matches('textarea,input')) {
    field.setRangeText(marker, start, end, 'end');
  } else {
    const selection = window.getSelection();
    const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
    let node; let offset = 0; let startPoint; let endPoint;
    while ((node = walker.nextNode())) {
      const next = offset + node.data.length;
      if (!startPoint && start >= offset && start <= next) startPoint = [node, start - offset];
      if (!endPoint && end >= offset && end <= next) { endPoint = [node, end - offset]; break; }
      offset = next;
    }
    if (startPoint && endPoint) {
      const range = document.createRange();
      range.setStart(...startPoint); range.setEnd(...endPoint);
      range.deleteContents(); range.insertNode(document.createTextNode(marker));
      range.collapse(false); selection.removeAllRanges(); selection.addRange(range);
    }
  }
  state.links.push({ marker, token });
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus();
}

async function searchAll(query) {
  const q = query.toLowerCase();
  heroPromise ||= fetch('/api/heroes/base', { cache: 'force-cache' }).then((r) => r.ok ? r.json() : { figures: [] }).catch(() => ({ figures: [] }));
  countryPromise ||= fetch('/api/countries', { cache: 'force-cache' }).then((r) => r.ok ? r.json() : []).catch(() => []);
  const placePromise = fetch(`/api/castle/search?q=${encodeURIComponent(query)}&limit=10`).then((r) => r.ok ? r.json() : []).catch(() => []);
  const [places, heroBase, countries] = await Promise.all([placePromise, heroPromise, countryPromise]);
  const seenPeople = new Set();
  const people = (heroBase.figures || []).filter((hero) => {
    const identity = String(hero.person_id || hero._id);
    const hit = [hero.name_ko, hero.name, hero.name_zh, hero.title, ...(hero.aliases || [])].filter(Boolean).join(' ').toLowerCase().includes(q);
    if (!hit || seenPeople.has(identity)) return false;
    seenPeople.add(identity); return true;
  }).slice(0, 8);
  const nations = (countries || []).filter((country) => [country.name, country.name_kor, country.name_chi, ...(country.aliases || [])]
    .filter(Boolean).join(' ').toLowerCase().includes(q)).slice(0, 6);
  return [
    ...nations.map((item) => ({ type: 'country', item })),
    ...people.map((item) => ({ type: 'person', item })),
    ...(places || []).map((item) => ({ type: 'place', item })),
  ];
}

window.renderEntityLinkTokens = function renderEntityLinkTokens(value) {
  return esc(value).replace(/\[\[(person|place|country):([^|\]]+)\|([^\]]+)\]\]/g, (_token, type, id, label) => (
    `<button type="button" class="history-${type === 'person' ? 'person' : type === 'country' ? 'country' : 'place'}-link global-entity-token-link" data-entity-type="${type}" data-entity-id="${esc(id)}">${esc(label)}</button>`
  ));
};

function bind(field) {
  if (!eligible(field)) return;
  field.dataset.entityMentionBound = '1';
  boundFields.add(field);
  const popup = document.createElement('div');
  popup.className = 'global-entity-mention-results';
  popup.style.cssText = 'display:none;position:fixed;z-index:2147482500;max-width:min(520px,calc(100vw - 16px));max-height:240px;overflow:auto;padding:4px;border:1px solid rgba(93,166,199,.55);border-radius:7px;background:#101a22;box-shadow:0 10px 28px rgba(0,0,0,.7);';
  document.body.appendChild(popup);
  const state = { popup, seq: 0, active: -1, buttons: [], links: [] };
  mentionState.set(field, state);
  if (field.matches('textarea,input')) {
    field.value = field.value.replace(/\[\[(person|place|country):([^|\]]+)\|([^\]]+)\]\]/g, (token, type, id, label) => {
      const marker = `@${label}`;
      state.links.push({ marker, token: `[[${type}:${id}|${label}]]` });
      return marker;
    });
  }
  const ownerForm = field.closest('form');
  if (ownerForm && field.name) {
    ownerForm.addEventListener('formdata', (event) => {
      event.formData.set(field.name, serializeLinks(field.value, state.links));
    });
  }

  const close = () => { popup.style.display = 'none'; popup.innerHTML = ''; state.buttons = []; state.active = -1; };
  const activate = (index) => {
    if (!state.buttons.length) return;
    state.active = (index + state.buttons.length) % state.buttons.length;
    state.buttons.forEach((button, i) => { button.style.background = i === state.active ? 'rgba(56,126,158,.32)' : 'transparent'; });
    state.buttons[state.active].scrollIntoView({ block: 'nearest' });
  };
  const update = async () => {
    const { value, caret } = valueAndCaret(field);
    if (caret < 0) return close();
    const match = value.slice(0, caret).match(/(?:^|\s)@([^\s@\[\]]{1,30})$/);
    if (!match) return close();
    const seq = ++state.seq;
    const start = caret - match[1].length - 1;
    const rect = field.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 528))}px`;
    popup.style.top = `${Math.min(window.innerHeight - 248, rect.bottom + 3)}px`;
    popup.style.width = `${Math.min(Math.max(rect.width, 300), 520)}px`;
    popup.style.display = 'block';
    popup.innerHTML = '<div style="padding:7px;color:#82919c;font-size:11px;">검색 중…</div>';
    const results = await searchAll(match[1]);
    if (seq !== state.seq) return;
    popup.innerHTML = '';
    state.buttons = results.slice(0, 20).map(({ type, item }) => {
      const id = String(item._id || '');
      const label = String(type === 'place' && item.matched_history_name ? item.matched_history_name : item.name_ko || item.name || '이름 없음');
      const button = document.createElement('button');
      button.type = 'button';
      button.style.cssText = 'display:flex;width:100%;gap:8px;justify-content:space-between;padding:7px 9px;border:0;border-radius:4px;background:transparent;color:#d8e5ec;text-align:left;cursor:pointer;';
      button.innerHTML = `<span>${type === 'place' ? '📍 지명' : type === 'person' ? '👤 인물' : '🚩 국가'} · ${esc(label)}</span><small style="opacity:.6">${esc(type === 'place' ? item.name : type === 'person' ? item.title || item.faction : item.ethnicity)}</small>`;
      button.addEventListener('mouseenter', () => activate(state.buttons.indexOf(button)));
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        const marker = `@${label}`;
        insertToken(field, start, caret, marker, `[[${type}:${id}|${label}]]`, state);
        close();
      });
      popup.appendChild(button); return button;
    });
    if (!state.buttons.length) popup.innerHTML = '<div style="padding:7px;color:#82919c;font-size:11px;">관련 지명·인물·국가가 없습니다.</div>';
    else activate(0);
  };
  field.addEventListener('input', update);
  field.addEventListener('click', update);
  field.addEventListener('keydown', (event) => {
    if (popup.style.display === 'none') return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); activate(state.active + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); activate(state.active - 1); }
    else if (event.key === 'Enter' && state.active >= 0) { event.preventDefault(); state.buttons[state.active]?.click(); }
  });
  field.addEventListener('blur', () => setTimeout(close, 120));
}

function scan(root = document) {
  const selector = 'textarea,[contenteditable="true"],#activity-chat-input,#activity-notice-input';
  if (root.matches?.(selector)) bind(root);
  root.querySelectorAll?.(selector).forEach(bind);
}

scan();
new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
  if (node.nodeType === Node.ELEMENT_NODE) scan(node);
}))).observe(document.body, { childList: true, subtree: true });

// 댓글처럼 FormData를 사용하지 않고 버튼 클릭 시 value를 직접 읽는 저장기도 지원한다.
document.addEventListener('click', (event) => {
  if (!event.target.closest('button,[type="submit"]') || event.target.closest('.global-entity-mention-results')) return;
  boundFields.forEach((field) => {
    const state = mentionState.get(field);
    if (!state?.links.length || !field.isConnected) return;
    const original = field.matches('textarea,input') ? field.value : field.textContent;
    const serialized = serializeLinks(original, state.links);
    if (serialized === original) return;
    if (field.matches('textarea,input')) field.value = serialized;
    else field.textContent = serialized;
    setTimeout(() => {
      const current = field.matches('textarea,input') ? field.value : field.textContent;
      if (current !== serialized) return;
      if (field.matches('textarea,input')) field.value = original;
      else field.textContent = original;
    }, 0);
  });
}, true);

document.addEventListener('click', (event) => {
  const link = event.target.closest('.global-entity-token-link');
  if (!link) return;
  event.preventDefault();
  event.stopPropagation();
  const id = link.dataset.entityId;
  const type = link.dataset.entityType;
  if (type === 'person') window.heroSystem?.openSidebar?.(id);
  else if (type === 'country') {
    const country = window.getCountryInfoById?.(id);
    if (country) window.showCountryInfoModal?.(country);
  } else if (type === 'place') {
    if (typeof window._openHistoryPlaceOnMap === 'function') window._openHistoryPlaceOnMap(id);
    else window.fetch?.(`/api/castle/${encodeURIComponent(id)}`).then((response) => response.json()).then((castle) => {
      if (Number.isFinite(Number(castle.lat)) && Number.isFinite(Number(castle.lng))) window.map?.flyTo?.([Number(castle.lat), Number(castle.lng)], 10);
    }).catch(() => {});
  }
});
