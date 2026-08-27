/**
 * 入力チェック（異常検知）の型定義。
 *
 * ルールは純粋関数として書く。DBアクセスは run.ts がまとめて済ませ、
 * ルールには読み込み済みのデータだけを渡す。こうしておくと
 * ルール単体をテストでき、ルールを増やしてもクエリは増えない。
 */

export type Severity = 'high' | 'medium' | 'low'

export type AttendanceRow = {
  id: string
  child_id: string
  unit_id: string | null
  date: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  service_start_time: string | null
  service_end_time: string | null
  daytime_support: boolean | null
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
}

export type PlanRow = {
  id: string
  child_id: string
  day_of_week: number[]
  start_date: string
  end_date: string | null
  is_active: boolean
}

export type ReservationRow = {
  child_id: string
  date: string
  status: string
}

export type OverrideRow = {
  plan_id: string
  date: string
  is_cancelled: boolean | null
}

export type BillingMonthRow = {
  unit_id: string
  year_month: string
  status: string
}

export type ChangeLogRow = {
  id: number
  table_name: string
  record_id: string
  operation: string
  child_id: string | null
  record_date: string | null
  changed_by: string | null
  changed_at: string
}

export type CheckContext = {
  /** JST の今日 (YYYY-MM-DD) */
  today: string
  /** チェック対象期間 */
  from: string
  to: string
  childNames: Map<string, string>
  attendance: AttendanceRow[]
  plans: PlanRow[]
  reservations: ReservationRow[]
  overrides: OverrideRow[]
  billingMonths: BillingMonthRow[]
  /** 直近の変更履歴（record_change_logs） */
  changeLogs: ChangeLogRow[]
}

export type Finding = {
  rule: string
  severity: Severity
  childId: string | null
  targetDate: string | null
  tableName: string
  recordId: string | null
  message: string
  detail: Record<string, unknown>
}

export type Rule = {
  key: string
  label: string
  /** 画面と通知に出す説明。何を見つけるルールなのかを職員の言葉で書く */
  description: string
  /**
   * false のルールは実行されない。
   * 誤検知が多くなりがちなものは既定でオフにし、運用を見ながら有効化する。
   */
  enabled: boolean
  run: (ctx: CheckContext) => Finding[]
}
