// ===== 学校マップ（Leaflet + 国土地理院 淡色地図）=====
// 教員ページの中学校 = 浸透度マップ（営業リストの全校を表示。丸の大きさ=中3生徒数、色=見込みに対する来場状況）
// それ以外（生徒ページ・小学校）= 来場のあった学校のみ、来場者数を数字＋色の濃さで表示
// 座標は schools-master.js (SCHOOLS_MASTER_JHS) / schools-geo.js (SCHOOLS_GEO)、来場者数は getSchoolTotals() を使用。

let _schoolMap = null;
let _schoolMapLayer = null;
let _schoolMapType = 'jhs';

// 浸透度の区分ごとの見た目（凡例と共通）
const PENETRATION_LEVELS = {
  none:   { label: '来場なし',              fill: '#FFFFFF', stroke: '#C62828', weight: 3 },
  low:    { label: '見込みの半分未満',      fill: '#F4A261', stroke: '#B85C1E', weight: 1.5 },
  mid:    { label: '見込み程度',            fill: '#A9C4DC', stroke: '#5E84A6', weight: 1.5 },
  high:   { label: '見込みの1.5倍以上',     fill: '#1F5F99', stroke: '#123B63', weight: 1.5 },
  nodata: { label: '生徒数データなし',      fill: '#C9C9D6', stroke: '#9E9EB8', weight: 1 },
};

function _mapMarkerColor(type, ratio) {
  // ratio(0〜1) が大きいほど濃い。中学校=えんじ / 小学校=青
  const alpha = (0.40 + 0.55 * ratio).toFixed(2);
  return type === 'jhs' ? `rgba(123,21,53,${alpha})` : `rgba(21,101,192,${alpha})`;
}

// 下関〜宇部〜美祢〜北九州〜山口市 の範囲（遠方・誤マッチ座標を地図から除外）
function _inRegion([lat, lng]) {
  return lat >= 33.0 && lat <= 34.6 && lng >= 130.2 && lng <= 132.3;
}

// 表示範囲の切替（浸透度マップ）。bounds: [[南, 西], [北, 東]]
const MAP_AREAS = [
  { key: 'west',   label: '下関・山陽小野田', bounds: [[33.92, 130.86], [34.32, 131.22]] },
  { key: 'city',   label: '下関市中心部',     bounds: [[33.925, 130.88], [34.045, 131.02]] },
  { key: 'all',    label: '県内全域',         bounds: [[33.90, 130.80], [34.42, 132.20]] },
];
let _mapArea = 'west';

function setMapArea(key) {
  _mapArea = key;
  const area = MAP_AREAS.find(a => a.key === key);
  if (_schoolMap && area) _schoolMap.fitBounds(area.bounds, { padding: [8, 8] });
  document.querySelectorAll('.pen-area-btn').forEach(b => b.classList.toggle('active', b.dataset.area === key));
}

function _isAnalysisMap(el) {
  return el.dataset.analysis === '1' && _schoolMapType === 'jhs' && typeof getJhsPenetration === 'function'
    && typeof SCHOOLS_MASTER_JHS !== 'undefined';
}

function renderSchoolMap(type) {
  if (type) _schoolMapType = type;
  const el = document.getElementById('school-map');
  if (!el) return;

  document.querySelectorAll('.map-toggle-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === _schoolMapType));

  const analysis = _isAnalysisMap(el);
  const label = _schoolMapType === 'jhs' ? '中学校' : '小学校';
  const titleEl = document.getElementById('school-map-title');
  if (titleEl) titleEl.textContent = analysis ? '🗺️ 中学校 浸透度マップ' : `🗺️ ${label}マップ（来場者数）`;

  // ライブラリ/座標データが未読込なら案内だけ出す
  if (typeof L === 'undefined' || typeof SCHOOLS_GEO === 'undefined') {
    el.innerHTML = '<p style="padding:var(--space-6);text-align:center;color:var(--color-gray-400);font-size:var(--text-sm)">地図を読み込めませんでした（通信環境をご確認ください）</p>';
    return;
  }

  if (!_schoolMap) {
    _schoolMap = L.map(el, { scrollWheelZoom: false, minZoom: 8, maxZoom: 15 }).setView([34.05, 131.05], 10);
    // 道路や建物が控えめな淡色地図（丸マーカーを見やすくするため。無料・APIキー不要）
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
      maxZoom: 15,
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>'
    }).addTo(_schoolMap);
  }
  if (_schoolMapLayer) _schoolMap.removeLayer(_schoolMapLayer);
  _schoolMapLayer = L.layerGroup().addTo(_schoolMap);

  if (analysis) _renderPenetrationMap();
  else _renderVisitedMap(label);

  // セクションが後から表示された場合に地図サイズを再計算
  setTimeout(() => { if (_schoolMap) _schoolMap.invalidateSize(); }, 200);
}

// ---- 来場のあった学校のみ（生徒ページ・小学校）----
function _renderVisitedMap(label) {
  _setAnalysisPanels(false);
  const totals = getSchoolTotals(_schoolMapType);
  const max = totals.length ? totals[0].students : 1;
  const bounds = [];
  let placed = 0, missing = [];

  totals.forEach(t => {
    const geo = SCHOOLS_GEO[t.name];
    if (!geo || !_inRegion(geo)) { missing.push(t.name); return; }
    const ratio = max > 0 ? t.students / max : 0;
    const size = 26 + Math.round(ratio * 24); // 26〜50px
    const color = _mapMarkerColor(_schoolMapType, ratio);
    const icon = L.divIcon({
      className: 'school-marker',
      html: `<div class="school-marker-inner" style="width:${size}px;height:${size}px;background:${color}">${t.students}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
    const repeat = t.visits - t.students;
    L.marker(geo, { icon })
      .bindPopup(`<strong>${escapeHtml(t.name)}</strong><br>来場 実人数 <b>${t.students}名</b>${repeat > 0 ? `（延べ${t.visits}）` : ''}`)
      .addTo(_schoolMapLayer);
    bounds.push(geo);
    placed++;
  });

  if (bounds.length) _schoolMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });

  const cap = document.getElementById('school-map-caption');
  if (cap) {
    let text = `丸の大きさ・色の濃さ＝来場者数（実人数）。${label} ${placed}校を表示中`
      + (missing.length ? ` ／ ${missing.length}校は位置を特定できず非表示` : '');
    if (document.getElementById('school-map').dataset.analysis === '1' && _schoolMapType === 'elm') {
      text += '。小学校は学校一覧（生徒数）が未登録のため、来場のあった学校のみ表示しています';
    }
    cap.textContent = text;
  }
}

// ---- 浸透度マップ（教員ページの中学校）----
function _renderPenetrationMap() {
  const p = getJhsPenetration();
  // 入試データ（教員ページで読込済みの場合のみ）
  const exam = typeof getExamCountsBySchool === 'function' ? getExamCountsBySchool() : null;
  p.schools.forEach(s => { s.exam = exam ? (exam.map[s.name] || 0) : null; });
  p.examFiscal = exam ? exam.fiscal : '';
  _setAnalysisPanels(true);

  const radiusOf = s => s.g3 ? 4 + Math.sqrt(s.g3) * 0.95 : (s.students > 0 ? 8 : 4.5);

  // 小さい丸が大きい丸に隠れないよう、大きい順に描く
  const ordered = [...p.schools].filter(s => s.lat != null).sort((a, b) => radiusOf(b) - radiusOf(a));
  ordered.forEach(s => {
    const pos = [s.lat, s.lng];
    if (!_inRegion(pos)) return;
    const lv = PENETRATION_LEVELS[s.level];
    const r = radiusOf(s);
    L.circleMarker(pos, {
      radius: r, color: lv.stroke, weight: lv.weight, fillColor: lv.fill,
      fillOpacity: s.level === 'nodata' ? 0.7 : 0.92
    })
      .bindTooltip(escapeHtml(s.name.replace(/^.+?[市町村]立/, '')), { direction: 'top', offset: [0, -r] })
      .bindPopup(_penetrationPopup(s, p.baseRate))
      .addTo(_schoolMapLayer);

    if (s.students > 0 && r >= 8) _addCountLabel(pos, s.students, s.level === 'high');
  });

  // 営業リストにない学校（北九州など）からの来場
  let outsidePlaced = 0;
  p.outside.forEach(t => {
    const geo = SCHOOLS_GEO[t.name];
    if (!geo || !_inRegion(geo)) return;
    L.circleMarker(geo, { radius: 8, color: '#6E6E8E', weight: 1.5, fillColor: '#FFFFFF', fillOpacity: 0.9, dashArray: '3 2' })
      .bindTooltip(escapeHtml(t.name), { direction: 'top', offset: [0, -8] })
      .bindPopup(`<strong>${escapeHtml(t.name)}</strong><br>来場 実人数 <b>${t.students}名</b><br><span class="pen-pop-note">営業リスト外の学校</span>`)
      .addTo(_schoolMapLayer);
    _addCountLabel(geo, t.students, false);
    outsidePlaced++;
  });

  _renderAreaButtons();
  setMapArea(_mapArea);

  _renderPenetrationSummary(p);
  _renderPenetrationLegend(p);
  _renderGapLists(p);

  const cap = document.getElementById('school-map-caption');
  if (cap) {
    cap.textContent = `営業リスト ${p.schools.length}校（うち中3生徒数の登録 ${p.sizedCount}校）を表示。`
      + `丸にカーソルを合わせると学校名、クリックで詳細を表示します。`
      + (outsidePlaced ? `点線の丸は営業リスト外（北九州など）からの来場 ${outsidePlaced}校です。` : '');
  }
}

// 丸の中に来場者数（実人数）を表示
function _addCountLabel(pos, n, onDark) {
  L.marker(pos, {
    interactive: false,
    icon: L.divIcon({
      className: 'pen-count',
      html: `<span class="${onDark ? 'on-dark' : ''}">${n}</span>`,
      iconSize: [30, 16], iconAnchor: [15, 8]
    })
  }).addTo(_schoolMapLayer);
}

function _examFiscalShort() {
  const ex = typeof getExamSummary === 'function' ? getExamSummary() : null;
  return ex && ex.fiscal ? ex.fiscal.replace('入試', '') : '入試';
}

function _penetrationPopup(s, baseRate) {
  const name = `<strong>${escapeHtml(s.name)}</strong>`;
  if (!s.g3) {
    return `${name}<br>来場 実人数 <b>${s.students}名</b>${s.exam ? `<br>受験者（${escapeHtml(_examFiscalShort())}） ${s.exam}名` : ''}<br><span class="pen-pop-note">中3生徒数が営業リストに未登録のため、見込みは算出していません</span>`;
  }
  const exp = s.expected.toFixed(1);
  const gap = s.gap >= 0 ? `+${s.gap.toFixed(1)}` : s.gap.toFixed(1);
  return `${name}
    <table class="pen-pop">
      <tr><th>中3生徒数</th><td>${s.g3}名</td></tr>
      <tr><th>来場 実人数</th><td><b>${s.students}名</b></td></tr>
      <tr><th>来場率</th><td>${(s.rate * 100).toFixed(1)}%</td></tr>
      <tr><th>来場見込み</th><td>${exp}名</td></tr>
      <tr><th>見込みとの差</th><td class="${s.gap < 0 ? 'neg' : 'pos'}">${gap}名</td></tr>
      ${s.exam != null ? `<tr><th>受験者（${escapeHtml(_examFiscalShort())}）</th><td>${s.exam}名</td></tr>` : ''}
    </table>
    <span class="pen-pop-note">見込み＝中3生徒数×全体の来場率 ${(baseRate * 100).toFixed(1)}%</span>`;
}

function _renderAreaButtons() {
  const el = document.getElementById('school-map-area');
  if (!el) return;
  el.innerHTML = '表示範囲：' + MAP_AREAS.map(a =>
    `<button class="pen-area-btn" data-area="${a.key}" onclick="setMapArea('${a.key}')">${a.label}</button>`).join('');
}

function _setAnalysisPanels(show) {
  ['school-map-summary', 'school-map-legend', 'school-map-area', 'school-gap-lists'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  });
}

function _renderPenetrationSummary(p) {
  const el = document.getElementById('school-map-summary');
  if (!el) return;
  const sizedNone = p.schools.filter(s => s.level === 'none').length;
  el.innerHTML = `
    <div class="pen-kpi"><span class="pen-kpi-label">全体の来場率</span><span class="pen-kpi-value">${(p.baseRate * 100).toFixed(1)}<small>%</small></span><span class="pen-kpi-sub">来場 ${p.sizedStudents}名 ÷ 中3生徒数 ${p.sizedG3.toLocaleString()}名</span></div>
    <div class="pen-kpi"><span class="pen-kpi-label">来場のあった学校</span><span class="pen-kpi-value">${p.visitedCount}<small>校 / ${p.schools.length}校</small></span><span class="pen-kpi-sub">営業リスト掲載校のうち</span></div>
    <div class="pen-kpi"><span class="pen-kpi-label">来場なし（生徒数登録校）</span><span class="pen-kpi-value">${sizedNone}<small>校 / ${p.sizedCount}校</small></span><span class="pen-kpi-sub">地図の赤い白抜きの丸</span></div>`;
}

function _renderPenetrationLegend(p) {
  const el = document.getElementById('school-map-legend');
  if (!el) return;
  const items = Object.entries(PENETRATION_LEVELS).map(([key, lv]) => {
    const n = p.schools.filter(s => s.level === key).length;
    return `<span class="pen-legend-item"><i style="background:${lv.fill};border:${Math.max(1.5, lv.weight)}px solid ${lv.stroke}"></i>${lv.label}<em>${n}</em></span>`;
  }).join('');
  el.innerHTML = `
    <div class="pen-legend-row">${items}</div>
    <div class="pen-legend-note">丸の大きさ＝中3生徒数　／　丸の中の数字＝来場者（実人数）　／　色＝「中3生徒数×全体の来場率」で求めた見込みと比べた来場状況</div>`;
}

function _renderGapLists(p) {
  const el = document.getElementById('school-gap-lists');
  if (!el) return;
  const hasExam = p.schools.some(s => s.exam != null);
  const row = s => {
    const lv = PENETRATION_LEVELS[s.level];
    const gap = s.gap >= 0 ? `+${s.gap.toFixed(1)}` : s.gap.toFixed(1);
    return `<tr>
      <td class="gap-name"><i style="background:${lv.fill};border-color:${lv.stroke}"></i>${escapeHtml(s.name.replace(/^.+?[市町村]立/, ''))}<span class="gap-city">${escapeHtml(s.city)}</span></td>
      <td>${s.g3}</td><td><b>${s.students}</b></td><td>${s.expected.toFixed(1)}</td>
      <td class="${s.gap < 0 ? 'neg' : 'pos'}">${gap}</td>
      ${hasExam ? `<td>${s.exam}</td>` : ''}</tr>`;
  };
  const table = (list, empty) => list.length ? `
    <div class="gap-table-wrap"><table class="gap-table">
      <thead><tr><th>学校</th><th>中3生徒数</th><th>来場</th><th>見込み</th><th>差</th>${hasExam ? `<th title="${escapeHtml(p.examFiscal)}の受験者数">昨年度受験</th>` : ''}</tr></thead>
      <tbody>${list.slice(0, 10).map(row).join('')}</tbody>
    </table></div>` : `<p class="gap-empty">${empty}</p>`;

  el.innerHTML = `
    <div class="gap-col">
      <h3 class="gap-title">来場が見込みを下回る学校</h3>
      <p class="gap-desc">中3生徒数に対して来場が少ない順（上位10校）。訪問・案内強化の候補です。</p>
      ${table(p.shortfall, '該当する学校はありません')}
    </div>
    <div class="gap-col">
      <h3 class="gap-title">来場が見込みを上回る学校</h3>
      <p class="gap-desc">中3生徒数に対して来場が多い順（上位10校）。関係が築けている学校です。</p>
      ${table(p.surplus, '該当する学校はありません')}
    </div>`;
}
