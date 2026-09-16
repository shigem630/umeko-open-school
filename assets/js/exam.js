// ===== 入試データ（受験者一覧・合格者一覧CSV）— 教員ページ専用・公開しない =====
// BLENDの「〇〇選抜_受験者一覧.csv」と「合格者一覧.csv」を読み込み、この端末のブラウザ（localStorage）にだけ保存する。
// 保存するのは 受験番号・プラスシードID・中学校・入試区分・専願/併願・OS参加有無・合格/入学 のみ。
// 氏名・ふりがな・住所・電話・メール・保護者名などは読み込んだ時点で捨て、保存しない。
// 教職員への共有：公開時に、この保存データを閲覧用パスワードから作った鍵で暗号化（AES-GCM）して data.json の examShared に入れる。
// 暗号化していない入試データは data.json に含めない。閲覧用パスワードでログインした人だけが復号して表示できる。

const EXAM_STORAGE_KEY = 'exam_records';
const EXAM_SHARED_KEY = 'exam_shared';        // data.json から取り込んだ暗号化データ
const EXAM_SHARE_KEY_KEY = 'exam_share_key';  // 管理者PCに保存する共有用の鍵（閲覧用パスワードは保存しない）
let _sharedExamRecords = null;                // 復号した共有データ（メモリ上のみ）

function _getExamRecords() {
  safeRemove('exam_summary'); // 旧形式（人数のみ）は合格者と照合できないため破棄 → 再読込を案内
  return safeGet(EXAM_STORAGE_KEY) || _sharedExamRecords;
}

async function _importAesKey(b64) {
  return crypto.subtle.importKey('raw', base64ToBytes(b64), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// 公開用：入試データを暗号化して返す（入試データが無ければ、取り込み済みの共有データをそのまま引き継ぐ）
// 戻り値: { shared: 暗号化データ or null, note: 利用者への補足 }
async function buildSharedExamPayload() {
  const rec = safeGet(EXAM_STORAGE_KEY);
  if (!rec) return { shared: safeGet(EXAM_SHARED_KEY), note: '' };

  // 閲覧用パスワードが変更されていたら、保存済みの鍵は使わず入力し直してもらう
  const saved = safeGet(EXAM_SHARE_KEY_KEY);
  let keyB64 = saved && saved.hash === STAFF_PASSWORD_HASH ? saved.key : null;
  if (!keyB64) {
    const pw = prompt('入試データを教職員にも共有するため、教職員に伝えた「閲覧用パスワード」を入力してください。\n（このパソコンでは初回のみ。キャンセルすると入試データは共有されません）');
    if (!pw) return { shared: null, note: '入試データは共有していません。' };
    if (await hashPassword(pw) !== STAFF_PASSWORD_HASH) {
      showToast('閲覧用パスワードが違います。入試データは共有していません。', 'error');
      return { shared: null, note: '入試データは共有していません。' };
    }
    keyB64 = await deriveExamShareKey(pw);
    safeSet(EXAM_SHARE_KEY_KEY, { hash: STAFF_PASSWORD_HASH, key: keyB64 });
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await _importAesKey(keyB64),
    new TextEncoder().encode(JSON.stringify(rec)));
  return { shared: { v: 1, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) }, note: '入試データも教職員に共有しました。' };
}

// 閲覧用：取り込み済みの暗号化データを復号してメモリに置く
// 戻り値: 'ok' / 'nodata'（共有なし）/ 'nokey'（鍵なし＝入り直しが必要）/ 'fail'（パスワード変更などで復号不可）
let _sharedExamStatus = 'nodata';
async function loadSharedExamRecords() {
  _sharedExamRecords = null;
  const blob = safeGet(EXAM_SHARED_KEY);
  if (!blob || !blob.data) return (_sharedExamStatus = 'nodata');
  const saved = safeGet(EXAM_SHARE_KEY_KEY);
  const keyB64 = sessionStorage.getItem('umeko_exam_key') || (saved && saved.key);
  if (!keyB64) return (_sharedExamStatus = 'nokey');
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(blob.iv) },
      await _importAesKey(keyB64), base64ToBytes(blob.data));
    _sharedExamRecords = JSON.parse(new TextDecoder().decode(plain));
    return (_sharedExamStatus = 'ok');
  } catch (_) {
    return (_sharedExamStatus = 'fail');
  }
}

function clearExamSummary() {
  if (!requireAdmin()) return;
  if (!confirm('読み込んだ入試データ（受験者・合格者）を削除します。よろしいですか？')) return;
  safeRemove(EXAM_STORAGE_KEY);
  showToast('入試データを削除しました。', 'success');
  refreshExamViews();
}

// 「学校推薦型選抜（普通科）（専願・併願）」→ { type: 学校推薦型選抜, dept: 普通科, label: 学校推薦型選抜（普通科） }
function _examKind(text) {
  const base = String(text || '').replace(/_受験者一覧.*$/, '').replace(/\.csv$/i, '');
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

// 受験者一覧・合格者一覧を読み込む（どちらか一方だけでも、まとめてでも可）
// 受験者一覧を含む場合は受験者データを入れ替え、合格者一覧を含む場合は合格者データを入れ替える
async function importExamFiles(fileList) {
  if (!requireAdmin()) return;
  const files = [...fileList].filter(f => f.name.toLowerCase().endsWith('.csv'));
  if (!files.length) { showToast('CSVファイル（.csv）を選択してください。', 'error'); return; }

  const applicants = { files: [], rows: [], latestApplied: '' };
  let passes = null;

  for (const file of files) {
    const text = await _readFileText(file);
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    const headers = result.meta.fields || [];
    const no = r => (r['受験番号'] || '').trim();

    if (headers.includes('受験番号') && headers.some(h => h.includes('入学'))) {
      // 合格者一覧
      const enrollCol = headers.find(h => h.includes('入学'));
      passes = {
        file: file.name,
        rows: result.data.filter(no).map(r => ({
          no: no(r),
          label: _examKind(r['日程']).label,
          dept: _examKind(r['日程']).dept,
          school: (r['中学校'] || '').trim() || '不明',
          enrolled: (r[enrollCol] || '').trim() === '入学',
        })),
      };
    } else if (headers.includes('受験番号') && headers.includes('中学校')) {
      // 受験者一覧（ファイル名から入試区分を判定）
      const kind = _examKind(file.name);
      const osCol = headers.find(h => h.includes('オープンスクール') && h.includes('参加'));
      const planCol = headers.find(h => h.includes('専願') && h.includes('併願'));
      let n = 0;
      result.data.filter(no).forEach(r => {
        n++;
        const applied = (r['出願日時'] || '').trim();
        if (applied > applicants.latestApplied) applicants.latestApplied = applied;
        applicants.rows.push({
          no: no(r),
          pid: (r['プラスシードID'] || '').trim(),
          school: (r['中学校'] || '').trim() || '不明',
          label: kind.label,
          dept: kind.dept,
          plan: planCol ? (r[planCol] || '').trim() : '',
          os: osCol ? (r[osCol] || '').trim() === '有' : false,
        });
      });
      applicants.files.push({ name: file.name, label: kind.label, count: n });
    } else {
      showToast(`「${file.name}」は受験者一覧・合格者一覧のCSVではないようです。読み込みを中止しました。`, 'error');
      return;
    }
  }

  const rec = _getExamRecords() || {};
  if (applicants.files.length) rec.applicants = applicants;
  if (passes) rec.passes = passes;
  rec.imported_at = new Date().toISOString();

  if (safeSet(EXAM_STORAGE_KEY, rec)) {
    const parts = [];
    if (applicants.files.length) parts.push(`受験者一覧 ${applicants.files.length}ファイル`);
    if (passes) parts.push(`合格者一覧（${passes.rows.length}名）`);
    showToast(`入試データを読み込みました（${parts.join('・')}）。`, 'success');
    refreshExamViews();
  }
}

// 入試区分の表示順：自己推薦型 → 学校推薦型 → 一般 → 二次募集（その他は最後）。同じ区分内は 普通科 → 音楽科
const EXAM_TYPE_ORDER = ['自己推薦', '学校推薦', '一般', '二次'];
const EXAM_DEPT_ORDER = ['普通科', '音楽科'];
function _examOrder(label) {
  const t = EXAM_TYPE_ORDER.findIndex(k => label.includes(k));
  const d = EXAM_DEPT_ORDER.findIndex(k => label.includes(k));
  return (t < 0 ? EXAM_TYPE_ORDER.length : t) * 10 + (d < 0 ? EXAM_DEPT_ORDER.length : d);
}

// 保存データから集計を作る
function getExamSummary() {
  const rec = _getExamRecords();
  if (!rec || (!rec.applicants && !rec.passes)) return null;
  const apps = rec.applicants ? rec.applicants.rows : [];
  const passRows = rec.passes ? rec.passes.rows : [];
  const appByNo = {};
  apps.forEach(a => { appByNo[a.no] = a; });

  // 入試年度：出願が10〜12月なら翌年度（例: 2025年12月出願 → 2026年度入試）
  let fiscal = '';
  const m = rec.applicants && rec.applicants.latestApplied.match(/^(\d{4})-(\d{2})/);
  if (m) fiscal = `${parseInt(m[2], 10) >= 10 ? +m[1] + 1 : +m[1]}年度入試`;

  // 受験者の実人数（プラスシードIDで重複除去）
  const personKey = a => a.pid || 'no:' + a.no;
  const persons = {};
  apps.forEach(a => {
    const p = persons[personKey(a)] || (persons[personKey(a)] = { school: a.school, os: false, depts: new Set(), labels: [] });
    if (a.os) p.os = true;
    p.depts.add(a.dept);
    p.labels.push(a);
  });
  const personList = Object.values(persons);

  // 入試区分別（延べ）
  const byExam = {};
  const ensureExam = label => byExam[label] || (byExam[label] = { label, total: 0, sengan: 0, heigan: 0, os: 0, passed: 0, enrolled: 0, hasApplicants: false });
  if (rec.applicants) rec.applicants.files.forEach(f => { ensureExam(f.label).hasApplicants = true; });
  apps.forEach(a => {
    const b = ensureExam(a.label);
    b.total++;
    if (a.plan === '専願') b.sengan++;
    if (a.plan === '併願') b.heigan++;
    if (a.os) b.os++;
  });
  passRows.forEach(p => {
    const b = ensureExam(p.label);
    b.passed++;
    if (p.enrolled) b.enrolled++;
  });

  // 中学校別
  const schools = {};
  const ensureSchool = short => schools[short] || (schools[short] = { short, total: 0, os: 0, general: 0, music: 0, sengan: 0, passed: 0, enrolled: 0, enrolledOs: 0 });
  personList.forEach(p => {
    const s = ensureSchool(p.school);
    s.total++;
    if (p.os) s.os++;
    if (p.depts.has('普通科')) s.general++;
    if (p.depts.has('音楽科')) s.music++;
    if (p.labels.some(a => a.plan === '専願')) s.sengan++;
  });
  let enrolledOs = 0, enrolledLinked = 0;
  passRows.forEach(p => {
    const s = ensureSchool(p.school);
    s.passed++;
    if (p.enrolled) {
      s.enrolled++;
      const a = appByNo[p.no];
      if (a) { enrolledLinked++; if (a.os) { enrolledOs++; s.enrolledOs++; } }
    }
  });

  const passedNos = new Set(passRows.map(p => p.no));
  const missingApplicantLabels = rec.applicants
    ? Object.values(byExam).filter(b => !b.hasApplicants && b.passed > 0).map(b => b.label)
    : [];

  return {
    fiscal,
    imported_at: rec.imported_at,
    hasApplicants: !!rec.applicants,
    hasPasses: !!rec.passes,
    applicantFiles: rec.applicants ? rec.applicants.files : [],
    total: personList.length,
    os: personList.filter(p => p.os).length,
    general: personList.filter(p => p.depts.has('普通科')).length,
    music: personList.filter(p => p.depts.has('音楽科')).length,
    multi: personList.filter(p => p.labels.length > 1).length,
    passed: passRows.length,
    enrolled: passRows.filter(p => p.enrolled).length,
    enrolledOs, enrolledLinked,
    notPassed: apps.filter(a => !passedNos.has(a.no)).length,
    missingApplicantLabels,
    byExam: Object.values(byExam).sort((x, y) => _examOrder(x.label) - _examOrder(y.label) || x.label.localeCompare(y.label, 'ja')),
    schools: Object.values(schools).sort((a, b) =>
      b.enrolled - a.enrolled || b.total - a.total || a.short.localeCompare(b.short, 'ja')),
  };
}

// 受験者一覧・合格者一覧の中学校名は略称（例: 長府中）→ 営業リスト・来場データの正式名（下関市立長府中学校）に対応づける
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

// 正式名 → { total: 受験者, enrolled: 入学者 }（浸透度マップから参照）
function getExamCountsBySchool() {
  const ex = getExamSummary();
  if (!ex) return null;
  const map = {};
  ex.schools.forEach(s => {
    const name = resolveExamSchoolName(s.short);
    const cur = map[name] || (map[name] = { total: 0, enrolled: 0 });
    cur.total += s.total;
    cur.enrolled += s.enrolled;
  });
  return { fiscal: ex.fiscal, hasApplicants: ex.hasApplicants, hasPasses: ex.hasPasses, map };
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
  if (!ex) { el.innerHTML = ''; return; }
  const parts = [];
  parts.push(ex.hasApplicants ? `受験者一覧 ${ex.applicantFiles.length}ファイル（${ex.total}名）` : '<span class="exam-warn">受験者一覧：未読込</span>');
  parts.push(ex.hasPasses ? `合格者一覧（${ex.passed}名）` : '<span class="exam-warn">合格者一覧：未読込</span>');
  el.innerHTML = `
    <span>✓ ${escapeHtml(ex.fiscal || '入試データ')}：${parts.join('・')}　読込日時 ${formatDatetimeDisplay(ex.imported_at)}</span>
    <button class="btn btn-ghost btn-sm" onclick="clearExamSummary()">削除</button>`;
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
    const staffMsg = {
      nokey: '入試データを表示するには、いったんこのタブを閉じ、閲覧用パスワードでもう一度ログインしてください。',
      fail:  '入試データを表示できませんでした。閲覧用パスワードが変更された可能性があります。管理者にお問い合わせください。',
    }[_sharedExamStatus] || '入試データはまだ共有されていません。管理者が公開すると表示されます。';
    body.innerHTML = `<p class="gap-empty" style="text-align:center">${window.IS_ADMIN
      ? '「データ管理」の「入試データ」欄から、BLENDの受験者一覧・合格者一覧のCSVを読み込むと表示されます。'
      : staffMsg}</p>`;
    return;
  }
  if (sub) sub.textContent = `${ex.fiscal || '入試'}の受験者・合格者・入学者（BLENDより）。教員ページのみに表示され、生徒用ページには表示されません`;

  const pen = typeof getJhsPenetration === 'function' ? getJhsPenetration() : null;
  const visitors = {};
  getSchoolTotals('jhs').forEach(t => { visitors[t.name.replace(/[\s　]/g, '')] = t.students; });
  const masterByName = {};
  if (pen) pen.schools.forEach(s => { masterByName[s.name] = s; });

  const pct = (a, b) => b > 0 ? Math.round(a * 100 / b) : 0;
  const dash = v => v ? v : '—';
  const P = ex.hasPasses;

  const warn = [];
  if (!ex.hasApplicants) warn.push('受験者一覧が読み込まれていないため、受験者数・OS参加は表示できません。');
  if (!P) warn.push('合格者一覧を読み込むと、合格者数・入学者数も表示されます。');
  if (ex.missingApplicantLabels.length) {
    warn.push(`合格者一覧にある「${ex.missingApplicantLabels.join('」「')}」の受験者一覧が読み込まれていません。受験者数・OS参加の人数は、この区分を除いた値です。`);
  }

  const examRows = ex.byExam.map(b => `
    <tr${b.hasApplicants ? '' : ' class="exam-row-missing"'}>
      <td>${escapeHtml(b.label)}</td>
      <td><b>${b.hasApplicants ? b.total : '—'}</b></td>
      <td>${b.hasApplicants ? dash(b.sengan) : '—'}</td><td>${b.hasApplicants ? dash(b.heigan) : '—'}</td>
      <td>${b.hasApplicants ? b.os : '—'}</td>
      ${P ? `<td>${b.passed}</td><td><b>${b.enrolled}</b></td>` : ''}
    </tr>`).join('');

  const schoolRows = ex.schools.map(s => {
    const name = resolveExamSchoolName(s.short);
    const m = masterByName[name];
    const label = name.replace(/^.+?[市町村]立/, '');
    return `<tr>
      <td class="gap-name">${escapeHtml(label)}${m ? `<span class="gap-city">${escapeHtml(m.city)}</span>` : ''}</td>
      <td><b>${dash(s.total)}</b></td><td>${dash(s.os)}</td>
      ${P ? `<td>${dash(s.passed)}</td><td><b>${dash(s.enrolled)}</b></td>` : ''}
      <td>${visitors[name] != null ? visitors[name] : 0}</td>
      <td>${m && m.g3 ? m.g3 : '—'}</td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    ${warn.length ? `<div class="exam-notice">${warn.map(w => `<div>⚠️ ${escapeHtml(w)}</div>`).join('')}</div>` : ''}
    <div class="pen-summary">
      <div class="pen-kpi"><span class="pen-kpi-label">受験者（実人数）</span><span class="pen-kpi-value">${ex.hasApplicants ? ex.total : '—'}<small>名</small></span><span class="pen-kpi-sub">${ex.hasApplicants ? `うち本校OS参加 ${ex.os}名（${pct(ex.os, ex.total)}%）` : '受験者一覧が未読込'}</span></div>
      <div class="pen-kpi"><span class="pen-kpi-label">合格者</span><span class="pen-kpi-value">${P ? ex.passed : '—'}<small>名</small></span><span class="pen-kpi-sub">${P && ex.hasApplicants ? `受験者一覧のうち合格者一覧にない人 ${ex.notPassed}名` : '合格者一覧より'}</span></div>
      <div class="pen-kpi"><span class="pen-kpi-label">入学者</span><span class="pen-kpi-value">${P ? ex.enrolled : '—'}<small>名</small></span><span class="pen-kpi-sub">${P && ex.enrolledLinked ? `照合できた${ex.enrolledLinked}名のうち本校OS参加 ${ex.enrolledOs}名` : '合格者一覧の「入学」の人数'}</span></div>
    </div>

    <h3 class="gap-title">入試区分別</h3>
    <p class="gap-desc">延べ人数（複数の入試を受けた人は、それぞれの区分で数えています）。${P ? '合格者一覧で「入学」以外（未登録）の人は、入学者に含めていません。' : ''}</p>
    <div style="overflow-x:auto">
      <table class="gap-table exam-table">
        <thead><tr><th>入試区分</th><th>受験者</th><th>専願</th><th>併願</th><th>OS参加</th>${P ? '<th>合格者</th><th>入学者</th>' : ''}</tr></thead>
        <tbody>${examRows}</tbody>
      </table>
    </div>

    <h3 class="gap-title" style="margin-top:var(--space-5, 20px)">中学校別</h3>
    <p class="gap-desc">${P ? '入学者の多い順。' : '受験者の多い順。'}「今年度OS来場」は今年度（2026年度）のオープンスクール来場者（実人数）で、学年が異なるため参考値です。</p>
    <div class="exam-school-scroll">
      <table class="gap-table exam-table">
        <thead><tr><th>中学校</th><th>受験者</th><th>うちOS参加</th>${P ? '<th>合格者</th><th>入学者</th>' : ''}<th>今年度OS来場</th><th>中3生徒数</th></tr></thead>
        <tbody>${schoolRows}</tbody>
      </table>
    </div>`;
}
