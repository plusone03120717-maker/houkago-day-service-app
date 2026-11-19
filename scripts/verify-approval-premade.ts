/**
 * 承認画面の初期値：前もって作られただけの出席記録（いつもの予定と同じ時間）を見分ける決め方を確かめる。
 *
 *   npm run verify:approval-premade
 */
import assert from 'node:assert/strict'
import { isPremadeFromPlan, type AttendanceAssignmentSource, type PlannedTimes } from '../src/lib/parent-contact-service'

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

console.log(`\nすべて通りました（${passed}件）`)
