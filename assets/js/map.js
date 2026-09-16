// ===== 学校マップ（Leaflet + 国土地理院 淡色地図）=====
// 教員ページ = 浸透度マップ（営業リストの全校を表示。丸の大きさ=中3/小6の生徒数、色=地域の平均並みの人数に対する来場状況）
// 生徒ページ = 来場者数マップ。下関市・門司区の全校（schools-area.js）は来場0も「0」で表示し、
// それ以外の地域は来場のあった学校のみ表示する
// 座標は schools-master.js / schools-area.js / schools-geo.js、来場者数は getSchoolTotals() を使用。

let _schoolMap = null;
let _schoolMapLayer = null;
let _schoolLabelLayer = null;  // 学校名ラベル（拡大時のみ表示）
let _schoolMapType = 'jhs';
const LABEL_MIN_ZOOM = 12;     // この拡大率以上で学校名を表示

// 浸透度の区分ごとの見た目（凡例と共通）
const PENETRATION_LEVELS = {
  none:   { label: '来場なし',              fill: '#FFFFFF', stroke: '#C62828', weight: 3 },
  low:    { label: '平均の半分未満',        fill: '#F4A261', stroke: '#B85C1E', weight: 1.5 },
  mid:    { label: '平均程度',              fill: '#A9C4DC', stroke: '#5E84A6', weight: 1.5 },
  high:   { label: '平均の1.5倍以上',       fill: '#1F5F99', stroke: '#123B63', weight: 1.5 },
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

// 表示範囲の切替。bounds: [[南, 西], [北, 東]]（null=表示中の学校すべてが入る範囲）
const MAP_AREAS = [
  { key: 'west',   label: '下関市全域',       bounds: [[33.92, 130.78], [34.32, 131.10]] },
  { key: 'city',   label: '下関市中心部',     bounds: [[33.925, 130.88], [34.045, 131.02]] },
  { key: 'sanyo',  label: '山陽小野田市',     bounds: [[33.93, 131.08], [34.10, 131.28]] },
  { key: 'kk',     label: '門司区・小倉',     bounds: [[33.77, 130.83], [33.97, 131.02]] },
  { key: 'all',    label: '全域',             bounds: [[33.77, 130.80], [34.42, 132.20]] },
];
// 来場者数マップ（生徒ページ・小学校）
const VISIT_MAP_AREAS = [
  { key: 'focus',  label: '下関市・門司区',       bounds: [[33.855, 130.78], [34.31, 131.09]] },
  { key: 'center', label: '下関市中心部・門司区', bounds: [[33.86, 130.87], [34.075, 131.05]] },
  { key: 'visit',  label: '来場のあった全地域',   bounds: null },
];
let _mapArea = 'west';
let _visitArea = 'focus';
let _mapAreas = MAP_AREAS;
let _mapFitBounds = [];  // 'visit' 用：表示中の全マーカーの座標

function setMapArea(key) {
  const area = _mapAreas.find(a => a.key === key);
  if (!area) return;
  if (_mapAreas === MAP_AREAS) _mapArea = key; else _visitArea = key;
  if (_schoolMap) {
    if (area.bounds) _schoolMap.fitBounds(area.bounds, { padding: [8, 8] });
    else if (_mapFitBounds.length) _schoolMap.fitBounds(_mapFitBounds, { padding: [30, 30], maxZoom: 12 });
  }
  document.querySelectorAll('.pen-area-btn').forEach(b => b.classList.toggle('active', b.dataset.area === key));
}

function _isAnalysisMap(el) {
  return el.dataset.analysis === '1' && typeof hasPenetrationMaster === 'function' && hasPenetrationMaster(_schoolMapType);
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
  const yearTag = window.IS_TEACHER ? `（${ACTIVE_YEAR}年度）` : '';
  if (titleEl) titleEl.textContent = analysis ? `🗺️ ${label} 浸透度マップ${yearTag}` : `🗺️ ${label}マップ（来場者数）${yearTag}`;
  const subEl = document.getElementById('school-map-subtitle');
  if (subEl) subEl.textContent = `${_schoolMapType === 'jhs' ? '中3' : '小6'}の生徒数（学校の規模）と、${_schoolMapType === 'jhs' ? '中3' : '小6'}の来場者数を学校ごとに比較（全イベント合算）`;

  // ライブラリ/座標データが未読込なら案内だけ出す
  if (typeof L === 'undefined' || typeof SCHOOLS_GEO === 'undefined') {
    el.innerHTML = '<p style="padding:var(--space-6);text-align:center;color:var(--color-gray-400);font-size:var(--text-sm)">地図を読み込めませんでした（通信環境をご確認ください）</p>';
    return;
  }

  if (!_schoolMap) {
    _schoolMap = L.map(el, { scrollWheelZoom: false, minZoom: 8, maxZoom: 15, zoomSnap: 0.25 }).setView([34.05, 131.05], 10);
    // 道路や建物が控えめな淡色地図（丸マーカーを見やすくするため。無料・APIキー不要）
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
      maxZoom: 15,
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>'
    }).addTo(_schoolMap);
    _addCityBoundaries();
    _schoolMap.createPane('schoolLabelPane').style.zIndex = 640;  // 学校名は丸より手前に表示
    _schoolMap.on('zoomend', _updateSchoolLabels);
  }
  if (_schoolMapLayer) _schoolMap.removeLayer(_schoolMapLayer);
  if (_schoolLabelLayer) _schoolMap.removeLayer(_schoolLabelLayer);
  _schoolMapLayer = L.layerGroup().addTo(_schoolMap);
  _schoolLabelLayer = L.layerGroup();

  if (analysis) _renderPenetrationMap();
  else _renderVisitedMap(label);

  _updateSchoolLabels();

  // セクションが後から表示された場合に地図サイズを再計算
  setTimeout(() => { if (_schoolMap) _schoolMap.invalidateSize(); }, 200);
}

// 市区の境界線と市区名（下関市と山陽小野田市などの区切りを分かりやすくする）
function _addCityBoundaries() {
  if (typeof CITY_BOUNDARIES === 'undefined') return;
  const pane = _schoolMap.createPane('cityPane');
  pane.style.zIndex = 350;  // 地図の上・学校の丸の下
  pane.style.pointerEvents = 'none';
  CITY_BOUNDARIES.forEach(c => {
    L.polygon(c.rings, { pane: 'cityPane', color: '#4A4A6A', weight: 1.6, opacity: 0.75, dashArray: '6 4', fill: false, interactive: false })
      .addTo(_schoolMap);
    // 最も大きい輪郭の中心付近に市区名
    const main = c.rings.reduce((a, b) => (b.length > a.length ? b : a));
    const center = L.polygon(main).getBounds().getCenter();
    L.marker(center, {
      pane: 'cityPane', interactive: false,
      icon: L.divIcon({ className: 'city-name-label', html: `<span>${escapeHtml(c.name)}</span>`, iconSize: [0, 0] })
    }).addTo(_schoolMap);
  });
}

// 学校名ラベル（丸の下）。拡大したときだけ表示する
function _addSchoolLabel(pos, name, offsetPx) {
  L.marker(pos, {
    interactive: false, keyboard: false, pane: 'schoolLabelPane',
    icon: L.divIcon({ className: 'school-name-label', html: `<span style="top:${Math.round(offsetPx)}px">${escapeHtml(_labelSchoolName(name))}</span>`, iconSize: [0, 0] })
  }).addTo(_schoolLabelLayer);
}

function _labelSchoolName(name) {
  return _shortSchoolName(name)
    .replace(/^うつい小中学校/, '')
    .replace(/高等学校附属中学校$/, '高附属中')
    .replace(/中等教育学校$/, '中等')
    .replace(/中学校/g, '中').replace(/小学校/g, '小');
}

function _updateSchoolLabels() {
  if (!_schoolMap || !_schoolLabelLayer) return;
  const show = _schoolMap.getZoom() >= LABEL_MIN_ZOOM;
  if (show && !_schoolMap.hasLayer(_schoolLabelLayer)) _schoolLabelLayer.addTo(_schoolMap);
  if (!show && _schoolMap.hasLayer(_schoolLabelLayer)) _schoolMap.removeLayer(_schoolLabelLayer);
}

// ---- 来場者数マップ（生徒ページ・小学校）----
// 学校名の照合用キー（空白・ヶ/ケ の表記ゆれ、既知の別名を吸収）
function _schoolKey(name) {
  const n = typeof _normSchoolName === 'function' ? _normSchoolName(name) : String(name || '').replace(/[\s　]/g, '');
  return n.replace(/ヶ/g, 'ケ');
}

function _visitMarker(pos, n, ratio, name, popupHtml, zero, ref) {
  const size = zero ? (ref ? 20 : 24) : 26 + Math.round(ratio * 24); // 来場あり 26〜50px
  const html = zero
    ? `<div class="school-marker-inner ${ref ? 'ref' : 'zero'}" style="width:${size}px;height:${size}px">0</div>`
    : `<div class="school-marker-inner" style="width:${size}px;height:${size}px;background:${_mapMarkerColor(_schoolMapType, ratio)}">${n}</div>`;
  L.marker(pos, {
    icon: L.divIcon({ className: 'school-marker', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
    zIndexOffset: zero ? 0 : 1000 + n,  // 来場ありの学校を上に重ねる
  })
    .bindTooltip(escapeHtml(_shortSchoolName(name)), { direction: 'top', offset: [0, -size / 2] })
    .bindPopup(popupHtml)
    .addTo(_schoolMapLayer);
  _addSchoolLabel(pos, name, size / 2 + 1);
  _mapFitBounds.push(pos);
}

function _shortSchoolName(name) {
  return String(name).replace(/^.+?[都道府県市区町村]立/, '');
}

function _renderVisitedMap(label) {
  _setAnalysisPanels(false);
  const totals = getSchoolTotals(_schoolMapType);
  const max = totals.length ? totals[0].students : 1;
  const byKey = {};
  totals.forEach(t => { byKey[_schoolKey(t.name)] = t; });
  const cancelByKey = {};
  Object.entries(getSchoolCancels(_schoolMapType)).forEach(([n, c]) => {
    cancelByKey[_schoolKey(n)] = (cancelByKey[_schoolKey(n)] || 0) + c;
  });
  const used = new Set();
  _mapFitBounds = [];

  const popup = (name, t, areaLabel, ref) => {
    const c = cancelByKey[_schoolKey(name)] || 0;
    return `<strong>${escapeHtml(name)}</strong><br>`
      + (t ? `来場 実人数 <b>${t.students}名</b>${t.visits > t.students ? `（延べ${t.visits}）` : ''}` : '来場 <b>0名</b>')
      + (c ? `<br>キャンセル ${c}名<span class="pen-pop-note">（申込後、来場なし）</span>` : '')
      + (ref ? `<br><span class="pen-pop-note">中高一貫校のため、通常は来場の対象外です（参考表示）</span>`
        : !t && areaLabel ? `<br><span class="pen-pop-note">${escapeHtml(areaLabel)}の学校のうち、まだ来場のない学校です</span>` : '');
  };

  // 1) 下関市・門司区の全校（来場0も表示）
  const areaSchools = (typeof SCHOOLS_AREA !== 'undefined' && SCHOOLS_AREA[_schoolMapType]) || [];
  const areaStats = {};  // area -> { total, visited, zero: [{name, cancels}], ref: [{name, students}] }
  areaSchools.forEach(s => {
    const keys = [_schoolKey(s.name)];
    if (/^.{2,3}県立/.test(s.name)) keys.push(_schoolKey(s.name.replace(/^.{2,3}県立/, '')));
    const key = keys.find(k => byKey[k]);
    const t = key ? byKey[key] : null;
    if (key) used.add(key);
    const st = areaStats[s.area] || (areaStats[s.area] = { total: 0, visited: 0, zero: [], ref: [] });
    if (s.ref) st.ref.push({ name: s.name, students: t ? t.students : 0 });  // 中高一貫校は集計から除き、参考として列挙
    else {
      st.total++;
      if (t) st.visited++; else st.zero.push({ name: s.name, cancels: cancelByKey[keys[0]] || 0 });
    }
    if (s.lat == null) return;
    _visitMarker([s.lat, s.lng], t ? t.students : 0, t && max > 0 ? t.students / max : 0, s.name, popup(s.name, t, s.area, s.ref), !t, s.ref);
  });

  // 2) それ以外の地域からの来場（来場のあった学校のみ）
  let otherPlaced = 0;
  const far = [];
  totals.forEach(t => {
    if (used.has(_schoolKey(t.name))) return;
    const geo = SCHOOLS_GEO[t.name];
    if (!geo || !_inRegion(geo)) { far.push(t); return; }
    _visitMarker(geo, t.students, max > 0 ? t.students / max : 0, t.name, popup(t.name, t), false);
    otherPlaced++;
  });

  _mapAreas = VISIT_MAP_AREAS;
  _renderAreaButtons();
  setMapArea(_visitArea);

  _renderZeroList(label, areaStats);

  const cap = document.getElementById('school-map-caption');
  if (cap) {
    const areaNote = Object.keys(areaStats).length
      ? `下関市・門司区は全${areaSchools.length}校を表示し、まだ来場のない学校は赤い枠の「0」で示しています（灰色の「0」は、通常は来場の対象外である中高一貫校）。` : '';
    const cancelTotal = Object.values(cancelByKey).reduce((a, c) => a + c, 0);
    cap.innerHTML = `丸の中の数字＝来場者数（実人数）。数が多いほど丸が大きく、色が濃くなります。<b>地図を拡大すると学校名が表示されます。</b>点線は市・区の境界です。<br>${areaNote}`
      + (otherPlaced ? `その他の地域は来場のあった${otherPlaced}校を表示しています。` : '')
      + (cancelTotal ? `<br>来場者数には、申込後に来場しなかった方（キャンセル 計${cancelTotal}名）は含めていません。学校をクリックすると件数を確認できます。` : '')
      + (far.length ? `<br>地図に表示していない学校（遠方または位置不明）：${far.map(t => `${escapeHtml(t.name)}（${t.students}名）`).join('、')}` : '');
  }
}

// 地図の下に「まだ来場のない学校」を地域ごとに一覧表示
function _renderZeroList(label, areaStats) {
  const el = document.getElementById('school-map-zero');
  if (!el) return;
  const areas = Object.keys(areaStats);
  if (!areas.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = `
    <h3 class="zero-title">まだ来場のない${label}</h3>
    ${areas.map(a => {
      const st = areaStats[a];
      return `<div class="zero-area">
        <div class="zero-area-head"><strong>${escapeHtml(a)}</strong>
          <span>全${st.total}校のうち 来場あり <b>${st.visited}</b>校 ／ 来場0 <b class="zero-num">${st.zero.length}</b>校</span></div>
        <div class="zero-chips">${st.zero.length
          ? st.zero.map(z => `<span class="zero-chip">${escapeHtml(_shortSchoolName(z.name))}${z.cancels ? `<small>キャンセル${z.cancels}</small>` : ''}</span>`).join('')
          : '<span class="zero-none">すべての学校から来場がありました</span>'}</div>
        ${st.ref.length ? `<div class="zero-ref">参考（中高一貫校のため通常は来場の対象外。上の校数には含めていません）：${st.ref.map(r => `${escapeHtml(_shortSchoolName(r.name))}（来場${r.students}名）`).join('、')}</div>` : ''}
      </div>`;
    }).join('')}`;
}

// ---- 浸透度マップ（教員ページ）----
function _renderPenetrationMap() {
  const p = getPenetration(_schoolMapType);
  // 入試データ（読込済み・共有済みの場合のみ）。中学校→高校入試、小学校→中学入試
  // 表示年度に来場した学年の入試結果（翌年度入試）を優先し、無ければ表示年度の入試（1学年上）を表示
  const exam = typeof getExamCountsBySchool === 'function' ? getExamCountsBySchool(_schoolMapType === 'jhs' ? 'high' : 'junior', [ACTIVE_YEAR + 1, ACTIVE_YEAR]) : null;
  p.schools.forEach(s => { s.exam = exam ? (exam.map[s.name] || { total: 0, enrolled: 0 }) : null; });
  p.examFiscal = exam ? exam.fiscal : '';
  p.examHasPasses = !!(exam && exam.hasPasses);
  _setAnalysisPanels(true);

  const radiusOf = s => s.size ? 4 + Math.sqrt(s.size) * 0.95 : (s.students > 0 ? 8 : 4.5);

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
      .bindPopup(_penetrationPopup(s, p))
      .addTo(_schoolMapLayer);
    _addSchoolLabel(pos, s.name, r + 2);

    if (s.students > 0 && r >= 8) _addCountLabel(pos, s.students, s.level === 'high');
  });

  // 営業リストにない学校（北九州など）からの来場
  let outsidePlaced = 0;
  p.outside.forEach(t => {
    const geo = SCHOOLS_GEO[t.name];
    if (!geo || !_inRegion(geo)) return;
    L.circleMarker(geo, { radius: 8, color: '#6E6E8E', weight: 1.5, fillColor: '#FFFFFF', fillOpacity: 0.9, dashArray: '3 2' })
      .bindTooltip(escapeHtml(t.name), { direction: 'top', offset: [0, -8] })
      .bindPopup(`<strong>${escapeHtml(t.name)}</strong><br>来場（${p.gradeLabel}） <b>${t.students}名</b><br><span class="pen-pop-note">営業リスト外の学校</span>`)
      .addTo(_schoolMapLayer);
    _addSchoolLabel(geo, t.name, 10);
    _addCountLabel(geo, t.students, false);
    outsidePlaced++;
  });

  _mapAreas = MAP_AREAS;
  _renderAreaButtons();
  setMapArea(_mapArea);

  _renderPenetrationSummary(p);
  _renderPenetrationLegend(p);
  _renderGapLists(p);

  const cap = document.getElementById('school-map-caption');
  if (cap) {
    const listNote = p.type === 'jhs' ? '営業リストと北九州市（門司区・小倉北区・小倉南区）' : '営業リスト（下関市・山陽小野田市・門司区）';
    const sizeYearNote = ACTIVE_YEAR === CURRENT_YEAR ? ''
      : p.type === 'elm' ? `生徒数は${ACTIVE_YEAR}年度の数値（無い学校は${CURRENT_YEAR}年度の数値）です。` : `生徒数は${CURRENT_YEAR}年度の数値です（${ACTIVE_YEAR}年度の数値が無いため）。`;
    cap.textContent = `${listNote}の${p.schools.length}校（うち${p.gradeLabel}生徒数の登録 ${p.sizedCount}校）を表示。来場者は${p.gradeLabel}のみ数えています。${sizeYearNote}`
      + `地図を拡大すると学校名が表示されます（丸にカーソルを合わせても確認できます）。クリックで詳細を表示します。点線は市・区の境界です。`
      + (outsidePlaced ? `点線の丸は一覧外の学校からの来場 ${outsidePlaced}校です。` : '');
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
  const ex = typeof getExamCountsBySchool === 'function' ? getExamCountsBySchool(_schoolMapType === 'jhs' ? 'high' : 'junior', [ACTIVE_YEAR + 1, ACTIVE_YEAR]) : null;
  return ex && ex.fiscal ? ex.fiscal : '入試';
}

function _penetrationPopup(s, p) {
  const name = `<strong>${escapeHtml(s.name)}</strong>`;
  const g = p.gradeLabel;
  if (!s.size) {
    return `${name}<br>来場（${g}） <b>${s.students}名</b>${s.cancels ? `<br>キャンセル ${s.cancels}名` : ''}${s.exam && (s.exam.total || s.exam.enrolled) ? `<br>${escapeHtml(_examFiscalShort())}：受験 ${s.exam.total}名・入学 ${s.exam.enrolled}名` : ''}<br><span class="pen-pop-note">${g}生徒数が未登録のため、平均並みの人数は算出していません</span>`;
  }
  const { exp, diff } = _gapNumbers(s);
  return `${name}
    <table class="pen-pop">
      <tr><th>${g}生徒数</th><td>${s.size}名</td></tr>
      <tr><th>来場（${g}）</th><td><b>${s.students}名</b></td></tr>
      ${s.cancels ? `<tr><th>キャンセル</th><td>${s.cancels}名</td></tr>` : ''}
      <tr><th>来場率</th><td>${(s.rate * 100).toFixed(1)}%</td></tr>
      <tr><th>平均並みの人数</th><td>${exp}名</td></tr>
      <tr><th>平均との差</th><td class="${diff < 0 ? 'neg' : diff > 0 ? 'pos' : ''}">${_signed(diff)}名</td></tr>
      ${s.exam != null ? `<tr><th>${escapeHtml(_examFiscalShort())} 受験者</th><td>${s.exam.total}名</td></tr>
      <tr><th>${escapeHtml(_examFiscalShort())} 入学者</th><td>${s.exam.enrolled}名</td></tr>` : ''}
    </table>
    <span class="pen-pop-note">平均並みの人数＝${g}生徒数 ${s.size}名 × ${escapeHtml(_regionLabel(s.region))}の平均来場率 ${(s.baseRate * 100).toFixed(1)}%</span>`;
}

// 表・吹き出し用の整数表示。平均並みの人数は四捨五入し、差は「来場 − 表示した平均並みの人数」にそろえる
function _gapNumbers(s) {
  const exp = Math.round(s.expected);
  return { exp, diff: s.students - exp };
}
function _signed(n) {
  return n > 0 ? `+${n}` : String(n);
}

function _renderAreaButtons() {
  const el = document.getElementById('school-map-area');
  if (!el) return;
  el.innerHTML = '表示範囲：' + _mapAreas.map(a =>
    `<button class="pen-area-btn" data-area="${a.key}" onclick="setMapArea('${a.key}')">${a.label}</button>`).join('');
}

function _setAnalysisPanels(show) {
  ['school-map-summary', 'school-map-legend', 'school-gap-lists'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  });
  const zero = document.getElementById('school-map-zero');
  if (zero && show) zero.style.display = 'none';
}

function _regionLabel(region, type = _schoolMapType) {
  if (region !== '北九州市') return '山口県内';
  return type === 'elm' ? '北九州市（門司区）' : '北九州市（門司区・小倉北区・小倉南区）';
}

function _renderPenetrationSummary(p) {
  const el = document.getElementById('school-map-summary');
  if (!el) return;
  el.innerHTML = p.regions.map(r => `
    <div class="pen-kpi"><span class="pen-kpi-label">${escapeHtml(_regionLabel(r.name))}の平均来場率</span><span class="pen-kpi-value">${(r.baseRate * 100).toFixed(1)}<small>%</small></span><span class="pen-kpi-sub">${p.gradeLabel}の来場 ${r.sizedStudents}名 ÷ ${p.gradeLabel}生徒数 ${r.sizedTotal.toLocaleString()}名</span></div>
    <div class="pen-kpi"><span class="pen-kpi-label">来場のあった学校</span><span class="pen-kpi-value">${r.visitedCount}<small>校 / ${r.count}校</small></span><span class="pen-kpi-sub">来場なし（生徒数登録校）${r.sizedNone}校 / ${r.sizedCount}校</span></div>`).join('');
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
    <div class="pen-legend-note">丸の大きさ＝${p.gradeLabel}生徒数　／　丸の中の数字＝${p.gradeLabel}の来場者（実人数、キャンセルは含まない）　／　色＝「${p.gradeLabel}生徒数×地域の平均来場率」で求めた平均並みの人数と比べた来場状況（山口県内と北九州市は距離が異なるため、平均来場率を分けて計算しています）</div>`;
}

function _renderGapLists(p) {
  const el = document.getElementById('school-gap-lists');
  if (!el) return;
  const hasExam = p.schools.some(s => s.exam != null);
  const row = s => {
    const lv = PENETRATION_LEVELS[s.level];
    const { exp, diff } = _gapNumbers(s);
    return `<tr>
      <td class="gap-name"><i style="background:${lv.fill};border-color:${lv.stroke}"></i>${escapeHtml(s.name.replace(/^.+?[市町村]立/, ''))}<span class="gap-city">${escapeHtml(s.city)}</span></td>
      <td>${s.size}</td><td><b>${s.students}</b></td><td>${exp}</td>
      <td class="${diff < 0 ? 'neg' : 'pos'}">${_signed(diff)}</td>
      ${hasExam ? `<td>${s.exam.total}${p.examHasPasses ? `<span class="gap-sub">／${s.exam.enrolled}</span>` : ''}</td>` : ''}</tr>`;
  };
  const table = (list, empty) => list.length ? `
    <div class="gap-table-wrap"><table class="gap-table">
      <thead><tr><th>学校</th><th>${p.gradeLabel}生徒数</th><th>来場（${p.gradeLabel}）</th><th>平均並みの人数</th><th>平均との差</th>${hasExam ? `<th title="${escapeHtml(p.examFiscal)}の受験者数${p.examHasPasses ? '／入学者数' : ''}">${p.examHasPasses ? '受験／入学' : '受験'}<br><small class="gap-th-sub">${escapeHtml(p.examFiscal)}</small></th>` : ''}</tr></thead>
      <tbody>${list.slice(0, 10).map(row).join('')}</tbody>
    </table></div>` : `<p class="gap-empty">${empty}</p>`;

  // 山口県内と北九州市は平均来場率が大きく違うため、表を分ける
  el.innerHTML = p.regions.filter(r => r.sizedCount).map(r => {
    const inRegion = s => s.region === r.name;
    const rate = (r.baseRate * 100).toFixed(1);
    return `
    <div class="gap-region">
      <h3 class="gap-region-title">${escapeHtml(_regionLabel(r.name))}</h3>
      <p class="gap-region-note">
        <b>平均並みの人数</b>＝${p.gradeLabel}生徒数 × ${escapeHtml(_regionLabel(r.name, p.type))}の平均来場率 <b>${rate}%</b>（${p.gradeLabel}の来場 ${r.sizedStudents}名 ÷ ${p.gradeLabel}生徒数 ${r.sizedTotal.toLocaleString()}名）。
        平均的な割合で来場していれば、何人来ている計算になるかを示します。<b>平均との差</b>＝来場 − 平均並みの人数。
        ${r.baseRate < 0.02 ? `<br>※平均来場率が低いため、平均並みの人数は多くの学校で0〜1名です。1〜2名の来場でも「上回る」に入ります。` : ''}
      </p>
      <div class="gap-lists">
        <div class="gap-col">
          <h4 class="gap-title">来場が平均を下回る学校</h4>
          <p class="gap-desc">平均との差が大きい順（上位10校）。訪問・案内強化の候補です。</p>
          ${table(p.shortfall.filter(inRegion), '該当する学校はありません')}
        </div>
        <div class="gap-col">
          <h4 class="gap-title">来場が平均を上回る学校</h4>
          <p class="gap-desc">平均との差が大きい順（上位10校）。関係が築けている学校です。</p>
          ${table(p.surplus.filter(inRegion), '該当する学校はありません')}
        </div>
      </div>
    </div>`;
  }).join('');
}
