function getEventAnnotations(eventKey) {
  const all = getAnnotations();
  return all[eventKey] || [];
}

function saveEventAnnotations(eventKey, list) {
  const all = getAnnotations();
  all[eventKey] = list;
  saveAnnotations(all);
}

function addAnnotation(eventKey, { date, text, type }) {
  const list = getEventAnnotations(eventKey);
  const newItem = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    date,
    text,
    type
  };
  list.push(newItem);
  list.sort((a, b) => a.date.localeCompare(b.date));
  saveEventAnnotations(eventKey, list);
  return newItem;
}

function updateAnnotation(eventKey, id, updates) {
  const list = getEventAnnotations(eventKey);
  const idx = list.findIndex(a => a.id === id);
  if (idx === -1) return false;
  list[idx] = { ...list[idx], ...updates };
  list.sort((a, b) => a.date.localeCompare(b.date));
  saveEventAnnotations(eventKey, list);
  return true;
}

function deleteAnnotation(eventKey, id) {
  const list = getEventAnnotations(eventKey).filter(a => a.id !== id);
  saveEventAnnotations(eventKey, list);
}

// Phase 7-4: inline onclick replaced with addEventListener after DOM injection
function renderAnnotationList(eventKey, containerId) {
  const list = getEventAnnotations(eventKey);
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!list.length) {
    container.innerHTML = '<p style="font-size:0.75rem;color:var(--color-gray-400);text-align:center;padding:0.5rem 0;">メモがありません</p>';
    return;
  }

  container.innerHTML = list.map(a => {
    const typeLabel = a.type === 'action' ? 'アクション' : a.type === 'sns' ? 'SNS' : 'その他';
    return `
      <div class="annotation-item" data-ann-id="${a.id}">
        <span class="annotation-date">${formatAnnotationDate(a.date)}</span>
        <span class="annotation-badge type--${a.type}">${typeLabel}</span>
        <span class="annotation-text">${escapeHtml(a.text)}</span>
        ${window.IS_TEACHER ? `<div class="annotation-actions">
          <button class="btn btn-ghost btn-sm btn-icon anno-delete-btn" title="削除" data-ann-id="${a.id}">✕</button>
        </div>` : ''}
      </div>
    `;
  }).join('');

  // Bind delete handlers after DOM injection (no inline onclick)
  container.querySelectorAll('.anno-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('このメモを削除しますか？')) return;
      const annId = btn.dataset.annId;
      deleteAnnotation(eventKey, annId);
      renderAnnotationList(eventKey, containerId);
      const rows = getEventRows(eventKey);
      const anns = getEventAnnotations(eventKey);
      buildTrendChart(`trend-${eventKey}`, rows, anns);
    });
  });
}

function formatAnnotationDate(dateStr) {
  if (!dateStr) return '';
  const [,m,d] = dateStr.split('-');
  return `${parseInt(m)}月${parseInt(d)}日`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
