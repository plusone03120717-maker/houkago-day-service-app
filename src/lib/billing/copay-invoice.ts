// 利用者（保護者）へ請求する負担金額を月次で組み立てる。
//
//   ① 放デイ給付費の1割 … billing_details.copay_amount（負担上限月額でキャップ済み）
//   ② 日中一時支援の1割 … 利用時間区分 × 児区分 の単位数表から算出（上限額とは別枠）
//   ③ 日中一時の送迎     … 片道あたり定額（facilities.daytime_transport_fee）
//   ④ 活動プログラム加算 … activity_programs.extra_charge（日々の記録の参加チェック）
//   ⑤ その他の実費       … billing_actual_costs
//
// 請求書・領収書はこの結果をスナップショットして billing_invoices に保存する。

import type { createClient } from '@/lib/supabase/server'
import {
  computeBillingDay,
  isItemChecked,
  timeToMinutes,
  type AttendanceLike,
  type DailyRecordLike,
  type ServiceItemLike,
} from './day-computation'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

export type InvoiceLineCategory = 'copay' | 'daytime' | 'daytime_transport' | 'extra' | 'actual'

export type InvoiceLine = {
  category: InvoiceLineCategory
  name: string
  /** 単価（円）。1割負担のように単価の概念がないものは null */
  unitPrice: number | null
  count: number
  amount: number
  /** 「8/3・8/5 ほか2日」などの補足 */
  detail?: string
}

export type DaytimeDay = {
  date: string
  startTime: string | null
  endTime: string | null
  minutes: number
  /** 1=2時間未満 2=2〜4時間 3=4〜6時間 4=6〜8時間 5=8時間以上 / null=時刻未入力 */
  timeCategory: 1 | 2 | 3 | 4 | 5 | null
  unitCount: number
  pickup: boolean
  dropoff: boolean
}

export type ChildInvoice = {
  childId: string
  childName: string
  unitId: string
  yearMonth: string

  /** ① 放デイ */
  totalDays: number
  totalUnits: number
  totalCost: number
  copayLimit: number
  benefitCopay: number
  /** 負担上限月額でキャップされた（1割そのままではない）か */
  copayCapped: boolean

  /** ② 日中一時 */
  daytimeCategory: 1 | 2 | 3 | null
  daytimeDays: DaytimeDay[]
  daytimeUnits: number
  daytimeCost: number
  daytimeCopay: number

  /** ③ 日中一時の送迎 */
  daytimeTransportCount: number
  daytimeTransportAmount: number

  /** ④⑤ */
  extraTotal: number
  actualTotal: number

  lines: InvoiceLine[]
  total: number
  warnings: string[]

  /** 発行済みの請求書 */
  issued: {
    id: string
    totalAmount: number
    issuedAt: string | null
    paidAt: string | null
    receiptNo: string | null
  } | null
}

export type MonthInvoices = {
  unitId: string
  unitName: string
  yearMonth: string
  unitPrice: number
  daytimeTransportFee: number
  children: ChildInvoice[]
  /** 集計できなかった理由 */
  fatal: string | null
}

export const TIME_CATEGORY_LABEL: Record<number, string> = {
  1: '2時間未満',
  2: '2時間以上4時間未満',
  3: '4時間以上6時間未満',
  4: '6時間以上8時間未満',
  5: '8時間以上',
}

/** 日中一時の利用時間（分）から時間区分を求める */
export function daytimeTimeCategory(minutes: number): 1 | 2 | 3 | 4 | 5 | null {
  if (minutes <= 0) return null
  if (minutes < 120) return 1
  if (minutes < 240) return 2
  if (minutes < 360) return 3
  if (minutes < 480) return 4
  return 5
}

function monthRange(yearMonth: string) {
  const year = parseInt(yearMonth.slice(0, 4))
  const month = parseInt(yearMonth.slice(4, 6))
  const lastDay = new Date(year, month, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}` }
}

function summarizeDates(dates: string[], max = 4): string {
  const shown = dates.slice(0, max).map((d) => `${parseInt(d.slice(5, 7))}/${parseInt(d.slice(8, 10))}`)
  const rest = dates.length - shown.length
  return rest > 0 ? `${shown.join('・')} ほか${rest}日` : shown.join('・')
}

export async function buildMonthInvoices(
  supabase: SupabaseLike,
  unitId: string,
  yearMonth: string,
): Promise<MonthInvoices> {
  const { start, end } = monthRange(yearMonth)

  const empty = (fatal: string): MonthInvoices => ({
    unitId, unitName: '', yearMonth, unitPrice: 10, daytimeTransportFee: 140, children: [], fatal,
  })

  // ── 施設・ユニット ────────────────────────────────────────
  const { data: unitRow } = await supabase
    .from('units')
    .select('id, name, facility_id, facilities (id, unit_price, daytime_transport_fee)')
    .eq('id', unitId)
    .maybeSingle()
  if (!unitRow) return empty('ユニットが見つかりません')

  const unit = unitRow as unknown as {
    id: string
    name: string
    facility_id: string
    facilities: { id: string; unit_price: number; daytime_transport_fee: number } | null
  }
  const facilityId = unit.facilities?.id ?? unit.facility_id
  const unitPrice = Number(unit.facilities?.unit_price ?? 10)
  const daytimeTransportFee = Number(unit.facilities?.daytime_transport_fee ?? 140)

  // ── 請求月 ────────────────────────────────────────────────
  const { data: monthly } = await supabase
    .from('billing_monthly')
    .select('id')
    .eq('unit_id', unitId)
    .eq('year_month', yearMonth)
    .maybeSingle()
  const billingMonthlyId = (monthly as { id: string } | null)?.id ?? null

  // ── ① 放デイの請求明細 ───────────────────────────────────
  const { data: detailsRaw } = billingMonthlyId
    ? await supabase
        .from('billing_details')
        .select('child_id, total_days, total_units, unit_price, copay_amount, children (id, name)')
        .eq('billing_monthly_id', billingMonthlyId)
    : { data: [] }
  const details = (detailsRaw ?? []) as unknown as Array<{
    child_id: string
    total_days: number
    total_units: number
    unit_price: number
    copay_amount: number
    children: { id: string; name: string } | null
  }>

  // ── 出席実績（日中一時・活動の集計元）───────────────────
  const { data: attRaw } = await supabase
    .from('daily_attendance')
    .select(
      'id, child_id, date, status, check_in_time, check_out_time, service_start_time, service_end_time,' +
      ' pickup_arrival_time, dropoff_arrival_time, daytime_support,' +
      ' daytime_support_start_time, daytime_support_end_time,' +
      ' daytime_pickup_arrival_time, daytime_dropoff_arrival_time,' +
      ' children (id, name)',
    )
    .eq('unit_id', unitId)
    .gte('date', start)
    .lte('date', end)
    .in('status', ['attended', 'absent'])
  const attendances = (attRaw ?? []) as unknown as Array<
    AttendanceLike & {
      child_id: string
      daytime_support_start_time: string | null
      daytime_support_end_time: string | null
      children: { id: string; name: string } | null
    }
  >

  const childIds = Array.from(new Set([...details.map((d) => d.child_id), ...attendances.map((a) => a.child_id)]))
  if (childIds.length === 0) {
    return { unitId, unitName: unit.name, yearMonth, unitPrice, daytimeTransportFee, children: [], fatal: null }
  }

  const attendedIds = attendances.filter((a) => a.status === 'attended').map((a) => a.id)

  const [
    { data: itemsRaw },
    { data: recordsRaw },
    { data: childrenRaw },
    { data: ratesRaw },
    { data: activitiesRaw },
    { data: costsRaw },
    { data: invoicesRaw },
  ] = await Promise.all([
    supabase
      .from('billing_service_items')
      .select('id, name, category, trigger_field')
      .eq('unit_id', unitId)
      .eq('is_active', true),
    supabase
      .from('billing_daily_records')
      .select('child_id, date, service_item_id, is_checked, billing_start_time, billing_end_time')
      .eq('unit_id', unitId)
      .gte('date', start)
      .lte('date', end),
    supabase
      .from('children')
      .select('id, name, daytime_support_category')
      .in('id', childIds),
    supabase
      .from('daytime_support_rates')
      .select('time_category, child_category, unit_count')
      .eq('facility_id', facilityId),
    attendedIds.length > 0
      ? supabase
          .from('daily_activities')
          .select('attendance_id, activity_programs (name, extra_charge)')
          .in('attendance_id', attendedIds)
          .eq('participated', true)
          .not('program_id', 'is', null)
      : Promise.resolve({ data: [] }),
    supabase
      .from('billing_actual_costs')
      .select('child_id, date, item_name, amount')
      .eq('unit_id', unitId)
      .gte('date', start)
      .lte('date', end),
    supabase
      .from('billing_invoices')
      .select('id, child_id, total_amount, issued_at, paid_at, receipt_no')
      .eq('year_month', yearMonth)
      .in('child_id', childIds),
  ])

  const serviceItems = (itemsRaw ?? []) as ServiceItemLike[]
  const basicItemIds = new Set(serviceItems.filter((i) => i.trigger_field === 'basic').map((i) => i.id))
  const daytimeItem = serviceItems.find((i) => i.trigger_field === 'daytime_support') ?? null
  const daytimePickupItem = serviceItems.find((i) => i.trigger_field === 'daytime_pickup') ?? null
  const daytimeDropoffItem = serviceItems.find((i) => i.trigger_field === 'daytime_dropoff') ?? null

  const recordsByChild = new Map<string, DailyRecordLike[]>()
  for (const r of (recordsRaw ?? []) as Array<DailyRecordLike & { child_id: string }>) {
    const list = recordsByChild.get(r.child_id) ?? []
    list.push(r)
    recordsByChild.set(r.child_id, list)
  }

  const childRows = (childrenRaw ?? []) as Array<{ id: string; name: string; daytime_support_category: number | null }>
  const childMap = new Map(childRows.map((c) => [c.id, c]))

  const rateMap = new Map<string, number>()
  for (const r of (ratesRaw ?? []) as Array<{ time_category: number; child_category: number; unit_count: number }>) {
    rateMap.set(`${r.time_category}-${r.child_category}`, r.unit_count)
  }

  // 活動プログラムの追加料金（児童 × プログラム名）
  const attIdToChild = new Map(attendances.map((a) => [a.id, a.child_id]))
  const attIdToDate = new Map(attendances.map((a) => [a.id, a.date]))
  const extraByChild = new Map<string, Map<string, { price: number; dates: string[] }>>()
  for (const act of (activitiesRaw ?? []) as unknown as Array<{
    attendance_id: string
    activity_programs: { name: string; extra_charge: number | null } | null
  }>) {
    const prog = act.activity_programs
    if (!prog || prog.extra_charge == null || prog.extra_charge <= 0) continue
    const childId = attIdToChild.get(act.attendance_id)
    const date = attIdToDate.get(act.attendance_id)
    if (!childId || !date) continue
    const byName = extraByChild.get(childId) ?? new Map<string, { price: number; dates: string[] }>()
    const entry = byName.get(prog.name) ?? { price: prog.extra_charge, dates: [] }
    entry.dates.push(date)
    byName.set(prog.name, entry)
    extraByChild.set(childId, byName)
  }

  const costsByChild = new Map<string, Array<{ date: string; item_name: string; amount: number }>>()
  for (const c of (costsRaw ?? []) as Array<{ child_id: string; date: string; item_name: string; amount: number }>) {
    const list = costsByChild.get(c.child_id) ?? []
    list.push(c)
    costsByChild.set(c.child_id, list)
  }

  const invoiceByChild = new Map(
    ((invoicesRaw ?? []) as Array<{
      id: string
      child_id: string
      total_amount: number
      issued_at: string | null
      paid_at: string | null
      receipt_no: string | null
    }>).map((i) => [i.child_id, i]),
  )

  const attByChild = new Map<string, typeof attendances>()
  for (const a of attendances) {
    const list = attByChild.get(a.child_id) ?? []
    list.push(a)
    attByChild.set(a.child_id, list)
  }

  const detailByChild = new Map(details.map((d) => [d.child_id, d]))

  // ── 児童ごとに組み立て ────────────────────────────────────
  const children: ChildInvoice[] = []

  for (const childId of childIds) {
    const detail = detailByChild.get(childId) ?? null
    const childRow = childMap.get(childId) ?? null
    const childName =
      childRow?.name ?? detail?.children?.name ?? attByChild.get(childId)?.[0]?.children?.name ?? '(不明)'
    const warnings: string[] = []
    const lines: InvoiceLine[] = []

    // ① 放デイ給付費の1割
    const totalDays = detail?.total_days ?? 0
    const totalUnits = detail?.total_units ?? 0
    const detailUnitPrice = Number(detail?.unit_price ?? unitPrice)
    const totalCost = Math.floor(totalUnits * detailUnitPrice)
    const benefitCopay = detail?.copay_amount ?? 0
    const tenPercent = Math.floor(totalCost / 10)
    const copayCapped = totalCost > 0 && benefitCopay < tenPercent

    if (!detail) {
      warnings.push('この月の請求明細がありません（請求管理で「出席実績から再集計」を実行してください）')
    } else if (totalUnits === 0 && totalDays > 0) {
      warnings.push('単位数が0です。設定 → 国保連サービスコード・単位数設定 で基本報酬の単位数を登録してください')
    }
    if (benefitCopay > 0) {
      lines.push({
        category: 'copay',
        name: '放課後等デイサービス 利用者負担（給付費の1割）',
        unitPrice: null,
        count: totalDays,
        amount: benefitCopay,
        detail: copayCapped
          ? `総費用額 ${totalCost.toLocaleString()}円 / 利用 ${totalDays}日 / 負担上限月額を適用`
          : `総費用額 ${totalCost.toLocaleString()}円 / 利用 ${totalDays}日`,
      })
    }

    // ② 日中一時支援
    const daytimeCategory = (childRow?.daytime_support_category ?? null) as 1 | 2 | 3 | null
    const dailyRecords = recordsByChild.get(childId) ?? []
    const daytimeDays: DaytimeDay[] = []
    let daytimeUnits = 0
    let transportCount = 0
    const missingDaytimeTime: string[] = []

    for (const att of (attByChild.get(childId) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))) {
      const day = computeBillingDay({
        date: att.date,
        attendance: att,
        dailyRecords,
        basicItemIds,
        isHoliday: false,
        participatedActivities: new Set(),
      })

      const usedDaytime = daytimeItem
        ? isItemChecked(
            daytimeItem,
            day,
            dailyRecords.find((r) => r.date === att.date && r.service_item_id === daytimeItem.id),
          )
        : day.daytimeSupport
      if (!usedDaytime) continue

      const s = att.daytime_support_start_time
      const e = att.daytime_support_end_time
      const minutes = s && e ? Math.max(0, timeToMinutes(e) - timeToMinutes(s)) : 0
      const timeCategory = daytimeTimeCategory(minutes)
      const unitCount = timeCategory && daytimeCategory ? (rateMap.get(`${timeCategory}-${daytimeCategory}`) ?? 0) : 0
      if (timeCategory === null) missingDaytimeTime.push(att.date)
      daytimeUnits += unitCount

      const pickup = daytimePickupItem
        ? isItemChecked(
            daytimePickupItem,
            day,
            dailyRecords.find((r) => r.date === att.date && r.service_item_id === daytimePickupItem.id),
          )
        : day.daytimeTransportPickup
      const dropoff = daytimeDropoffItem
        ? isItemChecked(
            daytimeDropoffItem,
            day,
            dailyRecords.find((r) => r.date === att.date && r.service_item_id === daytimeDropoffItem.id),
          )
        : day.daytimeTransportDropoff
      if (pickup) transportCount++
      if (dropoff) transportCount++

      daytimeDays.push({
        date: att.date,
        startTime: s?.slice(0, 5) ?? null,
        endTime: e?.slice(0, 5) ?? null,
        minutes,
        timeCategory,
        unitCount,
        pickup,
        dropoff,
      })
    }

    const daytimeCost = Math.floor(daytimeUnits * unitPrice)
    const daytimeCopay = Math.floor(daytimeCost / 10)
    const daytimeTransportAmount = transportCount * daytimeTransportFee

    if (daytimeDays.length > 0 && !daytimeCategory) {
      warnings.push('日中一時支援を利用していますが、児区分（1〜3）が未設定です（児童詳細 → 基本情報）')
    }
    if (missingDaytimeTime.length > 0) {
      warnings.push(`日中一時支援の利用時間が未入力の日があります: ${summarizeDates(missingDaytimeTime)}`)
    }
    if (daytimeCopay > 0) {
      lines.push({
        category: 'daytime',
        name: '日中一時支援 利用者負担（1割）',
        unitPrice: null,
        count: daytimeDays.length,
        amount: daytimeCopay,
        detail: `${daytimeUnits.toLocaleString()}単位 / 総額 ${daytimeCost.toLocaleString()}円 / 利用 ${daytimeDays.length}日`,
      })
    }
    if (daytimeTransportAmount > 0) {
      lines.push({
        category: 'daytime_transport',
        name: '日中一時支援 送迎費',
        unitPrice: daytimeTransportFee,
        count: transportCount,
        amount: daytimeTransportAmount,
        detail: `片道 ${transportCount}回`,
      })
    }

    // ④ 活動プログラムの追加料金
    let extraTotal = 0
    for (const [name, entry] of extraByChild.get(childId) ?? new Map<string, { price: number; dates: string[] }>()) {
      const amount = entry.price * entry.dates.length
      extraTotal += amount
      lines.push({
        category: 'extra',
        name,
        unitPrice: entry.price,
        count: entry.dates.length,
        amount,
        detail: summarizeDates(entry.dates.slice().sort()),
      })
    }

    // ⑤ その他の実費
    let actualTotal = 0
    for (const c of costsByChild.get(childId) ?? []) {
      actualTotal += c.amount
      lines.push({
        category: 'actual',
        name: c.item_name,
        unitPrice: null,
        count: 1,
        amount: c.amount,
        detail: `${parseInt(c.date.slice(5, 7))}/${parseInt(c.date.slice(8, 10))}`,
      })
    }

    const total = lines.reduce((s, l) => s + l.amount, 0)
    const issued = invoiceByChild.get(childId) ?? null

    children.push({
      childId,
      childName,
      unitId,
      yearMonth,
      totalDays,
      totalUnits,
      totalCost,
      copayLimit: copayCapped ? benefitCopay : 0,
      benefitCopay,
      copayCapped,
      daytimeCategory,
      daytimeDays,
      daytimeUnits,
      daytimeCost,
      daytimeCopay,
      daytimeTransportCount: transportCount,
      daytimeTransportAmount,
      extraTotal,
      actualTotal,
      lines,
      total,
      warnings,
      issued: issued
        ? {
            id: issued.id,
            totalAmount: issued.total_amount,
            issuedAt: issued.issued_at,
            paidAt: issued.paid_at,
            receiptNo: issued.receipt_no,
          }
        : null,
    })
  }

  children.sort((a, b) => a.childName.localeCompare(b.childName, 'ja'))

  return { unitId, unitName: unit.name, yearMonth, unitPrice, daytimeTransportFee, children, fatal: null }
}
