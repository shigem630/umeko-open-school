const chartRegistry = new Map();

function renderChart(id, config) {
  if (chartRegistry.has(id)) {
    chartRegistry.get(id).destroy();
  }
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const chart = new Chart(canvas, config);
  chartRegistry.set(id, chart);
  return chart;
}

function destroyChart(id) {
  if (chartRegistry.has(id)) {
    chartRegistry.get(id).destroy();
    chartRegistry.delete(id);
  }
}

// Phase 8-5: global Chart.js font defaults (removes per-chart size hardcoding)
if (typeof Chart !== 'undefined') {
  Chart.defaults.font.family = "'Noto Sans JP', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif";
  Chart.defaults.font.size   = 12;
}

// Brand palette
const CHART_COLORS = [
  '#7B1535', '#A52050', '#C94070', '#D4739A', '#E6A8C0', '#F0D0DB',
  '#5C0F26', '#B8417A', '#9B2D60'
];

// Visually distinct palette for channel chart
const CHANNEL_COLORS = [
  '#7B1535','#1565C0','#2E7D32','#E65100','#6A1B9A',
  '#00695C','#37474F','#827717','#1A237E','#BF360C'
];

const SATISFACTION_COLORS = {
  '非常に満足':    '#2E7D32',
  '満足':         '#66BB6A',
  'どちらでもない':'#9E9E9E',
  '不満':         '#EF9A9A',
  '非常に不満':    '#C62828',
};

// Phase 8-4: wrapLabel uses visual width (CJK chars count as 2 units)
function wrapLabel(text, maxWidth = 16) {
  if (!text) return text;

  function charVisualWidth(ch) {
    const code = ch.codePointAt(0);
    // CJK Unified Ideographs, Hiragana, Katakana, full-width punctuation, etc.
    if (
      (code >= 0x1100 && code <= 0x115F) ||
      (code >= 0x2E80 && code <= 0x303E) ||
      (code >= 0x3040 && code <= 0x33FF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0x4E00 && code <= 0x9FFF) ||
      (code >= 0xA000 && code <= 0xA4CF) ||
      (code >= 0xAC00 && code <= 0xD7AF) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFE30 && code <= 0xFE4F) ||
      (code >= 0xFF01 && code <= 0xFF60) ||
      (code >= 0xFFE0 && code <= 0xFFE6)
    ) return 2;
    return 1;
  }

  let totalWidth = 0;
  for (const ch of text) totalWidth += charVisualWidth(ch);
  if (totalWidth <= maxWidth) return text;

  const lines = [];
  let line = '';
  let lineWidth = 0;
  for (const ch of text) {
    const w = charVisualWidth(ch);
    if (lineWidth + w > maxWidth) {
      if (line) lines.push(line);
      line = ch;
      lineWidth = w;
    } else {
      line += ch;
      lineWidth += w;
    }
  }
  if (line) lines.push(line);
  return lines.length > 1 ? lines : text;
}

function buildTrendChart(canvasId, rows, annotations) {
  const cumulative = getCumulativeCounts(rows);
  if (!cumulative.length) {
    destroyChart(canvasId);
    return null;
  }

  const labels = cumulative.map(d => {
    const [,m,day] = d.date.split('-');
    return `${parseInt(m)}/${parseInt(day)}`;
  });
  const data   = cumulative.map(d => d.count);
  const daily  = cumulative.map(d => d.daily);

  const annotationPluginConfig = {};
  (annotations || []).forEach((a, i) => {
    const label = cumulative.find(d => d.date === a.date);
    if (!label) return;
    const idx = cumulative.findIndex(d => d.date === a.date);
    annotationPluginConfig[`ann_${i}`] = {
      type: 'line',
      xMin: idx,
      xMax: idx,
      borderColor: '#B8860B',
      borderWidth: 1.5,
      borderDash: [5, 4],
      label: {
        display: true,
        content: a.text,
        position: 'start',
        rotation: -90,
        font: { size: 10, family: "'Noto Sans JP', sans-serif" },
        color: '#5C4A00',
        backgroundColor: 'rgba(255,248,225,0.9)',
        padding: 3
      }
    };
  });

  return renderChart(canvasId, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '累積申込数',
          data,
          borderColor: '#7B1535',
          backgroundColor: 'rgba(123,21,53,0.08)',
          tension: 0.3,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: '#7B1535',
          yAxisID: 'y'
        },
        {
          label: '日別申込数',
          data: daily,
          borderColor: '#C94070',
          backgroundColor: 'rgba(201,64,112,0.12)',
          type: 'bar',
          yAxisID: 'y2'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: true, position: 'top', labels: { boxWidth: 14 } },
        annotation: { annotations: annotationPluginConfig }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          position: 'left',
          beginAtZero: true,
          ticks: { stepSize: 5 },
          title: { display: true, text: '累積', font: { size: 10 } }
        },
        y2: {
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { stepSize: 1 },
          title: { display: true, text: '日別', font: { size: 10 } }
        }
      }
    }
  });
}

// Phase 8-3: added layout padding to prevent labels overflowing on narrow screens
function buildChannelChart(canvasId, rows) {
  const rawCounts = countByField(rows, 'channel');
  if (!Object.keys(rawCounts).length) { destroyChart(canvasId); return null; }

  const sorted = Object.entries(rawCounts).sort(([,a],[,b]) => b - a);
  const total  = sorted.reduce((s,[,v]) => s + v, 0);
  const labels = sorted.map(([l]) => wrapLabel(l, 16));
  const data   = sorted.map(([,v]) => v);

  // Dynamic height: ~52px per item (accommodates 2-line labels), minimum 200px
  const canvas = document.getElementById(canvasId);
  if (canvas && canvas.parentElement) {
    canvas.parentElement.style.height = Math.max(200, data.length * 52) + 'px';
  }

  return renderChart(canvasId, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: CHANNEL_COLORS.slice(0, data.length),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 4 } }, // Phase 8-3: prevent label clipping on mobile
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const pct = total > 0 ? Math.round(ctx.parsed.x * 100 / total) : 0;
              return ` ${ctx.parsed.x}件（${pct}%）`;
            }
          }
        }
      },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 } },
        y: { ticks: { autoSkip: false } }
      }
    }
  });
}

// 長いラベルを指定文字数で打ち切る（CJK文字は2幅として計算）
function truncateLabel(text, maxVisual = 14) {
  if (!text) return text;
  let width = 0;
  let result = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    const w = (code >= 0x1100 && code <= 0xFFE6) ? 2 : 1;
    if (width + w > maxVisual) { result += '…'; break; }
    result += ch;
    width += w;
  }
  return result;
}

function buildReasonChart(canvasId, rows) {
  // '/' で結合された複数回答を分割して集計
  const rawCounts = countReasons(rows);
  if (!Object.keys(rawCounts).length) { destroyChart(canvasId); return null; }

  // 上位10件のみ表示
  const entries    = Object.entries(rawCounts).slice(0, 10);
  const fullLabels = entries.map(([l]) => l);               // ツールチップ用（全文）
  const shortLabels = fullLabels.map(l => truncateLabel(l, 13)); // 軸ラベル用（短縮）
  const data        = entries.map(([, v]) => v);

  // 高さ: 1項目あたり 48px（1行ラベル想定）
  const canvas = document.getElementById(canvasId);
  if (canvas && canvas.parentElement) {
    canvas.parentElement.style.height = Math.max(200, data.length * 48) + 'px';
  }

  return renderChart(canvasId, {
    type: 'bar',
    data: {
      labels: shortLabels,
      datasets: [{
        data,
        backgroundColor: CHART_COLORS[0],
        hoverBackgroundColor: CHART_COLORS[1],
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            // ツールチップには全文を表示
            title: (ctx) => fullLabels[ctx[0].dataIndex] || ctx[0].label,
            label: (ctx) => ` ${ctx.parsed.x}件`
          }
        }
      },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 } },
        y: { ticks: { autoSkip: false } }
      }
    }
  });
}

function buildGradeChart(canvasId, rows, isCombined) {
  if (!rows.length) { destroyChart(canvasId); return null; }

  if (isCombined) {
    const jhsRows  = rows.filter(r => r._slot === 'jhs');
    const elmRows  = rows.filter(r => r._slot === 'elm');
    const jhsDist  = getGradeDist(jhsRows);
    const elmDist  = getGradeDist(elmRows);
    const allGrades = [...new Set([...Object.keys(jhsDist), ...Object.keys(elmDist)])];
    const ORDER = ['1年生','2年生','3年生','4年生','5年生','6年生'];
    allGrades.sort((a,b) => (ORDER.indexOf(a)+1||99) - (ORDER.indexOf(b)+1||99));

    return renderChart(canvasId, {
      type: 'bar',
      data: {
        labels: allGrades,
        datasets: [
          {
            label: '中学生',
            data: allGrades.map(g => jhsDist[g] || 0),
            backgroundColor: '#7B1535',
            borderRadius: 4
          },
          {
            label: '小学生',
            data: allGrades.map(g => elmDist[g] || 0),
            backgroundColor: '#1565C0',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top', labels: { boxWidth: 14 } }
        },
        scales: {
          x: {},
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  } else {
    const dist   = getGradeDist(rows);
    const grades = Object.keys(dist);
    return renderChart(canvasId, {
      type: 'bar',
      data: {
        labels: grades,
        datasets: [{ data: grades.map(g => dist[g]), backgroundColor: CHART_COLORS[0], borderRadius: 4 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {},
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  }
}

// Phase 8-1: changed from vertical bar to horizontal bar (indexAxis:'y') for Likert scale readability
function buildSatisfactionChart(canvasId, rows) {
  const rawCounts = getSatisfactionDist(rows);
  if (!Object.keys(rawCounts).length) { destroyChart(canvasId); return null; }

  // Sort in natural Likert scale order
  const ORDER = ['非常に満足','満足','どちらでもない','不満','非常に不満'];
  const sorted = Object.entries(rawCounts).sort(([a],[b]) => {
    const ai = ORDER.indexOf(a), bi = ORDER.indexOf(b);
    return (ai >= 0 ? ai : 99) - (bi >= 0 ? bi : 99);
  });
  const labels = sorted.map(([l]) => l);
  const data   = sorted.map(([,v]) => v);
  const colors = labels.map(l => SATISFACTION_COLORS[l] || '#9E9E9E');
  const total  = data.reduce((s,v) => s + v, 0);

  const canvas = document.getElementById(canvasId);
  if (canvas && canvas.parentElement) {
    canvas.parentElement.style.height = Math.max(160, data.length * 44) + 'px';
  }

  return renderChart(canvasId, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4 }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const pct = total > 0 ? Math.round(ctx.parsed.x * 100 / total) : 0;
              return ` ${ctx.parsed.x}件（${pct}%）`;
            }
          }
        }
      },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 } },
        y: { ticks: { autoSkip: false } }
      }
    }
  });
}

function buildStackedChart(canvasId, distObj, title) {
  if (!Object.keys(distObj).length) {
    destroyChart(canvasId);
    return null;
  }
  const labels = [title];
  const datasets = Object.entries(distObj).map(([label, count], i) => ({
    label,
    data: [count],
    backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
    borderRadius: 4
  }));

  return renderChart(canvasId, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { boxWidth: 14 } } },
      scales: {
        x: { stacked: true, beginAtZero: true },
        y: { stacked: true }
      }
    }
  });
}

function downloadChartImage(chartId, filename) {
  const chart = chartRegistry.get(chartId);
  if (!chart) return;
  const url = chart.toBase64Image();
  const a = document.createElement('a');
  a.href = url;
  a.download = filename + '.png';
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    window.open(url);
  } else {
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
