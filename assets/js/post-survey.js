// ===== 事後アンケート（Microsoft Forms など、BLEND以外で回収したもの）=====
// 2026/11/7 はBLENDの不具合で事後アンケートが取れず、生徒がFormsで回収した。
// 教員ページでFormsの回答（.xlsx）を読み込むと、読み込んだ時点で集計し、氏名などの列は捨てる。
// 保存するのは「質問ごとの人数」と「自由記述の文章」だけ。
//   ・生徒ページ（data.json）：集計＋先生が🌐公開にした自由記述のみ。教職員のみの質問は入れない
//   ・教職員（閲覧用パスワード）：入試データと一緒に暗号化して全部共有

// 読み込まない列（個人情報・Formsの管理用の列）。質問文の中の「お名前は記入しないで」などは対象外にするため短い見出しだけ
const SURVEY_SKIP_COL = /^(ID|開始時刻|完了時刻|最終変更時刻)$/;
const SURVEY_PERSONAL_COL = /氏名|名前|メール|電話|住所|連絡先/;
const _isSkippedSurveyCol = t => SURVEY_SKIP_COL.test(t) || (t.length <= 12 && SURVEY_PERSONAL_COL.test(t));
// 生徒ページに出さない質問（申込時アンケートの「受験の気持ち」と同じ扱い）
const SURVEY_STAFF_ONLY = /どのように考えて/;
// プログラムごとの満足度など、同じ選択肢が並ぶ質問（Formsの「リッカート」）をまとめる目印
const SURVEY_MATRIX_OPTS = ['とても満足', '満足', 'どちらともいえない', 'やや不満', '不満', '参加していない'];

// 回答の良さ（棒の色と並び順に使う）。5=とても良い … 1=悪い、0=参加していない、null=良し悪しのない質問
function surveyScore(label) {
  const s = String(label);
  if (/参加していない/.test(s)) return 0;
  if (/やや不満|分かりにく|わかりにく|あまり/.test(s)) return 2;
  if (/不満|全く|まったく/.test(s)) return 1;
  if (/とても|よく|大変|非常|強くなった|第一志望/.test(s)) return 5;
  if (/満足|おおむね|ある程度|分かりやす|良かった|つもり|併願/.test(s)) return 4;
  if (/どちらとも|検討/.test(s)) return 3;
  return null;
}

const SURVEY_COLORS = { 5: '#1B5E20', 4: '#66BB6A', 3: '#9E9E9E', 2: '#EF9A9A', 1: '#C62828', 0: '#E0E0E0' };

// 表（1行目が見出し）を集計する。rows: [[見出し…], [回答…], …]
function summarizeFormsSurvey(table, fileName) {
  const header = (table[0] || []).map(h => String(h == null ? '' : h).trim());
  const body = table.slice(1).filter(r => r && r.some(v => v !== null && v !== undefined && String(v).trim() !== ''));
  const idCol = header.indexOf('ID');
  const whoCol = header.findIndex(h => h.includes('回答される方'));
  const cell = (r, i) => String(r[i] == null ? '' : r[i]).trim();

  const questions = [];
  const comments = [];
  let matrix = null;  // 連続する「同じ選択肢の質問」をまとめる
  const flushMatrix = () => {
    if (matrix && matrix.items.length >= 2) questions.push(matrix);
    else if (matrix) matrix.items.forEach(it => questions.push({ kind: 'single', title: it.name, counts: Object.entries(it.counts) }));
    matrix = null;
  };

  header.forEach((title, i) => {
    if (!title || _isSkippedSurveyCol(title)) return;
    const vals = body.map(r => cell(r, i)).filter(Boolean);
    if (!vals.length) return;
    const count = list => list.reduce((m, v) => (m[v] = (m[v] || 0) + 1, m), {});

    // 同じ選択肢が並ぶ質問（学校説明・入試説明…）
    const distinct = [...new Set(vals)];
    if (distinct.every(v => SURVEY_MATRIX_OPTS.includes(v)) && title.length <= 15) {
      (matrix || (matrix = { kind: 'matrix', title: 'プログラムごとの満足度', items: [] })).items.push({ name: title, counts: count(vals), answered: vals.length });
      return;
    }
    flushMatrix();
    const staffOnly = SURVEY_STAFF_ONLY.test(title);

    if (vals.some(v => v.includes(';'))) {                       // 複数選択（Formsは「;」区切り）
      const all = vals.flatMap(v => v.split(';').map(s => s.trim()).filter(Boolean));
      questions.push({ kind: 'multi', title, staffOnly, answered: vals.length, counts: Object.entries(count(all)).sort((a, b) => b[1] - a[1]) });
    } else if (vals.every(v => /^\d+$/.test(v) && +v <= 10) && distinct.length > 3) {  // 0〜10点の評価
      const counts = Array.from({ length: 11 }, (_, n) => [String(n), vals.filter(v => +v === n).length]);
      const avg = vals.reduce((s, v) => s + +v, 0) / vals.length;
      questions.push({ kind: 'scale', title, staffOnly, answered: vals.length, counts, avg: Math.round(avg * 10) / 10 });
    } else if (distinct.length <= 8) {                           // 1つ選ぶ質問
      questions.push({ kind: 'single', title, staffOnly, answered: vals.length, counts: Object.entries(count(vals)) });
    } else {                                                     // 自由記述
      const q = { kind: 'text', title, staffOnly, qid: 'q' + i, answered: vals.length };
      questions.push(q);
      body.forEach((r, n) => {
        const text = cell(r, i);
        if (!text) return;
        comments.push({
          id: `forms-${idCol >= 0 ? cell(r, idCol) : n + 1}-${q.qid}`,
          qid: q.qid,
          text,
          who: whoCol >= 0 ? cell(r, whoCol) : '',
        });
      });
    }
  });
  flushMatrix();

  return {
    source: 'forms',
    fileName: fileName || '',
    imported_at: new Date().toISOString(),
    total: body.length,
    questions,
    comments,
  };
}

// ===== 保存・取得 =====
// 教職員向けに復号した事後アンケート（全項目）。exam.js の loadSharedExamRecords で設定
let _sharedPostSurveys = null;
function setSharedPostSurveys(map) { _sharedPostSurveys = map || null; }

function savePostSurvey(eventKey, survey) {
  return safeSet('post_survey_' + eventKey, survey);
}

// 生徒ページ＝公開版、先生のパソコン＝読み込んだもの、教職員＝暗号化共有、無ければ公開版
function getPostSurvey(eventKey) {
  if (_publishedCache) return (_publishedCache.postSurveys || {})[eventKey] || null;
  return safeGet('post_survey_' + eventKey)
    || (_sharedPostSurveys && _sharedPostSurveys[eventKey])
    || (safeGet('post_surveys_published') || {})[eventKey]
    || null;
}

// このパソコンで読み込んだ事後アンケート（今年度）
function getLocalPostSurveys() {
  const out = {};
  EVENTS_BY_YEAR[CURRENT_YEAR].forEach(e => {
    const s = safeGet('post_survey_' + e.key);
    if (s) out[e.key] = s;
  });
  return out;
}

// 公開用：教職員のみの質問と、公開にしていない自由記述を外す
function buildPublicPostSurveys() {
  const approved = getApprovedComments();
  const out = { ...(safeGet('post_surveys_published') || {}) };
  Object.entries(getLocalPostSurveys()).forEach(([key, s]) => {
    const ok = new Set((approved[key] || []).map(String));
    out[key] = {
      ...s,
      questions: s.questions.filter(q => !q.staffOnly),
      comments: s.comments.filter(c => ok.has(String(c.id))),
    };
  });
  return out;
}

// ===== 読み込み（教員ページ）=====
function importPostSurveyFile(file, eventKey, onDone) {
  if (!requireAdmin()) return;
  const name = file.name || '';
  const done = table => {
    const survey = summarizeFormsSurvey(table, name);
    if (!survey.total || !survey.questions.length) {
      showToast('アンケートの回答が見つかりませんでした。Formsの「Excelで開く」でダウンロードしたファイルか確認してください。', 'error');
      return;
    }
    savePostSurvey(eventKey, survey);
    showToast(`事後アンケート ${survey.total}件を読み込みました（氏名などの列は保存していません）。`, 'success');
    onDone && onDone(eventKey);
  };
  const reader = new FileReader();
  if (/\.csv$/i.test(name)) {
    reader.onload = e => done(Papa.parse(e.target.result, { skipEmptyLines: true }).data);
    reader.readAsText(file);
    return;
  }
  if (typeof XLSX === 'undefined') {
    showToast('Excelファイルを読む部品を読み込めませんでした。インターネット接続を確認して、ページを開き直してください。', 'error');
    return;
  }
  reader.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      done(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }));
    } catch (err) {
      console.error(err);
      showToast('Excelファイルを読み込めませんでした。ファイルを確認してください。', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function deletePostSurvey(eventKey, onDone) {
  if (!requireAdmin()) return;
  if (!confirm('このパソコンに読み込んだ事後アンケートを削除しますか？（公開済みのものは次に「🚀 GitHubに公開」するまで残ります）')) return;
  safeRemove('post_survey_' + eventKey);
  onDone && onDone(eventKey);
}

// ===== 表示 =====
function _surveyBars(counts, total, { sortByScore = true } = {}) {
  let entries = counts.filter(([, n]) => n > 0 || !sortByScore);
  const scored = entries.some(([l]) => surveyScore(l) !== null);
  if (sortByScore && scored) {
    entries = [...entries].sort((a, b) => (surveyScore(b[0]) ?? 3) - (surveyScore(a[0]) ?? 3) || b[1] - a[1]);
  }
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return `<div class="fs-bars">${entries.map(([label, n]) => {
    const sc = surveyScore(label);
    const color = scored ? SURVEY_COLORS[sc ?? 3] : 'var(--color-primary)';
    const pct = total ? Math.round(n * 100 / total) : 0;
    return `
      <div class="fs-bar-row">
        <div class="fs-bar-label">${escapeHtml(label)}</div>
        <div class="fs-bar-track"><div class="fs-bar-fill" style="width:${n * 100 / max}%;background:${color}"></div></div>
        <div class="fs-bar-num"><strong>${n}</strong>人<span>${pct}%</span></div>
      </div>`;
  }).join('')}</div>`;
}

function _surveyMatrixHTML(q) {
  const opts = SURVEY_MATRIX_OPTS.filter(o => q.items.some(it => it.counts[o]));
  const good = it => (it.counts['とても満足'] || 0) + (it.counts['満足'] || 0);
  const joined = it => it.answered - (it.counts['参加していない'] || 0);
  return `
    <div class="fs-matrix-wrap">
      <table class="fs-matrix">
        <thead><tr><th>プログラム</th>${opts.map(o => `<th><i style="background:${SURVEY_COLORS[surveyScore(o) ?? 3]}"></i>${escapeHtml(o)}</th>`).join('')}<th>満足以上<br><small>（参加した人のうち）</small></th></tr></thead>
        <tbody>${q.items.map(it => `
          <tr>
            <td class="fs-matrix-name">${escapeHtml(it.name)}</td>
            ${opts.map(o => `<td>${it.counts[o] || '<span class="fs-zero">0</span>'}</td>`).join('')}
            <td class="fs-matrix-rate"><strong>${joined(it) ? Math.round(good(it) * 100 / joined(it)) : 0}%</strong><small>（${good(it)}/${joined(it)}人）</small></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function _surveyScaleHTML(q) {
  const high = q.counts.filter(([n]) => +n >= 9).reduce((s, [, c]) => s + c, 0);
  const max = Math.max(1, ...q.counts.map(([, c]) => c));
  return `
    <div class="fs-scale-summary">
      <span>平均 <strong>${q.avg}</strong>点</span>
      <span>9〜10点 <strong>${high}</strong>人（${Math.round(high * 100 / q.answered)}%）</span>
    </div>
    <div class="fs-scale">${q.counts.map(([n, c]) => `
      <div class="fs-scale-col">
        <div class="fs-scale-num">${c || ''}</div>
        <div class="fs-scale-bar" style="height:${c * 100 / max}%;background:${+n >= 9 ? '#1B5E20' : +n >= 7 ? '#66BB6A' : '#BDBDBD'}"></div>
        <div class="fs-scale-label">${n}</div>
      </div>`).join('')}
    </div>
    <div class="fs-note">0＝すすめたくない … 10＝ぜひすすめたい</div>`;
}

// 事後アンケートの画面（イベント後分析タブ）
function buildPostSurveyHTML(eventKey, s) {
  const staffBadge = '<span class="fs-staff-badge">🔒 教職員のみ</span>';
  const cards = s.questions.map(q => {
    const head = `<div class="card-title">${escapeHtml(q.title)}${q.staffOnly ? staffBadge : ''}</div>`;
    if (q.kind === 'matrix') return `<div class="card fs-card">${head}${_surveyMatrixHTML(q)}</div>`;
    if (q.kind === 'scale') return `<div class="card fs-card">${head}${_surveyScaleHTML(q)}</div>`;
    if (q.kind === 'multi') return `<div class="card fs-card">${head}<div class="fs-note">複数選択（％は回答した${q.answered}人のうち選んだ人の割合）</div>${_surveyBars(q.counts, q.answered, { sortByScore: false })}</div>`;
    if (q.kind === 'text') return `
      <div class="card fs-card">${head}
        ${window.IS_ADMIN ? '<div class="comment-mod-hint">🌐ボタンで生徒ページに公開／再度押すと非公開</div>' : ''}
        <div id="fs-comments-${eventKey}-${q.qid}" class="feedback-list"></div>
      </div>`;
    return `<div class="card fs-card">${head}${_surveyBars(q.counts, q.answered)}</div>`;
  }).join('');
  return `
    <div class="post-event-intro">
      <div class="resp-summary-row">
        <span class="resp-summary-label">📝 事後アンケート回答数</span>
        <span class="resp-total">合計 <strong>${s.total}</strong> 件</span>
      </div>
      <div class="fs-source">BLENDではなく、生徒がMicrosoft Formsで回収したアンケートの集計です。</div>
    </div>
    ${cards}`;
}

// 自由記述の一覧（先生ページは公開切替つき、生徒ページは公開済みのみ）
function renderPostSurveyComments(eventKey, s) {
  s.questions.filter(q => q.kind === 'text').forEach(q => {
    const el = document.getElementById(`fs-comments-${eventKey}-${q.qid}`);
    if (!el) return;
    const list = s.comments.filter(c => c.qid === q.qid);
    const who = c => c.who ? `<span class="resp-badge fs-who">${escapeHtml(c.who)}</span>` : '';
    const text = c => escapeHtml(c.text).replace(/\n/g, '<br>');
    if (!window.IS_TEACHER) {
      el.innerHTML = list.length
        ? list.map(c => `<div class="feedback-item">${who(c)}${text(c)}</div>`).join('')
        : '<p class="fs-empty">公開されている回答はまだありません</p>';
      return;
    }
    if (!list.length) { el.innerHTML = '<p class="fs-empty">回答はありません</p>'; return; }
    const on = c => isCommentApproved(eventKey, c.id);
    const tag = window.IS_ADMIN ? 'button' : 'span';
    el.innerHTML = `<div class="comment-mod-summary">${list.length}件中 <strong>${list.filter(on).length}件</strong> を生徒ページに公開中</div>`
      + list.map(c => `
        <div class="feedback-item comment-mod-item${on(c) ? ' is-public' : ''}">
          <${tag} class="comment-toggle-btn${on(c) ? ' on' : ''}${window.IS_ADMIN ? '' : ' is-readonly'}" data-id="${escapeHtml(c.id)}">${on(c) ? '🌐 公開中' : '🔒 非公開'}</${tag}>
          <span class="comment-mod-text">${who(c)}${text(c)}</span>
        </div>`).join('');
    el.querySelectorAll('button.comment-toggle-btn').forEach(btn => btn.addEventListener('click', () => {
      toggleCommentApproval(eventKey, btn.dataset.id);
      renderPostSurveyComments(eventKey, s);
    }));
  });
}
