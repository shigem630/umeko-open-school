// Returns { date: "YYYY-MM-DD", count: N }[] sorted by date
function getDailyCounts(rows) {
  const counts = {};
  for (const row of rows) {
    if (!row.applied_at) continue;
    counts[row.applied_at] = (counts[row.applied_at] || 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

// Returns cumulative version of getDailyCounts
function getCumulativeCounts(rows) {
  const daily = getDailyCounts(rows);
  let total = 0;
  return daily.map(({ date, count }) => {
    total += count;
    return { date, count: total, daily: count };
  });
}

// Returns { [value]: count } for a given field
function countByField(rows, field) {
  const counts = {};
  for (const row of rows) {
    const raw = row[field];
    if (!raw) continue;
    const val = field === 'channel' ? (CHANNEL_ALIASES[raw] || raw) : raw;
    counts[val] = (counts[val] || 0) + 1;
  }
  return sortObjectByValue(counts);
}

function sortObjectByValue(obj) {
  return Object.fromEntries(
    Object.entries(obj).sort(([,a], [,b]) => b - a)
  );
}

// Returns top N schools with count
function getTopSchools(rows, n = 10) {
  const counts = countByField(rows, 'school');
  return Object.entries(counts)
    .filter(([name]) => name && name !== '')
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

// 全イベント合算の学校別来場者数（type: 'jhs'=中学校 / 'elm'=小学校）
// 来場者＝「来場」列が「来場済み」の人のみ（CSVに来場列が無い場合は全員を来場扱い）。
// 開催日を過ぎたイベントで来場済みでない申込は「キャンセル」として別に数える。開催前のイベントの申込は数えない。
function _todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _schoolAttendance(type) {
  const uniq = {};    // school -> Set(生徒キー)
  const visits = {};  // school -> 延べ来場数
  const cancels = {}; // school -> キャンセル数（延べ）
  const today = _todayStr();
  for (const event of EVENTS) {
    if (event.date && event.date > today) continue;  // 開催前
    const past = !event.date || event.date < today;
    for (const slot of event.csvSlots) {
      if (slot.type !== type) continue;
      const data = getEventData(slot.id);
      if (!data || !data.rows) continue;
      const hasAttendance = data.rows.some(r => r.attended);
      for (const r of data.rows) {
        const school = (r.school || '').trim();
        if (!school) continue;
        if (hasAttendance && r.attended !== '来場済み') {
          if (past) cancels[school] = (cancels[school] || 0) + 1;
          continue;
        }
        visits[school] = (visits[school] || 0) + 1;
        if (!uniq[school]) uniq[school] = new Set();
        uniq[school].add(r.plusseed_id ? 'p:' + r.plusseed_id : 'r:' + (r.blend_id || r.app_no || Math.random()));
      }
    }
  }
  const totals = Object.keys(uniq)
    .map(name => ({ name, students: uniq[name].size, visits: visits[name], cancels: cancels[name] || 0 }))
    .sort((a, b) => b.students - a.students || b.visits - a.visits);
  return { totals, cancels };
}

function getSchoolTotals(type) {
  return _schoolAttendance(type).totals;
}

// 学校別キャンセル数（来場のない学校も含む）{ 学校名: 件数 }
function getSchoolCancels(type) {
  return _schoolAttendance(type).cancels;
}

// ===== 浸透度分析（中学校）=====
// 学校マスタ(SCHOOLS_MASTER_JHS)の全校について、中3生徒数から見込まれる来場者数と実績を比べる。
// 平均並みの人数(expected) = 中3生徒数 × 地域の平均来場率（地域＝山口県内／北九州市。生徒数データのある学校の 来場実人数 ÷ 中3生徒数）
// level: 'none'=来場なし / 'low'=平均の半分未満 / 'mid'=平均程度 / 'high'=平均の1.5倍以上 / 'nodata'=生徒数未登録
const _SCHOOL_NAME_ALIASES = {
  '下関市立内日中学校':     '下関市立うつい小中学校内日中学校',
  '下関市立うつい小中学校': '下関市立うつい小中学校内日中学校',
  '玖珂中学校':            '岩国市立玖珂中学校',
};
function _normSchoolName(name) {
  const n = String(name || '').replace(/[\s\u3000]/g, '');
  return _SCHOOL_NAME_ALIASES[n] || n;
}

function getJhsPenetration() {
  if (typeof SCHOOLS_MASTER_JHS === 'undefined') return null;
  const key = n => _normSchoolName(n).replace(/ヶ/g, 'ケ');
  const visited = {};
  getSchoolTotals('jhs').forEach(t => { visited[key(t.name)] = t; });
  const cancelsByKey = {};
  Object.entries(getSchoolCancels('jhs')).forEach(([n, c]) => { cancelsByKey[key(n)] = (cancelsByKey[key(n)] || 0) + c; });

  // 山口県内（営業リスト）＋北九州市（schools-area.js）。来場率は地域ごとに計算する
  const master = SCHOOLS_MASTER_JHS.concat(typeof SCHOOLS_MASTER_KK !== 'undefined' ? SCHOOLS_MASTER_KK : []);
  const schools = master.map(m => {
    const t = visited[key(m.name)];
    return { ...m, region: m.region || '山口県', students: t ? t.students : 0, visits: t ? t.visits : 0,
      cancels: cancelsByKey[key(m.name)] || 0 };
  });
  const inMaster = new Set(schools.map(s => key(s.name)));
  const outside = Object.keys(visited)
    .filter(n => !inMaster.has(n))
    .map(n => visited[n]);

  const regions = [...new Set(schools.map(s => s.region))].map(name => {
    const list = schools.filter(s => s.region === name);
    const sized = list.filter(s => s.g3);
    const sizedStudents = sized.reduce((a, s) => a + s.students, 0);
    const sizedG3 = sized.reduce((a, s) => a + s.g3, 0);
    return {
      name, count: list.length, sizedCount: sized.length, sizedG3, sizedStudents,
      baseRate: sizedG3 > 0 ? sizedStudents / sizedG3 : 0,
      visitedCount: list.filter(s => s.students > 0).length,
      sizedNone: sized.filter(s => s.students === 0).length,
    };
  });
  const rateOf = {};
  regions.forEach(r => { rateOf[r.name] = r.baseRate; });

  schools.forEach(s => {
    s.baseRate = rateOf[s.region];
    if (!s.g3) { s.level = 'nodata'; return; }
    s.expected = s.g3 * s.baseRate;
    s.gap = s.students - s.expected;
    s.rate = s.students / s.g3;
    const ratio = s.expected > 0 ? s.students / s.expected : 0;
    s.level = s.students === 0 ? 'none' : ratio < 0.5 ? 'low' : ratio >= 1.5 ? 'high' : 'mid';
  });

  const sized = schools.filter(s => s.g3);
  return {
    schools, outside, regions,
    sizedCount: sized.length,
    visitedCount: schools.filter(s => s.students > 0).length,
    shortfall: sized.filter(s => s.gap < -0.5).sort((a, b) => a.gap - b.gap),
    surplus:   sized.filter(s => s.gap > 0.5).sort((a, b) => b.gap - a.gap),
  };
}

// Returns top prefectures
function getTopPrefectures(rows, n = 10) {
  const counts = countByField(rows, 'prefecture');
  return Object.entries(counts).slice(0, n).map(([name, count]) => ({ name, count }));
}

// 申込理由の前方一致マップ（先頭が一致すれば統一形に正規化）
const _REASON_PREFIX_MAP = [
  ['とりあえず県内',          'とりあえず県内の私立校を見ておきたかったから'],
  ['今の学校教育',            '今の学校教育やルールに違和感があり、新しい環境をみたかった為'],
  ['自律学習（単元テスト等）',  '自律学習（単元テスト等）に興味があったから'],
  ['生徒だけで企画・運営',     '生徒だけで企画・運営していると知って面白そうだったから'],
  ['チラシやポスター',         'チラシやポスターのメッセージ（ありのまま、など）に共感した'],
];

function _canonicalReason(raw) {
  const s = raw
    .replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, '')
    .replace(/[\u00A0\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');
  for (const [prefix, canonical] of _REASON_PREFIX_MAP) {
    if (s.startsWith(prefix)) return canonical;
  }
  return (typeof REASON_ALIASES !== 'undefined' && REASON_ALIASES[s]) || s;
}

// Split '/' separated compound reason answers, count each part individually
function countReasons(rows) {
  const counts = {};
  for (const row of rows) {
    const val = row['reason'];
    if (!val) continue;
    const parts = val.split('/').map(s => _canonicalReason(s)).filter(Boolean);
    for (const part of parts) {
      counts[part] = (counts[part] || 0) + 1;
    }
  }
  return sortObjectByValue(counts);
}

// Returns satisfaction distribution for post-event analysis
function getSatisfactionDist(rows) {
  return countByField(rows, 'satisfaction');
}
function getImpressionDist(rows) {
  return countByField(rows, 'impression_change');
}
function getExamIntentDist(rows) {
  return countByField(rows, 'exam_intent');
}

// Returns grade distribution sorted in school-year order
function getGradeDist(rows) {
  const ORDER = ['1年生','2年生','3年生','4年生','5年生','6年生'];
  const counts = countByField(rows, 'grade');
  return Object.fromEntries(
    Object.entries(counts).sort(([a],[b]) => {
      const ai = ORDER.indexOf(a), bi = ORDER.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      return (ai >= 0 ? ai : 99) - (bi >= 0 ? bi : 99);
    })
  );
}

// Returns free comments (non-empty) with a stable id for moderation
// id は再アップロードしても変わらない BLEND管理番号（なければ申込番号）
function getFreeComments(rows) {
  return rows
    .filter(r => r.free_comment && r.free_comment.trim())
    .map(r => ({
      id: String(r.blend_id || r.app_no || ''),
      text: r.free_comment.trim(),
      slot: r._slot || ''   // 'jhs'=中学生 / 'elm'=小学生
    }))
    .filter(c => c.id);
}

// アンケート回答数（満足度を回答した人）を中学生/小学生別に集計
function getResponseCounts(rows) {
  const responded = rows.filter(r => r.satisfaction && r.satisfaction.trim());
  const jhs = responded.filter(r => r._slot === 'jhs').length;
  const elm = responded.filter(r => r._slot === 'elm').length;
  return { total: responded.length, jhs, elm };
}

// ===== 音楽科体験レッスン会（7/25・8/29）=====
// 人数が少ないため、グラフではなく項目ごとの人数一覧で表示する
function getMusicSummary(eventKey) {
  const rows = getMusicRows(eventKey);
  if (!rows.length) return null;

  const countBy = (fn) => {
    const counts = {};
    rows.forEach(r => {
      const v = fn(r);
      if (v) counts[v] = (counts[v] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };
  const wantCount = field => rows.filter(r => _parseWants(r[field]) === 'want').length;

  // 以前のイベント（普通科・音楽科とも）に参加したことがあるか
  const eventIdx = EVENTS.findIndex(e => e.key === eventKey);
  const previousIds = new Set();
  for (let i = 0; i < eventIdx; i++) {
    [...getEventRows(EVENTS[i].key), ...getMusicRows(EVENTS[i].key)]
      .forEach(r => { if (r.plusseed_id) previousIds.add(r.plusseed_id); });
  }
  const withId = rows.filter(r => r.plusseed_id);
  // 同じ日のオープンスクール（中学生・小学生）にも申し込んでいる人（プラスシードIDで照合）
  const osIds = new Set(getEventRows(eventKey).map(r => r.plusseed_id).filter(Boolean));

  return {
    headcount: getHeadcount(rows),
    majors:   countBy(r => r.music_major),
    grades:   countBy(r => r.grade),
    channels: countBy(r => r.channel ? (CHANNEL_ALIASES[r.channel] || r.channel) : ''),
    schools:  countBy(r => r.school),
    solfege:  wantCount('wants_solfege'),
    consult:  wantCount('wants_consultation'),
    generalOs: wantCount('joins_general_os'),
    returning: withId.filter(r => previousIds.has(r.plusseed_id)).length,
    newcomers: withId.filter(r => !previousIds.has(r.plusseed_id)).length,
    visitorAvailable: withId.length > 0,
    attended: rows.filter(r => r.attended === '来場済み').length,
    overlapWithOs: new Set(withId.filter(r => osIds.has(r.plusseed_id)).map(r => r.plusseed_id)).size,
  };
}

// Calculate required daily pace to reach goal
function calcPace(current, goal, eventDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(eventDateStr);
  eventDate.setHours(0, 0, 0, 0);
  const daysRemaining = Math.max(1, Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24)));
  const remaining = Math.max(0, goal - current);
  const perDay = remaining === 0 ? 0 : Math.ceil(remaining / daysRemaining);
  return { remaining, daysRemaining, perDay };
}

// Phase 7-2: getDeltaFromYesterday removed (was dead code — ui.js computes delta inline)

// ===== 新規/繰り返し来校者分析 =====

// plusseed_id を使って新規/繰り返しを判定
function getVisitorStats(eventKey) {
  const eventIdx = EVENTS.findIndex(e => e.key === eventKey);
  const currentRows = getEventRows(eventKey);
  const previousIds = new Set();
  for (let i = 0; i < eventIdx; i++) {
    getEventRows(EVENTS[i].key).forEach(r => {
      if (r.plusseed_id) previousIds.add(r.plusseed_id);
    });
  }
  let newCount = 0, returningCount = 0, noIdCount = 0;
  const seen = new Set();
  for (const r of currentRows) {
    if (!r.plusseed_id) { noIdCount++; continue; }
    if (seen.has(r.plusseed_id)) continue;
    seen.add(r.plusseed_id);
    previousIds.has(r.plusseed_id) ? returningCount++ : newCount++;
  }
  const available = currentRows.length > 0 && noIdCount < currentRows.length;
  return { newCount, returningCount, noIdCount, available };
}

// 全イベントの累計新規来校者数（重複除去）
function getCumulativeNewVisitors() {
  const allIds = new Set();
  let count = 0;
  for (const event of EVENTS) {
    const eventIds = new Set();
    getEventRows(event.key).forEach(r => {
      if (!r.plusseed_id || eventIds.has(r.plusseed_id)) return;
      eventIds.add(r.plusseed_id);
      if (!allIds.has(r.plusseed_id)) { allIds.add(r.plusseed_id); count++; }
    });
  }
  return { count, available: allIds.size > 0 };
}

// 来場見込み人数（申込者＋保護者等）
function getHeadcount(rows) {
  const students = rows.length;
  const guardians = rows.reduce((s, r) => {
    const n = parseInt(r.attendants, 10);
    return s + (isNaN(n) ? 0 : n);
  }, 0);
  return { students, guardians, total: students + guardians };
}

// 1つの希望フィールド値を解釈
// 戻り値: 'want'=申込/希望 / 'waitlist'=次回希望(定員超過) / 'declined'=不要 / null=未回答
// 数値"2"は旧・新どちらのCSVでも「不要/申し込まない」扱い
// テキスト「また別の機会に…」のみ次回希望としてカウント
function _parseWants(val) {
  if (val === null || val === undefined || val === '') return null;
  const v = String(val).trim();
  if (!v) return null;
  if (v === '1' || v === 'はい' || v.startsWith('はい')) return 'want';
  if (v.includes('別の機会') || v.includes('また申し込')) return 'waitlist';
  if (v === '2' || v === 'いいえ' || v.startsWith('いいえ') || v.includes('了承') || v.includes('分かりました')) return 'declined';
  return null;
}

// 制服試着・個別相談の希望者数を集計
// available=false の場合はその回のCSVに質問がなかった（表示しない）
function getOptionCounts(rows) {
  let uWant = 0, uWaitlist = 0, uTotal = 0;
  let cWant = 0, cWaitlist = 0, cTotal = 0;
  for (const r of rows) {
    const u = _parseWants(r.wants_uniform);
    if (u !== null) { uTotal++; if (u === 'want') uWant++; else if (u === 'waitlist') uWaitlist++; }
    const c = _parseWants(r.wants_consultation);
    if (c !== null) { cTotal++; if (c === 'want') cWant++; else if (c === 'waitlist') cWaitlist++; }
  }
  return {
    uniform: { want: uWant, waitlist: uWaitlist, total: uTotal, available: uTotal > 0 },
    consult: { want: cWant, waitlist: cWaitlist, total: cTotal, available: cTotal > 0 },
  };
}

// Canonical formatDate — shared across all JS files (Phase 7-3: duplicate removed from ui.js)
function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Format datetime string for display
function formatDatetimeDisplay(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${m}月${day}日 ${h}:${min}`;
}
