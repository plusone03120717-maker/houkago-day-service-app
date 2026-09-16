import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_HOURS_PER_DAY,
  HOURLY_LEAVE_LIMIT_DAYS,
  fiscalYearOf,
  fiscalYearRange,
  hourlyLimitHours,
  type LeaveUnit,
} from '@/lib/paid-leave'

export type LeaveInput = {
  unit: LeaveUnit
  daysUsed: number
  hoursUsed: number | null
}

/** リクエストの日数・時間数を正規化する。不正なら error を返す */
export function normalizeLeaveInput(raw: {
  unit?: unknown
  daysUsed?: unknown
  hours?: unknown
}, hoursPerDay: number): { input: LeaveInput } | { error: string } {
  const unit: LeaveUnit = raw.unit === 'hour' ? 'hour' : 'day'

  if (unit === 'hour') {
    const hours = Number(raw.hours)
    if (!Number.isInteger(hours) || hours < 1) {
      return { error: '時間数は1時間以上の整数で指定してください' }
    }
    if (hours > hoursPerDay) {
      return { error: `1日に取得できる時間単位の有給は${hoursPerDay}時間までです` }
    }
    return { input: { unit: 'hour', daysUsed: 0, hoursUsed: hours } }
  }

  const days = Number(raw.daysUsed)
  if (days !== 0.5 && days !== 1.0) {
    return { error: '日数は 0.5 か 1.0 のみ指定できます' }
  }
  return { input: { unit: 'day', daysUsed: days, hoursUsed: null } }
}

type UsageRow = { id: string; unit: string | null; days_used: number; hours_used: number | null }

/**
 * 同じ日の重複と、時間単位年休の年5日上限をチェックする。
 * 問題なければ null、あればエラーメッセージを返す。
 * excludeId を渡すと、その1件を除外して判定する（管理画面での編集用）。
 */
export async function validateLeaveUsage(
  client: SupabaseClient,
  params: {
    staffId: string
    date: string
    input: LeaveInput
    hoursPerDay: number
    excludeId?: string | null
  },
): Promise<string | null> {
  const { staffId, date, input, excludeId } = params
  const hoursPerDay = params.hoursPerDay > 0 ? params.hoursPerDay : DEFAULT_HOURS_PER_DAY

  // 同じ日の既存レコード
  const { data: sameDayRaw } = await client
    .from('paid_leave_usages')
    .select('id, unit, days_used, hours_used')
    .eq('staff_id', staffId)
    .eq('date', date)
  const sameDay = ((sameDayRaw ?? []) as UsageRow[]).filter((r) => r.id !== excludeId)

  const hasDayUnit = sameDay.some((r) => (r.unit ?? 'day') === 'day')
  const hasHourUnit = sameDay.some((r) => r.unit === 'hour')

  if (input.unit === 'day') {
    if (hasDayUnit) return 'この日の有給申請はすでに登録されています'
    if (hasHourUnit) return 'この日はすでに時間単位で有給を取得しています'
  } else {
    if (hasDayUnit) return 'この日はすでに1日または半日で有給を取得しています'
  }

  if (input.unit !== 'hour') return null

  // 時間単位は年5日分が上限（労基法39条4項）
  const year = fiscalYearOf(date)
  const { start, end } = fiscalYearRange(year)
  const { data: yearRaw } = await client
    .from('paid_leave_usages')
    .select('id, unit, days_used, hours_used')
    .eq('staff_id', staffId)
    .eq('unit', 'hour')
    .gte('date', start)
    .lte('date', end)

  const usedHours = ((yearRaw ?? []) as UsageRow[])
    .filter((r) => r.id !== excludeId)
    .reduce((sum, r) => sum + Number(r.hours_used ?? 0), 0)

  const limit = hourlyLimitHours(hoursPerDay)
  const sameDayHours = sameDay
    .filter((r) => r.unit === 'hour')
    .reduce((sum, r) => sum + Number(r.hours_used ?? 0), 0)

  if (sameDayHours + (input.hoursUsed ?? 0) > hoursPerDay) {
    return `1日に取得できる時間単位の有給は${hoursPerDay}時間までです（この日はすでに${sameDayHours}時間取得済み）`
  }

  if (usedHours + (input.hoursUsed ?? 0) > limit) {
    return `時間単位の有給は年${HOURLY_LEAVE_LIMIT_DAYS}日分（${limit}時間）までです（${year}年度はすでに${usedHours}時間取得済み）`
  }

  return null
}
