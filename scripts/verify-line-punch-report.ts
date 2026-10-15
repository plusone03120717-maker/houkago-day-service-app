// LINEの付け忘れ報告の読み取り・対象日の決め方を確かめる
// 実行: npx tsx scripts/verify-line-punch-report.ts
import { parsePunchReport, resolveEntries, jstIso, type DayPunches } from '../src/lib/line/timecard-correction'

const TODAY = '2026-10-15'
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

function parsed(text: string) {
  const r = parsePunchReport(text, TODAY)
  if (!r.ok) return r.reason
  return { date: r.report.date, entries: r.report.entries.map((e) => `${e.type}@${e.hour}:${String(e.minute).padStart(2, '0')}`) }
}

check('昨日 退勤 17:30', parsed('昨日 退勤 17:30'), { date: '2026-10-14', entries: ['clock_out@17:30'] })
check('全角', parsed('１０／１４　出勤　９：００'), { date: '2026-10-14', entries: ['clock_in@9:00'] })
check('文章', parsed('昨日退勤押し忘れました、17時30分です'), { date: '2026-10-14', entries: ['clock_out@17:30'] })
check('時半・午後補正', parsed('5時半に退勤しました'), { date: null, entries: ['clock_out@17:30'] })
check('両方', parsed('今日 9時出勤 18時退勤'), { date: '2026-10-15', entries: ['clock_in@9:00', 'clock_out@18:00'] })
check('言葉が先', parsed('出勤9:00 退勤18:00'), { date: null, entries: ['clock_in@9:00', 'clock_out@18:00'] })
check('出来た は出勤ではない', parsed('17:30に退勤できました'), { date: null, entries: ['clock_out@17:30'] })
check('範囲', parsed('10月13日 9:30〜17:00'), { date: '2026-10-13', entries: ['clock_in@9:30', 'clock_out@17:00'] })
check('種別なし', parsed('17:30です'), { date: null, entries: ['null@17:30'] })
check('14日', parsed('14日の退勤 18:00'), { date: '2026-10-14', entries: ['clock_out@18:00'] })
check('未来日は前年', parsed('12/1 出勤 9:00'), { date: '2025-12-01', entries: ['clock_in@9:00'] })
check('同じ種別が2つ', parsed('退勤17:30じゃなくて18:00'), 'ambiguous')
check('時刻なし', parsed('退勤押し忘れました'), 'no_time')
check('時間（長さ）は時刻でない', parsed('今日は5時間勤務'), 'no_time')
check('雑談', parsed('ありがとうございます'), 'no_time')

// ─── 対象日の決め方 ───
const rec = (type: 'clock_in' | 'clock_out', date: string, h: number) => ({ id: `${type}-${date}`, type, recorded_at: jstIso(date, h, 0) })
const empty: DayPunches = { clock_in: null, clock_out: null }
const morning = jstIso(TODAY, 9, 5) // 10/15 9:05
const evening = jstIso(TODAY, 20, 0)

function resolve(text: string, now: string, days: { today: DayPunches; yesterday: DayPunches }) {
  const r = parsePunchReport(text, TODAY)
  if (!r.ok) return r.reason
  const out = resolveEntries(r.report, TODAY, now, days)
  if ('error' in out) return out.error
  return out.map((o) => `${o.date} ${o.type} ${o.hour}:${String(o.minute).padStart(2, '0')}`)
}

// 昨日退勤し忘れ → 今朝出勤 → 「17:30です」とだけ返信
const forgotOut = { today: { clock_in: rec('clock_in', TODAY, 9), clock_out: null }, yesterday: { clock_in: rec('clock_in', '2026-10-14', 9), clock_out: null } }
check('翌朝「17:30です」は昨日の退勤', resolve('17:30です', morning, forgotOut), ['2026-10-14 clock_out 17:30'])
check('翌朝「退勤 17:30」も昨日の退勤', resolve('退勤 17:30', morning, forgotOut), ['2026-10-14 clock_out 17:30'])
// 今日出勤し忘れ → 夕方退勤 → 「出勤 9:00」
const forgotIn = { today: { clock_in: null, clock_out: rec('clock_out', TODAY, 18) }, yesterday: empty }
check('当日の出勤', resolve('出勤 9:00', evening, forgotIn), ['2026-10-15 clock_in 9:00'])
check('当日・種別なし', resolve('9時でした', evening, forgotIn), ['2026-10-15 clock_in 9:00'])
// 朝に出勤し忘れに気づいた
check('今朝の出勤', resolve('出勤 8:50', morning, { today: empty, yesterday: empty }), ['2026-10-15 clock_in 8:50'])
check('未来の時刻', resolve('今日 退勤 17:30', morning, forgotOut), 'future')
check('どちらか不明', resolve('17:30', evening, { today: empty, yesterday: empty }), 'unknown_type')

if (failed > 0) {
  console.log(`\n${failed} 件失敗`)
  process.exit(1)
}
console.log('\nすべて成功')
