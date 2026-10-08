// 児童発達支援の日別判定（提供形態なし・区分3まで・5時間超が延長）を確かめる。
//   npx tsx scripts/verify-development-support-day.ts
import { computeBillingDay, type AttendanceLike } from '../src/lib/billing/day-computation'

const att = (date: string, start: string, end: string): AttendanceLike =>
  ({
    status: 'attended', check_in_time: start, check_out_time: end, service_start_time: start, service_end_time: end,
    pickup_arrival_time: null, dropoff_arrival_time: null, daytime_support: false,
    daytime_pickup_arrival_time: null, daytime_dropoff_arrival_time: null, service_form_override: null,
    date,
  }) as unknown as AttendanceLike

const day = (date: string, start: string, end: string, isHoliday: boolean, serviceType: string) =>
  computeBillingDay({
    date, attendance: att(date, start, end), dailyRecords: [], basicItemIds: new Set(),
    isHoliday, participatedActivities: new Set(), serviceType,
  })

const cases = [
  // 三枝曜 9月の明細書: 9:25〜11:00（1時間35分）→ 児発 区分2（61JH16）
  { label: '児発 平日 1時間35分 → 区分2', d: day('2026-09-01', '09:25:00', '11:00:00', false, 'development_support'), category: 2, form: 1, ext: 0 },
  // 祝日でも児発は提供形態なし（休日の単位数を探さない）
  { label: '児発 祝日 2時間30分 → 区分2・提供形態1', d: day('2026-09-21', '09:00:00', '11:30:00', true, 'development_support'), category: 2, form: 1, ext: 0 },
  { label: '児発 4時間 → 区分3・延長なし（平日3時間の基準を使わない）', d: day('2026-09-02', '10:00:00', '14:00:00', false, 'development_support'), category: 3, form: 1, ext: 0 },
  { label: '児発 6時間 → 区分3・延長2', d: day('2026-09-02', '10:00:00', '16:00:00', false, 'development_support'), category: 3, form: 1, ext: 2 },
  // 放デイは今まで通り（宮下大生 9/21: 休日 10:00〜16:00 → 区分4・延長2）
  { label: '放デイ 休日 6時間 → 区分4・延長2', d: day('2026-09-21', '10:00:00', '16:00:00', true, 'afterschool'), category: 4, form: 2, ext: 2 },
  { label: '放デイ 平日 4時間 → 区分3・延長2', d: day('2026-09-02', '13:00:00', '17:00:00', false, 'afterschool'), category: 3, form: 1, ext: 2 },
]

let failed = 0
for (const c of cases) {
  const ok = c.d.billingCategory === c.category && c.d.serviceFormType === c.form && c.d.extensionLevel === c.ext
  if (!ok) failed++
  console.log(`${ok ? 'OK ' : 'NG '} ${c.label}（区分${c.d.billingCategory}・提供形態${c.d.serviceFormType}・延長${c.d.extensionLevel}）`)
}
if (failed > 0) process.exit(1)
