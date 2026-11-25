/**
 * かんたん入力で、両方の日の切りかえの時刻を変えても、その日の開始・終了が動かないことを確かめる（DB にさわらない）。
 *
 *   npm run verify:easy-switch
 */
import assert from 'node:assert/strict'
import { easyFromFields, fieldsFromEasy } from '../src/components/attendance/easy-attendance-panel'
import { initFields, type TransportRow } from '../src/components/transport/transport-daytime-panel'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✓ ${name}`)
}

const END = '17:30'
const row = (extra: Partial<TransportRow>): TransportRow => ({ ...({} as TransportRow), basic_service: true, daytime_support: false, ...extra })

/** 画面と同じく、1回変えるごとに前の結果を次のもとにする */
function typeSwitch(base: ReturnType<typeof initFields>, times: string[], order?: 'hd_first' | 'ni_first') {
  let fields = base
  let s = easyFromFields(fields)
  if (order) s = { ...s, order }
  for (const t of times) {
    s = { ...s, switchTime: t }
    fields = fieldsFromEasy(s, fields, END)
  }
  return fields
}

check('日中一時が先・お迎えなし：切りかえを 09:00→10:00 にしても開始 9:00 が残る（11/25 の相澤さんの形）', () => {
  // 日中一時 9:00〜9:00（切りかえ 9:00）・放デイ 9:00〜16:00・帰り 16:00
  const base = initFields(row({
    basic_service: true, daytime_support: true,
    daytime_support_start_time: '09:00:00', daytime_support_end_time: '09:00:00',
    service_start_time: '09:00:00', service_end_time: '16:00:00',
    dropoff_departure_time: '16:00:00', dropoff_arrival_time: '16:10:00',
  }), END)
  // 入力欄に 1→10:00 と打つときの途中の値も通す
  // 画面では「日中一時を先にする」を押した状態
  const f = typeSwitch(base, ['01:00', '10:00'], 'ni_first')
  assert.equal(f.daytimeSupportStartTime, '09:00')
  assert.equal(f.daytimeSupportEndTime, '10:00')
  assert.equal(f.serviceStartTime, '10:00')
  assert.equal(f.serviceEndTime, '16:00')
})

check('放デイが先・帰りなし：切りかえを変えても終了が残る', () => {
  const base = initFields(row({
    basic_service: true, daytime_support: true,
    service_start_time: '15:25:00', service_end_time: '16:30:00',
    daytime_support_start_time: '16:30:00', daytime_support_end_time: '18:00:00',
    pickup_departure_time: '15:15:00', pickup_arrival_time: '15:25:00',
  }), END)
  const f = typeSwitch(base, ['17:00'])
  assert.equal(f.serviceStartTime, '15:25')
  assert.equal(f.serviceEndTime, '17:00')
  assert.equal(f.daytimeSupportStartTime, '17:00')
  assert.equal(f.daytimeSupportEndTime, '18:00')
})

check('放デイだけの日は今までどおり', () => {
  const base = initFields(row({ service_start_time: '15:25:00', service_end_time: '16:30:00' }), END)
  const f = fieldsFromEasy(easyFromFields(base), base, END)
  assert.equal(f.serviceStartTime, '15:25')
  assert.equal(f.serviceEndTime, '16:30')
})

check('日中一時だけの日で、放デイ側に古い終了が残っていても使わない（11/23 の和光さんの形）', () => {
  const base = initFields(row({
    basic_service: false, daytime_support: true, service_end_time: '16:30:00',
    daytime_support_start_time: '09:00:00', daytime_support_end_time: '16:00:00',
  }), END)
  const f = fieldsFromEasy(easyFromFields(base), base, END)
  assert.equal(f.daytimeSupportStartTime, '09:00')
  assert.equal(f.daytimeSupportEndTime, '16:00')
})

console.log(`\n${passed} 件すべて通りました`)
