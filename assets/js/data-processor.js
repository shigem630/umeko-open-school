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

// Returns top prefectures
function getTopPrefectures(rows, n = 10) {
  const counts = countByField(rows, 'prefecture');
  return Object.entries(counts).slice(0, n).map(([name, count]) => ({ name, count }));
}

// 申込理由文字列の正規化（不可視文字・特殊スペースを除去してから比較）
function _normalizeReason(s) {
  return s
    .replace(/[​‌‍﻿­]/g, '') // ゼロ幅文字・ソフトハイフン
    .replace(/[ 　 -   ]/g, ' ') // 全角スペース等 → 半角スペース
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');
}

// Split '/' separated compound reason answers, count each part individually
function countReasons(rows) {
  const counts = {};
  for (const row of rows) {
    const val = row['reason'];
    if (!val) continue;
    const parts = val.split('/').map(s => _normalizeReason(s)).filter(Boolean);
    for (const part of parts) {
      const canonical = REASON_ALIASES[part] || part;
      counts[canonical] = (counts[canonical] || 0) + 1;
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

// Returns free comments (non-empty)
function getFreeComments(rows) {
  return rows.filter(r => r.free_comment && r.free_comment.trim()).map(r => r.free_comment.trim());
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
