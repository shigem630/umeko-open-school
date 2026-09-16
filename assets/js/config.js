// ===== 年度ごとのイベント設定 =====
// 年度＝オープンスクールを実施した学校年度（4月〜翌3月）。CURRENT_YEAR が今年度（生徒用ページ・目標人数・公開の対象）。
// 教員ページでは表示年度を切り替えられる（setActiveYear）。EVENTS は表示中の年度のイベント一覧。
// csvSlots[].file … BLENDの申込一覧のファイル名（「_申込一覧.csv」より前）。過去の年度の「まとめて読み込み」で使う
const CURRENT_YEAR = 2026;

const EVENTS_BY_YEAR = {
  2026: [
    {
      key:      '0725',
      label:    '7月25日',
      fullLabel:'第1回オープンスクール（7/25）',
      uploadTitle: '7月25日（第1回）',
      date:     '2026-07-25',
      csvSlots: [
        { id: '0725_jhs', label: '中学生CSV（午前）', uploadLabel: '中学生CSV（午前・高校受験）', type: 'jhs' },
        { id: '0725_elm', label: '小学生CSV（午後）', uploadLabel: '小学生CSV（午後・中学受験）', type: 'elm' },
        { id: '0725_music', label: '音楽科体験レッスン会CSV', uploadLabel: '音楽科CSV（体験レッスン会）', type: 'music' }  // 中学生・小学生の集計には含めない
      ],
      combined: true,
      defaultGoal: 100
    },
    {
      key:      '0829',
      label:    '8月29日',
      fullLabel:'第2回オープンスクール（8/29）',
      uploadTitle: '8月29日（第2回）',
      date:     '2026-08-29',
      csvSlots: [
        { id: '0829_jhs', label: '中学生CSV（午前）', uploadLabel: '中学生CSV（午前・高校受験）', type: 'jhs' },
        { id: '0829_elm', label: '小学生CSV（午後）', uploadLabel: '小学生CSV（午後・中学受験）', type: 'elm' },
        { id: '0829_music', label: '音楽科体験レッスン会CSV', uploadLabel: '音楽科CSV（体験レッスン会）', type: 'music' }  // 中学生・小学生の集計には含めない
      ],
      combined: true,
      defaultGoal: 100
    },
    {
      key:      '1107',
      label:    '11月7日',
      fullLabel:'第3回オープンスクール（11/7 小学生）',
      uploadTitle: '11月7日（第3回・小学生のみ）',
      date:     '2026-11-07',
      csvSlots: [
        { id: '1107_elm', label: '小学生CSV', uploadLabel: '小学生CSV', type: 'elm' }
      ],
      combined: false,
      defaultGoal: 60
    },
    {
      key:      '1128',
      label:    '11月28日',
      fullLabel:'第4回オープンスクール（11/28 中学生）',
      uploadTitle: '11月28日（第4回・中学生のみ）',
      date:     '2026-11-28',
      csvSlots: [
        { id: '1128_jhs', label: '中学生CSV', uploadLabel: '中学生CSV', type: 'jhs' }
      ],
      combined: false,
      defaultGoal: 60
    }
  ],

  // 2025年度：開催日はBLENDのデータに無いため、申込の最終日から推定（datesEstimated）。
  // 中学生・小学生の同じ回は同じ日に開催（申込の締切が同じ）。音楽科の行事は締切が近い回にまとめている
  2025: [
    {
      key: '2025_0705', label: '7月5日', fullLabel: '第1回オープンスクール（7/5）', uploadTitle: '7月5日（第1回）', date: '2025-07-05',
      csvSlots: [
        { id: '2025_0705_jhs', label: '中学生', uploadLabel: '中学生CSV（高校受験）', type: 'jhs', file: '第1回中学生対象オープンスクール' },
        { id: '2025_0705_elm', label: '小学生', uploadLabel: '小学生CSV（中学受験）', type: 'elm', file: '第1回小学生対象オープンスクール' },
        { id: '2025_0705_music', label: '第1回音楽科体験レッスン会', uploadLabel: '音楽科CSV（第1回体験レッスン会）', type: 'music', file: '第1回音楽科体験レッスン会' }
      ],
      combined: true, jhsLabel: '中学生', elmLabel: '小学生', musicLabel: '第1回音楽科体験レッスン会'
    },
    {
      key: '2025_0802', label: '8月2日', fullLabel: '第2回オープンスクール（8/2）', uploadTitle: '8月2日（第2回）', date: '2025-08-02',
      csvSlots: [
        { id: '2025_0802_jhs', label: '中学生', uploadLabel: '中学生CSV（高校受験）', type: 'jhs', file: '第2回中学生対象オープンスクール' },
        { id: '2025_0802_elm', label: '小学生', uploadLabel: '小学生CSV（中学受験）', type: 'elm', file: '第2回小学生対象オープンスクール' },
        { id: '2025_0802_music', label: '第1回音楽科受験講習会', uploadLabel: '音楽科CSV（第1回受験講習会）', type: 'music', file: '第1回音楽科受験講習会' }
      ],
      combined: true, jhsLabel: '中学生', elmLabel: '小学生', musicLabel: '第1回音楽科受験講習会'
    },
    {
      key: '2025_0920', label: '9月20日', fullLabel: '第3回オープンスクール（9/20）', uploadTitle: '9月20日（第3回）', date: '2025-09-20',
      csvSlots: [
        { id: '2025_0920_jhs', label: '中学生', uploadLabel: '中学生CSV（高校受験）', type: 'jhs', file: '第3回中学生対象オープンスクール' },
        { id: '2025_0920_elm', label: '小学生', uploadLabel: '小学生CSV（中学受験）', type: 'elm', file: '第3回小学生対象オープンスクール' }
      ],
      combined: true, jhsLabel: '中学生', elmLabel: '小学生'
    },
    {
      key: '2025_1011', label: '10月11日', fullLabel: '第4回オープンスクール（10/11）', uploadTitle: '10月11日（第4回）', date: '2025-10-11',
      csvSlots: [
        { id: '2025_1011_jhs', label: '中学生', uploadLabel: '中学生CSV（高校受験）', type: 'jhs', file: '第4回中学生対象オープンスクール' },
        { id: '2025_1011_elm', label: '小学生', uploadLabel: '小学生CSV（中学受験）', type: 'elm', file: '第4回小学生対象オープンスクール' },
        { id: '2025_1011_music', label: '第2回音楽科体験レッスン会', uploadLabel: '音楽科CSV（第2回体験レッスン会）', type: 'music', file: '第2回音楽科体験レッスン会' }
      ],
      combined: true, jhsLabel: '中学生', elmLabel: '小学生', musicLabel: '第2回音楽科体験レッスン会'
    },
    {
      key: '2025_1108', label: '11月8日', fullLabel: '入学者選抜説明会（11/8）', uploadTitle: '11月8日（入学者選抜説明会）', date: '2025-11-08',
      csvSlots: [
        { id: '2025_1108_jhs', label: '中学生', uploadLabel: '中学生CSV（高校受験）', type: 'jhs', file: '入学者選抜説明会' },
        { id: '2025_1108_elm', label: '小学生', uploadLabel: '小学生CSV（中学受験）', type: 'elm', file: '入学者選抜説明会' }
      ],
      combined: true, jhsLabel: '中学生', elmLabel: '小学生'
    },
    {
      key: '2025_0328', label: '3月28日', fullLabel: '第3回音楽科体験レッスン会（中1・中2対象）（3/28）', uploadTitle: '3月28日（第3回音楽科体験レッスン会・中1・中2対象）', date: '2026-03-28',
      csvSlots: [
        { id: '2025_0328_music', label: '第3回音楽科体験レッスン会', uploadLabel: '音楽科CSV（中1・中2対象）', type: 'music', file: '第3回音楽科体験レッスン会（中１・中２対象）' }
      ],
      combined: false, musicOnly: true, musicLabel: '第3回音楽科体験レッスン会（中1・中2対象）'
    }
  ],
};

// 年度ごとの補足
const YEAR_META = {
  2025: { datesEstimated: true },
};

let ACTIVE_YEAR = CURRENT_YEAR;
let EVENTS = EVENTS_BY_YEAR[CURRENT_YEAR];

function setActiveYear(year) {
  if (!EVENTS_BY_YEAR[year]) return false;
  ACTIVE_YEAR = year;
  EVENTS = EVENTS_BY_YEAR[year];
  return true;
}

function isPastYear() {
  return ACTIVE_YEAR !== CURRENT_YEAR;
}

// すべての年度から、スロットIDでイベントを探す
function findEventBySlot(slotId) {
  for (const year of Object.keys(EVENTS_BY_YEAR)) {
    const event = EVENTS_BY_YEAR[year].find(e => e.csvSlots.some(s => s.id === slotId));
    if (event) return { year: +year, event, slot: event.csvSlots.find(s => s.id === slotId) };
  }
  return null;
}

// 申込一覧のファイル名・回の名前の照合用（全角数字・空白の違いをそろえる）
function normEventFileName(s) {
  return String(s || '').normalize('NFKC').replace(/\s/g, '');
}

// すべての年度のスロット
function allSlots(filterYear) {
  return Object.entries(EVENTS_BY_YEAR)
    .filter(([y]) => filterYear == null || +y === filterYear)
    .flatMap(([y, evs]) => evs.flatMap(e => e.csvSlots.map(s => ({ year: +y, event: e, slot: s }))));
}

// CSV column names (Japanese header → internal key mapping)
// 中学生CSVと小学生CSVで列名が異なる項目は両方登録してある
const CSV_COLUMN_MAP = {
  'BLEND管理番号':          'blend_id',
  'プラスシードID':          'plusseed_id',
  '申込番号':               'app_no',
  '名前(姓)':              'last_name',
  '名前(名)':              'first_name',
  'ふりがな(姓)':           'last_kana',
  'ふりがな(名)':           'first_kana',
  '性別':                  'gender',
  '生年月日':              'birthdate',

  // 学校名（中学生 or 小学生で列名が異なる）
  '中学校':                'school',
  '小学校':                'school',        // 小学生CSV用

  '塾名・校舎名':           'cram_school',   // 中学生のみ
  '申込日時':              'applied_at_raw',
  '来場':                  'attended',
  '郵便番号':              'zip',
  '住所':                  'address',
  '電話番号(ハイフン付き)':  'phone',
  '保護者名':              'guardian_name',
  'メールアドレス':          'email',
  '学年':                  'grade',
  '保護者・引率者数':        'attendants',
  '保護者・引率者数（0とご入力下さい）': 'attendants', // 上限設定後の新列名
  '保護者・引率者・同伴者数': 'attendants',            // 音楽科CSV用

  // 中学校連絡（中学生のみ）
  '中学校への「参加連絡（公欠・出席扱い等の手続き）」を希望しますか？': 'wants_school_notice',

  // 制服試着（中学生と小学生で文言が微妙に異なる）
  '制服試着を希望しますか？一人あたり大体15分～20分程度で終わる見込みです。': 'wants_uniform',
  '制服試着を希望しますか？試着は、1人あたり大体15分～20分程で終わる見込みです。': 'wants_uniform', // 小学生CSV用
  '制服試着は申込上限に達したため終了いたしました。': 'wants_uniform', // 上限後の新列名

  '個人相談を希望しますか？': 'wants_consultation',
  '個人相談は、申込上限に達したため終了いたしました。': 'wants_consultation', // 上限後の新列名
  '個別相談を希望しますか？': 'wants_consultation',                          // 小学生CSV用
  '個別相談は、申込上限に達したため終了いたしました。': 'wants_consultation', // 小学生CSV・上限後
  '個人相談を希望される場合、現時点でのもので構いませんので、相談内容をご入力ください。': 'consultation_detail',
  '個別相談を希望される場合、現時点でのもので構いませんので、相談内容をご入力ください。': 'consultation_detail', // 小学生CSV用

  // 申込経路（小学生CSVは末尾の「）」が1つ多い）
  '本校のオープンスクールを知った一番のきっかけは何ですか？（もっとも当てはまるものを１つ）': 'channel',
  '本校のオープンスクールを知った一番のきっかけは何ですか？（もっとも当てはまるものを１つ））': 'channel', // 小学生CSV用
  '本校のオープンスクールはどのようにして知りましたか？（初めて知った時）': 'channel', // 音楽科CSV用

  // 音楽科体験レッスン会CSVのみ（専攻・楽器名の列は文言が回ごとに違うため csv-parser.js でキーワード検出）
  '個別面談を希望しますか？': 'wants_consultation',
  'ソルフェージュ（聴音・視唱）のレッスンを希望しますか？': 'wants_solfege',
  '同日午前中の普通科オープンスクールに参加されますか。': 'joins_general_os',

  '今回、参加してみようと思った「一番の理由」は何ですか？': 'reason',

  // 満足度（小学生CSVは末尾の句点なし）
  '本日のオープンスクールの「総合的な満足度」を教えてください。': 'satisfaction',
  '本日のオープンスクールの「総合的な満足度」を教えてください': 'satisfaction',  // 小学生CSV用

  // 生徒主体スタイルへの感想（文言が異なる）
  '今回のOSは「大人がお膳立てせず、生徒が全権を握る」というスタイルでした。この取り組みについてどう感': 'student_run_feedback',
  '今回は「大人がお膳立てせず、生徒が全権を握る」とういうスタイルでした。この取組についてどう感じますか': 'student_run_feedback', // 小学生CSV用

  // 印象の変化（中学生のみ・小学生CSVにはなし）
  '本日のイベントに参加する前と後で、梅光学院に対する「印象」は変わりましたか？': 'impression_change',

  '本日のイベントを終えて、梅光学院への「受験（入学）の意欲」はどうなりましたか？': 'exam_intent',

  // 自由感想（小学生CSVは末尾の句点なし）
  '最後に、本日の感想や、頑張っていた生徒たちへの「メッセージ」を自由にお書きください。': 'free_comment',
  '最後に、本日の感想や、頑張っていた生徒たちへの「メッセージ」を自由にお書きください': 'free_comment', // 小学生CSV用
};

// Personal info fields to remove at parse time (never stored in localStorage)
const PERSONAL_INFO_FIELDS = [
  'last_name', 'first_name', 'last_kana', 'first_kana',
  'birthdate', 'address', 'zip', 'phone',
  'guardian_name', 'email', 'consultation_detail'
];

// 申込経路の表記ゆれ統一マップ（旧表記 → 新表記）
const CHANNEL_ALIASES = {
  '梅光学院のホームページ':              '梅光学院の公式ホームページ',
  'HP（ホームページ）':                  '梅光学院の公式ホームページ',
  'Instagram（インスタグラム）':          '梅光学院の公式Instagram',
  '知人・友人に聞いた':                  '知人・友人・家族から聞いた',
  'その他のSNS（TikTok、Facebook、Xなど）': 'その他のSNS（YouTube、TikTok、Xなど）',
  '新しいポスター（青色のデザインのもの）':   '新しいポスター・チラシ（青空のデザインのもの）',
};

// 申込理由の表記ゆれ統一マップ（旧表記 → 新表記）
const REASON_ALIASES = {
  // とりあえず県内 の表記ゆれ
  'とりあえず県内私立中高一貫校を見たいから': 'とりあえず県内の私立校を見ておきたかったから',

  // 今の学校教育 の表記ゆれ（「ルール」vs「校則」、「為」vs「から」）
  '今の学校教育や校則に違和感があり、新しい環境を見たかったから': '今の学校教育やルールに違和感があり、新しい環境をみたかった為',

  // 自律学習 の語尾ゆれ
  '自律学習（単元テスト等）に興味があった': '自律学習（単元テスト等）に興味があったから',

  // 複合回答（「、」区切り） → 筆頭の理由に統合
  '生徒だけで企画・運営していると知って面白そうだったから、制服を着てみたかったから': '生徒だけで企画・運営していると知って面白そうだったから',
};

// Default password (SHA-256 of "baiko2026") - can be changed in settings
const DEFAULT_PASSWORD_HASH = '0d93c139337b3c8c7ea3c3166896afd4f78ed6637edc68d450378f4bcf2ffc87';

// 入試データを教職員に共有するときの暗号化（閲覧用パスワードから鍵を作る）に使う固定値。変えると共有済みデータが読めなくなる
const EXAM_SHARE_SALT = 'umeko-open-school/exam-share/v1';

// 閲覧用パスワード（教職員向け）。このパスワードで入ると表示のみで、CSV読込・設定・公開・リセットなどの操作はできない。
// 変更するときは新しいパスワードの SHA-256 をここに書く（設定画面からは変更できない）
const STAFF_PASSWORD_HASH = '048a63ab42c37ffb53884da275d79be059a9868928564def0c6836cd4fd671af';

const APP_VERSION = '1.0';
