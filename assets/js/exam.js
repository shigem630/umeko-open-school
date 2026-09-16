// ===== 入試データ（受験者一覧CSV）— 教員ページ専用・公開しない =====
// BLENDの「〇〇選抜_受験者一覧.csv」を複数まとめて読み込み、学校別・入試区分別の人数だけを集計して
// この端末のブラウザ（localStorage）に保存する。氏名・住所・連絡先などは保存しない。
// data.json（公開用）には含めない（publish.js の buildExportData は exam_summary を出力しない）。

const EXAM_STORAGE_KEY = 'exam_summary';

function getExamSummary() {
  return safeGet(EXAM_STORAGE_KEY);
}

function clearExamSummary() {
  if (!confirm('読み込んだ入試データ（学校別の受験者数）を削除します。よろしいですか？')) return;
  safeRemove(EXAM_STORAGE_KEY);
  showToast('入試データを削除しました。', 'success');
  refreshExamViews();
}

// ファイル名から入試区分と学科を判定（例: 学校推薦型選抜（普通科）（専願・併願）_受験者一覧.csv）
function _examKindFromFileName(fileName) {
  const base = fileName.replace(/_受験者一覧.*$/, '').replace(/\.csv$/i, '');
  const dept = base.includes('音楽科') ? '音楽科' : base.includes('普通科') ? '普通科' : '';
  const type = base.replace(/（[^）]*）/g, '').trim() || 'その他';
  return { dept, type, label: dept ? `${type}（${dept}）` : type };
}

function _readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const buf = e.target.result;
      const b = new Uint8Array(buf).slice(0, 3);
      const enc = (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) ? 'utf-8' : 'shift-jis';
      resolve(new TextDecoder(enc, { fatal: false }).decode(buf));
    };
    reader.onerror = () => reject(new Error('read'));
    reader.readAsArrayBuffer(file);
  });
}

// 複数の受験者一覧CSVを読み込み、人数の集計だけを保存する
async function importExamFiles(fileList) {
  const files = [...fileList].filter(f => f.name.toLowerCase().endsWith('.csv'));
  if (!files.length) { showToast('CSVファイル（.csv）を選択してください。', 'error'); return; }

  const persons = {};   // 受験者キー（プラスシードID）→ 集計用の情報（氏名などは持たない）
  const fileInfo = [];
  let latestApplied = '';

  for (const file of files) {
    const text = await _readFileText(file);
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    const headers = result.meta.fields || [];
    if (!headers.includes('受験番号') || !headers.includes('中学校')) {
      showToast(`「${file.name}」は受験者一覧のCSVではないようです。読み込みを中止しました。`, 'error');
      return;
    }
    const kind = _examKindFromFileName(file.name);
    const osCol = headers.find(h => h.includes('オープンスクール') && h.includes('参加'));
    const planCol = headers.find(h => h.includes('専願') && h.includes('併願'));

    let n = 0;
    for (const r of result.data) {
      const key = (r['プラスシードID'] || '').trim() || ('b:' + (r['BLEND管理番号'] || '').trim());
      if (key === 'b:') continue;
      n++;
      const applied = (r['出願日時'] || '').trim();
      if (applied > latestApplied) latestApplied = applied;
      if (!persons[key]) {
        persons[key] = {
          school: (r['中学校'] || '').trim() || '不明',
          code: (r['中学校コード'] || '').trim(),
          os: false,
          exams: [],
        };
      }
      const p = persons[key];
      if (osCol && (r[osCol] || '').trim() === '有') p.os = true;
      p.exams.push({ label: kind.label, dept: kind.dept, plan: planCol ? (r[planCol] || '').trim() : '' });
    }
    fileInfo.push({ name: file.name, label: kind.label, count: n });
  }

  const summary = _buildExamSummary(Object.values(persons), fileInfo, latestApplied);
  if (safeSet(EXAM_STORAGE_KEY, summary)) {
    showToast(`入試データを読み込みました（受験者 ${summary.total}名・${files.length}ファイル）。`, 'success');
    refreshExamViews();
  }
}

function _buildExamSummary(list, fileInfo, latestApplied) {
  // 入試年度：出願が10〜12月なら翌年度、1〜9月ならその年度（例: 2025年12月出願 → 2026年度入試）
  let fiscal = '';
  const m = latestApplied.match(/^(\d{4})-(\d{2})/);
  if (m) fiscal = `${parseInt(m[2], 10) >= 10 ? +m[1] + 1 : +m[1]}年度入試`;

  const byExam = {};
  fileInfo.forEach(f => { byExam[f.label] = { label: f.label, total: 0, sengan: 0, heigan: 0, os: 0 }; });
  const schools = {};
  let os = 0, music = 0, general = 0, multi = 0;

  list.forEach(p => {
    if (p.os) os++;
    const depts = new Set(p.exams.map(e => e.dept));
    if (depts.has('音楽科')) music++;
    if (depts.has('普通科')) general++;
    if (p.exams.length > 1) multi++;
    p.exams.forEach(e => {
      const b = byExam[e.label];
      b.total++;
      if (e.plan === '専願') b.sengan++;
      if (e.plan === '併願') b.heigan++;
      if (p.os) b.os++;
    });
    const s = schools[p.school] || (schools[p.school] = { short: p.school, code: p.code, total: 0, os: 0, general: 0, music: 0, sengan: 0 });
    s.total++;
    if (p.os) s.os++;
    if (depts.has('普通科')) s.general++;
    if (depts.has('音楽科')) s.music++;
    if (p.exams.some(e => e.plan === '専願')) s.sengan++;
  });

  return {
    imported_at: new Date().toISOString(),
    fiscal,
    files: fileInfo,
    total: list.length, os, music, general, multi,
    byExam: Object.values(byExam),
    schools: Object.values(schools).sort((a, b) => b.total - a.total || a.short.localeCompare(b.short, 'ja')),
  };
}

// 受験者一覧の中学校名は略称（例: 長府中）→ 営業リスト・来場データの正式名（下関市立長府中学校）に対応づける
function resolveExamSchoolName(short) {
  const core = short.endsWith('中') ? short + '学校' : short;
  const candidates = new Set();
  if (typeof SCHOOLS_MASTER_JHS !== 'undefined') SCHOOLS_MASTER_JHS.forEach(s => candidates.add(s.name));
  getSchoolTotals('jhs').forEach(t => candidates.add(t.name.replace(/[\s　]/g, '')));
  if (typeof SCHOOLS_GEO !== 'undefined') Object.keys(SCHOOLS_GEO).forEach(n => candidates.add(n));
  if (candidates.has(short)) return short;
  const hits = [...candidates].filter(n => n.replace(/^.+?[市町村]立/, '') === core);
  return hits.length === 1 ? hits[0] : short;
}

// 正式名 → 受験者数（浸透度マップから参照）
function getExamCountsBySchool() {
  const ex = getExamSummary();
  if (!ex) return null;
  const map = {};
  ex.schools.forEach(s => {
    const name = resolveExamSchoolName(s.short);
    map[name] = (map[name] || 0) + s.total;
  });
  return { fiscal: ex.fiscal, map };
}

// ===== 表示 =====
function refreshExamViews() {
  renderExamUploadState();
  renderExamSection();
  if (typeof renderSchoolMap === 'function') renderSchoolMap();
}

function renderExamUploadState() {
  const el = document.getElementById('exam-upload-state');
  if (!el) return;
  const ex = getExamSummary();
  el.innerHTML = ex ? `
    <span>✓ ${escapeHtml(ex.fiscal || '入試データ')}：受験者 ${ex.total}名（${ex.files.length}ファイル）を読込済（${formatDatetimeDisplay(ex.imported_at)}）</span>
    <button class="btn btn-ghost btn-sm" onclick="clearExamSummary()">削除</button>` : '';
}

function setupExamUpload() {
  const zone = document.getElementById('exam-upload-zone');
  if (!zone) return;
  const input = zone.querySelector('input[type="file"]');
  input.addEventListener('change', () => { importExamFiles(input.files); input.value = ''; });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    importExamFiles(e.dataTransfer.files);
  });
  renderExamUploadState();
}

function renderExamSection() {
  const body = document.getElementById('exam-section-body');
  if (!body) return;
  const ex = getExamSummary();
  const sub = document.getElementById('exam-section-subtitle');
  if (!ex) {
    if (sub) sub.textContent = '教員ページのみに表示され、生徒ページには公開されません';
    body.innerHTML = '<p class="gap-empty" style="text-align:center">「データ管理」の「入試データ」欄から、BLENDの受験者一覧CSVを読み込むと表示されます。</p>';
    return;
  }
  if (sub) sub.textContent = `${ex.fiscal}の受験者（BLEND受験者一覧より）。教員ページのみに表示され、公開されません`;

  const pen = typeof getJhsPenetration === 'function' ? getJhsPenetration() : null;
  const visitors = {};
  getSchoolTotals('jhs').forEach(t => { visitors[t.name.replace(/[\s　]/g, '')] = t.students; });
  const masterByName = {};
  if (pen) pen.schools.forEach(s => { masterByName[s.name] = s; });

  const pct = (a, b) => b > 0 ? Math.round(a * 100 / b) : 0;
  const examRows = ex.byExam.map(b => `
    <tr><td>${escapeHtml(b.label)}</td><td><b>${b.total}</b></td>
      <td>${b.sengan || '—'}</td><td>${b.heigan || '—'}</td><td>${b.os}</td></tr>`).join('');

  const schoolRows = ex.schools.map(s => {
    const name = resolveExamSchoolName(s.short);
    const m = masterByName[name];
    const label = name.replace(/^.+?[市町村]立/, '');
    return `<tr>
      <td class="gap-name">${escapeHtml(label)}${m ? `<span class="gap-city">${escapeHtml(m.city)}</span>` : ''}</td>
      <td><b>${s.total}</b></td><td>${s.os}</td><td>${s.sengan || '—'}</td>
      <td>${s.music ? `普${s.general}・音${s.music}` : '普通科'}</td>
      <td>${visitors[name] != null ? visitors[name] : 0}</td>
      <td>${m && m.g3 ? m.g3 : '—'}</td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div class="pen-summary">
      <div class="pen-kpi"><span class="pen-kpi-label">受験者（実人数）</span><span class="pen-kpi-value">${ex.total}<small>名</small></span><span class="pen-kpi-sub">普通科 ${ex.general}名・音楽科 ${ex.music}名${ex.multi ? `（複数回受験 ${ex.multi}名は1名で集計）` : ''}</span></div>
      <div class="pen-kpi"><span class="pen-kpi-label">うち本校OSに参加</span><span class="pen-kpi-value">${ex.os}<small>名（${pct(ex.os, ex.total)}%）</small></span><span class="pen-kpi-sub">受験者一覧の「オープンスクール参加有無」より</span></div>
      <div class="pen-kpi"><span class="pen-kpi-label">受験者のいた中学校</span><span class="pen-kpi-value">${ex.schools.length}<small>校</small></span><span class="pen-kpi-sub">最多：${escapeHtml(ex.schools[0] ? resolveExamSchoolName(ex.schools[0].short).replace(/^.+?[市町村]立/, '') + ' ' + ex.schools[0].total + '名' : '—')}</span></div>
    </div>

    <h3 class="gap-title">入試区分別</h3>
    <p class="gap-desc">延べ人数（二次募集などで複数回受験した人は、それぞれの区分で数えています）</p>
    <div style="overflow-x:auto">
      <table class="gap-table exam-table">
        <thead><tr><th>入試区分</th><th>受験者</th><th>専願</th><th>併願</th><th>OS参加</th></tr></thead>
        <tbody>${examRows}</tbody>
      </table>
    </div>

    <h3 class="gap-title" style="margin-top:var(--space-5, 20px)">中学校別</h3>
    <p class="gap-desc">受験者の多い順。「今年度OS来場」は今年度（2026年度）のオープンスクール来場者（実人数）で、学年が異なるため参考値です。</p>
    <div class="exam-school-scroll">
      <table class="gap-table exam-table">
        <thead><tr><th>中学校</th><th>受験者</th><th>うちOS参加</th><th>専願</th><th>学科</th><th>今年度OS来場</th><th>中3生徒数</th></tr></thead>
        <tbody>${schoolRows}</tbody>
      </table>
    </div>`;
}
