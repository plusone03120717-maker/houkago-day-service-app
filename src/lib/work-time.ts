/**
 * 勤務時間の計算ロジック（勤務時間集計ページ・タイムカード・LIFF マイスケジュールで共用）
 *
 * - 予定：シフトの開始〜終了から中抜けを引き、5時間以上なら昼休憩60分を自動控除
 * - 実績：タイムカードの出勤（30分単位で切り上げ）〜退勤（切り捨て）から、
 *   シフトの中抜けと LINE の中抜け申請（time_records の break_start / break_end）を引き、同じ自動控除を適用
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

/** 中抜け申請の1件（HH:MM。開始・終了の片方だけの古い記録もある） */
export type BreakPair = {
  start: string | null
  end: string | null
  startId: string | null
  endId: string | null
}

/** time_records の break_start / break_end を日付ごとに開始〜終了の組にする */
export function pairBreakRecords(records: TimeRecordLike[]): Map<string, BreakPair[]> {
  const byDate = new Map<string, BreakPair[]>()
  const sorted = records
    .filter((r) => r.type === 'break_start' || r.type === 'break_end')
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  for (const r of sorted) {
    const date = toJSTDate(r.recorded_at)
    if (!byDate.has(date)) byDate.set(date, [])
    const pairs = byDate.get(date)!
    if (r.type === 'break_start') {
      pairs.push({ start: toJSTTime(r.recorded_at), end: null, startId: r.id ?? null, endId: null })
    } else {
      const open = [...pairs].reverse().find((p) => p.start !== null && p.end === null)
      if (open) {
        open.end = toJSTTime(r.recorded_at)
        open.endId = r.id ?? null
      } else {
        pairs.push({ start: null, end: toJSTTime(r.recorded_at), startId: null, endId: r.id ?? null })
      }
    }
  }
  return byDate
}

/**
 * 実働から引く中抜けの分数。
 * シフトの中抜けと中抜け申請を合わせ、重なった時間は1回だけ数える。
 * 勤務（丸め後の出勤〜退勤。0時からの分数）の外にはみ出した分は引かない。
 */
export function deductibleBreakMinutes(
  workStart: number,
  workEnd: number,
  shift: { break_start_time: string | null; break_end_time: string | null } | undefined,
  requested: BreakPair[],
): number {
  const ranges: [number, number][] = []
  if (shift?.break_start_time && shift?.break_end_time) {
    ranges.push([toMinutes(shift.break_start_time.slice(0, 5)), toMinutes(shift.break_end_time.slice(0, 5))])
  }
  for (const p of requested) {
    if (p.start && p.end) ranges.push([toMinutes(p.start), toMinutes(p.end)])
  }

  const clipped = ranges
    .map(([s, e]): [number, number] => [Math.max(s, workStart), Math.min(e, workEnd)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])

  let total = 0
  let curStart = -1
  let curEnd = -1
  for (const [s, e] of clipped) {
    if (s > curEnd) {
      total += curEnd - curStart
      curStart = s
      curEnd = e
    } else if (e > curEnd) {
      curEnd = e
    }
  }
  return total + (curEnd - curStart)
}

/**
 * 1日の実働（分）。出勤・退勤は30分単位で丸めたあとの「0時からの分数」。
 * 中抜けを引いたあと5時間以上なら休憩60分を自動控除する。
 */
export function calcWorkedMinutes(
  inM: number,
  outM: number,
  shift: { break_start_time: string | null; break_end_time: string | null } | undefined,
  requested: BreakPair[],
): { net: number; breakMinutes: number; lunchDeduction: number } {
  const diff = outM - inM
  if (diff <= 0) return { net: 0, breakMinutes: 0, lunchDeduction: 0 }
  const breakMinutes = deductibleBreakMinutes(inM, outM, shift, requested)
  const afterBreak = Math.max(0, diff - breakMinutes)
  const lunchDeduction = afterBreak >= 300 ? 60 : 0
  return { net: Math.max(0, afterBreak - lunchDeduction), breakMinutes, lunchDeduction }
}

export type TCDay = {
  date: string
  clockIn: string | null    // HH:MM
  clockOut: string | null   // HH:MM
  clockInId: string | null
  clockOutId: string | null
  hours: number | null
  breakMinutes: number      // 差し引いた中抜け（シフト＋中抜け申請）
  lunchDeduction: number    // 5時間以上で自動控除される60分
}

/**
 * タイムカードの打刻から日次の実働時間を組み立てる。
 * records に break_start / break_end が含まれていれば、中抜け申請として差し引く。
 */
export function buildTCDays(
  records: TimeRecordLike[],
  shiftsMap: Map<string, { break_start_time: string | null; break_end_time: string | null }>,
): TCDay[] {
  const breaksByDate = pairBreakRecords(records)

  // raw データ（最早 clock_in・最遅 clock_out を選択）
  const byDate = new Map<string, { inRec: TimeRecordLike | null; outRec: TimeRecordLike | null }>()
  for (const r of records) {
    if (r.type !== 'clock_in' && r.type !== 'clock_out') continue
    const date = toJSTDate(r.recorded_at)
    if (!byDate.has(date)) byDate.set(date, { inRec: null, outRec: null })
    const d = byDate.get(date)!
    if (r.type === 'clock_in') {
      if (!d.inRec || r.recorded_at < d.inRec.recorded_at) d.inRec = r
    } else {
      if (!d.outRec || r.recorded_at > d.outRec.recorded_at) d.outRec = r
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { inRec, outRec }]) => {
      let hours: number | null = null
      let brkMins = 0
      let lunchDeduction = 0
      if (inRec && outRec) {
        const dayStart = toJSTEpochMin(`${date}T00:00:00+09:00`)
        const inM = Math.ceil(toJSTEpochMin(inRec.recorded_at) / 30) * 30 - dayStart   // 切り上げ30分
        const outM = Math.floor(toJSTEpochMin(outRec.recorded_at) / 30) * 30 - dayStart  // 切り捨て30分
        if (outM - inM > 0) {
          const worked = calcWorkedMinutes(inM, outM, shiftsMap.get(date), breaksByDate.get(date) ?? [])
          brkMins = worked.breakMinutes
          lunchDeduction = worked.lunchDeduction
          hours = Math.round((worked.net / 60) * 100) / 100
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
