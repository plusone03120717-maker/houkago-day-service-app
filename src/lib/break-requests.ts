import { isJapaneseNationalHoliday } from '@/lib/japanese-holidays'

/** 中抜けをまとめて申請・取り消しできる日数の上限（約3か月） */
export const MAX_BREAK_DAYS = 93

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' の曜日（0=日〜6=土） */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/**
 * 期間と曜日から、まとめて申請する日付を並べる。
 * skipHolidays なら祝日（振替休日を含む）を除く。上限を超えた分は返さない。
 */
export function listBreakDates(opts: {
  from: string
  to: string
  weekdays: number[]
  skipHolidays: boolean
}): string[] {
  const { from, to, weekdays, skipHolidays } = opts
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return []
  const days = new Set(weekdays)
  const dates: string[] = []
  // 期間が長すぎても無限に回らないよう、1年分で打ち切る
  for (let d = from, i = 0; d <= to && i < 366; d = addDays(d, 1), i++) {
    if (!days.has(dayOfWeek(d))) continue
    if (skipHolidays && isJapaneseNationalHoliday(d)) continue
    dates.push(d)
    if (dates.length >= MAX_BREAK_DAYS) break
  }
  return dates
}

/** HH:MM 同士の時間帯が重なるか */
export function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}
