const STORAGE_PREFIX = 'umeko_os_';

// Published data cache — set on student page after fetching data.json
// Null on teacher page, so all functions below behave normally there.
let _publishedCache = null;

function setPublishedCache(data) {
  _publishedCache = data || null;
}

function safeGet(key) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Storage read error:', e);
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      showToast('データの保存に失敗しました。ブラウザのストレージ容量が不足しています。', 'error');
    } else {
      showToast('データの保存中にエラーが発生しました。', 'error');
    }
    return false;
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch (e) {
    console.error('Storage remove error:', e);
  }
}

function getConfig() {
  const stored = safeGet('config');
  const base = stored || {
    goals: Object.fromEntries(EVENTS.map(e => [e.key, e.defaultGoal])),
    newVisitorGoal: 320,
    password_hash: DEFAULT_PASSWORD_HASH,
    version: APP_VERSION
  };
  if (base.newVisitorGoal === undefined) base.newVisitorGoal = 320; // 既存データのマイグレーション
  if (!stored) safeSet('config', base);
  if (stored && stored.version && stored.version !== APP_VERSION) {
    console.warn(`[umeko] config version mismatch: stored=${stored.version}, current=${APP_VERSION}.`);
  }
  // Overlay goals from published data.json (student page only; null on teacher page)
  if (_publishedCache) {
    const overlay = {};
    if (_publishedCache.goals) overlay.goals = { ...base.goals, ..._publishedCache.goals };
    if (_publishedCache.newVisitorGoal) overlay.newVisitorGoal = _publishedCache.newVisitorGoal;
    return { ...base, ...overlay };
  }
  return base;
}

function saveConfig(config) {
  safeSet('config', config);
}

function getEventData(slotId) {
  if (_publishedCache && _publishedCache.slots && _publishedCache.slots[slotId]) {
    return _publishedCache.slots[slotId];
  }
  return safeGet('data_' + slotId);
}

function saveEventData(slotId, data) {
  return safeSet('data_' + slotId, data);
}

function getAnnotations() {
  if (_publishedCache && _publishedCache.annotations) {
    return _publishedCache.annotations;
  }
  return safeGet('annotations') || {};
}

function saveAnnotations(annotations) {
  safeSet('annotations', annotations);
}

// Phase 7-6: use safeRemove for consistent prefix handling
function clearAllData() {
  EVENTS.forEach(event => {
    event.csvSlots.forEach(slot => {
      safeRemove('data_' + slot.id);
    });
  });
  safeRemove('annotations');
}

// Get combined rows for an event (merges jhs + elm if combined)
// _slot property is added here at read time, never stored in localStorage
function getEventRows(eventKey) {
  const event = EVENTS.find(e => e.key === eventKey);
  if (!event) return [];
  const rows = [];
  for (const slot of event.csvSlots) {
    const data = getEventData(slot.id);
    if (data && data.rows) {
      rows.push(...data.rows.map(r => ({ ...r, _slot: slot.type })));
    }
  }
  return rows;
}

// Get import timestamps for an event
function getEventImportInfo(eventKey) {
  const event = EVENTS.find(e => e.key === eventKey);
  if (!event) return null;
  const infos = [];
  for (const slot of event.csvSlots) {
    const data = getEventData(slot.id);
    if (data) infos.push({ slotId: slot.id, imported_at: data.imported_at, count: data.count });
  }
  if (!infos.length) return null;
  // ISO 8601 strings sort correctly lexicographically — no Date() needed
  const latest = infos.reduce((a, b) => a.imported_at > b.imported_at ? a : b);
  return { latest_at: latest.imported_at, slots: infos };
}
