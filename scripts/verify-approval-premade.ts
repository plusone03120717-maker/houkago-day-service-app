/**
 * 承認画面の初期値：前もって作られただけの出席記録（いつもの予定と同じ時間）を見分ける決め方を確かめる。
 *
 *   npm run verify:approval-premade
 */
import assert from 'node:assert/strict'
import {
  isPremadeFromPlan,
  fitRequestedTimes,
  differsFromRequest,
  type AttendanceAssignmentSource,
  type PlannedTimes,
  type ServiceAssignment,
} from '../src/lib/parent-contact-service'
import { serviceStartFromPickupArrival } from '../src/lib/transport-timing'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✓ ${name}`)
}

const plan: PlannedTimes = {
  serviceStartTime: '15:10',
  serviceEndTime: '16:30',
  daytimeSupport: true,
  daytimeSupportStartTime: '16:30',
  daytimeSupportEndTime: '17:30',
}
const att = (extra: Partial<AttendanceAssignmentSource> = {}): AttendanceAssignmentSource => ({
  basic_service: true,
  service_start_time: '15:10:00',
  service_end_time: '16:30:00',
  daytime_support: true,
  daytime_support_start_time: '16:30:00',
  daytime_support_end_time: '17:30:00',
  ...extra,
})

check('いつもの予定と同じ時間の記録は「前もって作られただけ」（2026-11-20 の幡野さんの件）', () => {
  assert.equal(isPremadeFromPlan(att(), plan), true)
})

check('スタッフが利用時間を変えた記録は守る', () => {
  assert.equal(isPremadeFromPlan(att({ service_start_time: '10:00:00', service_end_time: '16:00:00' }), plan), false)
})

check('日中一時の時間だけ変えた記録も守る', () => {
  assert.equal(isPremadeFromPlan(att({ daytime_support_end_time: '18:00:00' }), plan), false)
})

check('日中一時を付けた・外した記録も守る', () => {
  assert.equal(isPremadeFromPlan(att({ daytime_support: false }), plan), false)
})

check('日中一時を使わない日は、日中一時の時間を比べない', () => {
  const noDaytime: PlannedTimes = { ...plan, daytimeSupport: false, daytimeSupportStartTime: null, daytimeSupportEndTime: null }
  assert.equal(isPremadeFromPlan(att({ daytime_support: false, daytime_support_start_time: null, daytime_support_end_time: null }), noDaytime), true)
})

check('記録かいつもの予定のどちらかが無ければ「前もって作られた」とはみなさない', () => {
  assert.equal(isPremadeFromPlan(null, plan), false)
  assert.equal(isPremadeFromPlan(att(), undefined), false)
})

// ── ご希望の時刻の当てはめ（fitRequestedTimes）と、承認前の確認（differsFromRequest） ──
const weekday: ServiceAssignment = {
  serviceType: 'both',
  serviceStartTime: '15:10',
  serviceEndTime: '16:30',
  daytimeStartTime: '16:30',
  daytimeEndTime: '17:00',
}

check('祝日の 10:00〜16:00 は、休みの日の切りかえ 16:00 より前なので放デイだけにする（2026-11-22 幡野さん 11/23）', () => {
  assert.deepEqual(fitRequestedTimes(weekday, '10:00:00', '16:00:00', '16:00'), {
    serviceType: 'regular',
    serviceStartTime: '10:00',
    serviceEndTime: '16:00',
    daytimeStartTime: null,
    daytimeEndTime: null,
  })
})

check('いまの切りかえ（16:30）がご希望の中にあれば、それで分ける（11/5 森田さんの形）', () => {
  assert.deepEqual(fitRequestedTimes(weekday, '14:30:00', '17:30:00', '16:30'), {
    ...weekday,
    serviceStartTime: '14:30',
    daytimeEndTime: '17:30',
  })
})

check('いまの切りかえが外にあっても、その日の既定の切りかえが中にあれば、そこで分ける', () => {
  assert.deepEqual(fitRequestedTimes(weekday, '10:00:00', '16:20:00', '16:00'), {
    ...weekday,
    serviceStartTime: '10:00',
    serviceEndTime: '16:00',
    daytimeStartTime: '16:00',
    daytimeEndTime: '16:20',
  })
})

check('ご希望がまるごと切りかえの後ろなら、日中一時だけにする', () => {
  const a = fitRequestedTimes(weekday, '16:40:00', '18:00:00', '16:30')
  assert.equal(a.serviceType, 'daytime_support')
  assert.equal(a.daytimeStartTime, '16:40')
  assert.equal(a.daytimeEndTime, '18:00')
})

check('放デイだけの日は時刻だけ替える（今までどおり）', () => {
  const regular: ServiceAssignment = { serviceType: 'regular', serviceStartTime: '15:10', serviceEndTime: '17:00', daytimeStartTime: null, daytimeEndTime: null }
  assert.deepEqual(fitRequestedTimes(regular, '10:00:00', '16:00:00', '16:00'), { ...regular, serviceStartTime: '10:00', serviceEndTime: '16:00' })
})

check('ご希望と違う時間（いまの予定のまま）で承認しようとしたら「ずれている」', () => {
  assert.equal(differsFromRequest(weekday, '10:00:00', '16:00:00', true, serviceStartFromPickupArrival), true)
})

check('ご希望どおり・お迎えの10分後の開始なら「ずれていない」', () => {
  const ok: ServiceAssignment = { serviceType: 'regular', serviceStartTime: '10:00', serviceEndTime: '16:00', daytimeStartTime: null, daytimeEndTime: null }
  assert.equal(differsFromRequest(ok, '10:00:00', '16:00:00', true, serviceStartFromPickupArrival), false)
  assert.equal(differsFromRequest({ ...ok, serviceStartTime: '10:10' }, '10:00:00', '16:00:00', true, serviceStartFromPickupArrival), false)
  assert.equal(differsFromRequest({ ...ok, serviceStartTime: '10:10' }, '10:00:00', '16:00:00', false, serviceStartFromPickupArrival), true)
})

check('ご希望の時間が無い連絡は比べない', () => {
  assert.equal(differsFromRequest(weekday, null, null, true, serviceStartFromPickupArrival), false)
})

console.log(`\nすべて通りました（${passed}件）`)
