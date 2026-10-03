// ===== アクセス解析（管理者だけが見る） =====
// ページが開かれたとき・回のタブを切り替えたときに、先生のGoogleスプレッドシート（Apps Script）へ記録を送る。
// 送るのは ページ・タブ・端末番号（この端末で作った意味のない乱数）・立場 だけで、個人情報は送らない。
// 管理者でログインした端末は「自分の閲覧」として数えない（生徒ページを確認したときも含む）。

const ANALYTICS_DEVICE_KEY = 'umeko_os_analytics_device';
const ANALYTICS_SELF_KEY   = 'umeko_os_analytics_self';
const ANALYTICS_SECRET_KEY = 'umeko_os_analytics_secret';

function _analyticsEnabled() {
  if (!ANALYTICS_URL) return false;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return false; // 動作確認中は数えない
  try { if (localStorage.getItem(ANALYTICS_SELF_KEY) === '1') return false; } catch (_) {}
  return true;
}

function _analyticsDevice() {
  try {
    let id = localStorage.getItem(ANALYTICS_DEVICE_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      localStorage.setItem(ANALYTICS_DEVICE_KEY, id);
    }
    return id;
  } catch (_) {
    return 'nostorage';
  }
}

function _analyticsSend(params) {
  if (!_analyticsEnabled()) return;
  const qs = new URLSearchParams({ t: 'hit', d: _analyticsDevice(), ...params }).toString();
  try { fetch(ANALYTICS_URL + '?' + qs, { mode: 'no-cors', keepalive: true }).catch(() => {}); } catch (_) {}
}

// page: 'student'（生徒・保護者向けページ）/ 'teacher'（教員ページ）、role: 'student' / 'staff'
let _analyticsRole = 'student';
function trackPageView(page, role) {
  _analyticsRole = role;
  _analyticsSend({ k: 'view', page, r: role });
}

// 回のタブ（同じ画面で同じタブは1回だけ数える）
// 画面を開いたときに自動で表示される最初の回は数えず、自分で切り替えたタブだけを数える
const _trackedTabs = new Set();
let _firstTabShown = false;
function trackEventTab(label) {
  if (!_firstTabShown) { _firstTabShown = true; return; }
  if (!label || _trackedTabs.has(label)) return;
  _trackedTabs.add(label);
  _analyticsSend({ k: 'tab', tab: label, r: _analyticsRole });
}

// 管理者でログインした端末は、以後この端末の閲覧を数えない
function markAnalyticsSelf() {
  try { localStorage.setItem(ANALYTICS_SELF_KEY, '1'); } catch (_) {}
}

// ===== 教員ページ（管理者）：アクセス状況の表示 =====
async function renderAnalyticsPanel() {
  const body = document.getElementById('analytics-body');
  if (!body) return;
  if (!ANALYTICS_URL) {
    body.innerHTML = '<p class="an-note">アクセス解析はまだ準備中です（スプレッドシートの設定が終わると表示されます）。</p>';
    return;
  }
  let secret = '';
  try { secret = localStorage.getItem(ANALYTICS_SECRET_KEY) || ''; } catch (_) {}
  if (!secret) {
    body.innerHTML = `
      <form class="an-key-form" onsubmit="saveAnalyticsSecret(event)">
        <label for="analytics-secret">アクセス状況を見るための「合言葉」を入力してください（このパソコンでは初回のみ）</label>
        <div class="an-key-row">
          <input id="analytics-secret" class="form-input" autocomplete="off" placeholder="合言葉">
          <button class="btn btn-primary btn-sm" type="submit">表示する</button>
        </div>
      </form>`;
    return;
  }
  body.innerHTML = '<p class="an-note">読み込み中…</p>';
  let s;
  try {
    const res = await fetch(`${ANALYTICS_URL}?t=stats&key=${encodeURIComponent(secret)}&_=${Date.now()}`);
    s = await res.json();
  } catch (_) {
    body.innerHTML = '<p class="an-note">アクセス状況を読み込めませんでした。時間をおいて「更新」を押してください。</p>';
    return;
  }
  if (!s.ok) {
    try { localStorage.removeItem(ANALYTICS_SECRET_KEY); } catch (_) {}
    body.innerHTML = '<p class="an-note">合言葉が違うようです。</p>';
    setTimeout(renderAnalyticsPanel, 1500);
    return;
  }

  const fmtDate = iso => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const tile = (label, o) => `
    <div class="an-tile">
      <div class="an-tile-label">${label}</div>
      <div class="an-tile-main">${o.devStudent}<span>人（端末）</span></div>
      <div class="an-tile-sub">生徒ページ ${o.student}回</div>
      <div class="an-tile-sub staff">教職員 ${o.devStaff}人・${o.staff}回</div>
    </div>`;
  const tabs = Object.entries(s.byTab || {}).sort((a, b) => b[1] - a[1]);
  const wd = ['日', '月', '火', '水', '木', '金', '土'];

  body.innerHTML = `
    <div class="an-tiles">
      ${tile('今日', s.today)}
      ${tile('この7日間', s.week)}
      ${tile(`合計${s.first ? `（${fmtDate(s.first).split(' ')[0]}から）` : ''}`, s.total)}
    </div>
    <p class="an-note">「人（端末）」は見たスマホ・パソコンの台数で、だいたいの人数です（同じ人が別の端末で見ると2人と数えます）。先生が管理者でログインした端末の閲覧は数えていません。</p>
    <div class="an-chart-block">
      <div class="an-chart-title">日ごとの閲覧（直近30日）</div>
      <div style="position:relative;height:240px"><canvas id="analytics-daily"></canvas></div>
    </div>
    <div class="an-grid">
      <div class="an-chart-block">
        <div class="an-chart-title">見られている時間帯（生徒ページ・直近30日）</div>
        <div style="position:relative;height:200px"><canvas id="analytics-hour"></canvas></div>
      </div>
      <div class="an-chart-block">
        <div class="an-chart-title">曜日（生徒ページ・直近30日）</div>
        <div style="position:relative;height:200px"><canvas id="analytics-weekday"></canvas></div>
      </div>
    </div>
    ${tabs.length ? `
    <div class="an-chart-block">
      <div class="an-chart-title">切り替えて見られた回のタブ（生徒ページ・直近30日）</div>
      <div class="ps-notes">${tabs.map(([t, n]) => `<span class="ps-chip">${escapeHtml(t)} <strong>${n}</strong></span>`).join('')}</div>
    </div>` : ''}
    <p class="an-note">最終更新 ${fmtDate(s.generatedAt)}${s.last ? `・最後の閲覧 ${fmtDate(s.last)}` : ''}　<button class="btn btn-ghost btn-sm" onclick="renderAnalyticsPanel()">🔄 更新</button></p>`;

  const days = s.days || [];
  renderChart('analytics-daily', {
    type: 'bar',
    data: {
      labels: days.map(d => { const [, m, dd] = d.date.split('-'); return `${+m}/${+dd}`; }),
      datasets: [
        { label: '生徒ページ（人・端末）', data: days.map(d => d.devStudent), backgroundColor: '#A52050', borderRadius: 3 },
        { label: '教職員（人・端末）', data: days.map(d => d.devStaff), backgroundColor: '#9E9EB8', borderRadius: 3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { afterLabel: ctx => {
        const d = days[ctx.dataIndex];
        return ctx.datasetIndex === 0 ? `閲覧 ${d.student}回` : `閲覧 ${d.staff}回`;
      } } } },
      scales: { x: { stacked: true, ticks: { maxRotation: 0, autoSkip: true } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
  const simpleBar = (id, labels, data) => renderChart(id, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: '#A52050', borderRadius: 3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
  simpleBar('analytics-hour', Array.from({ length: 24 }, (_, h) => `${h}時`), s.byHour || []);
  simpleBar('analytics-weekday', wd, s.byWeekday || []);
}

function saveAnalyticsSecret(e) {
  e.preventDefault();
  const v = (document.getElementById('analytics-secret') || {}).value || '';
  if (!v.trim()) return;
  try { localStorage.setItem(ANALYTICS_SECRET_KEY, v.trim()); } catch (_) {}
  renderAnalyticsPanel();
}
