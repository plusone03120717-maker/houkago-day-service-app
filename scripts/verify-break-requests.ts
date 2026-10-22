// 中抜け申請の日付の並べ方と、勤務時間からの差し引き方を確かめる
// 実行: npx tsx scripts/verify-break-requests.ts
import { listBreakDates, timeRangesOverlap, MAX_BREAK_DAYS } from '../src/lib/break-requests'
import { buildTCDays, deductibleBreakMinutes, pairBreakRecords, type BreakPair } from '../src/lib/work-time'

let failed = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) console.log(`OK   ${label}`)
  else {
    failed++
    console.log(`NG   ${label}\n     expected ${e}\n     actual   ${a}`)
  }
}

const iso = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`).toISOString()
const pair = (start: string, end: string): BreakPair => ({ start, end, startId: null, endId: null })
type ShiftBreak = { break_start_time: string | null; break_end_time: string | null }
const noShift: ShiftBreak = { break_start_time: null, break_end_time: null }

// ─── まとめて申請する日付 ───
// 2026-11: 3日(火)文化の日・23日(月)勤労感謝の日
check('平日・祝日除く（11/2〜11/8）',
  listBreakDates({ from: '2026-11-02', to: '2026-11-08', weekdays: [1, 2, 3, 4, 5], skipHolidays: true }),
  ['2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06'])
check('祝日も含める',
  listBreakDates({ from: '2026-11-02', to: '2026-11-08', weekdays: [1, 2, 3, 4, 5], skipHolidays: false }),
  ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'])
check('月・水だけ（11月）',
  listBreakDates({ from: '2026-11-01', to: '2026-11-30', weekdays: [1, 3], skipHolidays: true }).length,
  8) // 月: 2,9,16,30（23は祝日）＋ 水: 4,11,18,25
check('月またぎ',
  listBreakDates({ from: '2026-11-30', to: '2026-12-02', weekdays: [1, 2, 3], skipHolidays: true }),
  ['2026-11-30', '2026-12-01', '2026-12-02'])
check('開始が終了より後', listBreakDates({ from: '2026-11-10', to: '2026-11-01', weekdays: [1], skipHolidays: true }), [])
check('曜日なし', listBreakDates({ from: '2026-11-01', to: '2026-11-30', weekdays: [], skipHolidays: true }), [])
check('上限で止まる',
  listBreakDates({ from: '2026-01-01', to: '2026-12-31', weekdays: [0, 1, 2, 3, 4, 5, 6], skipHolidays: false }).length,
  MAX_BREAK_DAYS)

check('重なる', timeRangesOverlap('12:00', '13:00', '12:30', '14:00'), true)
check('くっついているだけは重ならない', timeRangesOverlap('12:00', '13:00', '13:00', '14:00'), false)

// ─── 差し引く中抜けの分数（0時からの分数で 9:00=540, 18:00=1080） ───
check('申請だけ', deductibleBreakMinutes(540, 1080, noShift, [pair('13:00', '14:00')]), 60)
check('シフトと申請が同じ時間なら1回だけ',
  deductibleBreakMinutes(540, 1080, { break_start_time: '13:00:00', break_end_time: '14:00:00' }, [pair('13:00', '14:00')]), 60)
check('一部重なり（13:00〜14:00 と 13:30〜15:00 → 120分）',
  deductibleBreakMinutes(540, 1080, { break_start_time: '13:00:00', break_end_time: '14:00:00' }, [pair('13:30', '15:00')]), 120)
check('離れた2回', deductibleBreakMinutes(540, 1080, noShift, [pair('11:00', '11:30'), pair('15:00', '16:00')]), 90)
check('勤務の外は引かない（退勤16:00、中抜け15:30〜17:00 → 30分）',
  deductibleBreakMinutes(540, 960, noShift, [pair('15:30', '17:00')]), 30)
check('片方だけの古い記録は数えない', deductibleBreakMinutes(540, 1080, noShift, [{ start: '13:00', end: null, startId: null, endId: null }]), 0)

// ─── 組にする ───
const recs = [
  { id: 'a', type: 'break_start', recorded_at: iso('2026-11-04', '13:00') },
  { id: 'b', type: 'break_end', recorded_at: iso('2026-11-04', '14:00') },
  { id: 'c', type: 'clock_in', recorded_at: iso('2026-11-04', '09:00') },
  { id: 'd', type: 'clock_out', recorded_at: iso('2026-11-04', '18:00') },
]
check('組', pairBreakRecords(recs).get('2026-11-04'), [{ start: '13:00', end: '14:00', startId: 'a', endId: 'b' }])

// ─── 1日の実働（9:00〜18:00 = 9h） ───
const day = (records: typeof recs, shift = noShift) =>
  buildTCDays(records, new Map([['2026-11-04', shift]]))
    .map((d) => ({ date: d.date, hours: d.hours, breakMinutes: d.breakMinutes, lunch: d.lunchDeduction }))

check('中抜けなし: 9h − 休憩1h = 8h', day(recs.slice(2)), [{ date: '2026-11-04', hours: 8, breakMinutes: 0, lunch: 60 }])
check('申請1h: 9h − 1h − 休憩1h = 7h', day(recs), [{ date: '2026-11-04', hours: 7, breakMinutes: 60, lunch: 60 }])
check('シフトと申請が同じなら二重に引かない',
  day(recs, { break_start_time: '13:00:00', break_end_time: '14:00:00' }),
  [{ date: '2026-11-04', hours: 7, breakMinutes: 60, lunch: 60 }])
check('中抜けだけの日は行を作らない',
  buildTCDays([
    { type: 'break_start', recorded_at: iso('2026-11-05', '13:00') },
    { type: 'break_end', recorded_at: iso('2026-11-05', '14:00') },
  ], new Map()),
  [])
// 13:00〜18:00 出勤で、中抜け 15:00〜16:00 → 5h − 1h = 4h（5時間未満なので休憩控除なし）
check('中抜けで5時間を下回ると休憩控除なし',
  buildTCDays([
    { type: 'clock_in', recorded_at: iso('2026-11-06', '13:00') },
    { type: 'clock_out', recorded_at: iso('2026-11-06', '18:00') },
    { type: 'break_start', recorded_at: iso('2026-11-06', '15:00') },
    { type: 'break_end', recorded_at: iso('2026-11-06', '16:00') },
  ], new Map()).map((d) => d.hours),
  [4])

console.log(failed === 0 ? '\nすべて OK' : `\n${failed}件 NG`)
process.exit(failed === 0 ? 0 : 1)
