// LINEの付け忘れ報告の読み取り・聞き返し・反映先の決め方を確かめる
// 実行: npx tsx scripts/verify-line-punch-report.ts
import {
  parsePunchReport,
  parseReportDate,
  parseReportType,
  resolveEntries,
  askAgainReply,
  missingPunchNotice,
  handlePunchReport,
  jstIso,
  type DayPunches,
} from '../src/lib/line/timecard-correction'

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

// ─── 読み取り ───
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
check('日付だけ', parseReportDate('10/14です', TODAY), '2026-10-14')
check('日付なし', parseReportDate('退勤 17:30', TODAY), null)
check('種別だけ', parseReportType('10/14 退勤です'), 'clock_out')

// ─── 反映先（日付つき） ───
const rec = (type: 'clock_in' | 'clock_out', date: string, h: number) => ({ id: `${type}-${date}`, type, recorded_at: jstIso(date, h, 0) })
const morning = jstIso(TODAY, 9, 5)
const evening = jstIso(TODAY, 20, 0)

function resolve(text: string, now: string, day: DayPunches) {
  const r = parsePunchReport(text, TODAY)
  if (!r.ok || !r.report.date) return 'parse_failed'
  const out = resolveEntries(r.report.date, r.report.entries, now, day)
  if ('error' in out) return out.error
  return out.map((o) => `${o.date} ${o.type} ${o.hour}:${String(o.minute).padStart(2, '0')}`)
}
check('種別なしは抜けている方', resolve('10/14 17:30です', morning, { clock_in: rec('clock_in', '2026-10-14', 9), clock_out: null }), ['2026-10-14 clock_out 17:30'])
check('当日の出勤', resolve('今日 出勤 9:00', evening, { clock_in: null, clock_out: rec('clock_out', TODAY, 18) }), ['2026-10-15 clock_in 9:00'])
check('未来の時刻', resolve('今日 退勤 17:30', morning, { clock_in: rec('clock_in', TODAY, 9), clock_out: null }), 'future')
check('どちらか不明', resolve('10/14 17:30', evening, { clock_in: null, clock_out: null }), 'unknown_type')

// ─── 聞き返しの文 ───
const missOut = { staff_member_id: 's', date: '2026-10-14', type: 'clock_out' as const }
console.log('\n--- 日付なし ---\n' + askAgainReply({ today: TODAY, date: null, type: 'clock_out', time: '17:30', missing: missOut }))
console.log('--- 時刻なし ---\n' + askAgainReply({ today: TODAY, date: '2026-10-14', type: 'clock_out', time: null, missing: missOut }))
console.log('--- 両方なし ---\n' + askAgainReply({ today: TODAY, date: null, type: null, time: null, missing: missOut }))
console.log('--- 夜の通知 ---\n' + missingPunchNotice('山田', [{ staff_member_id: 's', date: TODAY, type: 'clock_out' }]))

// ─── handlePunchReport を、DBの代わりの偽クライアントで通す ───
function fakeAdmin(rows: { staff_member_id: string; type: string; recorded_at: string }[]) {
  const writes: string[] = []
  const builder = (table: string) => {
    const q: Record<string, unknown> = {}
    const chain = new Proxy(q, {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) =>
            resolve({ data: table === 'time_records' ? rows : [], error: null })
        }
        if (prop === 'single') return async () => ({ data: { id: 'new-id' }, error: null })
        if (prop === 'insert' || prop === 'update') {
          return (v: unknown) => { writes.push(`${table}.${String(prop)} ${JSON.stringify(v)}`); return chain }
        }
        return () => chain
      },
    })
    return chain
  }
  return { client: { from: builder }, writes }
}

async function run() {
  const yIn = { staff_member_id: 's', type: 'clock_in', recorded_at: jstIso('2026-10-14', 9, 0) }
  const now = new Date(jstIso(TODAY, 9, 5))
  const staff = { id: 's', name: '山田' }

  let db = fakeAdmin([yIn])
  let reply = await handlePunchReport(db.client, staff, '17:30です', now)
  check('日付なしは反映しない', db.writes.length, 0)
  check('日付なしは聞き返す', reply?.startsWith('📅 日付が入っていません'), true)
  check('聞き返しに抜けている日を出す', reply?.includes('10月14日の退勤'), true)

  db = fakeAdmin([yIn])
  reply = await handlePunchReport(db.client, staff, '10/14 退勤です', now)
  check('時刻なしは反映しない', db.writes.length, 0)
  check('時刻なしは聞き返す', reply?.startsWith('⏰ 時刻が入っていません'), true)

  db = fakeAdmin([yIn])
  reply = await handlePunchReport(db.client, staff, '退勤忘れました', now)
  check('両方なしは聞き返す', reply?.startsWith('📅⏰ 日付と時刻が入っていません'), true)

  db = fakeAdmin([yIn])
  reply = await handlePunchReport(db.client, staff, '10/14 退勤 17:30', now)
  check('そろっていれば反映', reply?.startsWith('✏️ 山田さんのタイムカードに反映しました'), true)
  check('履歴も書く', db.writes.some((w) => w.startsWith('time_record_corrections.insert')), true)

  db = fakeAdmin([yIn])
  reply = await handlePunchReport(db.client, staff, 'ありがとうございます', now)
  check('雑談には反応しない', reply, null)

  if (failed > 0) {
    console.log(`\n${failed} 件失敗`)
    process.exit(1)
  }
  console.log('\nすべて成功')
}
void run()
