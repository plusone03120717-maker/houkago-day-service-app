/**
 * 出席管理の「予定から自動入力（未保存）」の出し方を確かめる（データベースにさわらない）。
 *
 *   npm run verify:unsaved-label
 *
 * 出席管理の画面と同じ順で、記録の欄（base）を予定で埋めた欄（shown）を作り、
 * isSchedulePresetFields が「未保存」と言うかを見る。
 */
import assert from 'node:assert/strict'
import {
  applyScheduleDefaults,
  applyTransportDefaults,
  initFields,
  isBlankFields,
  isSchedulePresetFields,
  type TransportRow,
} from '../src/components/transport/transport-daytime-panel'
import type { ScheduleDefaults } from '../src/lib/schedule-defaults'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✓ ${name}`)
}

const END = '17:00'

const sched = (extra: Partial<ScheduleDefaults> = {}): ScheduleDefaults => ({
  transportType: 'both',
  pickupTime: '15:15:00',
  dropoffTime: '16:30:00',
  serviceStartTime: null,
  serviceEndTime: null,
  daytimeSupport: false,
  daytimeSupportStartTime: null,
  daytimeSupportEndTime: null,
  ...extra,
})

const row = (extra: Partial<TransportRow> = {}): TransportRow => ({
  ...({} as TransportRow),
  basic_service: true,
  daytime_support: false,
  ...extra,
})

/** attendance-board.tsx の buildInitialFields と同じ順 */
function preset(r: TransportRow, s: ScheduleDefaults): boolean {
  const base = initFields(r, END)
  const shown = isBlankFields(base) ? applyScheduleDefaults(base, s, END) : applyTransportDefaults(base, s)
  return isSchedulePresetFields(base, shown)
}

check('まだ何も入っていない記録は、予定で埋めるので「未保存」', () => {
  assert.equal(preset(row(), sched()), true)
})

check('いつも帰りだけの子：帰りを保存したあとは「未保存」と出さない（2026-11-19 の不具合）', () => {
  const saved = row({
    service_start_time: '15:25:00',
    service_end_time: '16:30:00',
    dropoff_departure_time: '16:30:00',
    dropoff_arrival_time: '16:40:00',
  })
  assert.equal(preset(saved, sched({ transportType: 'dropoff_only', pickupTime: null })), false)
})

check('いつも行きだけの子：行きを保存したあとは「未保存」と出さない', () => {
  const saved = row({
    service_start_time: '15:25:00',
    service_end_time: '17:00:00',
    pickup_departure_time: '15:15:00',
    pickup_arrival_time: '15:25:00',
  })
  assert.equal(preset(saved, sched({ transportType: 'pickup_only', dropoffTime: null })), false)
})

check('予定は行き帰りとも送迎で、帰りがまだ空なら、予定で埋めるので「未保存」', () => {
  const half = row({
    service_start_time: '15:25:00',
    pickup_departure_time: '15:15:00',
    pickup_arrival_time: '15:25:00',
  })
  assert.equal(preset(half, sched()), true)
})

check('行き帰りとも保存ずみなら「未保存」と出さない', () => {
  const full = row({
    service_start_time: '15:25:00',
    service_end_time: '16:30:00',
    pickup_departure_time: '15:15:00',
    pickup_arrival_time: '15:25:00',
    dropoff_departure_time: '16:30:00',
    dropoff_arrival_time: '16:40:00',
  })
  assert.equal(preset(full, sched()), false)
})

check('予定が送迎なしの子で、時間だけ保存ずみなら「未保存」と出さない', () => {
  const saved = row({ service_start_time: '15:30:00', service_end_time: '17:00:00' })
  assert.equal(preset(saved, sched({ transportType: 'none', pickupTime: null, dropoffTime: null })), false)
})

console.log(`\n${passed} 件すべて通りました`)
