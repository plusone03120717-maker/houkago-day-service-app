// 事業所（ユニット）単位で算定する加算・減算の定義。
//
// 国保連の加算は大きく2種類ある。
//   ・利用者ごとにつく加算 … 送迎・欠席時対応・延長支援・専門的支援実施など。
//                            billing_service_items が日々の実績から自動判定する。
//   ・事業所につく加算     … 児童指導員等加配加算・処遇改善加算・各種減算など。
//                            体制届で届け出た区分をあらかじめ登録しておき、
//                            請求の再集計時に全児童の明細へ自動で積む。
// このファイルは後者の一覧。設定値は unit_addition_settings に保存する。
//
// 単位数・率・サービスコードは定員規模・地域区分・年度改定で変わるため、
// ここでは「どの加算があるか」と「どう計算するか」だけを定義し、
// 実際の数値は設定画面で事業所が入力する（国保連サービスコード設定と同じ方針）。

export type UnitServiceType = 'afterschool' | 'development_support'

export type FacilityAdditionCalc =
  /** 基本報酬を算定した日ごとに1回 */
  | 'per_day'
  /** 月に1回 */
  | 'per_month'
  /** 減算。基本報酬の単位数に対する割合をマイナス計上する */
  | 'deduction'
  /** 処遇改善加算。基本報酬＋加算−減算の合計に対する割合を計上する */
  | 'treatment'

export type FacilityAdditionOption = {
  value: string
  label: string
  /** 減算率・加算率（％）の初期値。単位数で算定するものは持たない */
  defaultRate?: number
}

export type FacilityAdditionDef = {
  key: string
  label: string
  calc: FacilityAdditionCalc
  serviceTypes: UnitServiceType[]
  options: FacilityAdditionOption[]
  note?: string
}

const BOTH: UnitServiceType[] = ['afterschool', 'development_support']

/** 「あり／なし」だけの加算・減算の選択肢 */
const YES = (defaultRate?: number): FacilityAdditionOption[] => [
  { value: 'yes', label: 'あり', defaultRate },
]

export const FACILITY_ADDITIONS: FacilityAdditionDef[] = [
  // ── 事業所につく加算（利用日ごと） ──────────────────────
  {
    key: 'child_instructor_extra',
    label: '児童指導員等加配加算',
    calc: 'per_day',
    serviceTypes: BOTH,
    options: [
      { value: 'specialist', label: '理学療法士等（専門職）' },
      { value: 'fulltime_5y', label: '常勤専従・経験5年以上' },
      { value: 'fulltime_under5y', label: '常勤専従・経験5年未満' },
      { value: 'fte_5y', label: '常勤換算・経験5年以上' },
      { value: 'fte_under5y', label: '常勤換算・経験5年未満' },
      { value: 'other', label: 'その他の従業者' },
    ],
    note: '単位数は定員規模で変わります。体制届の区分に合わせて選んでください。',
  },
  {
    key: 'welfare_specialist',
    label: '福祉専門職員配置等加算',
    calc: 'per_day',
    serviceTypes: BOTH,
    options: [
      { value: 'I', label: '（Ⅰ）' },
      { value: 'II', label: '（Ⅱ）' },
      { value: 'III', label: '（Ⅲ）' },
    ],
  },
  {
    key: 'nurse_extra',
    label: '看護職員加配加算',
    calc: 'per_day',
    serviceTypes: BOTH,
    options: [
      { value: 'I', label: '（Ⅰ）' },
      { value: 'II', label: '（Ⅱ）' },
    ],
  },
  {
    key: 'manager_dedicated',
    label: '児童発達支援管理責任者専任加算',
    calc: 'per_day',
    serviceTypes: BOTH,
    options: YES(),
  },
  {
    key: 'specialized_support_system',
    label: '専門的支援体制加算',
    calc: 'per_day',
    serviceTypes: BOTH,
    options: YES(),
    note: '専門職を配置していることに対する加算です。実際に支援を行った日に算定する「専門的支援実施加算」は児童ごとに自動計算されます（設定 → 国保連サービスコード・単位数設定）。',
  },
  {
    key: 'core_function_facility',
    label: '中核機能強化事業所加算',
    calc: 'per_day',
    serviceTypes: BOTH,
    options: YES(),
  },
  {
    key: 'core_function',
    label: '中核機能強化加算',
    calc: 'per_day',
    serviceTypes: ['development_support'],
    options: YES(),
  },

  // ── 減算（基本報酬の単位数に対する割合） ────────────────
  {
    key: 'opening_hours',
    label: '開所時間減算',
    calc: 'deduction',
    serviceTypes: BOTH,
    options: [
      { value: 'under4h', label: '4時間未満', defaultRate: 30 },
      { value: 'under6h', label: '4時間以上6時間未満', defaultRate: 15 },
    ],
    note: '営業時間が4時間未満なら所定単位数の70％（減算率30％）、4時間以上6時間未満なら85％（減算率15％）です。',
  },
  {
    key: 'capacity_over',
    label: '定員超過利用減算',
    calc: 'deduction',
    serviceTypes: BOTH,
    options: YES(30),
  },
  {
    key: 'staff_shortage',
    label: 'サービス提供職員欠如減算',
    calc: 'deduction',
    serviceTypes: BOTH,
    options: [
      { value: 'rate30', label: '3割減', defaultRate: 30 },
      { value: 'rate50', label: '5割減', defaultRate: 50 },
    ],
  },
  {
    key: 'manager_shortage',
    label: '児童発達支援管理責任者欠如減算',
    calc: 'deduction',
    serviceTypes: BOTH,
    options: [
      { value: 'rate30', label: '3割減', defaultRate: 30 },
      { value: 'rate50', label: '5割減', defaultRate: 50 },
    ],
  },
  {
    key: 'restraint',
    label: '身体拘束廃止未実施減算',
    calc: 'deduction',
    serviceTypes: BOTH,
    options: YES(1),
  },
  {
    key: 'self_evaluation',
    label: '自己評価結果等未公表減算',
    calc: 'deduction',
    serviceTypes: BOTH,
    options: YES(15),
  },
  {
    key: 'info_disclosure',
    label: '情報公表未報告減算',
    calc: 'deduction',
    serviceTypes: BOTH,
    options: YES(10),
  },
  {
    key: 'abuse_prevention',
    label: '虐待防止措置未実施減算',
    calc: 'deduction',
    serviceTypes: BOTH,
    options: YES(1),
  },
  {
    key: 'bcp',
    label: '業務継続計画未策定減算',
    calc: 'deduction',
    serviceTypes: BOTH,
    options: YES(3),
  },
  {
    key: 'support_program',
    label: '支援プログラム未公表減算',
    calc: 'deduction',
    serviceTypes: BOTH,
    options: YES(15),
  },

  // ── 処遇改善加算（総単位数に対する割合・月1行） ──────────
  {
    key: 'treatment_improvement',
    label: '福祉・介護職員等処遇改善加算',
    calc: 'treatment',
    serviceTypes: BOTH,
    options: [
      { value: 'I', label: '（Ⅰ）', defaultRate: 8.1 },
      { value: 'II', label: '（Ⅱ）', defaultRate: 7.6 },
      { value: 'III', label: '（Ⅲ）', defaultRate: 6.1 },
      { value: 'IV', label: '（Ⅳ）', defaultRate: 4.9 },
      { value: 'V', label: '（Ⅴ）経過措置区分' },
    ],
    note: '加算率の初期値は令和6年度改定時の値です。届出どおりの率とサービスコード（（Ⅰ）イ・ロなどの区別を含む）を必ず確認してください。',
  },
]

export const FACILITY_ADDITION_MAP = new Map(FACILITY_ADDITIONS.map((d) => [d.key, d]))

/** 設定画面・請求集計の見出し */
export function additionGroup(def: FacilityAdditionDef): '加算' | '減算' | '処遇改善加算' {
  if (def.calc === 'deduction') return '減算'
  if (def.calc === 'treatment') return '処遇改善加算'
  return '加算'
}

/** 「あり」しか選択肢がない加算は区分名を明細に出さない */
export function additionLineName(def: FacilityAdditionDef, optionValue: string): string {
  const option = def.options.find((o) => o.value === optionValue)
  if (!option || option.value === 'yes') return def.label
  return `${def.label}（${option.label.replace(/^（|）$/g, '')}）`
}

export function additionsForServiceType(serviceType: string): FacilityAdditionDef[] {
  return FACILITY_ADDITIONS.filter((d) =>
    d.serviceTypes.includes(serviceType as UnitServiceType),
  )
}
