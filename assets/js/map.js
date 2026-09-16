// ===== 学校マップ（Leaflet + OpenStreetMap）=====
// 各学校の位置に、来場者数を数字＋色の濃さで表示する。
// 座標は schools-geo.js (SCHOOLS_GEO)、来場者数は getSchoolTotals() を使用。

let _schoolMap = null;
let _schoolMapLayer = null;
let _schoolMapType = 'jhs';

function _mapMarkerColor(type, ratio) {
  // ratio(0〜1) が大きいほど濃い。中学校=えんじ / 小学校=青
  const alpha = (0.40 + 0.55 * ratio).toFixed(2);
  return type === 'jhs' ? `rgba(123,21,53,${alpha})` : `rgba(21,101,192,${alpha})`;
}

function renderSchoolMap(type) {
  if (type) _schoolMapType = type;
  const el = document.getElementById('school-map');
  if (!el) return;

  document.querySelectorAll('.map-toggle-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === _schoolMapType));

  const label = _schoolMapType === 'jhs' ? '中学校' : '小学校';
  const titleEl = document.getElementById('school-map-title');
  if (titleEl) titleEl.textContent = `🗺️ ${label}マップ（来場者数）`;

  // ライブラリ/座標データが未読込なら案内だけ出す
  if (typeof L === 'undefined' || typeof SCHOOLS_GEO === 'undefined') {
    el.innerHTML = '<p style="padding:var(--space-6);text-align:center;color:var(--color-gray-400);font-size:var(--text-sm)">地図を読み込めませんでした（通信環境をご確認ください）</p>';
    return;
  }

  if (!_schoolMap) {
    _schoolMap = L.map(el, { scrollWheelZoom: false }).setView([34.05, 131.05], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(_schoolMap);
  }
  if (_schoolMapLayer) _schoolMap.removeLayer(_schoolMapLayer);
  _schoolMapLayer = L.layerGroup().addTo(_schoolMap);

  const totals = getSchoolTotals(_schoolMapType);
  const max = totals.length ? totals[0].students : 1;
  const bounds = [];
  let placed = 0, missing = [];

  // 下関〜宇部〜美祢〜北九州〜山口市 の範囲（遠方・誤マッチ座標を地図から除外）
  const inRegion = ([lat, lng]) => lat >= 33.0 && lat <= 34.6 && lng >= 130.2 && lng <= 131.9;

  totals.forEach(t => {
    const geo = SCHOOLS_GEO[t.name];
    if (!geo || !inRegion(geo)) { missing.push(t.name); return; }
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
      .bindPopup(`<strong>${t.name}</strong><br>来場 実人数 <b>${t.students}名</b>${repeat > 0 ? `（延べ${t.visits}）` : ''}`)
      .addTo(_schoolMapLayer);
    bounds.push(geo);
    placed++;
  });

  if (bounds.length) _schoolMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });

  const cap = document.getElementById('school-map-caption');
  if (cap) {
    cap.textContent = `丸の大きさ・色の濃さ＝来場者数（実人数）。${label} ${placed}校を表示中`
      + (missing.length ? ` ／ ${missing.length}校は位置を特定できず非表示` : '');
  }
  // セクションが後から表示された場合に地図サイズを再計算
  setTimeout(() => { if (_schoolMap) _schoolMap.invalidateSize(); }, 200);
}
