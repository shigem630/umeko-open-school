const EVENTS = [
  {
    key:      '0725',
    label:    '7月25日',
    fullLabel:'第1回オープンスクール（7/25）',
    date:     '2026-07-25',
    csvSlots: [
      { id: '0725_jhs', label: '中学生CSV（午前）', type: 'jhs' },
      { id: '0725_elm', label: '小学生CSV（午後）', type: 'elm' }
    ],
    combined: true,
    defaultGoal: 100
  },
  {
    key:      '0829',
    label:    '8月29日',
    fullLabel:'第2回オープンスクール（8/29）',
    date:     '2026-08-29',
    csvSlots: [
      { id: '0829_jhs', label: '中学生CSV（午前）', type: 'jhs' },
      { id: '0829_elm', label: '小学生CSV（午後）', type: 'elm' }
    ],
    combined: true,
    defaultGoal: 100
  },
  {
    key:      '1107',
    label:    '11月7日',
    fullLabel:'第3回オープンスクール（11/7 小学生）',
    date:     '2026-11-07',
    csvSlots: [
      { id: '1107_elm', label: '小学生CSV', type: 'elm' }
    ],
    combined: false,
    defaultGoal: 60
  },
  {
    key:      '1128',
    label:    '11月28日',
    fullLabel:'第4回オープンスクール（11/28 中学生）',
    date:     '2026-11-28',
    csvSlots: [
      { id: '1128_jhs', label: '中学生CSV', type: 'jhs' }
    ],
    combined: false,
    defaultGoal: 60
  }
];

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

const APP_VERSION = '1.0';
