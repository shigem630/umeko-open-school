// ===== GITHUB SETTINGS =====
const GH_CONFIG_KEY = 'umeko_os_gh_config';

function getGitHubConfig() {
  try {
    const raw = localStorage.getItem(GH_CONFIG_KEY);
    return raw ? JSON.parse(raw) : { owner: '', repo: '', branch: 'main', token: '' };
  } catch { return { owner: '', repo: '', branch: 'main', token: '' }; }
}

function saveGitHubConfig() {
  const owner = (document.getElementById('gh-owner')?.value || '').trim();
  const repo  = (document.getElementById('gh-repo')?.value  || '').trim();
  const tokenEl = document.getElementById('gh-token');
  const rawToken = (tokenEl?.value || '').trim();
  const saved = getGitHubConfig();
  const token = rawToken || saved.token;

  localStorage.setItem(GH_CONFIG_KEY, JSON.stringify({ owner, repo, branch: 'main', token }));

  if (tokenEl) {
    tokenEl.value = '';
    tokenEl.placeholder = token ? '（設定済み — 変更する場合のみ入力）' : 'ghp_xxxxxxxxxxxx';
  }
  showToast('GitHub設定を保存しました。', 'success');
}

// ===== BUILD EXPORT DATA =====
function buildExportData() {
  const slots = {};
  EVENTS.forEach(event => {
    event.csvSlots.forEach(slot => {
      const data = getEventData(slot.id);
      if (data) slots[slot.id] = data;
    });
  });
  const config = getConfig();
  return {
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    slots,
    annotations: getAnnotations(),
    goals: config.goals
  };
}

// ===== DOWNLOAD data.json =====
function downloadPublishData() {
  const payload = buildExportData();
  if (!Object.keys(payload.slots).length) {
    showToast('エクスポートするデータがありません。先にCSVをアップロードしてください。', 'error');
    return;
  }
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('data.json をダウンロードしました。', 'success');
}

// UTF-8 文字列を Base64 に変換（GitHub API 用）
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// ===== PUBLISH TO GITHUB =====
async function publishToGitHub() {
  const cfg = getGitHubConfig();
  if (!cfg.owner || !cfg.repo || !cfg.token) {
    showToast('GitHub設定（ユーザー名・リポジトリ名・トークン）を先に保存してください。', 'error');
    return;
  }

  const payload = buildExportData();
  if (!Object.keys(payload.slots).length) {
    showToast('公開するデータがありません。先にCSVをアップロードしてください。', 'error');
    return;
  }

  const btn = document.getElementById('gh-publish-btn');
  if (btn) { btn.disabled = true; btn.textContent = '公開中…'; }

  const json    = JSON.stringify(payload, null, 2);
  const content = utf8ToBase64(json);
  const branch  = cfg.branch || 'main';
  const apiBase = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
  const filePath = 'data.json';
  const headers = {
    'Authorization': `Bearer ${cfg.token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  try {
    // ファイルが既に存在する場合は SHA が必要
    let sha = null;
    const getRes = await fetch(`${apiBase}/contents/${filePath}?ref=${encodeURIComponent(branch)}`, { headers });
    if (getRes.ok) sha = (await getRes.json()).sha;

    const body = {
      message: `データ更新 ${new Date().toLocaleDateString('ja-JP')}`,
      content,
      branch,
      ...(sha ? { sha } : {})
    };

    const putRes = await fetch(`${apiBase}/contents/${filePath}`, {
      method: 'PUT', headers, body: JSON.stringify(body)
    });

    if (putRes.ok) {
      showToast('GitHubに公開しました。約30秒後に生徒用ページに反映されます。', 'success');
    } else {
      const err = await putRes.json();
      showToast(`公開失敗: ${err.message || '不明なエラー'}`, 'error');
    }
  } catch (e) {
    showToast(`公開に失敗しました: ${e.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🚀 GitHubに公開'; }
  }
}

// ===== INIT (teacher page: restore saved settings) =====
function initPublishUI() {
  const cfg = getGitHubConfig();
  const ownerEl = document.getElementById('gh-owner');
  const repoEl  = document.getElementById('gh-repo');
  const tokenEl = document.getElementById('gh-token');
  if (ownerEl) ownerEl.value = cfg.owner;
  if (repoEl)  repoEl.value  = cfg.repo;
  if (tokenEl) tokenEl.placeholder = cfg.token
    ? '（設定済み — 変更する場合のみ入力）'
    : 'ghp_xxxxxxxxxxxx';
}
