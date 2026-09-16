// ===== 入試結果の分析（受験者一覧・合格者一覧・過去のオープンスクール申込一覧）— 教員ページ専用 =====
// BLENDの「〇〇選抜_受験者一覧.csv」「合格者一覧.csv」と、過去の「〇〇_申込一覧.csv」を読み込み、このブラウザ（localStorage）に保存する。
// 保存するのは 受験番号・プラスシードID・学校名・入試区分・学科/コース・専願/併願・OS参加有無・合格/入学、
// 申込一覧は プラスシードID・学校名・学年・来場有無 のみ。氏名・ふりがな・住所・電話・メール・保護者名などは読み込んだ時点で捨てる。
// 教職員への共有：公開時に、この保存データを閲覧用パスワードから作った鍵で暗号化（AES-GCM）して data.json の examShared に入れる。
// 暗号化していない入試データは data.json に含めない。閲覧用パスワードでログインした人だけが復号して表示できる。
//
// 年度の考え方（募集年度）：「2026年度募集」＝2025年度のオープンスクール → 2026年1〜2月の入試（2026年度入試）→ 2026年4月入学。
// 高校入試（中学生向け）と中学入試（小学生向け）を分けて扱う。

const EXAM_STORAGE_KEY = 'exam_data_v2';
const EXAM_STORAGE_KEY_V1 = 'exam_records';   // 旧形式（高校入試1年分のみ）→ 読み込み時に v2 へ移行
const EXAM_SHARED_KEY = 'exam_shared';        // data.json から取り込んだ暗号化データ
const EXAM_SHARE_KEY_KEY = 'exam_share_key';  // 管理者PCに保存する共有用の鍵（閲覧用パスワードは保存しない）
let _sharedExamData = null;                   // 復号した共有データ（メモリ上のみ）

// 今年度のオープンスクールの実施年度（config.js の EVENTS から判定）
const OS_YEAR = parseInt(EVENTS[0].date.slice(0, 4), 10);

const EXAM_SIDES = {
  high:   { label: '高校入試', audience: '中学生', schoolCol: '中学校', unit: '中学校', targetGrade: '3年生', gradeLabel: '中3', slotTypes: ['jhs', 'music'] },
  junior: { label: '中学入試', audience: '小学生', schoolCol: '小学校', unit: '小学校', targetGrade: '6年生', gradeLabel: '小6', slotTypes: ['elm'] },
};

// ===== 保存データ =====
function _emptyExamData() {
  return { version: 2, exams: {}, visits: {} };
}

// 出願日時（YYYY-MM-DD…）→ 入試年度。4月以降の出願は翌年度の入試（例: 2025年12月出願 → 2026年度入試）
function _fiscalFromApplied(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})/);
  return m ? (+m[2] >= 4 ? +m[1] + 1 : +m[1]) : null;
}

// 旧形式 { applicants, passes, imported_at }（高校入試のみ）→ v2
function _migrateExamData(obj) {
  if (!obj) return null;
  if (obj.version === 2) return obj;
  if (!obj.applicants && !obj.passes) return null;
  const fiscal = _fiscalFromApplied(obj.applicants && obj.applicants.latestApplied) || OS_YEAR;
  const data = _emptyExamData();
  data.exams[`high-${fiscal}`] = {
    side: 'high', fiscal, applicants: obj.applicants || null, passes: obj.passes || null, imported_at: obj.imported_at,
  };
  return data;
}

// このパソコンで読み込んだデータ（旧形式があれば移行して保存し直す）
function _getLocalExamData() {
  safeRemove('exam_summary'); // さらに古い形式（人数のみ）は照合できないため破棄
  const v1 = safeGet(EXAM_STORAGE_KEY_V1);
  if (v1) {
    const cur = safeGet(EXAM_STORAGE_KEY);
    const migrated = _migrateExamData(v1);
    if (!cur && migrated && safeSet(EXAM_STORAGE_KEY, migrated)) safeRemove(EXAM_STORAGE_KEY_V1);
    else if (cur) safeRemove(EXAM_STORAGE_KEY_V1);
  }
  return safeGet(EXAM_STORAGE_KEY);
}

// 表示に使うデータ：このパソコンで読み込んだもの → なければ共有（暗号化）データ
function _getExamData() {
  return _getLocalExamData() || _sharedExamData;
}

async function _importAesKey(b64) {
  return crypto.subtle.importKey('raw', base64ToBytes(b64), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// 公開用：入試データを暗号化して返す（このパソコンに入試データが無ければ、取り込み済みの共有データをそのまま引き継ぐ）
// 戻り値: { shared: 暗号化データ or null, note: 利用者への補足 }
async function buildSharedExamPayload() {
  const rec = _getLocalExamData();
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
  return { shared: { v: 2, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) }, note: '入試データも教職員に共有しました。' };
}

// 閲覧用：取り込み済みの暗号化データを復号してメモリに置く
// 戻り値: 'ok' / 'nodata'（共有なし）/ 'nokey'（鍵なし＝入り直しが必要）/ 'fail'（パスワード変更などで復号不可）
let _sharedExamStatus = 'nodata';
async function loadSharedExamRecords() {
  _sharedExamData = null;
  const blob = safeGet(EXAM_SHARED_KEY);
  if (!blob || !blob.data) return (_sharedExamStatus = 'nodata');
  const saved = safeGet(EXAM_SHARE_KEY_KEY);
  const keyB64 = sessionStorage.getItem('umeko_exam_key') || (saved && saved.key);
  if (!keyB64) return (_sharedExamStatus = 'nokey');
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(blob.iv) },
      await _importAesKey(keyB64), base64ToBytes(blob.data));
    _sharedExamData = _migrateExamData(JSON.parse(new TextDecoder().decode(plain)));
    return (_sharedExamStatus = _sharedExamData ? 'ok' : 'nodata');
  } catch (_) {
    return (_sharedExamStatus = 'fail');
  }
}

function clearExamSummary() {
  if (!requireAdmin()) return;
  if (!confirm('読み込んだ入試データ（受験者一覧・合格者一覧・過去のオープンスクール）をすべて削除します。よろしいですか？')) return;
  safeRemove(EXAM_STORAGE_KEY);
  safeRemove(EXAM_STORAGE_KEY_V1);
  showToast('入試データを削除しました。', 'success');
  refreshExamViews();
}

// ===== 読み込み =====

// 「学校推薦型選抜（普通科）（専願・併願）」→ { type, dept: 普通科, label: 学校推薦型選抜（普通科）, plan: '' }
// 「自己推薦型選抜（専願）」のように専願のみの区分は plan='専願'（CSVに専願／併願の列が無い場合に使う）
function _examKind(text) {
  const base = String(text || '').replace(/_受験者一覧.*$/, '').replace(/\.csv$/i, '').trim();
  const dept = base.includes('音楽科') ? '音楽科' : base.includes('普通科') ? '普通科' : '';
  const type = base.replace(/（[^）]*）/g, '').trim() || 'その他';
  const plan = /（専願）/.test(base) ? '専願' : /（併願）/.test(base) ? '併願' : '';
  return { dept, type, label: dept ? `${type}（${dept}）` : type, plan };
}

// コース：「GSSコース（Wake-Up全員留学留学必須）」→「GSSコース」。音楽科は「音楽科」
function _examCourse(dept, raw) {
  if (dept === '音楽科') return '音楽科';
  return String(raw || '').replace(/（[^）]*）|\([^)]*\)/g, '').trim();
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

// 申込一覧のファイル名 →「第2回小学生対象オープンスクール」（「 (2)」などの重複番号は除く）
function _eventNameFromFile(name) {
  return name.replace(/\.csv$/i, '').replace(/\s*\(\d+\)\s*$/, '').replace(/_申込一覧.*$/, '').trim();
}

// 受験者一覧・合格者一覧・過去の申込一覧をまとめて読み込む（ファイルの種類は列名から自動判定）
// ・受験者一覧：入試区分ごとに置き換え（同じ年度・同じ区分を読み込み直すと上書き）
// ・合格者一覧：受験番号が一致する年度の合格者を置き換え
// ・申込一覧：「過去のオープンスクールの年度」欄で選んだ年度の回として保存（同名の回は上書き）
async function importExamFiles(fileList) {
  if (!requireAdmin()) return;
  const files = [...fileList].filter(f => f.name.toLowerCase().endsWith('.csv'));
  if (!files.length) { showToast('CSVファイル（.csv）を選択してください。', 'error'); return; }

  const osYearEl = document.getElementById('exam-os-year');
  const osYear = parseInt(osYearEl && osYearEl.value, 10) || OS_YEAR - 1;

  // 今年度のオープンスクール（上の各回の欄で読込済み）のBLEND管理番号。過去分として重複登録しないため
  const currentIds = new Set();
  EVENTS.forEach(ev => ev.csvSlots.forEach(s => {
    const d = getEventData(s.id);
    (d && d.rows || []).forEach(r => { if (r.blend_id) currentIds.add(String(r.blend_id)); });
  }));

  const newApplicants = {};  // 'high-2026' -> { side, fiscal, files, rows, latestApplied }
  const newPasses = [];      // { side, file, rows }
  const newEvents = [];      // { name, side, kind, rows }
  const skipped = { current: [], empty: [], unknown: [] };

  for (const file of files) {
    const text = await _readFileText(file);
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    const headers = result.meta.fields || [];
    const side = headers.includes('小学校') ? 'junior' : headers.includes('中学校') ? 'high' : null;
    if (!side) { skipped.unknown.push(file.name); continue; }
    const schoolCol = EXAM_SIDES[side].schoolCol;
    const val = (r, c) => (c && r[c] != null ? String(r[c]) : '').trim();
    const no = r => val(r, '受験番号');
    const enrollCol = headers.find(h => h.includes('入学'));

    if (headers.includes('受験番号') && headers.includes('日程') && enrollCol) {
      // 合格者一覧
      const rows = result.data.filter(no).map(r => {
        const k = _examKind(val(r, '日程'));
        return { no: no(r), label: k.label, dept: k.dept, plan: k.plan, school: val(r, schoolCol) || '不明', enrolled: val(r, enrollCol) === '入学' };
      });
      if (!rows.length) { skipped.empty.push(file.name); continue; }
      newPasses.push({ side, file: file.name, rows });

    } else if (headers.includes('受験番号')) {
      // 受験者一覧（ファイル名から入試区分を判定）
      const kind = _examKind(file.name);
      const osCol = headers.find(h => h.includes('オープンスクール') && h.includes('参加'));
      const planCol = headers.find(h => h.includes('専願') && h.includes('併願'));
      const courseCol = headers.find(h => h === 'コース選択');
      const rows = result.data.filter(no);
      if (!rows.length) { skipped.empty.push(file.name); continue; }
      const latest = rows.map(r => val(r, '出願日時')).sort().pop() || '';
      const fiscal = _fiscalFromApplied(latest) || OS_YEAR;
      const key = `${side}-${fiscal}`;
      const bucket = newApplicants[key] || (newApplicants[key] = { side, fiscal, files: [], rows: [], latestApplied: '' });
      if (latest > bucket.latestApplied) bucket.latestApplied = latest;
      rows.forEach(r => bucket.rows.push({
        no: no(r),
        pid: val(r, 'プラスシードID'),
        school: val(r, schoolCol) || '不明',
        label: kind.label,
        dept: kind.dept,
        course: _examCourse(kind.dept, val(r, courseCol)),
        plan: val(r, planCol) || kind.plan,
        os: val(r, osCol) === '有',
      }));
      bucket.files.push({ name: file.name, label: kind.label, count: rows.length });

    } else if (headers.includes('申込番号') && headers.includes('来場')) {
      // 過去のオープンスクール・説明会・体験会の申込一覧
      const rows = result.data.filter(r => val(r, '申込番号') || val(r, 'BLEND管理番号'));
      if (!rows.length) { skipped.empty.push(file.name); continue; }
      if (osYear >= OS_YEAR || rows.some(r => currentIds.has(val(r, 'BLEND管理番号')))) { skipped.current.push(file.name); continue; }
      const name = _eventNameFromFile(file.name);
      newEvents.push({
        name, side,
        kind: name.includes('説明会') ? 'briefing' : name.includes('音楽') ? 'music' : 'os',
        rows: rows.map(r => ({ pid: val(r, 'プラスシードID'), school: val(r, schoolCol), grade: val(r, '学年'), attended: val(r, '来場') === '来場済み' })),
      });

    } else {
      skipped.unknown.push(file.name);
    }
  }

  const data = _getLocalExamData() || (_sharedExamData ? JSON.parse(JSON.stringify(_sharedExamData)) : _emptyExamData());
  const now = new Date().toISOString();

  // 受験者一覧：入試区分（ファイル）ごとに置き換え
  Object.entries(newApplicants).forEach(([key, b]) => {
    const ex = data.exams[key] || (data.exams[key] = { side: b.side, fiscal: b.fiscal, applicants: null, passes: null });
    const labels = new Set(b.files.map(f => f.label));
    const old = ex.applicants || { files: [], rows: [], latestApplied: '' };
    ex.applicants = {
      files: old.files.filter(f => !labels.has(f.label)).concat(b.files),
      rows: old.rows.filter(r => !labels.has(r.label)).concat(b.rows),
      latestApplied: [old.latestApplied, b.latestApplied].sort().pop(),
    };
    ex.imported_at = now;
  });

  // 合格者一覧：受験番号の一致が最も多い年度に入れる（受験者一覧が無ければ最新年度、それも無ければ選択年度の翌年度）
  newPasses.forEach(p => {
    const nos = new Set(p.rows.map(r => r.no));
    const cands = Object.values(data.exams).filter(e => e.side === p.side);
    let best = null, bestHits = 0;
    cands.forEach(e => {
      const hits = (e.applicants ? e.applicants.rows : []).filter(r => nos.has(r.no)).length;
      if (hits > bestHits) { best = e; bestHits = hits; }
    });
    if (!best) best = cands.sort((a, b) => b.fiscal - a.fiscal)[0];
    if (!best) {
      const fiscal = osYear + 1;
      best = data.exams[`${p.side}-${fiscal}`] = { side: p.side, fiscal, applicants: null, passes: null };
    }
    best.passes = { file: p.file, rows: p.rows };
    best.imported_at = now;
  });

  // 申込一覧：年度・回ごとに置き換え
  newEvents.forEach(e => {
    const y = data.visits[osYear] || (data.visits[osYear] = { events: {} });
    y.events[`${e.side}:${e.name}`] = e;
    y.imported_at = now;
  });

  const parts = [];
  const nApp = Object.values(newApplicants).reduce((a, b) => a + b.files.length, 0);
  if (nApp) parts.push(`受験者一覧 ${nApp}ファイル`);
  if (newPasses.length) parts.push(`合格者一覧 ${newPasses.length}ファイル`);
  if (newEvents.length) parts.push(`${osYear}年度のオープンスクール等 ${newEvents.length}回分`);
  const notes = [];
  if (skipped.empty.length) notes.push(`0件のため読み飛ばし：${skipped.empty.join('、')}`);
  if (skipped.current.length) notes.push(`今年度（${OS_YEAR}年度）の申込一覧のため読み飛ばし：${skipped.current.join('、')}（今年度分は上の各回の欄で読み込んでください。過去の年度のファイルなら「過去のオープンスクールの年度」を確認してください）`);
  if (skipped.unknown.length) notes.push(`受験者一覧・合格者一覧・申込一覧ではないため読み飛ばし：${skipped.unknown.join('、')}`);

  if (!parts.length) {
    showToast(`読み込めるファイルがありませんでした。${notes.join(' ／ ')}`, 'error');
    return;
  }
  if (safeSet(EXAM_STORAGE_KEY, data)) {
    safeRemove(EXAM_STORAGE_KEY_V1);
    showToast(`読み込みました（${parts.join('・')}）。${notes.length ? ' ' + notes.join(' ／ ') : ''}`, notes.length ? 'warning' : 'success');
    refreshExamViews();
  }
}

// ===== 学校名 =====
// 「下関市立勝山中学校」「勝山中学校」「勝山中」→「勝山中」にそろえて照合する
function _shortSchoolName(name) {
  return String(name || '').replace(/[\s　]/g, '')
    .replace(/^.+?[市町村]立/, '').replace(/^(山口県立|福岡県立|県立|国立|私立)/, '')
    .replace(/学校$/, '') || '不明';
}

// BLENDの動作確認用の登録（学校名が「梅光（デモ）」「テスト小学校」など）は集計から除く
function _isTestEntry(schoolName) {
  return /デモ|テスト/.test(String(schoolName || ''));
}

let _schoolIndex = null;  // 略称 → [{ name, city }]
function _schoolCandidates(short) {
  if (!_schoolIndex) {
    _schoolIndex = {};
    const add = (name, city) => {
      const k = _shortSchoolName(name);
      const list = _schoolIndex[k] || (_schoolIndex[k] = []);
      if (!list.some(x => x.name === name)) list.push({ name, city: city || '' });
    };
    if (typeof SCHOOLS_MASTER_JHS !== 'undefined') SCHOOLS_MASTER_JHS.forEach(s => add(s.name, s.city));
    if (typeof SCHOOLS_MASTER_KK !== 'undefined') SCHOOLS_MASTER_KK.forEach(s => add(s.name, s.city));
    if (typeof SCHOOLS_AREA !== 'undefined') ['jhs', 'elm'].forEach(t => (SCHOOLS_AREA[t] || []).forEach(s => add(s.name, s.area)));
    if (typeof SCHOOLS_GEO !== 'undefined') Object.keys(SCHOOLS_GEO).forEach(n => { if (/[市町村]立/.test(n)) add(n, ''); });
  }
  return _schoolIndex[short] || [];
}

// 略称 → 正式名（候補が1校に絞れない場合は略称のまま）
function resolveExamSchoolName(short) {
  const s = _shortSchoolName(short);
  const withCity = _schoolCandidates(s).filter(c => c.city);
  const list = withCity.length ? withCity : _schoolCandidates(s);
  return list.length === 1 ? list[0].name : short;
}

// 表示名：「勝山中」→「勝山中学校」（正式名が分かればその学校名、分からなければ略称を補って表示）
function _schoolLabel(short) {
  const full = resolveExamSchoolName(short);
  if (full !== short) return full.replace(/^.+?[市町村]立/, '');
  return /[中小]$/.test(short) ? short + '学校' : short;
}

function _schoolCity(short) {
  const list = _schoolCandidates(short).filter(c => c.city);
  return list.length === 1 ? list[0].city.replace(/市$/, '') : '';
}

// ===== 集計 =====

// 入試区分の表示順：自己推薦型 → 学校推薦型 → 一般 → A日程 → B日程 → C日程 → 二次募集（その他は最後）。同じ区分内は 普通科 → 音楽科
const EXAM_TYPE_ORDER = ['自己推薦', '学校推薦', '一般', 'A日程', 'B日程', 'C日程', '二次'];
const EXAM_DEPT_ORDER = ['普通科', '音楽科'];
function _examOrder(label) {
  const t = EXAM_TYPE_ORDER.findIndex(k => label.includes(k));
  const d = EXAM_DEPT_ORDER.findIndex(k => label.includes(k));
  return (t < 0 ? EXAM_TYPE_ORDER.length : t) * 10 + (d < 0 ? EXAM_DEPT_ORDER.length : d);
}

function _todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 回の並び順：オープンスクール（第1回→第4回）→ 説明会 → 音楽科
function _eventOrder(e) {
  const m = e.name.normalize('NFKC').match(/第(\d+)回/);
  const kind = { os: 0, briefing: 1, music: 2 }[e.kind] ?? 3;
  const date = e.date ? +e.date.slice(5).replace('-', '') : 0;  // MMDD
  return kind * 1000000 + (m ? +m[1] : 0) * 10000 + date;
}

// 募集年度 fiscal の来場記録（前年度のオープンスクール等）。今年度分は上の各回の欄のデータを使う
function _cohortEvents(side, fiscal) {
  const osYear = fiscal - 1;
  const conf = EXAM_SIDES[side];
  const events = [];
  const data = _getExamData();
  const y = data && data.visits && data.visits[osYear];
  if (y) Object.values(y.events).filter(e => e.side === side).forEach(e => events.push(e));
  if (osYear === OS_YEAR) {
    const today = _todayYmd();
    EVENTS.forEach(ev => ev.csvSlots.forEach(s => {
      if (!conf.slotTypes.includes(s.type)) return;
      const d = getEventData(s.id);
      if (!d || !d.rows || !d.rows.length) return;
      const hasAttendance = d.rows.some(r => r.attended);
      const held = ev.date <= today;
      events.push({
        name: s.type === 'music' ? `音楽科体験レッスン会（${ev.label}）` : `${ev.fullLabel}`,
        side, kind: s.type === 'music' ? 'music' : 'os', date: ev.date,
        rows: d.rows.map(r => ({
          pid: r.plusseed_id || '', school: r.school || '', grade: r.grade || '',
          attended: hasAttendance ? r.attended === '来場済み' : held,
        })),
      });
    }));
  }
  return events.sort((a, b) => _eventOrder(a) - _eventOrder(b));
}

// 利用できる募集年度（入試データ・来場記録のどちらかがある年度）
function getExamCohorts() {
  const data = _getExamData();
  const set = {};
  const add = (side, fiscal) => { set[`${side}-${fiscal}`] = { side, fiscal }; };
  if (data) {
    Object.values(data.exams || {}).forEach(e => add(e.side, e.fiscal));
    Object.entries(data.visits || {}).forEach(([year, y]) => Object.values(y.events).forEach(e => add(e.side, +year + 1)));
  }
  Object.keys(EXAM_SIDES).forEach(side => { if (_cohortEvents(side, OS_YEAR + 1).length) add(side, OS_YEAR + 1); });
  return Object.values(set);
}

// 募集年度・入試の種類ごとの集計
function getExamSummary(side, fiscal) {
  const conf = EXAM_SIDES[side];
  const data = _getExamData();
  const ex = data && data.exams ? data.exams[`${side}-${fiscal}`] : null;
  const events = _cohortEvents(side, fiscal);
  if (!ex && !events.length) return null;

  const apps = ex && ex.applicants ? ex.applicants.rows.filter(a => !_isTestEntry(a.school)) : [];
  const passRows = ex && ex.passes ? ex.passes.rows.filter(p => !_isTestEntry(p.school)) : [];
  const hasApplicants = !!(ex && ex.applicants);
  const hasPasses = !!(ex && ex.passes);
  const appByNo = {};
  apps.forEach(a => { appByNo[a.no] = a; });

  // --- 来場者（対象学年：高校入試＝中3、中学入試＝小6。学年欄が空の回は対象学年とみなす）---
  const visitors = {};  // 人 → { school, events: Set }
  events.forEach((e, i) => {
    e.rows.forEach((r, j) => {
      if (!r.attended || _isTestEntry(r.school)) return;
      if (r.grade && r.grade !== conf.targetGrade) return;
      const key = r.pid ? 'p:' + r.pid : `r:${i}:${j}`;
      const v = visitors[key] || (visitors[key] = { school: _shortSchoolName(r.school), events: new Set() });
      v.events.add(i);
    });
  });

  // --- 受験者（プラスシードIDで実人数にまとめる）---
  const personKey = a => a.pid ? 'p:' + a.pid : 'no:' + a.no;
  const persons = {};
  apps.forEach(a => {
    const k = personKey(a);
    const p = persons[k] || (persons[k] = { key: k, school: _shortSchoolName(a.school), os: false, labels: [], passed: false, enrolled: false, passPlan: '', passCourse: '' });
    if (a.os) p.os = true;
    p.labels.push(a);
  });

  // --- 合格者（受験番号で受験者と照合。受験者一覧に無い合格者も1人として数える）---
  const passPersons = {};
  passRows.forEach(pr => {
    const a = appByNo[pr.no];
    const k = a ? personKey(a) : 'no:' + pr.no;
    const pp = passPersons[k] || (passPersons[k] = {
      key: k, school: _shortSchoolName(a ? a.school : pr.school), os: a ? !!(persons[k] && persons[k].os) : null,
      linked: !!a, enrolled: false, plan: '', course: '',
    });
    if (pr.enrolled) pp.enrolled = true;
    // 入学した区分（なければ最後に合格した区分）の専願/併願・コースを使う
    if (pr.enrolled || !pp.plan) {
      pp.plan = (a && a.plan) || pr.plan || '';
      pp.course = a ? a.course || _examCourse(a.dept, '') : _examCourse(pr.dept, '');
    }
    if (persons[k]) { persons[k].passed = true; if (pr.enrolled) persons[k].enrolled = true; }
  });
  const personList = Object.values(persons);
  const passList = Object.values(passPersons);

  const count = (list, fn) => list.filter(fn).length;
  const visitorList = Object.values(visitors);

  // --- 入試区分別（延べ）---
  const byExam = {};
  const ensureExam = label => byExam[label] || (byExam[label] = { label, total: 0, sengan: 0, heigan: 0, os: 0, passed: 0, enrolled: 0, hasApplicants: false });
  if (ex && ex.applicants) ex.applicants.files.forEach(f => { ensureExam(f.label).hasApplicants = true; });
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

  // --- 専願・併願別、コース別（合格者は1人1回）---
  const groupBy = (keyOfApp, keyOfPass, order) => {
    const g = {};
    const ensure = k => g[k] || (g[k] = { key: k, apps: 0, passed: 0, enrolled: 0 });
    apps.forEach(a => { ensure(keyOfApp(a)).apps++; });
    passList.forEach(p => { const x = ensure(keyOfPass(p)); x.passed++; if (p.enrolled) x.enrolled++; });
    return Object.values(g).sort((a, b) => order(a.key) - order(b.key) || a.key.localeCompare(b.key, 'ja'));
  };
  const planName = v => v || '記載なし';
  const byPlan = groupBy(a => planName(a.plan), p => planName(p.plan), k => ['専願', '併願', '記載なし'].indexOf(k));
  const byCourse = groupBy(a => a.course || _examCourse(a.dept, '') || '記載なし', p => p.course || '記載なし', k => (k === '音楽科' ? 50 : k === '記載なし' ? 99 : 0));

  // --- OS参加の有無別（受験者）---
  const byOs = [true, false].map(flag => {
    const list = personList.filter(p => p.os === flag);
    return { flag, apps: list.length, passed: count(list, p => p.passed), enrolled: count(list, p => p.enrolled) };
  });

  // --- 学校別 ---
  const schools = {};
  const ensureSchool = short => schools[short] || (schools[short] = { short, visitors: 0, visitorsApplied: 0, apps: 0, os: 0, passed: 0, enrolled: 0, declined: 0 });
  const appliedKeys = new Set(personList.map(p => p.key));
  Object.entries(visitors).forEach(([k, v]) => {
    const s = ensureSchool(v.school);
    s.visitors++;
    if (appliedKeys.has(k)) s.visitorsApplied++;
  });
  personList.forEach(p => { const s = ensureSchool(p.school); s.apps++; if (p.os) s.os++; });
  passList.forEach(p => {
    const s = ensureSchool(p.school);
    s.passed++;
    if (p.enrolled) s.enrolled++; else s.declined++;
  });

  // --- 回別（来場者＝対象学年）---
  const byEvent = events.map((e, i) => {
    const keys = Object.entries(visitors).filter(([, v]) => v.events.has(i)).map(([k]) => k);
    const inApps = keys.filter(k => persons[k]);
    return {
      name: e.name, kind: e.kind,
      visitors: keys.length,
      apps: inApps.length,
      passed: count(inApps, k => persons[k].passed),
      enrolled: count(inApps, k => persons[k].enrolled),
    };
  });

  // --- 来場回数別 ---
  const byTimes = [1, 2, 3].map(n => {
    const keys = Object.entries(visitors).filter(([, v]) => (n < 3 ? v.events.size === n : v.events.size >= 3)).map(([k]) => k);
    const inApps = keys.filter(k => persons[k]);
    return { label: n < 3 ? `${n}回` : '3回以上', visitors: keys.length, apps: inApps.length, enrolled: count(inApps, k => persons[k].enrolled) };
  });

  const passed = passList.length;
  const enrolled = count(passList, p => p.enrolled);
  return {
    side, fiscal, conf,
    osYear: fiscal - 1,
    fiscalLabel: `${fiscal}年度入試`,
    imported_at: ex && ex.imported_at,
    hasExam: !!ex, hasApplicants, hasPasses,
    applicantFiles: hasApplicants ? ex.applicants.files : [],
    eventCount: events.length,
    osEventCount: count(events, e => e.kind === 'os'),
    visitors: visitorList.length,
    visitorsApplied: count(Object.keys(visitors), k => !!persons[k]),
    total: personList.length,
    os: count(personList, p => p.os),
    osNoRecord: count(personList, p => p.os && !visitors[p.key]),
    multi: count(personList, p => p.labels.length > 1),
    passed, enrolled, declined: passed - enrolled,
    enrolledOs: count(passList, p => p.enrolled && p.os === true),
    enrolledLinked: count(passList, p => p.enrolled && p.linked),
    notPassed: count(personList, p => !p.passed),
    missingApplicantLabels: hasApplicants ? Object.values(byExam).filter(b => !b.hasApplicants && b.passed > 0).map(b => b.label) : [],
    byExam: Object.values(byExam).sort((x, y) => _examOrder(x.label) - _examOrder(y.label) || x.label.localeCompare(y.label, 'ja')),
    byPlan, byCourse, byOs, byEvent, byTimes,
    schools: Object.values(schools).filter(s => s.short !== '不明' || s.apps || s.passed),
  };
}

// 正式名 → { total: 受験者, enrolled: 入学者 }（浸透度マップから参照。高校入試の最新年度）
function getExamCountsBySchool() {
  const data = _getExamData();
  if (!data || !data.exams) return null;
  const latest = Object.values(data.exams).filter(e => e.side === 'high').sort((a, b) => b.fiscal - a.fiscal)[0];
  if (!latest) return null;
  const ex = getExamSummary('high', latest.fiscal);
  const map = {};
  ex.schools.forEach(s => {
    const name = resolveExamSchoolName(s.short);
    const cur = map[name] || (map[name] = { total: 0, enrolled: 0 });
    cur.total += s.apps;
    cur.enrolled += s.enrolled;
  });
  return { fiscal: ex.fiscalLabel, hasApplicants: ex.hasApplicants, hasPasses: ex.hasPasses, map };
}

// ===== 表示 =====
const _examView = { side: 'high', fiscal: null, sort: 'enrolled' };

function refreshExamViews() {
  renderExamUploadState();
  renderExamSection();
  if (typeof renderSchoolMap === 'function') renderSchoolMap();
}

function renderExamUploadState() {
  const el = document.getElementById('exam-upload-state');
  if (!el) return;
  const data = _getLocalExamData();
  if (!data) { el.innerHTML = ''; return; }
  const lines = [];
  Object.values(data.exams).sort((a, b) => b.fiscal - a.fiscal || a.side.localeCompare(b.side)).forEach(e => {
    const parts = [];
    parts.push(e.applicants ? `受験者一覧 ${e.applicants.files.length}ファイル（延べ${e.applicants.rows.length}名）` : '<span class="exam-warn">受験者一覧：未読込</span>');
    parts.push(e.passes ? `合格者一覧（${e.passes.rows.length}名）` : '<span class="exam-warn">合格者一覧：未読込</span>');
    lines.push(`${e.fiscal}年度 ${EXAM_SIDES[e.side].label}：${parts.join('・')}`);
  });
  Object.entries(data.visits || {}).sort((a, b) => b[0] - a[0]).forEach(([year, y]) => {
    const ev = Object.values(y.events);
    const n = side => ev.filter(e => e.side === side).length;
    lines.push(`${year}年度のオープンスクール等：中学生向け ${n('high')}回・小学生向け ${n('junior')}回`);
  });
  el.innerHTML = `
    <div class="exam-state-lines">${lines.map(l => `<div>✓ ${l}</div>`).join('')}</div>
    <button class="btn btn-ghost btn-sm" onclick="clearExamSummary()">すべて削除</button>`;
}

function setupExamUpload() {
  const zone = document.getElementById('exam-upload-zone');
  if (!zone) return;
  const sel = document.getElementById('exam-os-year');
  if (sel) {
    sel.innerHTML = [1, 2, 3, 4].map(d => OS_YEAR - d)
      .map(y => `<option value="${y}">${y}年度（${y + 1}年度募集）</option>`).join('');
  }
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

function setExamView(key, value) {
  _examView[key] = key === 'fiscal' ? +value : value;
  renderExamSection();
}

const _pct = (a, b) => (b > 0 ? Math.round(a * 100 / b) : null);
const _pctText = (a, b) => { const p = _pct(a, b); return p == null ? '—' : `${p}%`; };
const _dash = v => (v ? v : '—');

function renderExamSection() {
  const body = document.getElementById('exam-section-body');
  if (!body) return;
  const sub = document.getElementById('exam-section-subtitle');
  const cohorts = getExamCohorts();

  if (!cohorts.some(c => getExamSummary(c.side, c.fiscal) && getExamSummary(c.side, c.fiscal).hasExam)) {
    if (sub) sub.textContent = '教員ページのみに表示され、生徒用ページには表示されません';
    const staffMsg = {
      nokey: '入試データを表示するには、いったんこのタブを閉じ、閲覧用パスワードでもう一度ログインしてください。',
      fail:  '入試データを表示できませんでした。閲覧用パスワードが変更された可能性があります。管理者にお問い合わせください。',
    }[_sharedExamStatus] || '入試データはまだ共有されていません。管理者が公開すると表示されます。';
    body.innerHTML = `<p class="gap-empty" style="text-align:center">${window.IS_ADMIN
      ? '「データ管理」の「入試データ」欄から、BLENDの受験者一覧・合格者一覧（と過去のオープンスクールの申込一覧）を読み込むと表示されます。'
      : staffMsg}</p>`;
    return;
  }

  // 年度の選択肢：入試データのある年度＋今年度の募集年度。初期表示は入試データのある最新年度
  const years = [...new Set(cohorts.map(c => c.fiscal))].sort((a, b) => b - a);
  const examYears = years.filter(y => Object.keys(EXAM_SIDES).some(s => { const x = getExamSummary(s, y); return x && x.hasExam; }));
  if (!years.includes(_examView.fiscal)) _examView.fiscal = examYears[0] || years[0];
  const fiscal = _examView.fiscal;
  if (!getExamSummary(_examView.side, fiscal)) {
    const other = Object.keys(EXAM_SIDES).find(s => getExamSummary(s, fiscal));
    if (other) _examView.side = other;
  }
  const side = _examView.side;
  const ex = getExamSummary(side, fiscal);
  const conf = EXAM_SIDES[side];

  if (sub) sub.textContent = `募集年度ごとに、前年度のオープンスクール来場 → 入試 → 入学までを表示します（BLENDより）。教員ページのみに表示され、生徒用ページには表示されません`;

  const btn = (key, value, label, active) =>
    `<button class="pen-area-btn${active ? ' active' : ''}" onclick="setExamView('${key}','${value}')">${label}</button>`;
  const controls = `
    <div class="exam-controls">
      <div class="exam-control-row"><span class="exam-control-label">募集年度</span>${years.map(y =>
        btn('fiscal', y, `${y}年度募集${examYears.includes(y) ? '' : '（入試前）'}`, y === fiscal)).join('')}</div>
      <div class="exam-control-row"><span class="exam-control-label">入試</span>${Object.entries(EXAM_SIDES).map(([k, c]) =>
        btn('side', k, `${c.label}（${c.audience}）`, k === side)).join('')}</div>
      <p class="exam-period">${fiscal}年度募集＝${fiscal - 1}年度のオープンスクール（${fiscal - 1}年）→ ${fiscal}年1〜2月の入試 → ${fiscal}年4月入学</p>
    </div>`;

  if (!ex) {
    body.innerHTML = controls + `<p class="gap-empty" style="text-align:center">${fiscal}年度募集の${conf.label}のデータはありません。</p>`;
    return;
  }

  body.innerHTML = controls + (ex.hasExam ? _examResultHtml(ex) : _examBeforeHtml(ex)) + _examYearCompareHtml(side);
}

// 入試前（今年度の募集）：来場状況のみ
function _examBeforeHtml(ex) {
  const c = ex.conf;
  return `
    <div class="exam-notice"><div>${ex.fiscal}年度入試の受験者一覧・合格者一覧は、入試後（${ex.fiscal}年1〜2月）に読み込むと表示されます。現在は、${ex.osYear}年度のオープンスクールの来場状況のみです。</div></div>
    <div class="pen-summary">
      <div class="pen-kpi"><span class="pen-kpi-label">来場者（${c.gradeLabel}・実人数）</span><span class="pen-kpi-value">${ex.visitors}<small>名</small></span><span class="pen-kpi-sub">${ex.eventCount}回分の来場記録より</span></div>
    </div>`;
}

function _examResultHtml(ex) {
  const c = ex.conf;
  const P = ex.hasPasses;
  const A = ex.hasApplicants;
  const V = ex.eventCount > 0;

  const warn = [];
  if (!A) warn.push('受験者一覧が読み込まれていないため、受験者数・OS参加は表示できません。');
  if (!P) warn.push('合格者一覧を読み込むと、合格者数・入学者数・辞退者数も表示されます。');
  if (ex.missingApplicantLabels.length) warn.push(`合格者一覧にある「${ex.missingApplicantLabels.join('」「')}」の受験者一覧が読み込まれていません。受験者数・OS参加の人数は、この区分を除いた値です。`);
  if (!V) warn.push(`${ex.osYear}年度のオープンスクールの申込一覧が読み込まれていないため、来場者数と「回別」は表示できません。`);

  const kpi = (label, value, subText) =>
    `<div class="pen-kpi"><span class="pen-kpi-label">${label}</span><span class="pen-kpi-value">${value}<small>名</small></span><span class="pen-kpi-sub">${subText}</span></div>`;
  const kpis = `
    <div class="exam-funnel">
      ${kpi(`来場者（${c.gradeLabel}）`, V ? ex.visitors : '—', V ? `${ex.osYear}年度 ${ex.eventCount}回分・実人数` : '申込一覧が未読込')}
      <span class="exam-funnel-arrow" aria-hidden="true">→</span>
      ${kpi('受験者', A ? ex.total : '—', A ? `うちOS参加 ${ex.os}名（${_pctText(ex.os, ex.total)}）` : '受験者一覧が未読込')}
      <span class="exam-funnel-arrow" aria-hidden="true">→</span>
      ${kpi('合格者', P ? ex.passed : '—', P && A ? `受験者の ${_pctText(ex.passed, ex.total)}` : '合格者一覧より')}
      <span class="exam-funnel-arrow" aria-hidden="true">→</span>
      ${kpi('入学者', P ? ex.enrolled : '—', P ? `合格者の ${_pctText(ex.enrolled, ex.passed)}` : '合格者一覧より')}
    </div>
    <div class="exam-funnel-notes">
      ${V && A ? `<span>来場者のうち受験 <b>${ex.visitorsApplied}名（${_pctText(ex.visitorsApplied, ex.visitors)}）</b></span>` : ''}
      ${P ? `<span>合格したが入学しなかった人（辞退） <b>${ex.declined}名</b></span>` : ''}
      ${A && ex.multi ? `<span>複数の入試区分を受験 ${ex.multi}名</span>` : ''}
    </div>`;

  // 要点（訪問の優先順位づけ用）
  const top = (list, n = 5) => list.slice(0, n);
  const label = s => escapeHtml(_schoolLabel(s.short));
  const notConverted = V && A ? top(ex.schools.filter(s => s.visitors >= 2 && s.visitorsApplied < s.visitors)
    .sort((a, b) => (b.visitors - b.visitorsApplied) - (a.visitors - a.visitorsApplied) || b.visitors - a.visitors)) : [];
  const declined = P ? top(ex.schools.filter(s => s.declined > 0).sort((a, b) => b.declined - a.declined || b.passed - a.passed)) : [];
  const noOs = A ? top(ex.schools.filter(s => s.apps - s.os > 0).sort((a, b) => (b.apps - b.os) - (a.apps - a.os) || b.apps - a.apps)) : [];
  const point = (title, desc, list, text) => `
    <div class="exam-point">
      <h4 class="exam-point-title">${title}</h4>
      <p class="gap-desc">${desc}</p>
      ${list.length ? `<ul class="exam-point-list">${list.map(s => `<li><span>${label(s)}</span><span>${text(s)}</span></li>`).join('')}</ul>` : '<p class="gap-empty">該当なし</p>'}
    </div>`;
  const points = (V && A) || P ? `
    <h3 class="gap-title exam-h3">訪問先の検討材料</h3>
    <div class="exam-points">
      ${V && A ? point('来場したが受験しなかった人が多い学校', '来場後の働きかけを検討する候補', notConverted, s => `来場 ${s.visitors} → 受験 ${s.visitorsApplied}`) : ''}
      ${P ? point('合格後に入学しなかった人が多い学校', '併願先に流れている可能性がある学校', declined, s => `合格 ${s.passed} → 入学 ${s.enrolled}`) : ''}
      ${A ? point('オープンスクールに参加せず受験した人が多い学校', '学校・塾など、来場以外の経路で届いている学校', noOs, s => `受験 ${s.apps}（うち不参加 ${s.apps - s.os}）`) : ''}
    </div>` : '';

  // 入試区分別
  const examRows = ex.byExam.map(b => `
    <tr${b.hasApplicants || !A ? '' : ' class="exam-row-missing"'}>
      <td>${escapeHtml(b.label)}</td>
      ${A ? `<td><b>${b.hasApplicants ? b.total : '—'}</b></td>
      <td>${b.hasApplicants ? _dash(b.sengan) : '—'}</td><td>${b.hasApplicants ? _dash(b.heigan) : '—'}</td>
      <td>${b.hasApplicants ? b.os : '—'}</td>` : ''}
      ${P ? `<td>${b.passed}</td><td><b>${b.enrolled}</b></td><td>${_dash(b.passed - b.enrolled)}</td>` : ''}
    </tr>`).join('');
  const examTable = `
    <h3 class="gap-title exam-h3">入試区分別</h3>
    <p class="gap-desc">延べ人数（複数の入試区分を受けた人は、それぞれの区分で数えています）。</p>
    <div class="exam-scroll-x">
      <table class="gap-table exam-table">
        <thead><tr><th>入試区分</th>${A ? '<th>受験者</th><th>専願</th><th>併願</th><th>OS参加</th>' : ''}${P ? '<th>合格者</th><th>入学者</th><th>辞退</th>' : ''}</tr></thead>
        <tbody>${examRows}</tbody>
      </table>
    </div>`;

  // 専願・併願別／コース別／OS参加の有無別（合格者は1人1回）
  const groupTable = (title, desc, head, rows) => `
    <div class="exam-mini">
      <h4 class="exam-point-title">${title}</h4>
      <p class="gap-desc">${desc}</p>
      <table class="gap-table exam-table">
        <thead><tr><th>${head}</th>${A ? '<th>受験者</th>' : ''}${P ? '<th>合格者</th><th>入学者</th><th>入学率</th>' : ''}</tr></thead>
        <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.key)}</td>${A ? `<td>${r.apps}</td>` : ''}${P ? `<td>${r.passed}</td><td><b>${r.enrolled}</b></td><td>${_pctText(r.enrolled, r.passed)}</td>` : ''}</tr>`).join('')}</tbody>
      </table>
    </div>`;
  const osRows = ex.byOs.filter(r => r.apps).map(r => ({ key: r.flag ? 'OS参加あり' : 'OS参加なし', apps: r.apps, passed: r.passed, enrolled: r.enrolled }));
  const groups = `
    <div class="exam-minis">
      ${groupTable('専願・併願別', '受験者は延べ人数。「記載なし」は専願・併願の区別がない区分（一般選抜など）', '区分', ex.byPlan)}
      ${ex.byCourse.some(r => r.key !== '記載なし') ? groupTable('学科・コース別', '受験者は延べ人数', 'コース', ex.byCourse) : ''}
      ${A ? groupTable('オープンスクール参加の有無別', `BLENDの「${ex.osYear}年度本校オープンスクール参加有無」より（実人数）`, '参加', osRows) : ''}
    </div>`;

  // 回別・来場回数別
  const eventTables = V ? `
    <h3 class="gap-title exam-h3">オープンスクールの回別</h3>
    <p class="gap-desc">${ex.osYear}年度に来場した${c.gradeLabel}（実人数）のうち、受験・入学した人数。複数回来場した人は、それぞれの回で数えています。${c.gradeLabel}の来場者がいない回は省略しています。</p>
    <div class="exam-minis">
      <div class="exam-mini exam-mini-wide">
        <table class="gap-table exam-table">
          <thead><tr><th>回</th><th>来場者</th>${A ? '<th>うち受験</th><th>受験率</th>' : ''}${P ? '<th>うち合格</th><th>うち入学</th>' : ''}</tr></thead>
          <tbody>${ex.byEvent.filter(e => e.visitors).map(e => `<tr><td>${escapeHtml(e.name)}</td><td>${e.visitors}</td>${A ? `<td><b>${e.apps}</b></td><td>${_pctText(e.apps, e.visitors)}</td>` : ''}${P ? `<td>${e.passed}</td><td><b>${e.enrolled}</b></td>` : ''}</tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="exam-mini">
        <h4 class="exam-point-title">来場回数別</h4>
        <table class="gap-table exam-table">
          <thead><tr><th>来場回数</th><th>人数</th>${A ? '<th>うち受験</th><th>受験率</th>' : ''}${P ? '<th>うち入学</th>' : ''}</tr></thead>
          <tbody>${ex.byTimes.map(t => `<tr><td>${t.label}</td><td>${t.visitors}</td>${A ? `<td><b>${t.apps}</b></td><td>${_pctText(t.apps, t.visitors)}</td>` : ''}${P ? `<td>${t.enrolled}</td>` : ''}</tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
    ${A && ex.osNoRecord ? `<p class="gap-desc">※OS参加「有」の受験者のうち ${ex.osNoRecord}名は、読み込んだ申込一覧に来場記録がありません（読み込んでいない行事への参加などが考えられます）。</p>` : ''}` : '';

  // 学校別
  const sorters = {
    enrolled: (a, b) => b.enrolled - a.enrolled || b.apps - a.apps || b.visitors - a.visitors,
    apps:     (a, b) => b.apps - a.apps || b.enrolled - a.enrolled || b.visitors - a.visitors,
    visitors: (a, b) => b.visitors - a.visitors || b.apps - a.apps,
    declined: (a, b) => b.declined - a.declined || b.passed - a.passed,
  };
  const sortLabels = { enrolled: '入学者', apps: '受験者', visitors: '来場者', declined: '辞退' };
  const sortKeys = Object.keys(sortLabels).filter(k => (k === 'visitors' ? V : k === 'apps' ? A : P));
  if (!sortKeys.includes(_examView.sort)) _examView.sort = sortKeys[0];
  const schools = [...ex.schools].sort(sorters[_examView.sort]);
  const schoolRows = schools.map(s => {
    const city = _schoolCity(s.short);
    return `<tr>
      <td class="gap-name">${label(s)}${city ? `<span class="gap-city">${escapeHtml(city)}</span>` : ''}</td>
      ${V ? `<td>${_dash(s.visitors)}</td>${A ? `<td>${_dash(s.visitorsApplied)}</td>` : ''}` : ''}
      ${A ? `<td><b>${_dash(s.apps)}</b></td><td>${_dash(s.os)}</td>` : ''}
      ${P ? `<td>${_dash(s.passed)}</td><td><b>${_dash(s.enrolled)}</b></td><td>${_dash(s.declined)}</td>` : ''}
    </tr>`;
  }).join('');
  const schoolTable = `
    <div class="exam-school-head">
      <h3 class="gap-title exam-h3">${c.unit}別</h3>
      <div class="exam-sort">並び順：${sortKeys.map(k => `<button class="pen-area-btn${k === _examView.sort ? ' active' : ''}" onclick="setExamView('sort','${k}')">${sortLabels[k]}の多い順</button>`).join('')}</div>
    </div>
    <p class="gap-desc">${schools.length}校。${V ? `「来場者」は${ex.osYear}年度のオープンスクールに来場した${c.gradeLabel}（実人数）、「うち受験」はそのうち受験した人数。` : ''}${A ? '「受験者」「OS参加」は実人数。' : ''}${P ? '「辞退」は合格したが入学しなかった人数。' : ''}</p>
    <div class="exam-school-scroll">
      <table class="gap-table exam-table">
        <thead><tr><th>${c.unit}</th>${V ? `<th>来場者</th>${A ? '<th>うち受験</th>' : ''}` : ''}${A ? '<th>受験者</th><th>OS参加</th>' : ''}${P ? '<th>合格者</th><th>入学者</th><th>辞退</th>' : ''}</tr></thead>
        <tbody>${schoolRows}</tbody>
      </table>
    </div>`;

  return `
    ${warn.length ? `<div class="exam-notice">${warn.map(w => `<div>⚠️ ${escapeHtml(w)}</div>`).join('')}</div>` : ''}
    ${kpis}
    ${points}
    ${examTable}
    ${groups}
    ${eventTables}
    ${schoolTable}`;
}

// 年度比較（同じ入試の種類で2年度以上ある場合のみ）
function _examYearCompareHtml(side) {
  const list = getExamCohorts().filter(c => c.side === side).map(c => getExamSummary(side, c.fiscal)).filter(Boolean)
    .sort((a, b) => b.fiscal - a.fiscal);
  if (list.length < 2) return '';
  const c = EXAM_SIDES[side];
  const cell = (ok, v) => (ok ? v : '—');
  return `
    <h3 class="gap-title exam-h3">年度比較（${c.label}）</h3>
    <p class="gap-desc">オープンスクールの実施回数が年度によって異なるため、来場者数は回数とあわせて比較してください。入試前の年度は、現時点の来場者数です。</p>
    <div class="exam-scroll-x">
      <table class="gap-table exam-table">
        <thead><tr><th>募集年度</th><th>来場記録の回数</th><th>来場者（${c.gradeLabel}）</th><th>受験者</th><th>OS参加</th><th>合格者</th><th>入学者</th><th>辞退</th></tr></thead>
        <tbody>${list.map(x => `<tr>
          <td>${x.fiscal}年度募集${x.hasExam ? '' : '（入試前）'}</td>
          <td>${x.eventCount ? x.eventCount + '回' : '—'}</td><td>${x.eventCount ? x.visitors : '—'}</td>
          <td><b>${cell(x.hasApplicants, x.total)}</b></td><td>${cell(x.hasApplicants, x.os)}</td>
          <td>${cell(x.hasPasses, x.passed)}</td><td><b>${cell(x.hasPasses, x.enrolled)}</b></td><td>${cell(x.hasPasses, x.declined)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}
