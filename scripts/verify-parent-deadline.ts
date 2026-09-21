/**
 * 利用連絡の申込締切の日付計算を検証する（DB不要）。
 *
 *   npx tsx scripts/verify-parent-deadline.ts
 *
 * 締切の判定は画面（カレンダー）とAPI（保存の検証）の両方で同じ関数を使う。
 * ここがズレると、送信ボタンは出ているのに保存で弾かれる状態になるため、
 * 月またぎ・年またぎ・締切日当日の扱いをまとめて確かめておく。
 */
import {
  deadlineDateFor,
  isMonthClosed,
  firstOpenMonth,
  formatMonthDay,
  type ReservationDeadline,
} from '../src/lib/parent-reservation-deadline'

const on: ReservationDeadline = { enabled: true, day: 15 }
const off: ReservationDeadline = { enabled: false, day: 15 }

let failed = 0

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? '  OK  ' : ' NG   '} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` （期待: ${JSON.stringify(expected)}）`}`)
}

console.log('■ 締切日（前月の15日）')
check('2026年10月分', deadlineDateFor(2026, 10, 15), '2026-09-15')
check('2026年1月分（年またぎ）', deadlineDateFor(2026, 1, 15), '2025-12-15')
check('表示用', formatMonthDay(deadlineDateFor(2026, 10, 15)), '9月15日')

console.log('■ 締め切られているか（締切日当日はまだ受け付ける）')
check('9/14時点の10月分', isMonthClosed(2026, 10, on, '2026-09-14'), false)
check('9/15時点の10月分', isMonthClosed(2026, 10, on, '2026-09-15'), false)
check('9/16時点の10月分', isMonthClosed(2026, 10, on, '2026-09-16'), true)
check('9/16時点の11月分', isMonthClosed(2026, 11, on, '2026-09-16'), false)
check('9/16時点の9月分（当月は締切済み）', isMonthClosed(2026, 9, on, '2026-09-16'), true)
check('設定OFFなら締め切らない', isMonthClosed(2026, 9, off, '2026-09-16'), false)

console.log('■ 次に出せる月')
check('9/14時点', firstOpenMonth('2026-09-14', on), { year: 2026, month: 10 })
check('9/15時点', firstOpenMonth('2026-09-15', on), { year: 2026, month: 10 })
check('9/16時点', firstOpenMonth('2026-09-16', on), { year: 2026, month: 11 })
check('12/16時点（年またぎ）', firstOpenMonth('2026-12-16', on), { year: 2027, month: 2 })
check('11/20時点（年またぎ）', firstOpenMonth('2026-11-20', on), { year: 2027, month: 1 })
check('設定OFFなら当月から', firstOpenMonth('2026-09-16', off), { year: 2026, month: 9 })

console.log(failed === 0 ? '\nすべて期待どおりです' : `\n${failed}件が期待と違います`)
process.exit(failed === 0 ? 0 : 1)
