'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, Loader2, Plus, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isJapaneseNationalHoliday } from '@/lib/japanese-holidays'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type ServiceItem = {
  id: string
  unit_id: string
  name: string
  category: '基本' | '加算' | '保険外'
  trigger_field: 'basic' | 'transport_pickup' | 'transport_dropoff' | 'daytime_support' | 'manual'
  billing_code: string | null
  is_active: boolean
  sort_order: number
}

type DailyAttendance = {
  id: string
  date: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  service_start_time: string | null
  service_end_time: string | null
  pickup_type: string
  pickup_arrival_time: string | null
  dropoff_arrival_time: string | null
  daytime_support: boolean
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
}

type ActivityRecord = {
  attendance_id: string
  participated: boolean
  activity_programs: { name: string } | null
}

type SchoolHoliday = {
  start_date: string
  end_date: string
  label: string
}

type BillingDailyRecord = {
  id: string
  date: string
  service_item_id: string | null
  is_checked: boolean
  billing_start_time: string | null
  billing_end_time: string | null
}

type DayComputed = {
  date: string
  isAttended: boolean
  isAbsent: boolean
  attendance: DailyAttendance | null
  isSchoolHoliday: boolean
  serviceFormType: 1 | 2
  startTime: string | null
  endTime: string | null
  durationMinutes: number
  hoursCalculated: number
  billingCategory: 0 | 1 | 2 | null
  transportPickup: boolean
  transportDropoff: boolean
  daytimeSupport: boolean
  participatedActivities: Set<string>
}

// ─────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function calcHours(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 0
  const dur = timeToMinutes(endTime) - timeToMinutes(startTime)
  if (dur <= 0) return 0
  return Math.floor(dur / 30) * 0.5
}

function getBillingCategory(hours: number, hasValidTimes: boolean): 0 | 1 | 2 | null {
  if (!hasValidTimes) return null
  if (hours <= 0) return 0   // 30分未満（30分単位で切り捨て → 0h）
  if (hours <= 1.5) return 1 // 30分以上〜1時間30分以下
  return 2                   // 1時間30分超
}

function isSchoolHolidayDate(dateStr: string, holidays: SchoolHoliday[]): boolean {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return true  // 土日
  return holidays.some((h) => h.start_date <= dateStr && dateStr <= h.end_date)
}

function getDaysInMonth(yearMonth: string): string[] {
  const [y, m] = yearMonth.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, i) =>
    `${yearMonth}-${String(i + 1).padStart(2, '0')}`
  )
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']
const CATEGORY_COLORS: Record<ServiceItem['category'], string> = {
  '基本': 'bg-teal-100 text-teal-700',
  '加算': 'bg-indigo-100 text-indigo-700',
  '保険外': 'bg-amber-100 text-amber-700',
}

// ─────────────────────────────────────────────────────────────
// Circle component
// ─────────────────────────────────────────────────────────────

function BillingCircle({
  value,
  variant = 'actual',
  small = false,
}: {
  value: number | string
  variant?: 'plan' | 'actual'
  small?: boolean
}) {
  if (variant === 'plan') {
    return (
      <span className={`inline-flex items-center justify-center rounded-full border-2 border-yellow-400 text-yellow-600 font-bold ${small ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-[10px]'}`}>
        {value}
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center justify-center rounded-full bg-orange-500 text-white font-bold ${small ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-[10px]'}`}>
      {value}
    </span>
  )
}

function FormTypeCircle({ type, small = false }: { type: 1 | 2; small?: boolean }) {
  const cls = type === 1
    ? `inline-flex items-center justify-center rounded-full border-2 border-red-500 text-red-600 font-bold ${small ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-[10px]'}`
    : `inline-flex items-center justify-center rounded-full border-2 border-blue-500 text-blue-600 font-bold ${small ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-[10px]'}`
  return <span className={cls}>{type}</span>
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function BillingChildMonthlyView({
  childId,
  childName,
  unitId,
  yearMonth,
  serviceItems: initialServiceItems,
  certInfo,
  facilityId,
}: {
  childId: string
  childName: string
  unitId: string
  yearMonth: string
  serviceItems: ServiceItem[]
  certInfo: { certificate_number?: string; max_days_per_month?: number; copay_limit?: number; municipality?: string } | null
  facilityId?: string | null
}) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const [attendances, setAttendances] = useState<DailyAttendance[]>([])
  const [schoolHolidays, setSchoolHolidays] = useState<SchoolHoliday[]>([])
  const [publicHolidays, setPublicHolidays] = useState<string[]>([])
  const [manualRecords, setManualRecords] = useState<BillingDailyRecord[]>([])
  const [activityMap, setActivityMap] = useState<Map<string, Set<string>>>(new Map())
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>(initialServiceItems)
  const [showAddItem, setShowAddItem] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemCategory, setNewItemCategory] = useState<'基本' | '加算' | '保険外'>('加算')
  const [newItemTrigger, setNewItemTrigger] = useState<ServiceItem['trigger_field']>('manual')
  const [monthOffset, setMonthOffset] = useState(0)

  // Compute effective yearMonth with offset
  const [y, m] = yearMonth.split('-').map(Number)
  const effDate = new Date(y, m - 1 + monthOffset, 1)
  const effYearMonth = `${effDate.getFullYear()}-${String(effDate.getMonth() + 1).padStart(2, '0')}`
  const days = getDaysInMonth(effYearMonth)

  // ── Fetch data ──────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const monthStart = days[0]
    const monthEnd = days[days.length - 1]

    // Step 1: 出席レコードを取得（活動取得のためIDが必要）
    const { data: attData } = await supabase
      .from('daily_attendance')
      .select('id, date, status, check_in_time, check_out_time, service_start_time, service_end_time, pickup_type, pickup_arrival_time, dropoff_arrival_time, daytime_support, daytime_support_start_time, daytime_support_end_time')
      .eq('child_id', childId)
      .eq('unit_id', unitId)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .in('status', ['attended', 'absent'])

    // 活動記録の取得は出席日のみ
    const attendanceIds = (attData ?? [])
      .filter((a: { id: string; status: string }) => a.status === 'attended')
      .map((a: { id: string }) => a.id)

    // Step 2: 残りを並列取得
    const [{ data: holidayData }, { data: publicHolidayData }, { data: recordData }, { data: actData }] = await Promise.all([
      supabase
        .from('child_school_holidays')
        .select('start_date, end_date, label')
        .eq('child_id', childId)
        .lte('start_date', monthEnd)
        .gte('end_date', monthStart),
      facilityId
        ? supabase
            .from('facility_events')
            .select('event_date')
            .eq('facility_id', facilityId)
            .eq('event_type', 'holiday')
            .gte('event_date', monthStart)
            .lte('event_date', monthEnd)
        : { data: [] },
      supabase
        .from('billing_daily_records')
        .select('id, date, service_item_id, is_checked, billing_start_time, billing_end_time')
        .eq('child_id', childId)
        .eq('unit_id', unitId)
        .gte('date', monthStart)
        .lte('date', monthEnd),
      attendanceIds.length > 0
        ? supabase
            .from('daily_activities')
            .select('attendance_id, participated, activity_programs(name)')
            .in('attendance_id', attendanceIds)
            .eq('participated', true)
        : { data: [] },
    ])

    setAttendances((attData ?? []) as DailyAttendance[])
    setSchoolHolidays((holidayData ?? []) as SchoolHoliday[])
    setPublicHolidays((publicHolidayData ?? []).map((h: { event_date: string }) => h.event_date))
    setManualRecords((recordData ?? []) as BillingDailyRecord[])

    // 日付ごとの参加活動名セットを構築
    const attIdToDate = new Map((attData ?? []).map((a: { id: string; date: string }) => [a.id, a.date]))
    const newActivityMap = new Map<string, Set<string>>()
    for (const act of (actData ?? []) as unknown as { attendance_id: string; activity_programs: { name: string } | null }[]) {
      const date = attIdToDate.get(act.attendance_id)
      if (!date) continue
      const progName = act.activity_programs?.name
      if (!progName) continue
      if (!newActivityMap.has(date)) newActivityMap.set(date, new Set())
      newActivityMap.get(date)!.add(progName)
    }
    setActivityMap(newActivityMap)

    setLoading(false)
  }, [childId, unitId, effYearMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  // ── Compute day data ────────────────────────────────────────
  const attMap = new Map(attendances.map((a) => [a.date, a]))

  const computeDay = (dateStr: string): DayComputed => {
    const att = attMap.get(dateStr) ?? null
    const isAttended = att?.status === 'attended'
    const isAbsent = att?.status === 'absent'
    const isHoliday = isSchoolHolidayDate(dateStr, schoolHolidays) || publicHolidays.includes(dateStr) || isJapaneseNationalHoliday(dateStr)
    const serviceFormType: 1 | 2 = isHoliday ? 2 : 1

    // Check for billing_start_time override
    const basicRecord = manualRecords.find((r) => {
      const item = serviceItems.find((i) => i.id === r.service_item_id)
      return item?.trigger_field === 'basic' && r.date === dateStr
    })
    const startTime = basicRecord?.billing_start_time ?? att?.service_start_time ?? att?.check_in_time ?? null
    const endTime = basicRecord?.billing_end_time ?? att?.service_end_time ?? att?.check_out_time ?? null

    const hours = calcHours(startTime, endTime)
    const billingCategory = getBillingCategory(hours, startTime !== null && endTime !== null)

    return {
      date: dateStr,
      isAttended,
      isAbsent,
      attendance: att,
      isSchoolHoliday: isHoliday,
      serviceFormType,
      startTime: startTime?.slice(0, 5) ?? null,
      endTime: endTime?.slice(0, 5) ?? null,
      durationMinutes: startTime && endTime ? timeToMinutes(endTime) - timeToMinutes(startTime) : 0,
      hoursCalculated: hours,
      billingCategory,
      transportPickup: att
        ? (att.pickup_arrival_time != null || ['both', 'pickup_only'].includes(att.pickup_type))
        : false,
      transportDropoff: att
        ? (att.dropoff_arrival_time != null || ['both', 'dropoff_only'].includes(att.pickup_type))
        : false,
      daytimeSupport: att?.daytime_support ?? false,
      participatedActivities: activityMap.get(dateStr) ?? new Set(),
    }
  }

  const dayDataMap = new Map(days.map((d) => [d, computeDay(d)]))

  // ── Check if item is auto-triggered ────────────────────────
  const isAutoTriggered = (item: ServiceItem, d: DayComputed): boolean => {
    if (!d.isAttended) return false
    switch (item.trigger_field) {
      case 'basic': return true
      case 'transport_pickup': return d.transportPickup
      case 'transport_dropoff': return d.transportDropoff
      case 'daytime_support': return d.daytimeSupport
      case 'manual': return d.participatedActivities.has(item.name)
    }
  }

  const getManualRecord = (itemId: string, dateStr: string) =>
    manualRecords.find((r) => r.service_item_id === itemId && r.date === dateStr)

  const isItemChecked = (item: ServiceItem, dateStr: string, d: DayComputed): boolean => {
    const rec = getManualRecord(item.id, dateStr)
    if (rec !== undefined) return rec.is_checked
    return isAutoTriggered(item, d)
  }

  const getCircleValue = (item: ServiceItem, d: DayComputed): number => {
    if (item.trigger_field === 'basic') return d.billingCategory ?? 1
    return 1
  }

  // ── Toggle item check ───────────────────────────────────────
  const toggleItem = async (item: ServiceItem, dateStr: string, newChecked: boolean) => {
    setSaving(`${item.id}-${dateStr}`)
    const d = dayDataMap.get(dateStr)!
    const autoState = isAutoTriggered(item, d)

    if (newChecked === autoState) {
      // Return to auto state: delete manual record if it exists
      const rec = getManualRecord(item.id, dateStr)
      if (rec) {
        await supabase.from('billing_daily_records').delete().eq('id', rec.id)
        setManualRecords((prev) => prev.filter((r) => r.id !== rec.id))
      }
    } else {
      // Override: upsert
      const payload = {
        child_id: childId,
        unit_id: unitId,
        date: dateStr,
        year_month: effYearMonth,
        service_item_id: item.id,
        is_checked: newChecked,
      }
      const { data, error } = await supabase
        .from('billing_daily_records')
        .upsert(payload, { onConflict: 'child_id,unit_id,date,service_item_id' })
        .select('id, date, service_item_id, is_checked, billing_start_time, billing_end_time')
        .single()
      if (!error && data) {
        setManualRecords((prev) => {
          const filtered = prev.filter((r) => !(r.date === dateStr && r.service_item_id === item.id))
          return [...filtered, data as BillingDailyRecord]
        })
      }
    }
    setSaving(null)
  }

  // ── Update billing times ────────────────────────────────────
  const updateBillingTimes = async (
    itemId: string,
    dateStr: string,
    field: 'billing_start_time' | 'billing_end_time',
    value: string
  ) => {
    const existing = getManualRecord(itemId, dateStr)
    const payload = {
      child_id: childId,
      unit_id: unitId,
      date: dateStr,
      year_month: effYearMonth,
      service_item_id: itemId,
      is_checked: true,
      [field]: value || null,
    }
    const { data, error } = await supabase
      .from('billing_daily_records')
      .upsert({ ...(existing ?? {}), ...payload }, { onConflict: 'child_id,unit_id,date,service_item_id' })
      .select('id, date, service_item_id, is_checked, billing_start_time, billing_end_time')
      .single()
    if (!error && data) {
      setManualRecords((prev) => {
        const filtered = prev.filter((r) => !(r.date === dateStr && r.service_item_id === itemId))
        return [...filtered, data as BillingDailyRecord]
      })
    }
  }

  // ── Add default service items ───────────────────────────────
  const addDefaultItems = async () => {
    const defaults: Omit<ServiceItem, 'id' | 'billing_code'>[] = [
      { unit_id: unitId, name: '放デイ基本報酬', category: '基本', trigger_field: 'basic', is_active: true, sort_order: 1 },
      { unit_id: unitId, name: '日中一時支援', category: '基本', trigger_field: 'daytime_support', is_active: true, sort_order: 2 },
      { unit_id: unitId, name: '送迎加算（迎え）', category: '加算', trigger_field: 'transport_pickup', is_active: true, sort_order: 3 },
      { unit_id: unitId, name: '送迎加算（送り）', category: '加算', trigger_field: 'transport_dropoff', is_active: true, sort_order: 4 },
      { unit_id: unitId, name: '専門的支援実施加算', category: '加算', trigger_field: 'manual', is_active: true, sort_order: 5 },
      { unit_id: unitId, name: 'おやつ', category: '保険外', trigger_field: 'manual', is_active: true, sort_order: 6 },
      { unit_id: unitId, name: '学習教材', category: '保険外', trigger_field: 'manual', is_active: true, sort_order: 7 },
    ]
    const { data } = await supabase
      .from('billing_service_items')
      .insert(defaults.map((d) => ({ ...d, billing_code: null })))
      .select('id, unit_id, name, category, trigger_field, billing_code, is_active, sort_order')
    if (data) {
      setServiceItems(data as ServiceItem[])
    }
    router.refresh()
  }

  // ── Add new service item ────────────────────────────────────
  const addServiceItem = async () => {
    if (!newItemName.trim()) return
    const { data } = await supabase
      .from('billing_service_items')
      .insert({
        unit_id: unitId,
        name: newItemName.trim(),
        category: newItemCategory,
        trigger_field: newItemTrigger,
        is_active: true,
        sort_order: (serviceItems[serviceItems.length - 1]?.sort_order ?? 0) + 1,
        billing_code: null,
      })
      .select('id, unit_id, name, category, trigger_field, billing_code, is_active, sort_order')
      .single()
    if (data) {
      setServiceItems((prev) => [...prev, data as ServiceItem])
    }
    setNewItemName('')
    setShowAddItem(false)
  }

  // ── Month label ─────────────────────────────────────────────
  const [ey, em] = effYearMonth.split('-').map(Number)
  const monthLabel = `${ey}年${em}月`

  const attendedDays = days
    .map((d) => dayDataMap.get(d)!)
    .filter((d) => d.isAttended)

  // ── Count helper ────────────────────────────────────────────
  const countChecked = (item: ServiceItem) =>
    days.filter((d) => isItemChecked(item, d, dayDataMap.get(d)!)).length

  const hasDaytimeItems = serviceItems.some((i) => i.trigger_field === 'daytime_support')
  const daytimeSupportItem = serviceItems.find((i) => i.trigger_field === 'daytime_support') ?? null

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* 月選択 */}
      <div className="flex items-center gap-3">
        <button onClick={() => setMonthOffset((o) => o - 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-lg font-semibold text-gray-900 min-w-[100px] text-center">{monthLabel}</span>
        <button onClick={() => setMonthOffset((o) => o + 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* サービス項目なし → 初期設定 */}
          {serviceItems.length === 0 && (
            <div className="text-center py-8 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700 mb-3">サービス項目が設定されていません</p>
              <Button onClick={addDefaultItems} size="sm" variant="outline">
                デフォルト項目を追加
              </Button>
            </div>
          )}

          {/* ── 月次グリッド（第1スクリーンショット） ────────── */}
          {serviceItems.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">月次サービス実績</h2>
                <span className="text-xs text-gray-400">
                  出席 {attendedDays.length}日
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse min-w-max">
                  <thead>
                    <tr className="bg-[#f5f0e8]">
                      <th className="border border-gray-300 px-2 py-1.5 text-left min-w-[160px] sticky left-0 bg-[#f5f0e8] z-10">
                        サービス内容
                      </th>
                      <th className="border border-gray-300 px-1 py-1.5 w-8 text-center sticky left-[160px] bg-[#f5f0e8] z-10">

                      </th>
                      {days.map((d) => {
                        const day = new Date(d + 'T00:00:00')
                        const dow = day.getDay()
                        const isSat = dow === 6
                        const isSun = dow === 0
                        const dd = dayDataMap.get(d)!
                        return (
                          <th
                            key={d}
                            className={`border border-gray-300 w-7 px-0.5 py-1 text-center font-medium ${
                              isSat ? 'text-blue-600 bg-blue-50' : isSun ? 'text-red-500 bg-red-50' : ''
                            }`}
                          >
                            <div>{day.getDate()}</div>
                            <div className="text-[8px] font-normal">{DAY_LABELS[dow]}</div>
                            {dd.isAbsent && (
                              <div className="text-[7px] text-gray-400 font-normal leading-none mt-0.5">欠</div>
                            )}
                          </th>
                        )
                      })}
                      <th className="border border-gray-300 px-2 py-1.5 text-center w-12">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceItems.map((item) => {
                      const total = countChecked(item)
                      return [
                        // 実績行
                        <tr key={`${item.id}-actual`}>
                          <td
                            className="border border-gray-300 px-2 py-1 sticky left-0 bg-white z-10"
                            rowSpan={1}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] px-1 rounded font-medium ${CATEGORY_COLORS[item.category]}`}>
                                {item.category}
                              </span>
                              <span className="text-gray-800 font-medium leading-tight">{item.name}</span>
                            </div>
                          </td>
                          <td className="border border-gray-300 px-1 py-1 text-center sticky left-[160px] bg-white z-10 text-gray-500 text-[10px]">
                            実績
                          </td>
                          {days.map((d) => {
                            const dd = dayDataMap.get(d)!
                            const checked = isItemChecked(item, d, dd)
                            const isSaving = saving === `${item.id}-${d}`
                            const circleVal = getCircleValue(item, dd)
                            const dow = new Date(d + 'T00:00:00').getDay()
                            return (
                              <td
                                key={d}
                                className={`border border-gray-300 w-7 p-0.5 text-center cursor-pointer hover:bg-gray-50 transition-colors ${
                                  dow === 6 ? 'bg-blue-50/50' : dow === 0 ? 'bg-red-50/50' : dd.isAbsent ? 'bg-gray-100/70' : ''
                                }`}
                                onClick={() => toggleItem(item, d, !checked)}
                                title={dd.isAbsent ? `${d} (欠席)` : d}
                              >
                                {isSaving ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-gray-400 mx-auto" />
                                ) : checked ? (
                                  <div className="flex justify-center">
                                    <BillingCircle value={circleVal} small />
                                  </div>
                                ) : null}
                              </td>
                            )
                          })}
                          <td className="border border-gray-300 px-2 py-1 text-center font-bold text-indigo-700">
                            {total}
                          </td>
                        </tr>,
                      ]
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── 日別明細（第2スクリーンショット） ───────────── */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700">サービス提供実績（日別）</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-[#f5f0e8] text-xs">
                    <th className="border border-gray-300 px-3 py-2 text-left font-medium text-gray-600 w-28">日付</th>
                    <th className="border border-gray-300 px-2 py-2 text-center font-medium text-gray-600 w-20">提供形態</th>
                    <th className="border border-gray-300 px-2 py-2 text-center font-medium text-gray-600 w-24">開始時間</th>
                    <th className="border border-gray-300 px-2 py-2 text-center font-medium text-gray-600 w-24">終了時間</th>
                    <th className="border border-gray-300 px-2 py-2 text-center font-medium text-gray-600 w-24">算定時間数</th>
                    <th className="border border-gray-300 px-2 py-2 text-center font-medium text-gray-600 w-20" colSpan={2}>送迎加算</th>
                    {hasDaytimeItems && (
                      <th className="border border-gray-300 px-2 py-2 text-center font-medium text-gray-600 bg-purple-50" colSpan={4}>日中一時支援</th>
                    )}
                  </tr>
                  <tr className="bg-[#f5f0e8] text-[10px]">
                    <th className="border border-gray-300" />
                    <th className="border border-gray-300" />
                    <th className="border border-gray-300" />
                    <th className="border border-gray-300" />
                    <th className="border border-gray-300" />
                    <th className="border border-gray-300 px-2 py-1 text-center text-gray-500">往</th>
                    <th className="border border-gray-300 px-2 py-1 text-center text-gray-500">復</th>
                    {hasDaytimeItems && (
                      <>
                        <th className="border border-gray-300 px-1 py-1 text-center text-gray-500 bg-purple-50">開始</th>
                        <th className="border border-gray-300 px-1 py-1 text-center text-gray-500 bg-purple-50">終了</th>
                        <th className="border border-gray-300 px-1 py-1 text-center text-gray-500 bg-purple-50">往</th>
                        <th className="border border-gray-300 px-1 py-1 text-center text-gray-500 bg-purple-50">復</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {days.map((dateStr) => {
                    const d = dayDataMap.get(dateStr)!
                    if (!d.isAttended && !d.isAbsent) return null

                    const dow = new Date(dateStr + 'T00:00:00').getDay()
                    const dayLabel = `${parseInt(dateStr.slice(8))}日（${DAY_LABELS[dow]}）`
                    const basicItem = serviceItems.find((i) => i.trigger_field === 'basic')
                    const basicRec = basicItem ? getManualRecord(basicItem.id, dateStr) : null

                    // 欠席行
                    if (d.isAbsent) {
                      return (
                        <tr key={dateStr} className="bg-gray-50 text-gray-400">
                          <td className="border border-gray-200 px-3 py-2 text-gray-500 font-medium">
                            {dayLabel}
                          </td>
                          <td className="border border-gray-200 px-2 py-2 text-center">
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 text-[10px] font-medium whitespace-nowrap">
                              欠席
                            </span>
                          </td>
                          <td className="border border-gray-200 px-2 py-2 text-center text-gray-300 text-xs">—</td>
                          <td className="border border-gray-200 px-2 py-2 text-center text-gray-300 text-xs">—</td>
                          <td className="border border-gray-200 px-2 py-2 text-center text-gray-300 text-xs">—</td>
                          <td className="border border-gray-200 px-2 py-2 text-center text-gray-300 text-xs">—</td>
                          <td className="border border-gray-200 px-2 py-2 text-center text-gray-300 text-xs">—</td>
                          {hasDaytimeItems && (
                            <>
                              <td className="border border-gray-200 px-2 py-2 text-center text-gray-300 text-xs bg-purple-50/30">—</td>
                              <td className="border border-gray-200 px-2 py-2 text-center text-gray-300 text-xs bg-purple-50/30">—</td>
                              <td className="border border-gray-200 px-2 py-2 text-center text-gray-300 text-xs bg-purple-50/30">—</td>
                              <td className="border border-gray-200 px-2 py-2 text-center text-gray-300 text-xs bg-purple-50/30">—</td>
                            </>
                          )}
                        </tr>
                      )
                    }

                    const startTimeVal = basicRec?.billing_start_time?.slice(0, 5) ?? d.startTime ?? ''
                    const endTimeVal = basicRec?.billing_end_time?.slice(0, 5) ?? d.endTime ?? ''

                    // Recompute hours if overridden
                    const overriddenHours = calcHours(startTimeVal, endTimeVal)
                    const overriddenCategory = getBillingCategory(overriddenHours, startTimeVal !== '' && endTimeVal !== '')

                    // 日中一時支援の時間（billing override → 出席記録の順）
                    const daytimeRec = daytimeSupportItem && d.daytimeSupport
                      ? getManualRecord(daytimeSupportItem.id, dateStr)
                      : null
                    const dtStartVal = daytimeRec?.billing_start_time?.slice(0, 5)
                      ?? d.attendance?.daytime_support_start_time?.slice(0, 5) ?? ''
                    const dtEndVal = daytimeRec?.billing_end_time?.slice(0, 5)
                      ?? d.attendance?.daytime_support_end_time?.slice(0, 5) ?? ''

                    return (
                      <tr key={dateStr} className={`hover:bg-gray-50 ${d.isSchoolHoliday ? 'bg-blue-50/30' : ''}`}>
                        <td className="border border-gray-200 px-3 py-2 text-gray-700 font-medium">
                          {dayLabel}
                        </td>
                        <td className="border border-gray-200 px-2 py-2 text-center">
                          <FormTypeCircle type={d.serviceFormType} />
                          <div className="text-[9px] text-gray-400 mt-0.5">
                            {d.serviceFormType === 1 ? '平日' : '休日'}
                          </div>
                        </td>
                        <td className="border border-gray-200 px-2 py-2 text-center">
                          <input
                            type="time"
                            defaultValue={startTimeVal}
                            className="text-xs border border-gray-200 rounded px-1.5 py-0.5 w-full text-center"
                            onBlur={(e) => {
                              if (!basicItem) return
                              updateBillingTimes(basicItem.id, dateStr, 'billing_start_time', e.target.value)
                            }}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-2 text-center">
                          <input
                            type="time"
                            defaultValue={endTimeVal}
                            className="text-xs border border-gray-200 rounded px-1.5 py-0.5 w-full text-center"
                            onBlur={(e) => {
                              if (!basicItem) return
                              updateBillingTimes(basicItem.id, dateStr, 'billing_end_time', e.target.value)
                            }}
                          />
                        </td>
                        <td className="border border-gray-200 px-2 py-2 text-center">
                          {overriddenCategory !== null ? (
                            <div>
                              <BillingCircle value={overriddenCategory} />
                              <div className="text-[9px] text-gray-400 mt-0.5">{overriddenHours}h</div>
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="border border-gray-200 px-2 py-2 text-center">
                          {d.transportPickup ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold">1</span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="border border-gray-200 px-2 py-2 text-center">
                          {d.transportDropoff ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold">1</span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        {hasDaytimeItems && (
                          <>
                            {/* 日中一時 開始時間 */}
                            <td className="border border-gray-200 px-2 py-2 text-center bg-purple-50/30">
                              {d.daytimeSupport ? (
                                <input
                                  type="time"
                                  defaultValue={dtStartVal}
                                  className="text-xs border border-gray-200 rounded px-1.5 py-0.5 w-full text-center"
                                  onBlur={(e) => {
                                    if (!daytimeSupportItem) return
                                    updateBillingTimes(daytimeSupportItem.id, dateStr, 'billing_start_time', e.target.value)
                                  }}
                                />
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            {/* 日中一時 終了時間 */}
                            <td className="border border-gray-200 px-2 py-2 text-center bg-purple-50/30">
                              {d.daytimeSupport ? (
                                <input
                                  type="time"
                                  defaultValue={dtEndVal}
                                  className="text-xs border border-gray-200 rounded px-1.5 py-0.5 w-full text-center"
                                  onBlur={(e) => {
                                    if (!daytimeSupportItem) return
                                    updateBillingTimes(daytimeSupportItem.id, dateStr, 'billing_end_time', e.target.value)
                                  }}
                                />
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            {/* 日中一時 送迎往 */}
                            <td className="border border-gray-200 px-2 py-2 text-center bg-purple-50/30">
                              {d.daytimeSupport && d.transportPickup ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold">1</span>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            {/* 日中一時 送迎復 */}
                            <td className="border border-gray-200 px-2 py-2 text-center bg-purple-50/30">
                              {d.daytimeSupport && d.transportDropoff ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold">1</span>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                  {attendedDays.length === 0 && (
                    <tr>
                      <td colSpan={hasDaytimeItems ? 11 : 7} className="border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
                        この月の実績記録がありません
                      </td>
                    </tr>
                  )}
                </tbody>
                {attendedDays.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#f5f0e8]">
                      <td className="border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600">
                        合計 {attendedDays.length}日
                      </td>
                      <td className="border border-gray-300" />
                      <td className="border border-gray-300" />
                      <td className="border border-gray-300" />
                      <td className="border border-gray-300" />
                      <td className="border border-gray-300 text-center text-xs font-bold text-gray-700">
                        {attendedDays.filter((d) => d.transportPickup).length}
                      </td>
                      <td className="border border-gray-300 text-center text-xs font-bold text-gray-700">
                        {attendedDays.filter((d) => d.transportDropoff).length}
                      </td>
                      {hasDaytimeItems && (
                        <>
                          <td className="border border-gray-300 bg-purple-50/30" />
                          <td className="border border-gray-300 bg-purple-50/30" />
                          <td className="border border-gray-300 text-center text-xs font-bold text-gray-700 bg-purple-50/30">
                            {attendedDays.filter((d) => d.daytimeSupport && d.transportPickup).length}
                          </td>
                          <td className="border border-gray-300 text-center text-xs font-bold text-gray-700 bg-purple-50/30">
                            {attendedDays.filter((d) => d.daytimeSupport && d.transportDropoff).length}
                          </td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* ── サービス項目追加フォーム ──────────────────────── */}
          <div className="flex items-center gap-2">
            {showAddItem ? (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="サービス名"
                  className="border border-gray-200 rounded px-2 py-1.5 text-sm w-48"
                />
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value as '基本' | '加算' | '保険外')}
                  className="border border-gray-200 rounded px-2 py-1.5 text-sm"
                >
                  <option value="基本">基本</option>
                  <option value="加算">加算</option>
                  <option value="保険外">保険外</option>
                </select>
                <select
                  value={newItemTrigger}
                  onChange={(e) => setNewItemTrigger(e.target.value as ServiceItem['trigger_field'])}
                  className="border border-gray-200 rounded px-2 py-1.5 text-sm"
                >
                  <option value="basic">出席時（自動）</option>
                  <option value="transport_pickup">お迎え時（自動）</option>
                  <option value="transport_dropoff">お送り時（自動）</option>
                  <option value="daytime_support">日中一時支援時（自動）</option>
                  <option value="manual">手動のみ</option>
                </select>
                <Button size="sm" onClick={addServiceItem}>追加</Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddItem(false)}>キャンセル</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setShowAddItem(true)}>
                <Plus className="h-3.5 w-3.5" />
                サービス項目を追加
              </Button>
            )}
          </div>

          {/* 凡例 */}
          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1">
              <FormTypeCircle type={1} small />
              平日利用（通学日）
            </span>
            <span className="flex items-center gap-1">
              <FormTypeCircle type={2} small />
              学校休日（土日・長期休暇等）
            </span>
            <span className="flex items-center gap-1">
              <BillingCircle value={0} small />
              算定区分0 30分未満
            </span>
            <span className="flex items-center gap-1">
              <BillingCircle value={1} small />
              算定区分① 30分以上〜1時間30分以下
            </span>
            <span className="flex items-center gap-1">
              <BillingCircle value={2} small />
              算定区分② 1時間30分超〜3時間以下
            </span>
            <span className="text-gray-400">※ 月次グリッドのセルをクリックでチェックのオン/オフが切り替えられます</span>
          </div>
        </>
      )}
    </div>
  )
}
