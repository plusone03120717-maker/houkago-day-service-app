/**
 * 出席の入力の安全策（@/lib/attendance-safeguards）を確かめる（データベースにさわらない）。
 *
 *   npm run verify:attendance-safeguards
 */
import assert from 'node:assert/strict'
import {
  absentToAttendedMessage,
  basicServiceFor,
  isAttendedWithoutTime,
} from '../src/lib/attendance-safeguards'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✓ ${name}`)
}

check('欠席→出席（3秒後に出席に戻され、時間が空のまま残った 11/17 の形）は「時間なしの出席」', () => {
  assert.equal(isAttendedWithoutTime({ status: 'attended', basic_service: true, daytime_support: false }), true)
})

check('放デイの時間が入った出席は対象外', () => {
  assert.equal(isAttendedWithoutTime({ status: 'attended', service_start_time: '15:10:00', service_end_time: '17:30:00' }), false)
})

check('旧データの check_in/out だけの出席も対象外', () => {
  assert.equal(isAttendedWithoutTime({ status: 'attended', check_in_time: '15:10:00', check_out_time: '17:30:00' }), false)
})

check('日中一時だけの時間が入った出席は対象外（11/23 の時間の形）', () => {
  assert.equal(
    isAttendedWithoutTime({ status: 'attended', daytime_support: true, daytime_support_start_time: '09:00:00', daytime_support_end_time: '16:00:00' }),
    false
  )
})

check('欠席・予定のままの記録は対象外', () => {
  assert.equal(isAttendedWithoutTime({ status: 'absent' }), false)
  assert.equal(isAttendedWithoutTime({ status: 'scheduled' }), false)
})

check('欠席から出席に変えるときだけ確認する', () => {
  assert.ok(absentToAttendedMessage('absent'))
  assert.equal(absentToAttendedMessage('scheduled'), null)
  assert.equal(absentToAttendedMessage(undefined), null)
})

check('カレンダーで日中一時だけの日（放デイの時間が空）は、放デイを使わない（11/23）', () => {
  assert.equal(basicServiceFor({ daytimeSupport: true, serviceStart: '', serviceEnd: '' }), false)
  assert.equal(basicServiceFor({ daytimeSupport: true, serviceStart: null, serviceEnd: null }), false)
})

check('放デイの時間があるか、日中一時を使わない日は、今までどおり放デイを使う', () => {
  assert.equal(basicServiceFor({ daytimeSupport: true, serviceStart: '10:00', serviceEnd: '16:00' }), true)
  assert.equal(basicServiceFor({ daytimeSupport: false, serviceStart: '', serviceEnd: '' }), true)
  assert.equal(basicServiceFor({ daytimeSupport: false, serviceStart: '15:10', serviceEnd: '17:30' }), true)
})

console.log(`\n${passed} 件すべて通りました`)
