/**
 * 勤務時間の計算ロジック（勤務時間集計ページと LIFF マイスケジュールで共用）
 *
 * - 予定：シフトの開始〜終了から中抜けを引き、5時間以上なら昼休憩60分を自動控除
 * - 実績：タイムカードの出勤（30分単位で切り上げ）〜退勤（切り捨て）に同じ控除を適用
 */

export function toJSTDate(isoStr: string): string {
  return new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function toJSTTime(isoStr: string): string {
  return new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16)
}

export function toJSTEpochMin(isoStr: string): number {
  return Math.floor((new Date(isoStr).getTime() + 9 * 60 * 60 * 1000) / 60000)
}

/** 'HH:MM' → 0時からの分数 */
export function toMinutes(time: string | null): number {
  if (!time) return 0
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

/** 分数 → '7時間30分' */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0分'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}分`
  if (m === 0) return `${h}時間`
  return `${h}時間${m}分`
}

/** 中抜けの分数（開始・終了が揃っているときだけ） */
export function breakMinutesOf(brkStart?: string | null, brkEnd?: string | null): number {
  if (!brkStart || !brkEnd) return 0
  return Math.max(0, toMinutes(brkEnd.slice(0, 5)) - toMinutes(brkStart.slice(0, 5)))
}

/** シフトの予定勤務分数（中抜け・5時間以上の昼休憩60分を控除） */
export function calcShiftMinutes(
  start: string | null, end: string | null,
  brkStart?: string | null, brkEnd?: string | null,
): number {
  if (!start || !end) return 0
  const diff = toMinutes(end) - toMinutes(start)
  if (diff <= 0) return 0
  const afterBreak = Math.max(0, diff - breakMinutesOf(brkStart, brkEnd))
  return Math.max(0, afterBreak - (afterBreak >= 300 ? 60 : 0))
}

export type TimeRecordLike = { id?: string; type: string; recorded_at: string }

export type TCDay = {
  date: string
  clockIn: string | null    // HH:MM
  clockOut: string | null   // HH:MM
  clockInId: string | null
  clockOutId: string | null
  hours: number | null
  breakMinutes: number      // シフトに設定された中抜け
  lunchDeduction: number    // 5時間以上で自動控除される60分
}

/** タイムカードの打刻から日次の実働時間を組み立てる */
export function buildTCDays(
  records: TimeRecordLike[],
  shiftsMap: Map<string, { break_start_time: string | null; break_end_time: string | null }>,
): TCDay[] {
  // raw データ（最早 clock_in・最遅 clock_out を選択）
  const byDate = new Map<string, { inRec: TimeRecordLike | null; outRec: TimeRecordLike | null }>()
  for (const r of records) {
    const date = toJSTDate(r.recorded_at)
    if (!byDate.has(date)) byDate.set(date, { inRec: null, outRec: null })
    const d = byDate.get(date)!
    if (r.type === 'clock_in') {
      if (!d.inRec || r.recorded_at < d.inRec.recorded_at) d.inRec = r
    } else if (r.type === 'clock_out') {
      if (!d.outRec || r.recorded_at > d.outRec.recorded_at) d.outRec = r
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { inRec, outRec }]) => {
      const shift = shiftsMap.get(date)
      const brkMins = breakMinutesOf(shift?.break_start_time, shift?.break_end_time)

      let hours: number | null = null
      let lunchDeduction = 0
      if (inRec && outRec) {
        const inM = Math.ceil(toJSTEpochMin(inRec.recorded_at) / 30) * 30   // 切り上げ30分
        const outM = Math.floor(toJSTEpochMin(outRec.recorded_at) / 30) * 30  // 切り捨て30分
        const diff = outM - inM
        if (diff > 0) {
          const afterBreak = Math.max(0, diff - brkMins)
          lunchDeduction = afterBreak >= 300 ? 60 : 0
          const net = Math.max(0, afterBreak - lunchDeduction)
          hours = Math.round((net / 60) * 100) / 100
        }
      }
      return {
        date,
        clockIn: inRec ? toJSTTime(inRec.recorded_at) : null,
        clockOut: outRec ? toJSTTime(outRec.recorded_at) : null,
        clockInId: inRec?.id ?? null,
        clockOutId: outRec?.id ?? null,
        hours,
        breakMinutes: brkMins,
        lunchDeduction,
      }
    })
}
