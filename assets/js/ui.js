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
// 表示中の年度のカードを用意する（年度を切り替えたら作り直す）
function _ensureProgressCards() {
  const grid = document.getElementById('progress-grid');
  if (!grid || grid.dataset.year === String(ACTIVE_YEAR)) return;
  const click = window.IS_TEACHER ? 'handleCardClick' : 'switchEvent';
  grid.innerHTML = EVENTS.map(e => `
    <div id="card-${e.key}" class="progress-card" onclick="${click}('${e.key}')">
      <div class="progress-empty"><div class="progress-empty-icon">📋</div><div class="progress-empty-text">読込中…</div></div>
    </div>`).join('');
  grid.dataset.year = String(ACTIVE_YEAR);
}

// 過去の年度のカード：目標・ペースは出さず、申込数と来場数を表示
function _pastProgressCardHTML(event, rows) {
  const est = YEAR_META[ACTIVE_YEAR] && YEAR_META[ACTIVE_YEAR].datesEstimated;
  const header = `
    <div class="progress-card-header">
      <div>
        <div class="progress-event-date">${escapeHtml(event.label)}${est ? '<span class="progress-est">推定</span>' : ''}</div>
        <div class="progress-event-name">${escapeHtml(event.fullLabel.replace(/（[^）]*）$/, ''))}</div>
      </div>
    </div>`;
  if (!rows.length) {
    return `${header}
      <div class="progress-empty">
        <div class="progress-empty-icon">📋</div>
        <div class="progress-empty-text">データ未読込</div>
      </div>`;
  }
  const attended = rows.filter(r => r.attended === '来場済み').length;
  const hasAttendance = rows.some(r => r.attended);
  const music = event.combined ? getMusicRows(event.key) : [];
  const vs = event.musicOnly ? { available: false } : getVisitorStats(event.key);
  const importInfo = getEventImportInfo(event.key);
  return `${header}
    <div class="progress-numbers">
      <span class="progress-current">${rows.length}</span>
      <span class="progress-unit">人 申込</span>
    </div>
    ${event.combined ? `
      <div class="progress-breakdown">
        <span class="breakdown-jhs">中学生 ${rows.filter(r => r._slot === 'jhs').length}人</span>
        <span class="breakdown-sep">・</span>
        <span class="breakdown-elm">小学生 ${rows.filter(r => r._slot === 'elm').length}人</span>
        ${music.length ? `<span class="breakdown-sep">・</span><span class="breakdown-music">音楽科 ${music.length}人</span>` : ''}
      </div>` : ''}
    ${vs.available ? `
      <div class="progress-visitor-row">
        <span class="visitor-new-badge">🆕 新規 ${vs.newCount}人</span>
        <span class="visitor-sep">・</span>
        <span class="visitor-return-badge">🔁 再訪 ${vs.returningCount}人</span>
      </div>` : ''}
    ${hasAttendance ? `<div class="progress-rate">来場 <strong>${attended}人</strong>（来場率 ${Math.round(attended * 100 / rows.length)}%）</div>` : ''}
    <div class="progress-updated">${importInfo ? `読込: ${formatDatetimeDisplay(importInfo.latest_at)}` : ''}</div>`;
}

function renderProgressCards(role) {
  const config = getConfig();
  _ensureProgressCards();
  EVENTS.forEach(event => {
    const rows = getEventRows(event.key);
    if (isPastYear()) {
      const pastCard = document.getElementById('card-' + event.key);
      if (pastCard) {
        pastCard.className = 'progress-card past-year';
        pastCard.innerHTML = _pastProgressCardHTML(event, rows);
      }
      return;
    }
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

    // 新規/繰り返し・来場見込み
    const vs = getVisitorStats(event.key);
    const hc = getHeadcount(rows);

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
      ${vs.available ? `
        <div class="progress-visitor-row">
          <span class="visitor-new-badge">🆕 新規 ${vs.newCount}人</span>
          <span class="visitor-sep">・</span>
          <span class="visitor-return-badge">🔁 再訪 ${vs.returningCount}人</span>
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
      <div class="progress-headcount">
        来場見込み <strong>${hc.total}人</strong>
        <span class="headcount-sub">（申込${hc.students}＋保護者等${hc.guardians}）</span>
      </div>
      <div class="progress-updated">${updatedStr ? `最終更新: ${updatedStr}` : ''}</div>
    `;
  });
  renderNewVisitorSummary();
}

// ===== 新規来校者累計カード =====
function renderNewVisitorSummary() {
  const el = document.getElementById('new-visitor-summary');
  if (!el) return;

  const config = getConfig();
  const goal = config.newVisitorGoal || 320;
  const { count, available } = getCumulativeNewVisitors();

  const hasAnyData = EVENTS.some(e => getEventRows(e.key).length > 0);
  if (!hasAnyData) { el.innerHTML = ''; return; }

  if (isPastYear()) {
    el.innerHTML = available ? `
      <div class="new-visitor-summary-card card">
        <div class="nv-summary-inner">
          <div class="nv-summary-label">🎯 新規来校者 累計（${ACTIVE_YEAR}年度）</div>
          <div class="nv-summary-numbers"><span class="nv-current">${count}</span><span class="nv-unit">人</span></div>
          <div class="nv-past-note">年度内で初めて申し込んだ人数（複数回の申込は1人として集計）</div>
        </div>
      </div>` : '';
    return;
  }

  const pct = goal > 0 ? Math.min(100, Math.round(count * 100 / goal)) : 0;
  const achieved = count >= goal;

  el.innerHTML = `
    <div class="new-visitor-summary-card card">
      <div class="nv-summary-inner">
        <div class="nv-summary-label">🎯 新規来校者 累計目標</div>
        ${available ? `
          <div class="nv-summary-numbers">
            <span class="nv-current">${count}</span>
            <span class="nv-sep"> / </span>
            <span class="nv-goal">${goal}</span>
            <span class="nv-unit">人</span>
          </div>
          <div class="progress-bar-track nv-bar">
            <div class="progress-bar-fill" style="width:${pct}%"></div>
          </div>
          <div class="nv-rate">${achieved ? '🎉 目標達成！' : `達成率 <strong>${pct}%</strong> ／ あと <strong>${goal - count}人</strong>`}</div>
        ` : `
          <div class="nv-unavailable">プラスシードIDのデータがある場合に自動集計されます</div>
        `}
      </div>
    </div>
  `;
}

// ===== EVENT TABS =====
let currentEventKey = EVENTS[0].key;
let _phaseTabsReady = false;

// 回のタブ（表示中の年度の回から作る。年度を切り替えたら呼び直す）
function initEventTabs() {
  const tabNav  = document.getElementById('event-tab-nav');
  const dropdown = document.getElementById('event-select-dropdown');
  if (!tabNav && !dropdown) return;

  if (tabNav) {
    tabNav.innerHTML = EVENTS.map(e =>
      `<button class="tab-btn event-tab-btn" data-key="${e.key}" onclick="switchEvent('${e.key}')">${escapeHtml(e.label)}</button>`
    ).join('');
  }
  if (dropdown) {
    dropdown.innerHTML = EVENTS.map(e =>
      `<option value="${e.key}">${escapeHtml(e.fullLabel)}</option>`
    ).join('');
    if (!dropdown.dataset.bound) {
      dropdown.addEventListener('change', () => switchEvent(dropdown.value));
      dropdown.dataset.bound = '1';
    }
  }

  // Phase 7-5: init phase tabs ONCE (not in renderEventPanel)
  if (!_phaseTabsReady) { initPhaseTabs(); _phaseTabsReady = true; }

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
    if (isCombined) {
      const jhsRows = rows.filter(r => r._slot === 'jhs');
      const elmRows = rows.filter(r => r._slot === 'elm');
      buildChannelChart(`channel-${eventKey}-jhs`, jhsRows);
      buildChannelChart(`channel-${eventKey}-elm`, elmRows);
      buildReasonChart(`reason-${eventKey}-jhs`,  jhsRows);
      buildReasonChart(`reason-${eventKey}-elm`,  elmRows);
    } else {
      buildChannelChart(`channel-${eventKey}`, rows);
      buildReasonChart(`reason-${eventKey}`,   rows);
    }
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
  const jhsRows = isCombined ? rows.filter(r => r._slot === 'jhs') : [];
  const elmRows = isCombined ? rows.filter(r => r._slot === 'elm') : [];
  const jhsCount = jhsRows.length;
  const elmCount = elmRows.length;

  // 来場見込み・新規/繰り返し
  const hc    = getHeadcount(rows);
  const jhsHc = isCombined ? getHeadcount(jhsRows) : null;
  const elmHc = isCombined ? getHeadcount(elmRows) : null;
  const vs = getVisitorStats(key);

  const visitorRow = vs.available ? `
    <div class="breakdown-visitor-row">
      <span class="breakdown-visitor-new">🆕 新規 ${vs.newCount}人</span>
      <span class="breakdown-visitor-return">🔁 再訪 ${vs.returningCount}人</span>
    </div>
  ` : '';

  // 制服試着・個別相談 希望者数（中学生/小学生それぞれ）
  const jhsOpt = isCombined ? getOptionCounts(jhsRows) : getOptionCounts(rows);
  const elmOpt = isCombined ? getOptionCounts(elmRows) : null;

  function optionRow(label, waitlistLabel, jhs, elm) {
    const jhsAvail = jhs.available;
    const elmAvail = elm && elm.available;
    if (!jhsAvail && !elmAvail) return '';
    const wantRow = `
      <div class="breakdown-option-row">
        <span class="breakdown-option-label">${label}</span>
        ${jhsAvail ? `<span class="breakdown-option-jhs">中学生 ${jhs.want}人</span>` : ''}
        ${elmAvail ? `<span class="breakdown-option-elm">小学生 ${elm.want}人</span>` : ''}
      </div>`;
    const hasWaitlist = (jhsAvail && jhs.waitlist > 0) || (elmAvail && elm.waitlist > 0);
    const waitRow = hasWaitlist ? `
      <div class="breakdown-option-row waitlist-row">
        <span class="breakdown-option-label breakdown-option-sub">└ ${waitlistLabel}</span>
        ${jhsAvail && jhs.waitlist > 0 ? `<span class="breakdown-option-jhs faded">中学生 ${jhs.waitlist}人</span>` : ''}
        ${elmAvail && elm.waitlist > 0 ? `<span class="breakdown-option-elm faded">小学生 ${elm.waitlist}人</span>` : ''}
      </div>` : '';
    return wantRow + waitRow;
  }
  const uniformRow = optionRow('👔 制服試着申込', '次回試着希望', jhsOpt.uniform, elmOpt ? elmOpt.uniform : null);
  const consultRow = optionRow('💬 個別相談申込', '定員超過・次回希望', jhsOpt.consult, elmOpt ? elmOpt.consult : null);

  const musicSummary = isCombined ? getMusicSummary(key) : null;
  const musicHc = musicSummary ? musicSummary.headcount : null;

  // 来場見込み: combined は中学生/小学生を分けて表示
  const headcountRow = rows.length > 0 ? (isCombined ? `
    <div class="breakdown-headcount-split">
      <div class="breakdown-hc-row jhs">
        <span class="breakdown-hc-type">中学生</span>
        <span class="breakdown-hc-detail">申込${jhsHc.students}＋保護者等${jhsHc.guardians}</span>
        <span class="breakdown-hc-value">${jhsHc.total}人</span>
      </div>
      <div class="breakdown-hc-row elm">
        <span class="breakdown-hc-type">小学生</span>
        <span class="breakdown-hc-detail">申込${elmHc.students}＋保護者等${elmHc.guardians}</span>
        <span class="breakdown-hc-value">${elmHc.total}人</span>
      </div>
      ${musicHc ? `
      <div class="breakdown-hc-row music">
        <span class="breakdown-hc-type">音楽科</span>
        <span class="breakdown-hc-detail">申込${musicHc.students}＋保護者・同伴者${musicHc.guardians}</span>
        <span class="breakdown-hc-value">${musicHc.total}人</span>
      </div>` : ''}
      <div class="breakdown-hc-row total">
        <span class="breakdown-hc-type">合計 来場見込み</span>
        <span class="breakdown-hc-detail"></span>
        <span class="breakdown-hc-value total">${hc.total + (musicHc ? musicHc.total : 0)}人</span>
      </div>
    </div>
  ` : `
    <div class="breakdown-headcount-row">
      <span class="breakdown-headcount-label">来場見込み</span>
      <span class="breakdown-headcount-value">${hc.total}人</span>
      <span class="breakdown-headcount-sub">（申込${hc.students}＋保護者等${hc.guardians}）</span>
    </div>
  `) : '';

  // 音楽科体験レッスン会（7/25・8/29）。データがあれば合計に加えて表示
  const music = musicSummary;
  const attendedCount = list => list.filter(r => r.attended === '来場済み').length;
  const attendedRow = (music && isCombined) ? (() => {
    const j = attendedCount(jhsRows), e = attendedCount(elmRows), m = music.attended;
    return `
      <div class="breakdown-attended-row">
        <span class="breakdown-attended-label">うち来場済み</span>
        <span>中学生 ${j}人</span><span>小学生 ${e}人</span><span>音楽科 ${m}人</span>
        <span class="breakdown-attended-total">合計 <strong>${j + e + m}人</strong></span>
      </div>`;
  })() : '';
  const overlapNote = (music && music.overlapWithOs > 0) ? `
      <div class="breakdown-overlap-note">※ オープンスクールと音楽科の両方に申し込んだ人が${music.overlapWithOs}人いるため、実人数は${rows.length + music.headcount.students - music.overlapWithOs}人です</div>` : '';

  const breakdownCard = isCombined ? `
    <div class="card breakdown-card">
      <div class="breakdown-stat-row">
        <div class="breakdown-stat">
          <div class="breakdown-stat-label">${escapeHtml(event.jhsLabel || '中学生（午前）')}</div>
          <div class="breakdown-stat-count">${jhsCount}<span class="breakdown-unit">人</span></div>
        </div>
        <div class="breakdown-stat-op">＋</div>
        <div class="breakdown-stat">
          <div class="breakdown-stat-label">${escapeHtml(event.elmLabel || '小学生（午後）')}</div>
          <div class="breakdown-stat-count">${elmCount}<span class="breakdown-unit">人</span></div>
        </div>
        ${music ? `
        <div class="breakdown-stat-op">＋</div>
        <div class="breakdown-stat">
          <div class="breakdown-stat-label">音楽科</div>
          <div class="breakdown-stat-count">${music.headcount.students}<span class="breakdown-unit">人</span></div>
        </div>` : ''}
        <div class="breakdown-stat-op">＝</div>
        <div class="breakdown-stat total">
          <div class="breakdown-stat-label">${music ? '総合計' : '合計'}</div>
          <div class="breakdown-stat-count">${rows.length + (music ? music.headcount.students : 0)}<span class="breakdown-unit">人</span></div>
        </div>
      </div>
      ${music ? `<div class="breakdown-total-note">オープンスクール（中学生＋小学生）${rows.length}人 ＋ 音楽科 ${music.headcount.students}人</div>` : ''}
      ${attendedRow}${overlapNote}
      ${visitorRow}
      ${headcountRow}
      ${uniformRow}${consultRow}
      ${music ? buildMusicDetailsHTML(music, event.musicLabel) : ''}
    </div>
  ` : rows.length > 0 ? `
    <div class="card breakdown-card single-event-breakdown">
      ${visitorRow}
      ${headcountRow}
      ${uniformRow}${consultRow}
      ${event.musicOnly && getMusicSummary(key) ? buildMusicDetailsHTML(getMusicSummary(key), event.musicLabel) : ''}
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
          ${window.IS_ADMIN ? `<button class="btn btn-secondary btn-sm" onclick="showAnnotationForm()">＋ メモを追加</button>` : ''}
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

    ${isCombined ? `
    <div class="card">
      <div class="chart-toolbar">
        <div class="chart-title">📡 申込経路</div>
      </div>
      <div class="chart-row-2col" style="margin-bottom:0">
        <div>
          <div class="split-type-header jhs">
            🎓 中学生（高校受験）
            <button class="btn btn-ghost btn-sm split-dl-btn" onclick="downloadChartImage('channel-${key}-jhs','申込経路_中学生')">💾</button>
          </div>
          <div id="channel-${key}-jhs-wrap" style="position:relative;height:260px"><canvas id="channel-${key}-jhs"></canvas></div>
        </div>
        <div>
          <div class="split-type-header elm">
            📚 小学生（中学受験）
            <button class="btn btn-ghost btn-sm split-dl-btn" onclick="downloadChartImage('channel-${key}-elm','申込経路_小学生')">💾</button>
          </div>
          <div id="channel-${key}-elm-wrap" style="position:relative;height:260px"><canvas id="channel-${key}-elm"></canvas></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="chart-toolbar">
        <div class="chart-title">💬 申込理由</div>
      </div>
      <div class="chart-row-2col" style="margin-bottom:0">
        <div>
          <div class="split-type-header jhs">
            🎓 中学生（高校受験）
            <button class="btn btn-ghost btn-sm split-dl-btn" onclick="downloadChartImage('reason-${key}-jhs','申込理由_中学生')">💾</button>
          </div>
          <div id="reason-${key}-jhs-wrap" style="position:relative;height:260px"><canvas id="reason-${key}-jhs"></canvas></div>
        </div>
        <div>
          <div class="split-type-header elm">
            📚 小学生（中学受験）
            <button class="btn btn-ghost btn-sm split-dl-btn" onclick="downloadChartImage('reason-${key}-elm','申込理由_小学生')">💾</button>
          </div>
          <div id="reason-${key}-elm-wrap" style="position:relative;height:260px"><canvas id="reason-${key}-elm"></canvas></div>
        </div>
      </div>
    </div>
    ` : `
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
    `}

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

// 音楽科体験レッスン会の内訳（内訳カードの末尾に折りたたみで表示）
function buildMusicDetailsHTML(m, label = '音楽科体験レッスン会') {
  const chips = list => list.length
    ? list.map(([name, n]) => `<span class="music-chip">${escapeHtml(name)} ${n}</span>`).join('')
    : '<span class="music-none">回答なし</span>';
  const item = (label, body) => `
    <div class="music-row">
      <div class="music-row-label">${label}</div>
      <div class="music-row-body">${body}</div>
    </div>`;
  return `
    <details class="music-details">
      <summary>🎹 ${escapeHtml(label)}の内訳（専攻・希望・中学校など）</summary>
      <div class="music-rows">
        ${m.visitorAvailable ? item('新規・再訪', `<span class="music-chip">新規 ${m.newcomers}</span><span class="music-chip">再訪 ${m.returning}</span>`) : ''}
        ${item('専攻・楽器', chips(m.majors))}
        ${item('学年', chips(m.grades))}
        ${item('希望・参加', `
          <span class="music-chip">ソルフェージュ希望 ${m.solfege}</span>
          <span class="music-chip">個別面談希望 ${m.consult}</span>
          <span class="music-chip">同日の普通科OSにも参加 ${m.generalOs}</span>`)}
        ${item('知ったきっかけ', chips(m.channels))}
        ${item('中学校', chips(m.schools))}
      </div>
      <div class="music-unit-note">数字は人数です。中学生・小学生のグラフには含めていません。</div>
    </details>`;
}

function buildAfterPanelHTML(key) {
  const commentsSection = `
    <div class="card" style="margin-top:var(--space-4)">
      <div class="card-title">✏️ 感想・メッセージ${window.IS_ADMIN ? '<span class="comment-mod-hint">（🌐ボタンで生徒ページに公開／再度押すと非公開）</span>' : ''}</div>
      <div id="free-comments-${key}" class="feedback-list">
        <p style="color:var(--color-gray-400);font-size:var(--text-sm)">データがありません</p>
      </div>
    </div>`;

  return `
    <div class="post-event-intro" id="post-event-summary-${key}">
      イベント終了後に参加者が回答したアンケートの集計です。CSVに満足度データが含まれると自動で表示されます。
    </div>
    <div class="card">
      <div class="card-title">😊 総合満足度</div>
      <div id="satisfaction-${key}-wrapper" style="position:relative;height:200px"><canvas id="satisfaction-${key}"></canvas></div>
    </div>
    <div class="card" style="margin-top:var(--space-4)">
      <div class="card-title">💡 受験（入学）意欲の変化</div>
      <div id="intent-${key}-wrapper" style="position:relative;height:220px"><canvas id="intent-${key}"></canvas></div>
    </div>
    <div class="card" style="margin-top:var(--space-4)">
      <div class="card-title">🌟 梅光への印象の変化</div>
      <div id="impression-${key}-wrapper" style="position:relative;height:200px"><canvas id="impression-${key}"></canvas></div>
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
  buildSentimentBarChart(`impression-${eventKey}`, getImpressionDist(withSatisfaction));
  buildSentimentBarChart(`intent-${eventKey}`, getExamIntentDist(withSatisfaction));

  renderResponseSummary(eventKey, rows);
  renderCommentsSection(eventKey, rows);
}

// アンケート回答数のサマリー（中学生/小学生別・合計）
function renderResponseSummary(eventKey, rows) {
  const el = document.getElementById(`post-event-summary-${eventKey}`);
  if (!el) return;
  const event = EVENTS.find(e => e.key === eventKey);
  const { total, jhs, elm } = getResponseCounts(rows);
  const breakdown = (event && event.combined)
    ? `<span class="resp-badge resp-jhs">中学生 ${jhs}件</span><span class="resp-badge resp-elm">小学生 ${elm}件</span>`
    : '';
  el.innerHTML = `
    <div class="resp-summary-row">
      <span class="resp-summary-label">📝 アンケート回答数</span>
      ${breakdown}
      <span class="resp-total">合計 <strong>${total}</strong> 件</span>
    </div>`;
}

// 中学生/小学生 バッジ（combined イベントのみ表示）
function slotBadgeHTML(slot, isCombined) {
  if (!isCombined) return '';
  if (slot === 'jhs') return '<span class="resp-badge resp-jhs">中学生</span>';
  if (slot === 'elm') return '<span class="resp-badge resp-elm">小学生</span>';
  return '';
}

// 感想一覧の描画。先生ページは公開トグル付き、生徒ページは公開済みのみ表示。
function renderCommentsSection(eventKey, rows) {
  const comments = getFreeComments(rows);
  const commentsEl = document.getElementById(`free-comments-${eventKey}`);
  if (!commentsEl) return;
  const event = EVENTS.find(e => e.key === eventKey);
  const isCombined = !!(event && event.combined);

  if (window.IS_TEACHER) {
    if (!comments.length) {
      commentsEl.innerHTML = '<p style="color:var(--color-gray-400);font-size:var(--text-sm)">感想はまだありません</p>';
      return;
    }
    const approvedCount = comments.filter(c => isCommentApproved(eventKey, c.id)).length;
    const summary = `<div class="comment-mod-summary">${comments.length}件中 <strong>${approvedCount}件</strong> を生徒ページに公開中</div>`;
    commentsEl.innerHTML = summary + comments.map(c => {
      const on = isCommentApproved(eventKey, c.id);
      // 閲覧専用では公開状態の表示のみ（切替不可）
      const tag = window.IS_ADMIN ? 'button' : 'span';
      return `
        <div class="feedback-item comment-mod-item${on ? ' is-public' : ''}">
          <${tag} class="comment-toggle-btn${on ? ' on' : ''}${window.IS_ADMIN ? '' : ' is-readonly'}" data-id="${escapeHtml(c.id)}">
            ${on ? '🌐 公開中' : '🔒 非公開'}
          </${tag}>
          <span class="comment-mod-text">${slotBadgeHTML(c.slot, isCombined)}${escapeHtml(c.text)}</span>
        </div>`;
    }).join('');
    commentsEl.querySelectorAll('button.comment-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        toggleCommentApproval(eventKey, btn.dataset.id);
        renderCommentsSection(eventKey, rows);
      });
    });
  } else {
    // 生徒ページ: 公開承認された感想のみ
    const approved = comments.filter(c => isCommentApproved(eventKey, c.id));
    if (!approved.length) {
      commentsEl.innerHTML = '<p style="color:var(--color-gray-400);font-size:var(--text-sm)">公開されている感想はまだありません</p>';
      return;
    }
    commentsEl.innerHTML = approved.map(c => `<div class="feedback-item">${slotBadgeHTML(c.slot, isCombined)}${escapeHtml(c.text)}</div>`).join('');
  }
}

// 感想の公開状態を判定・切替（先生ページのみ）
function isCommentApproved(eventKey, id) {
  const map = getApprovedComments();
  return (map[eventKey] || []).includes(String(id));
}

function toggleCommentApproval(eventKey, id) {
  if (!requireAdmin()) return;
  const map = safeGet('approved_comments') || {};
  const list = map[eventKey] || [];
  const sid = String(id);
  const idx = list.indexOf(sid);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(sid);
  map[eventKey] = list;
  saveApprovedComments(map);
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

// ===== 学校別 累計来場者（全イベント合算・営業用）=====
let _schoolTotalsType = 'jhs';
function renderSchoolTotals(type) {
  if (type) _schoolTotalsType = type;
  const body = document.getElementById('school-totals-body');
  if (!body) return;

  document.querySelectorAll('.st-toggle-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === _schoolTotalsType));

  const label = _schoolTotalsType === 'jhs' ? '中学校' : '小学校';
  const titleEl = document.getElementById('school-totals-title');
  if (titleEl) titleEl.textContent = `🏫 ${label}別 累計来場者数${window.IS_TEACHER ? `（${ACTIVE_YEAR}年度）` : ''}`;

  const totals = getSchoolTotals(_schoolTotalsType);
  if (!totals.length) {
    body.innerHTML = '<p style="color:var(--color-gray-400);font-size:var(--text-sm);text-align:center;padding:var(--space-6)">まだデータがありません</p>';
    return;
  }

  const totalStudents = totals.reduce((s, t) => s + t.students, 0);
  const max = totals[0].students;
  const cancels = getSchoolCancels(_schoolTotalsType);
  const cancelTotal = Object.values(cancels).reduce((a, c) => a + c, 0);
  const visitedNames = new Set(totals.map(t => t.name));
  const cancelOnly = Object.keys(cancels).filter(n => !visitedNames.has(n));
  body.innerHTML = `
    <div class="st-summary">${label} <strong>${totals.length}</strong>校から、実人数 <strong>${totalStudents}</strong>名が来場（同じ生徒の複数回参加は1名で集計）${cancelTotal ? `
      <br><span class="st-cancel-note">申込後に来場しなかった方（キャンセル）${cancelTotal}名は来場者数に含めていません${cancelOnly.length ? `。キャンセルのみで来場0の学校：${cancelOnly.map(n => `${escapeHtml(n)}（${cancels[n]}名）`).join('、')}` : ''}</span>` : ''}</div>
    <div class="st-list">
      ${totals.map((t, i) => {
        const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
        const barPct = Math.round(t.students * 100 / max);
        const repeat = t.visits - t.students;
        return `
          <div class="st-row">
            <span class="school-rank ${rankClass}">${i + 1}</span>
            <span class="st-name">${escapeHtml(t.name)}</span>
            <div class="st-bar"><div class="st-bar-fill" style="width:${barPct}%"></div></div>
            <span class="st-count">${t.students}<span class="st-unit">名</span>${repeat > 0 ? `<span class="st-repeat">延べ${t.visits}</span>` : ''}${t.cancels ? `<span class="st-repeat st-cancel">キャンセル${t.cancels}</span>` : ''}</span>
          </div>`;
      }).join('')}
    </div>`;
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
  if (!requireAdmin()) return;
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

// ===== データ管理欄（表示中の年度の回から作る）=====
const _UPLOAD_LABEL_STYLE = 'font-size:var(--text-xs);font-weight:600;color:var(--color-gray-700);margin-bottom:var(--space-2)';

function renderUploadPanel(onUploaded) {
  const wrap = document.getElementById('upload-event-groups');
  if (!wrap) return;
  const config = getConfig();
  const past = isPastYear();
  const zone = slot => `
    <div>
      <p style="${_UPLOAD_LABEL_STYLE}">${escapeHtml(slot.uploadLabel || slot.label)}</p>
      <label class="upload-zone" data-slot="${slot.id}">
        <input type="file" accept=".csv">
        <div class="upload-zone-icon">${slot.type === 'music' ? '🎹' : '📄'}</div>
        <div class="upload-zone-label">クリックまたはドラッグ&ドロップ</div>
        <div class="upload-zone-hint">.csvファイル</div>
      </label>
    </div>`;
  const hasFileNames = EVENTS.some(e => e.csvSlots.some(s => s.file));
  const bulk = past && hasFileNames ? `
    <div class="upload-event-group upload-bulk-group">
      <div class="upload-event-header">
        <span class="upload-event-date">${ACTIVE_YEAR}年度の申込一覧をまとめて読み込む</span>
      </div>
      <p class="exam-upload-desc">BLENDの「〇〇_申込一覧.csv」を複数まとめて選択（またはドラッグ）すると、ファイル名から該当する回の欄に自動で読み込みます（中学生・小学生は「中学校」「小学校」の列で判定）。今年度のファイルが混ざっていた場合は読み飛ばします。</p>
      <label class="upload-zone exam-upload-zone" id="bulk-upload-zone">
        <input type="file" accept=".csv" multiple>
        <div class="upload-zone-icon">📚</div>
        <div class="upload-zone-label">クリックまたはドラッグ&ドロップ（複数ファイル可）</div>
        <div class="upload-zone-hint">.csvファイル</div>
      </label>
    </div>` : '';
  wrap.innerHTML = (past ? `<p class="upload-year-note">📅 ${ACTIVE_YEAR}年度（過去の年度）の欄です。ここで読み込んだデータは生徒用ページには表示されず、「🚀 GitHubに公開」で入試データと一緒に暗号化して教職員に共有されます。</p>` : '')
    + bulk
    + EVENTS.map(ev => {
      const n = ev.csvSlots.length;
      const grid = n >= 3 ? ' with-music' : n === 1 ? ' single-file' : '';
      return `
      <div class="upload-event-group">
        <div class="upload-event-header">
          <span class="upload-event-date">${escapeHtml(ev.uploadTitle || ev.label)}</span>
          ${past ? '' : `<span class="upload-event-goal" id="goal-badge-${ev.key}">目標${config.goals[ev.key] || ev.defaultGoal}人</span>`}
        </div>
        <div class="upload-files-grid${grid}">${ev.csvSlots.map(zone).join('')}</div>
      </div>`;
    }).join('');

  EVENTS.forEach(event => event.csvSlots.forEach(slot => {
    const z = wrap.querySelector(`[data-slot="${slot.id}"]`);
    if (z) setupUploadZone(z, slot.id, event.key, onUploaded);
  }));
  const bulkZone = document.getElementById('bulk-upload-zone');
  if (bulkZone) {
    const input = bulkZone.querySelector('input[type="file"]');
    input.addEventListener('change', () => { importYearCsvFiles(input.files, ACTIVE_YEAR, onUploaded); input.value = ''; });
    bulkZone.addEventListener('dragover', e => { e.preventDefault(); bulkZone.classList.add('drag-over'); });
    bulkZone.addEventListener('dragleave', () => bulkZone.classList.remove('drag-over'));
    bulkZone.addEventListener('drop', e => { e.preventDefault(); bulkZone.classList.remove('drag-over'); importYearCsvFiles(e.dataTransfer.files, ACTIVE_YEAR, onUploaded); });
  }
  restoreUploadStates();
}

function _readCsvHeaders(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const buf = e.target.result;
      const b = new Uint8Array(buf).slice(0, 3);
      const enc = (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) ? 'utf-8' : 'shift-jis';
      const text = new TextDecoder(enc, { fatal: false }).decode(buf);
      resolve((Papa.parse(text, { header: true, preview: 1 }).meta.fields) || []);
    };
    reader.onerror = () => resolve([]);
    reader.readAsArrayBuffer(file);
  });
}

// 申込一覧のCSVを、指定年度の該当する回の欄に読み込む（ファイル名と「中学校／小学校」の列、音楽科の列で判定）
// 戻り値: { ok: true, event, slot, count } / { ok: false, reason: 'nomatch'|'current'|'error', message }
async function importOsCsvToYear(file, year, headers) {
  const name = normEventFileName(file.name.replace(/\.csv$/i, '').replace(/\s*\(\d+\)\s*$/, '').replace(/_申込一覧.*$/, ''));
  const hdr = headers || await _readCsvHeaders(file);
  const type = hdr.some(h => h.startsWith('専攻') || h.includes('楽器名')) ? 'music' : hdr.includes('小学校') ? 'elm' : 'jhs';
  const cands = allSlots(year).filter(({ slot }) => slot.file && normEventFileName(slot.file) === name);
  const hit = cands.find(({ slot }) => slot.type === type);
  if (!hit) return { ok: false, reason: 'nomatch' };
  const data = await new Promise(resolve => parseCSVFile(file, hit.slot.id, d => resolve(d), msg => resolve({ error: msg })));
  if (data.error) return { ok: false, reason: 'error', message: data.error };
  // 今年度のファイル（BLEND管理番号が今年度のデータと一致）は過去の年度に入れない
  const currentIds = new Set(allSlots(CURRENT_YEAR).flatMap(({ slot }) => ((safeGet('data_' + slot.id) || {}).rows || []).map(r => String(r.blend_id || ''))).filter(Boolean));
  if (data.rows.some(r => r.blend_id && currentIds.has(String(r.blend_id)))) return { ok: false, reason: 'current' };
  if (!saveEventData(hit.slot.id, data)) return { ok: false, reason: 'error', message: '保存に失敗しました' };
  return { ok: true, event: hit.event, slot: hit.slot, count: data.count };
}

async function importYearCsvFiles(fileList, year, onUploaded) {
  if (!requireAdmin()) return;
  const files = [...fileList].filter(f => f.name.toLowerCase().endsWith('.csv'));
  if (!files.length) { showToast('CSVファイル（.csv）を選択してください。', 'error'); return; }
  const done = [], skipped = [];
  for (const file of files) {
    const res = await importOsCsvToYear(file, year);
    if (res.ok) done.push(`${res.event.label}・${res.slot.label}`);
    else skipped.push(`${file.name}（${res.reason === 'nomatch' ? '該当する回なし' : res.reason === 'current' ? '今年度のファイル' : res.message}）`);
  }
  if (done.length) {
    showToast(`${year}年度の申込一覧を${done.length}件読み込みました。${skipped.length ? ` 読み飛ばし：${skipped.join('、')}` : ''}`, skipped.length ? 'warning' : 'success');
    onUploaded && onUploaded(EVENTS[0].key);
    restoreUploadStates();
  } else {
    showToast(`読み込めるファイルがありませんでした。${skipped.join('、')}`, 'error');
  }
}

// ===== SETTINGS =====
function renderSettingsPanel() {
  const config = getConfig();
  EVENTS_BY_YEAR[CURRENT_YEAR].forEach(event => {
    const input = document.getElementById(`goal-${event.key}`);
    if (input) input.value = config.goals[event.key] || event.defaultGoal;
  });
  const nvInput = document.getElementById('goal-new-visitor');
  if (nvInput) nvInput.value = config.newVisitorGoal || 320;
}

function saveGoals() {
  if (!requireAdmin()) return;
  const config = getConfig();
  EVENTS_BY_YEAR[CURRENT_YEAR].forEach(event => {
    const input = document.getElementById(`goal-${event.key}`);
    if (input) {
      const val = parseInt(input.value, 10);
      if (val > 0) config.goals[event.key] = val;
    }
  });
  const nvInput = document.getElementById('goal-new-visitor');
  if (nvInput) {
    const val = parseInt(nvInput.value, 10);
    if (val > 0) config.newVisitorGoal = val;
  }
  saveConfig(config);
  showToast('目標人数を保存しました。', 'success');
  renderProgressCards();
}
// Phase 7-3: formatDate removed (canonical copy lives in data-processor.js)
