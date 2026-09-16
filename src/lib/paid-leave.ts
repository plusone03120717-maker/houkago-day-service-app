/**
 * 有給休暇の共通ロジック。
 *
 * 時間単位年休（労基法39条4項）の制約:
 *   - 労使協定に基づき、1年度あたり5日分を上限として取得できる
 *   - 「1日分の時間数」は所定労働時間数（1時間未満の端数は切り上げ）
 *   - 時間単位の取得は年5日の時季指定義務には充当できない
 */

/** 時間単位年休の年間上限（日数換算） */
export const HOURLY_LEAVE_LIMIT_DAYS = 5

/** 年5日の時季指定義務（対象は年10日以上付与される者） */
export const MANDATORY_LEAVE_DAYS = 5
export const MANDATORY_LEAVE_THRESHOLD_DAYS = 10

/** 1日分の時間数の既定値（所定労働時間を未設定のスタッフ向け） */
export const DEFAULT_HOURS_PER_DAY = 8

export type LeaveUnit = 'day' | 'hour'

export type LeaveUsageLike = {
  /** 'hour' 以外（null や未設定を含む）は日単位として扱う */
  unit?: string | null
  days_used: number
  hours_used?: number | null
}

/** 年度（4月始まり）。1〜3月は前年度に含める */
export function fiscalYearOf(date: string): number {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  return m >= 4 ? y : y - 1
}

/** 現在（JST）の年度 */
export function currentFiscalYear(): number {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const m = jst.getUTCMonth() + 1
  const y = jst.getUTCFullYear()
  return m >= 4 ? y : y - 1
}

/** 年度の開始日・終了日（YYYY-MM-DD） */
export function fiscalYearRange(year: number): { start: string; end: string } {
  return { start: `${year}-04-01`, end: `${year + 1}-03-31` }
}

/** 指定年度に属する日付か */
export function isInFiscalYear(date: string, year: number): boolean {
  const { start, end } = fiscalYearRange(year)
  return date >= start && date <= end
}

/** 有給1件の単位を正規化する（unit 列を持たない古いデータは日単位とみなす） */
export function unitOf(u: LeaveUsageLike): LeaveUnit {
  return u.unit === 'hour' ? 'hour' : 'day'
}

/** 日単位で使用した日数の合計（時間単位は含めない） */
export function sumDayUnitDays(usages: LeaveUsageLike[]): number {
  return round1(
    usages.filter((u) => unitOf(u) === 'day').reduce((sum, u) => sum + Number(u.days_used), 0),
  )
}

/** 時間単位で使用した時間数の合計 */
export function sumHourUnitHours(usages: LeaveUsageLike[]): number {
  return usages
    .filter((u) => unitOf(u) === 'hour')
    .reduce((sum, u) => sum + Number(u.hours_used ?? 0), 0)
}

/** 有給1件のラベル（「1日」「半日」「3時間」） */
export function usageLabel(u: LeaveUsageLike): string {
  if (unitOf(u) === 'hour') return `${u.hours_used ?? 0}時間`
  return Number(u.days_used) === 0.5 ? '半日' : '1日'
}

/** 時間数を「○日○時間」形式にする。半日ちょうどは「○.5日」と表示する */
export function formatDayHours(totalHours: number, hoursPerDay: number): string {
  const hpd = hoursPerDay > 0 ? hoursPerDay : DEFAULT_HOURS_PER_DAY
  const sign = totalHours < 0 ? '-' : ''
  const abs = Math.abs(totalHours)
  const days = Math.floor(round1(abs) / hpd)
  const rest = round1(abs - days * hpd)

  if (rest === 0) return `${sign}${days}日`
  if (rest === hpd / 2) return `${sign}${days + 0.5}日`
  if (days === 0) return `${sign}${rest}時間`
  return `${sign}${days}日${rest}時間`
}

/** 日数＋時間数をまとめた使用量ラベル（「2.5日」「2.5日＋3時間」） */
export function formatUsedLabel(days: number, hours: number): string {
  if (hours === 0) return `${round1(days)}日`
  if (days === 0) return `${hours}時間`
  return `${round1(days)}日＋${hours}時間`
}

/** 残日数（時間換算）を求める */
export function remainingHours(
  grantDays: number,
  usages: LeaveUsageLike[],
  hoursPerDay: number,
): number {
  const hpd = hoursPerDay > 0 ? hoursPerDay : DEFAULT_HOURS_PER_DAY
  return round1(grantDays * hpd - sumDayUnitDays(usages) * hpd - sumHourUnitHours(usages))
}

/** 時間単位年休の年間上限（時間数） */
export function hourlyLimitHours(hoursPerDay: number): number {
  const hpd = hoursPerDay > 0 ? hoursPerDay : DEFAULT_HOURS_PER_DAY
  return HOURLY_LEAVE_LIMIT_DAYS * hpd
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
