/**
 * 週ごとの予定のお知らせ・保護者の確認の決め方を確かめる（データベースにさわらない）。
 *
 *   npm run verify:schedule-week
 */
import assert from 'node:assert/strict'
import type { FacilityScheduleDay } from '../src/components/parent/usage-contact-calendar'
import {
  addDays,
  buildWeekSnapshots,
  changedDates,
  childWeekState,
  parentWeekState,
  dayLine,
  isWeekStart,
  monthsOfWeek,
  weekDates,
  weekLabel,
  weekStartOf,
} from '../src/lib/schedule-week-confirm'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✓ ${name}`)
}

const day = (date: string, extra: Partial<FacilityScheduleDay> = {}): FacilityScheduleDay => ({
  child_id: 'a',
  date,
  kind: 'planned',
  service_start_time: '14:30',
  service_end_time: '17:30',
  transport_type: 'both',
  pickup_place: 'school',
  dropoff_place: 'home',
  ...extra,
})

check('週の月曜日（日曜は前の週）', () => {
  assert.equal(weekStartOf('2026-11-14'), '2026-11-09') // 土
  assert.equal(weekStartOf('2026-11-15'), '2026-11-09') // 日
  assert.equal(weekStartOf('2026-11-16'), '2026-11-16') // 月
  assert.equal(weekStartOf('2026-11-20'), '2026-11-16') // 金
  assert.equal(addDays('2026-11-30', 1), '2026-12-01')
  assert.ok(isWeekStart('2026-11-16'))
  assert.ok(!isWeekStart('2026-11-17'))
  assert.ok(!isWeekStart('2026-11-xx'))
  assert.deepEqual(weekDates('2026-11-30').slice(-1), ['2026-12-06'])
  assert.deepEqual(monthsOfWeek('2026-11-30'), [{ year: 2026, month: 11 }, { year: 2026, month: 12 }])
  assert.equal(weekLabel('2026-11-16'), '11/16（月）〜11/22（日）')
})

check('週の外の日は要約に入れない', () => {
  const snaps = buildWeekSnapshots([day('2026-11-15'), day('2026-11-16'), day('2026-11-23')], '2026-11-16')
  assert.deepEqual(Object.keys(snaps.get('a')!), ['2026-11-16'])
})

check('利用済みは利用予定と同じ要約（日が過ぎただけで変わったことにしない）', () => {
  const a = buildWeekSnapshots([day('2026-11-16')], '2026-11-16').get('a')!
  const b = buildWeekSnapshots([day('2026-11-16', { kind: 'attended' })], '2026-11-16').get('a')!
  assert.deepEqual(a, b)
})

const today = '2026-11-14'
const base = buildWeekSnapshots([day('2026-11-16'), day('2026-11-18')], '2026-11-16').get('a')!

check('知らせる前は「未通知」、予定がなければ出さない', () => {
  assert.equal(childWeekState({ current: base, notified: false, noticeSnapshot: undefined, confirmSnapshot: undefined, today }).status, 'not_notified')
  assert.equal(childWeekState({ current: {}, notified: true, noticeSnapshot: undefined, confirmSnapshot: undefined, today }).status, 'no_plan')
})

check('知らせて未確認なら「まだ」', () => {
  const s = childWeekState({ current: base, notified: true, noticeSnapshot: base, confirmSnapshot: undefined, today })
  assert.equal(s.status, 'waiting')
  assert.deepEqual(s.changedSinceNotice, [])
})

check('確認のあと変わらなければ「確認ずみ」', () => {
  const s = childWeekState({ current: base, notified: true, noticeSnapshot: base, confirmSnapshot: base, today })
  assert.equal(s.status, 'confirmed')
})

check('確認のあとで時間が変わったら「変更後まだ」と変わった日', () => {
  const now = buildWeekSnapshots([day('2026-11-16'), day('2026-11-18', { service_end_time: '18:00' })], '2026-11-16').get('a')!
  const s = childWeekState({ current: now, notified: true, noticeSnapshot: base, confirmSnapshot: base, today })
  assert.equal(s.status, 'changed')
  assert.deepEqual(s.changedSinceConfirm, ['2026-11-18'])
  assert.deepEqual(s.changedSinceNotice, ['2026-11-18'])
})

check('日が増えた・なくなった・お休みになったも変更', () => {
  const now = buildWeekSnapshots(
    [day('2026-11-16', { kind: 'absent' }), day('2026-11-20')],
    '2026-11-16'
  ).get('a')!
  assert.deepEqual(changedDates(base, now, today), ['2026-11-16', '2026-11-18', '2026-11-20'])
})

check('予定がすべてなくなっても、確認ずみだった児童は「変更後まだ」で残す', () => {
  const s = childWeekState({ current: {}, notified: true, noticeSnapshot: base, confirmSnapshot: base, today })
  assert.equal(s.status, 'changed')
})

check('過ぎた日の違いは見ない', () => {
  const now = buildWeekSnapshots([day('2026-11-16', { service_end_time: '18:00' }), day('2026-11-18')], '2026-11-16').get('a')!
  const s = childWeekState({ current: now, notified: true, noticeSnapshot: base, confirmSnapshot: base, today: '2026-11-17' })
  assert.equal(s.status, 'confirmed')
})

check('知らせ直したあとは「まだ知らせていない変更」が消える', () => {
  const now = buildWeekSnapshots([day('2026-11-16'), day('2026-11-18', { service_end_time: '18:00' })], '2026-11-16').get('a')!
  const s = childWeekState({ current: now, notified: true, noticeSnapshot: now, confirmSnapshot: base, today })
  assert.equal(s.status, 'changed')
  assert.deepEqual(s.changedSinceNotice, [])
})

check('知らせたあとで予定ができた児童は「まだ」＋知らせていない変更あり', () => {
  const s = childWeekState({ current: base, notified: true, noticeSnapshot: undefined, confirmSnapshot: undefined, today })
  assert.equal(s.status, 'waiting')
  assert.deepEqual(s.changedSinceNotice, ['2026-11-16', '2026-11-18'])
})

check('保護者に見せる1行', () => {
  assert.equal(dayLine(day('2026-11-18')), '11/18（水） 14:30〜17:30')
  assert.equal(dayLine(day('2026-11-19', { kind: 'absent' })), '11/19（木） お休み')
  assert.equal(dayLine(day('2026-11-20', { service_start_time: null, service_end_time: null })), '11/20（金）')
})

check('当日の違いは見ない（出席を付けても変わったことにしない）', () => {
  const now = buildWeekSnapshots([day('2026-11-16', { transport_type: 'none' }), day('2026-11-18')], '2026-11-16').get('a')!
  const s = childWeekState({ current: now, notified: true, noticeSnapshot: base, confirmSnapshot: base, today: '2026-11-16' })
  assert.equal(s.status, 'confirmed')
})

check('予定がすべてなくなった週も、確認し直せば一覧から消える', () => {
  const s = childWeekState({ current: {}, notified: true, noticeSnapshot: base, confirmSnapshot: {}, today })
  assert.equal(s.status, 'no_plan')
})

check('保護者には「変更を知らせる」を押すまで変更を出さない', () => {
  const now = buildWeekSnapshots([day('2026-11-16'), day('2026-11-18', { service_end_time: '18:00' })], '2026-11-16').get('a')!
  const staff = childWeekState({ current: now, notified: true, noticeSnapshot: base, confirmSnapshot: base, today })
  assert.equal(staff.status, 'changed')
  const before = parentWeekState(staff, {
    noticeSnapshot: base, confirmSnapshot: base,
    lastNotifiedAt: '2026-11-13T08:00:00Z', confirmedAt: '2026-11-13T09:00:00Z', today,
  })
  assert.equal(before.status, 'confirmed')
  const after = parentWeekState(
    childWeekState({ current: now, notified: true, noticeSnapshot: now, confirmSnapshot: base, today }),
    { noticeSnapshot: now, confirmSnapshot: base, lastNotifiedAt: '2026-11-14T08:00:00Z', confirmedAt: '2026-11-13T09:00:00Z', today }
  )
  assert.equal(after.status, 'changed')
  assert.deepEqual(after.changedSinceConfirm, ['2026-11-18'])
})

console.log(`\nすべて通りました（${passed}件）`)
