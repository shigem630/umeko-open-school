// ===== TOAST (Phase 6-2: errors have × close button, no auto-dismiss) =====
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  toast.appendChild(msgSpan);

  if (type === 'error') {
    // Errors: manual close only
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', '閉じる');
    closeBtn.addEventListener('click', () => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    });
    toast.appendChild(closeBtn);
  } else {
    // Success / warning: auto-dismiss after 3.5s
    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, 3500);
  }

  container.appendChild(toast);
}

// ===== PROGRESS CARDS =====
function renderProgressCards(role) {
  const config = getConfig();
  EVENTS.forEach(event => {
    const rows = getEventRows(event.key);
    const goal = config.goals[event.key] || event.defaultGoal;
    const total = rows.length;
    const pct = goal > 0 ? Math.min(100, Math.round(total * 100 / goal)) : 0;
    const achieved = total >= goal;

    // Delta (today + yesterday)
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const todayStr = formatDate(today);
    const ydStr = formatDate(yesterday);
    const daily = getDailyCounts(rows);
    const byDate = Object.fromEntries(daily.map(d => [d.date, d.count]));
    const delta = (byDate[todayStr] || 0) + (byDate[ydStr] || 0);

    // Pace
    const { remaining, daysRemaining, perDay } = calcPace(total, goal, event.date);

    // Import info
    const importInfo = getEventImportInfo(event.key);
    const updatedStr = importInfo ? formatDatetimeDisplay(importInfo.latest_at) : null;

    const card = document.getElementById('card-' + event.key);
    if (!card) return;

    card.className = `progress-card${achieved ? ' achieved' : ''}`;
    card.style.setProperty('--pct', pct + '%');

    // Breakdown by type (for combined events with jhs + elm)
    const jhsCount = event.combined ? rows.filter(r => r._slot === 'jhs').length : 0;
    const elmCount = event.combined ? rows.filter(r => r._slot === 'elm').length : 0;

    if (rows.length === 0) {
      card.innerHTML = `
        <div class="progress-card-header">
          <div>
            <div class="progress-event-date">${event.label}</div>
          </div>
        </div>
        <div class="progress-empty">
          <div class="progress-empty-icon">📋</div>
          <div class="progress-empty-text">データ未読込</div>
        </div>
        <div class="progress-updated">目標: ${goal}人</div>
      `;
      return;
    }

    card.innerHTML = `
      <div class="progress-card-header">
        <div>
          <div class="progress-event-date">${event.label}</div>
        </div>
        <div class="progress-delta${delta === 0 ? ' zero' : ''}">
          ${delta > 0 ? '+' : ''}${delta}人
        </div>
      </div>
      <div class="progress-numbers">
        <span class="progress-current">${total}</span>
        <span class="progress-separator">/</span>
        <span class="progress-goal">${goal}</span>
        <span class="progress-unit">人</span>
      </div>
      ${event.combined ? `
        <div class="progress-breakdown">
          <span class="breakdown-jhs">中学生 ${jhsCount}人</span>
          <span class="breakdown-sep">・</span>
          <span class="breakdown-elm">小学生 ${elmCount}人</span>
        </div>
      ` : ''}
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="progress-rate">達成率 <strong>${pct}%</strong></div>
      ${!achieved && remaining > 0 ? `
        <div class="progress-pace">あと${remaining}人 ／ 残${daysRemaining}日 ／ 1日${perDay}人ペース</div>
      ` : achieved ? `
        <div class="progress-pace" style="background:var(--color-gold-soft);color:var(--color-gold)">🎉 目標達成！</div>
      ` : ''}
      <div class="progress-updated">${updatedStr ? `最終更新: ${updatedStr}` : ''}</div>
    `;
  });
}

// ===== EVENT TABS =====
let currentEventKey = EVENTS[0].key;

function initEventTabs() {
  const tabNav  = document.getElementById('event-tab-nav');
  const dropdown = document.getElementById('event-select-dropdown');
  if (!tabNav && !dropdown) return;

  if (dropdown) {
    dropdown.innerHTML = EVENTS.map(e =>
      `<option value="${e.key}">${e.fullLabel}</option>`
    ).join('');
    dropdown.addEventListener('change', () => switchEvent(dropdown.value));
  }

  // Phase 7-5: init phase tabs ONCE here (not in renderEventPanel)
  initPhaseTabs();

  switchEvent(EVENTS[0].key);
}

function switchEvent(key) {
  currentEventKey = key;

  // Update tab active state
  document.querySelectorAll('.event-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.key === key);
  });

  // Update dropdown
  const dropdown = document.getElementById('event-select-dropdown');
  if (dropdown) dropdown.value = key;

  // Render the detail panel for this event
  renderEventPanel(key);
}

// ===== PHASE TABS (Phase 7-5: called once, reads currentEventKey at click time) =====
function initPhaseTabs() {
  document.querySelectorAll('.phase-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.phase-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const phase = btn.dataset.phase;
      document.querySelectorAll('.phase-panel').forEach(p => {
        p.style.display = p.dataset.phase === phase ? 'block' : 'none';
      });
      if (phase === 'after') renderPostEventPanel(currentEventKey);
    });
  });
}

// ===== RENDER EVENT PANEL =====
function renderEventPanel(eventKey) {
  const beforePanel = document.querySelector('.phase-panel[data-phase="before"]');
  const afterPanel  = document.querySelector('.phase-panel[data-phase="after"]');
  if (!beforePanel || !afterPanel) return;

  const rows = getEventRows(eventKey);

  if (rows.length === 0) {
    const msg = window.IS_TEACHER
      ? '上の「データ管理」からブレンドのCSVファイルを読み込むとグラフが表示されます。'
      : 'まもなくデータが公開される予定です。しばらくお待ちください。';
    beforePanel.innerHTML = `
      <div class="empty-state-panel">
        <div class="empty-state-icon">📂</div>
        <div class="empty-state-title">${window.IS_TEACHER ? 'CSVファイルをアップロードしてください' : 'データ準備中です'}</div>
        <div class="empty-state-body">${msg}</div>
      </div>`;
    afterPanel.innerHTML = buildAfterPanelHTML(eventKey);
  } else {
    const event = EVENTS.find(e => e.key === eventKey);
    const isCombined = event && event.combined;
    beforePanel.innerHTML = buildBeforePanelHTML(eventKey, rows);
    afterPanel.innerHTML  = buildAfterPanelHTML(eventKey);
    const anns = getEventAnnotations(eventKey);
    buildTrendChart(`trend-${eventKey}`, rows, anns);
    buildChannelChart(`channel-${eventKey}`, rows);
    buildReasonChart(`reason-${eventKey}`, rows);
    buildGradeChart(`grade-${eventKey}`, rows, isCombined);
    if (isCombined) {
      renderSchoolTable(`school-tbody-${eventKey}-jhs`, rows.filter(r => r._slot === 'jhs'));
      renderSchoolTable(`school-tbody-${eventKey}-elm`, rows.filter(r => r._slot === 'elm'));
    } else {
      renderSchoolTable(`school-tbody-${eventKey}`, rows);
    }
    renderAnnotationList(eventKey, `anno-list-${eventKey}`);
  }

  // Reset phase tabs to "before" on event switch
  document.querySelectorAll('.phase-tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.querySelectorAll('.phase-panel').forEach((p, i) => p.style.display = i === 0 ? 'block' : 'none');
}

function buildBeforePanelHTML(key, rows = []) {
  const event = EVENTS.find(e => e.key === key);
  const isCombined = event && event.combined;
  const jhsCount = isCombined ? rows.filter(r => r._slot === 'jhs').length : 0;
  const elmCount = isCombined ? rows.filter(r => r._slot === 'elm').length : 0;

  const breakdownCard = isCombined ? `
    <div class="card breakdown-card">
      <div class="breakdown-stat-row">
        <div class="breakdown-stat">
          <div class="breakdown-stat-label">中学生（午前）</div>
          <div class="breakdown-stat-count">${jhsCount}<span class="breakdown-unit">人</span></div>
        </div>
        <div class="breakdown-stat-op">＋</div>
        <div class="breakdown-stat">
          <div class="breakdown-stat-label">小学生（午後）</div>
          <div class="breakdown-stat-count">${elmCount}<span class="breakdown-unit">人</span></div>
        </div>
        <div class="breakdown-stat-op">＝</div>
        <div class="breakdown-stat total">
          <div class="breakdown-stat-label">合計</div>
          <div class="breakdown-stat-count">${rows.length}<span class="breakdown-unit">人</span></div>
        </div>
      </div>
    </div>
  ` : '';

  // Phase 8-2: grade chart height depends on combined
  const gradeHeight = isCombined ? '280px' : '220px';

  return `
    ${breakdownCard}
    <div class="card chart-row">
      <div class="chart-toolbar">
        <div class="chart-title">📈 日別申込推移</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          ${window.IS_TEACHER ? `<button class="btn btn-secondary btn-sm" onclick="showAnnotationForm()">＋ メモを追加</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="downloadChartImage('trend-${key}','申込推移')">💾 画像保存</button>
        </div>
      </div>
      <div id="annotation-form" class="annotation-form">
        <div class="annotation-form-row">
          <div class="annotation-form-field">
            <label>日付</label>
            <input type="date" id="anno-date" class="form-input">
          </div>
          <div class="annotation-form-field" style="flex:1;min-width:160px">
            <label>メモ内容</label>
            <input type="text" id="anno-text" class="form-input" placeholder="例: チラシ配布@下関駅">
          </div>
          <div class="annotation-form-field">
            <label>種別</label>
            <select id="anno-type" class="form-input">
              <option value="action">アクション</option>
              <option value="sns">SNS</option>
              <option value="other">その他</option>
            </select>
          </div>
          <div class="annotation-form-field" style="justify-content:flex-end">
            <label>&nbsp;</label>
            <div style="display:flex;gap:0.5rem">
              <button class="btn btn-primary btn-sm" onclick="submitAnnotation()">保存</button>
              <button class="btn btn-ghost btn-sm" onclick="hideAnnotationForm()">キャンセル</button>
            </div>
          </div>
        </div>
      </div>
      <div style="position:relative;height:280px"><canvas id="trend-${key}"></canvas></div>
      <div id="anno-list-${key}" class="annotation-list"></div>
    </div>

    <!-- Phase 8-7: channel chart is full-width -->
    <div class="card">
      <div class="chart-toolbar">
        <div class="chart-title">📡 申込経路</div>
        <button class="btn btn-ghost btn-sm" onclick="downloadChartImage('channel-${key}','申込経路')">💾</button>
      </div>
      <div id="channel-${key}-wrap" style="position:relative;height:260px"><canvas id="channel-${key}"></canvas></div>
    </div>

    <div class="card">
      <div class="chart-toolbar">
        <div class="chart-title">💬 申込理由</div>
        <button class="btn btn-ghost btn-sm" onclick="downloadChartImage('reason-${key}','申込理由')">💾</button>
      </div>
      <div id="reason-${key}-wrap" style="position:relative;height:260px"><canvas id="reason-${key}"></canvas></div>
    </div>

    <div class="card">
      <div class="card-title">🎓 学年別申込数</div>
      <div id="grade-${key}-wrap" style="position:relative;height:${gradeHeight}"><canvas id="grade-${key}"></canvas></div>
    </div>

    ${isCombined ? `
    <div class="school-tables-2col">
      <div class="card">
        <div class="card-title">🏫 中学校 TOP10</div>
        <div style="overflow-x:auto">
          <table class="data-table">
            <thead><tr><th width="40">順位</th><th>学校名</th><th>申込数</th></tr></thead>
            <tbody id="school-tbody-${key}-jhs"></tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-title">🏫 小学校 TOP10</div>
        <div style="overflow-x:auto">
          <table class="data-table">
            <thead><tr><th width="40">順位</th><th>学校名</th><th>申込数</th></tr></thead>
            <tbody id="school-tbody-${key}-elm"></tbody>
          </table>
        </div>
      </div>
    </div>
    ` : `
    <div class="card">
      <div class="card-title">🏫 出身校 TOP10</div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr><th width="40">順位</th><th>学校名</th><th>申込数</th></tr></thead>
          <tbody id="school-tbody-${key}"></tbody>
        </table>
      </div>
    </div>
    `}
  `;
}

function buildAfterPanelHTML(key) {
  const commentsSection = window.IS_TEACHER ? `
    <div class="card" style="margin-top:var(--space-4)">
      <div class="card-title">✏️ 感想・メッセージ一覧</div>
      <div id="free-comments-${key}" class="feedback-list">
        <p style="color:var(--color-gray-400);font-size:var(--text-sm)">データがありません</p>
      </div>
    </div>` : '';

  return `
    <div class="post-event-intro">
      イベント終了後に参加者が回答したアンケートの集計です。CSVに満足度データが含まれると自動で表示されます。
    </div>
    <div class="chart-row-2col">
      <div class="card">
        <div class="card-title">😊 総合満足度</div>
        <div id="satisfaction-${key}-wrapper" style="position:relative;height:200px"><canvas id="satisfaction-${key}"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">💡 受験意欲の変化</div>
        <div id="intent-${key}-wrapper" style="position:relative;height:200px"><canvas id="intent-${key}"></canvas></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">🌟 印象の変化</div>
      <div id="impression-${key}-wrapper" style="position:relative;height:120px"><canvas id="impression-${key}"></canvas></div>
    </div>
    ${commentsSection}
  `;
}

function renderPostEventPanel(eventKey) {
  const rows = getEventRows(eventKey);
  const withSatisfaction = rows.filter(r => r.satisfaction && r.satisfaction.trim());

  if (!withSatisfaction.length) {
    const afterPanel = document.querySelector('.phase-panel[data-phase="after"]');
    if (afterPanel) {
      afterPanel.innerHTML = buildAfterPanelHTML(eventKey);
      showEmptyState(`satisfaction-${eventKey}-wrapper`, 'イベント後アンケートのデータがまだありません');
    }
    return;
  }

  buildSatisfactionChart(`satisfaction-${eventKey}`, withSatisfaction);
  buildStackedChart(`impression-${eventKey}`, getImpressionDist(withSatisfaction), '印象の変化');
  buildStackedChart(`intent-${eventKey}`, getExamIntentDist(withSatisfaction), '受験意欲');

  if (!window.IS_TEACHER) return;

  // Comments (teacher only)
  const comments = getFreeComments(rows);
  const commentsEl = document.getElementById(`free-comments-${eventKey}`);
  if (commentsEl) {
    if (!comments.length) {
      commentsEl.innerHTML = '<p style="color:var(--color-gray-400);font-size:var(--text-sm)">感想はまだありません</p>';
    } else {
      commentsEl.innerHTML = comments.map(c => `<div class="feedback-item">${escapeHtml(c)}</div>`).join('');
    }
  }
}

function showEmptyState(wrapperId, message) {
  const el = document.getElementById(wrapperId);
  if (!el) return;
  el.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">📊</div>
      <div class="empty-state-title">${message}</div>
    </div>
  `;
}

// ===== SCHOOL TABLE =====
function renderSchoolTable(tbodyId, rows) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const schools = getTopSchools(rows);
  if (!schools.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--color-gray-400);padding:1rem">データがありません</td></tr>';
    return;
  }
  const max = schools[0].count;
  tbody.innerHTML = schools.map(({ name, count }, i) => {
    const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
    const isTop3 = i < 3;
    const barPct = Math.round(count * 100 / max);
    return `
      <tr class="${isTop3 ? 'school-top3' : ''}">
        <td><span class="school-rank ${rankClass}">${i + 1}</span></td>
        <td>${escapeHtml(name)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:0.5rem">
            <div class="school-bar" style="width:80px;flex-shrink:0">
              <div class="school-bar-fill" style="width:${barPct}%"></div>
            </div>
            <span style="font-weight:600;color:var(--color-primary)">${count}人</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ===== CSV UPLOAD UI =====
function setupUploadZone(zoneEl, slotId, eventKey, onUploaded) {
  const input = zoneEl.querySelector('input[type="file"]');

  zoneEl.addEventListener('click', () => input.click());

  zoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    zoneEl.classList.add('drag-over');
  });
  zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('drag-over'));
  zoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    zoneEl.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, slotId, zoneEl, eventKey, onUploaded);
  });

  input.addEventListener('change', () => {
    if (input.files[0]) handleFile(input.files[0], slotId, zoneEl, eventKey, onUploaded);
  });
}

function handleFile(file, slotId, zoneEl, eventKey, onUploaded) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showToast('CSVファイル（.csv）を選択してください。', 'error');
    return;
  }

  setUploadState(zoneEl, 'loading');

  parseCSVFile(
    file, slotId,
    (data) => {
      const ok = saveEventData(slotId, data);
      if (ok) {
        setUploadState(zoneEl, 'loaded', `✓ ${data.count}件 読込済 (${formatDatetimeDisplay(data.imported_at)})`);
        showToast(`${data.count}件のデータを読み込みました。`, 'success');
        onUploaded && onUploaded(eventKey);
      }
    },
    (errMsg) => {
      setUploadState(zoneEl, 'error');
      showToast(errMsg, 'error');
    }
  );
}

function setUploadState(zoneEl, state, label) {
  zoneEl.classList.remove('loaded', 'error', 'drag-over');
  const labelEl = zoneEl.querySelector('.upload-zone-label');
  if (state === 'loading') {
    if (labelEl) labelEl.textContent = '読み込み中…';
  } else if (state === 'loaded') {
    zoneEl.classList.add('loaded');
    if (labelEl) labelEl.textContent = label || '読込済';
  } else if (state === 'error') {
    zoneEl.classList.add('error');
    if (labelEl) labelEl.textContent = '読み込み失敗 — 再試行';
  }
}

function restoreUploadStates() {
  EVENTS.forEach(event => {
    event.csvSlots.forEach(slot => {
      const data = getEventData(slot.id);
      if (!data) return;
      const zoneEl = document.querySelector(`[data-slot="${slot.id}"]`);
      if (zoneEl) {
        setUploadState(zoneEl, 'loaded',
          `✓ ${data.count}件 読込済 (${formatDatetimeDisplay(data.imported_at)})`);
      }
    });
  });
}

// ===== SETTINGS =====
function renderSettingsPanel() {
  const config = getConfig();
  EVENTS.forEach(event => {
    const input = document.getElementById(`goal-${event.key}`);
    if (input) input.value = config.goals[event.key] || event.defaultGoal;
  });
}

function saveGoals() {
  const config = getConfig();
  EVENTS.forEach(event => {
    const input = document.getElementById(`goal-${event.key}`);
    if (input) {
      const val = parseInt(input.value, 10);
      if (val > 0) config.goals[event.key] = val;
    }
  });
  saveConfig(config);
  showToast('目標人数を保存しました。', 'success');
  renderProgressCards();
}
// Phase 7-3: formatDate removed (canonical copy lives in data-processor.js)
