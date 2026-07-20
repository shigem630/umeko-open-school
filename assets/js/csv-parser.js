function parseCSVFile(file, slotId, onSuccess, onError) {
  // Phase 7-1: derive event year from EVENTS config so date parsing survives year-boundary uploads
  const event = EVENTS.find(e => e.csvSlots.some(s => s.id === slotId));
  const eventYear = event ? new Date(event.date).getFullYear() : new Date().getFullYear();

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const buf = e.target.result;
      const bom = new Uint8Array(buf).slice(0, 3);
      const isUtf8Bom = bom[0] === 0xEF && bom[1] === 0xBB && bom[2] === 0xBF;
      const encoding = isUtf8Bom ? 'utf-8' : 'shift-jis';
      const text = new TextDecoder(encoding, { fatal: false }).decode(buf);

      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          if (result.errors && result.errors.length > 0) {
            const serious = result.errors.filter(e => e.type !== 'Quotes');
            if (serious.length > 0) {
              onError('CSVの読み込みに失敗しました。ファイルの形式を確認してください。');
              return;
            }
          }

          if (!result.data || result.data.length === 0) {
            onError('CSVにデータが含まれていません。');
            return;
          }

          const rows = result.data
            .map(row => normalizeRow(row, eventYear))
            .filter(r => r !== null);

          if (rows.length === 0) {
            onError('有効なデータ行が見つかりませんでした。');
            return;
          }

          const data = {
            imported_at: new Date().toISOString(),
            count: rows.length,
            rows: rows
          };

          onSuccess(data);
        },
        error: (err) => {
          onError('ファイルの解析中にエラーが発生しました: ' + err.message);
        }
      });
    } catch (err) {
      onError('ファイルの読み込みに失敗しました。別のファイルをお試しください。');
    }
  };

  reader.onerror = () => {
    onError('ファイルを開くことができませんでした。');
  };

  reader.readAsArrayBuffer(file);
}

// Phase 7-1: accept year parameter so uploads across New Year work correctly
function normalizeRow(raw, year = new Date().getFullYear()) {
  const row = {};

  // Map Japanese column headers to internal keys.
  // CSV_COLUMN_MAP には同一の internalKey に複数の jpKey が登録されている場合がある
  // （例: 中学校 と 小学校 がともに school にマップ）。
  // その場合、対象列が存在するCSVの値を使い、存在しない列の空文字で上書きしない。
  for (const [jpKey, internalKey] of Object.entries(CSV_COLUMN_MAP)) {
    const val = raw[jpKey];
    if (val !== undefined) {
      const trimmed = val.trim();
      // 既にセット済みの非空値は空文字で上書きしない（重複マッピング対策）
      if (row[internalKey] === undefined || trimmed !== '') {
        row[internalKey] = trimmed;
      }
    } else if (!(internalKey in row)) {
      // 対象列がこのCSVに存在しない → まだ未設定なら空文字で初期化
      row[internalKey] = '';
    }
  }

  // ===== フォールバック: 制服試着・個別相談 列のキーワード検出 =====
  // BLENDのアンケート文言は回ごとに変わる（「個人相談/個別相談」、読点の有無、
  // 「希望しますか？」/「申込上限に達したため終了…」など）。CSV_COLUMN_MAP の
  // 完全一致に失敗しても、キーワードで該当列を拾えるようにする。
  if (!row.wants_uniform) {
    for (const [k, v] of Object.entries(raw)) {
      if (k.includes('試着') && (k.includes('希望') || k.includes('終了') || k.includes('上限'))) {
        row.wants_uniform = (v || '').trim();
        break;
      }
    }
  }
  if (!row.wants_consultation) {
    for (const [k, v] of Object.entries(raw)) {
      // 「相談内容をご入力ください」の自由記述欄は対象外（希望可否の列だけ拾う）
      if (k.includes('相談') && !k.includes('入力') && !k.includes('内容') &&
          (k.includes('希望しますか') || k.includes('終了') || k.includes('上限'))) {
        row.wants_consultation = (v || '').trim();
        break;
      }
    }
  }

  // Parse applied_at date from "M月D日 H時mm分" format using the event year
  row.applied_at = parseAppliedDate(row.applied_at_raw, year);
  delete row.applied_at_raw;

  // Extract prefecture from address (before address is deleted below)
  row.prefecture = extractPrefecture(row.address || '');

  // Remove personal info fields — never stored in localStorage
  for (const field of PERSONAL_INFO_FIELDS) {
    delete row[field];
  }

  // Skip rows with no application number
  if (!row.app_no && !row.blend_id) return null;

  return row;
}

// Phase 7-1: accepts explicit year; falls back to current year if not provided
function parseAppliedDate(raw, year) {
  if (!raw) return null;
  const y = year || new Date().getFullYear();

  // Format: "5月15日 13時43分"
  const jpMatch = raw.match(/(\d+)月(\d+)日/);
  if (jpMatch) {
    const month = parseInt(jpMatch[1], 10);
    const day   = parseInt(jpMatch[2], 10);
    return `${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  // Format: ISO or slash-separated (already contains year)
  const isoMatch = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [,iy,m,d] = isoMatch;
    return `${iy}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  return null;
}

function extractPrefecture(address) {
  const match = address.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/);
  return match ? match[1] : (address.slice(0, 3) || '不明');
}
