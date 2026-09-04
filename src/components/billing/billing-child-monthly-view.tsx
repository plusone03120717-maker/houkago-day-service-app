'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Plus, Settings, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isJapaneseNationalHoliday } from '@/lib/japanese-holidays'
import {
  calcHours,
  computeBillingDay,
  extensionThresholdMinutes,
  formatMinutes,
  getBillingCategory,
  getCircleValue,
  getExtensionLevel,
  isAutoTriggered,
  isHolidayDate,
  isItemChecked as isItemCheckedShared,
  timeToMinutes,
  type ComputedDay,
} from '@/lib/billing/day-computation'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type ServiceItem = {
  id: string
  unit_id: string
  name: string
  category: '基本' | '加算' | '保険外'
  trigger_field: 'basic' | 'transport_pickup' | 'transport_dropoff' | 'daytime_support' | 'daytime_pickup' | 'daytime_dropoff' | 'absent' | 'extension' | 'manual'
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
  daytime_pickup_arrival_time: string | null
  daytime_dropoff_arrival_time: string | null
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
  daytime_pickup: boolean
  daytime_dropoff: boolean
}

// 日別の判定結果。共通ロジック（lib/billing/day-computation）に画面固有の項目を足したもの
type DayComputed = ComputedDay & {
  isCancelled: boolean
  attendance: DailyAttendance | null
}

// ─────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────

function getDaysInMonth(yearMonth: string): string[] {
  const [y, m] = yearMonth.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, i) =>
    `${yearMonth}-${String(i + 1).padStart(2, '0')}`
  )
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']
const ATTENDANCE_COLUMNS =
  'id, date, status, check_in_time, check_out_time, service_start_time, service_end_time, pickup_type, pickup_arrival_time, dropoff_arrival_time, daytime_support, daytime_support_start_time, daytime_support_end_time, daytime_pickup_arrival_time, daytime_dropoff_arrival_time'
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
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDate, setConfirmDate] = useState<string | null>(null)

  const [attendances, setAttendances] = useState<DailyAttendance[]>([])
  const [schoolHolidays, setSchoolHolidays] = useState<SchoolHoliday[]>([])
  const [publicHolidays, setPublicHolidays] = useState<string[]>([])
  const [manualRecords, setManualRecords] = useState<BillingDailyRecord[]>([])
  const [cancelledDates, setCancelledDates] = useState<Set<string>>(new Set())
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
      .select(ATTENDANCE_COLUMNS)
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
    const [{ data: holidayData }, { data: publicHolidayData }, { data: recordData }, { data: actData }, { data: cancelledData }] = await Promise.all([
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
        .select('id, date, service_item_id, is_checked, billing_start_time, billing_end_time, daytime_pickup, daytime_dropoff')
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
      supabase
        .from('usage_reservations')
        .select('date')
        .eq('child_id', childId)
        .eq('unit_id', unitId)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .eq('status', 'cancelled'),
    ])

    setAttendances((attData ?? []) as DailyAttendance[])
    setSchoolHolidays((holidayData ?? []) as SchoolHoliday[])
    setPublicHolidays((publicHolidayData ?? []).map((h: { event_date: string }) => h.event_date))
    setManualRecords((recordData ?? []) as BillingDailyRecord[])
    setCancelledDates(new Set((cancelledData ?? []).map((r: { date: string }) => r.date)))

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

    // サービス項目を最新化（各種加算の自動挿入を含む）
    const { data: latestItems } = await supabase
      .from('billing_service_items')
      .select('id, unit_id, name, category, trigger_field, billing_code, is_active, sort_order')
      .eq('unit_id', unitId)
      .eq('is_active', true)
      .order('sort_order')
    let items = (latestItems ?? []) as ServiceItem[]
    if (items.length > 0) {
      const toInsert: Omit<ServiceItem, 'id'>[] = []
      let maxOrder = Math.max(...items.map((i) => i.sort_order), 0)
      const hasDaytimeSupportItem = items.some((i) => i.trigger_field === 'daytime_support')
      if (hasDaytimeSupportItem && !items.some((i) => i.trigger_field === 'daytime_pickup')) {
        toInsert.push({ unit_id: unitId, name: '日中一時支援・送迎加算（往）', category: '加算', trigger_field: 'daytime_pickup', billing_code: null, is_active: true, sort_order: ++maxOrder })
      }
      if (hasDaytimeSupportItem && !items.some((i) => i.trigger_field === 'daytime_dropoff')) {
        toInsert.push({ unit_id: unitId, name: '日中一時支援・送迎加算（復）', category: '加算', trigger_field: 'daytime_dropoff', billing_code: null, is_active: true, sort_order: ++maxOrder })
      }
      if (!items.some((i) => i.trigger_field === 'absent')) {
        toInsert.push({ unit_id: unitId, name: '欠席時対応加算', category: '加算', trigger_field: 'absent', billing_code: null, is_active: true, sort_order: ++maxOrder })
      }
      if (!items.some((i) => i.trigger_field === 'extension')) {
        toInsert.push({ unit_id: unitId, name: '延長加算', category: '加算', trigger_field: 'extension', billing_code: null, is_active: true, sort_order: ++maxOrder })
      }
      if (toInsert.length > 0) {
        const { data: inserted } = await supabase
          .from('billing_service_items')
          .insert(toInsert)
          .select('id, unit_id, name, category, trigger_field, billing_code, is_active, sort_order')
        if (inserted) items = [...items, ...(inserted as ServiceItem[])]
      }
    }
    setServiceItems(items)

    setLoading(false)
  }, [childId, unitId, effYearMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  const getManualRecord = (itemId: string, dateStr: string) =>
    manualRecords.find((r) => r.service_item_id === itemId && r.date === dateStr)

  // ── Compute day data ────────────────────────────────────────
  const attMap = new Map(attendances.map((a) => [a.date, a]))

  const basicItemIds = new Set(serviceItems.filter((i) => i.trigger_field === 'basic').map((i) => i.id))

  const computeDay = (dateStr: string): DayComputed => {
    const att = attMap.get(dateStr) ?? null
    const base = computeBillingDay({
      date: dateStr,
      attendance: att,
      dailyRecords: manualRecords,
      basicItemIds,
      isHoliday: isHolidayDate(dateStr, schoolHolidays, publicHolidays),
      participatedActivities: activityMap.get(dateStr) ?? new Set(),
    })
    return {
      ...base,
      attendance: att,
      isCancelled: !base.isAttended && !base.isAbsent && cancelledDates.has(dateStr),
    }
  }

  const dayDataMap = new Map(days.map((d) => [d, computeDay(d)]))

  const isItemChecked = (item: ServiceItem, dateStr: string, d: DayComputed): boolean =>
    isItemCheckedShared(item, d, getManualRecord(item.id, dateStr))

  // ── Create an attendance record from this page ──────────────
  // 出欠記録がない日をこのページから登録する。記録がないと日別表で
  // 時間・送迎・日中一時を入力できないため、実績入力の起点になる。
  const createAttendance = async (
    dateStr: string,
    status: 'attended' | 'absent'
  ): Promise<DailyAttendance | null> => {
    const { data, error } = await supabase
      .from('daily_attendance')
      .insert({ child_id: childId, unit_id: unitId, date: dateStr, status, pickup_type: 'none' })
      .select(ATTENDANCE_COLUMNS)
      .single()
    if (error || !data) {
      alert(`この日の記録を作成できませんでした: ${error?.message ?? ''}`)
      return null
    }
    // 利用予定（予約）も復元し、出席管理側と食い違わないようにする
    await supabase
      .from('usage_reservations')
      .upsert(
        { child_id: childId, unit_id: unitId, date: dateStr, status: 'confirmed' },
        { onConflict: 'child_id,unit_id,date' }
      )
    const att = data as unknown as DailyAttendance
    setAttendances((prev) => [...prev.filter((a) => a.date !== dateStr), att])
    setCancelledDates((prev) => {
      const next = new Set(prev)
      next.delete(dateStr)
      return next
    })
    return att
  }

  // 「加算のみ」行から出席／欠席として登録し直す
  const registerDayAs = async (dateStr: string, status: 'attended' | 'absent') => {
    setSaving(`register-${dateStr}`)
    await createAttendance(dateStr, status)
    setSaving(null)
  }

  // ── Toggle item check ───────────────────────────────────────
  const toggleItem = async (item: ServiceItem, dateStr: string, newChecked: boolean) => {
    setSaving(`${item.id}-${dateStr}`)
    let d = dayDataMap.get(dateStr)!

    // 出欠記録がない日に「放デイ基本報酬」「欠席時対応加算」をチェックしたら
    // その日を出席／欠席として登録し、日別表で時間などを入力できるようにする
    if (
      newChecked &&
      !d.isAttended &&
      !d.isAbsent &&
      (item.trigger_field === 'basic' || item.trigger_field === 'absent')
    ) {
      const status = item.trigger_field === 'absent' ? 'absent' : 'attended'
      const created = await createAttendance(dateStr, status)
      if (!created) {
        setSaving(null)
        return
      }
      d = {
        ...d,
        attendance: created,
        isAttended: status === 'attended',
        isAbsent: status === 'absent',
        isCancelled: false,
      }
    }

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
        .select('id, date, service_item_id, is_checked, billing_start_time, billing_end_time, daytime_pickup, daytime_dropoff')
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
    value: string,
    attendanceField?: 'service_start_time' | 'service_end_time' | 'daytime_support_start_time' | 'daytime_support_end_time'
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
      .select('id, date, service_item_id, is_checked, billing_start_time, billing_end_time, daytime_pickup, daytime_dropoff')
      .single()
    if (!error && data) {
      setManualRecords((prev) => {
        const filtered = prev.filter((r) => !(r.date === dateStr && r.service_item_id === itemId))
        return [...filtered, data as BillingDailyRecord]
      })
      if (attendanceField) {
        const att = attendances.find((a) => a.date === dateStr)
        if (att) {
          await supabase.from('daily_attendance').update({ [attendanceField]: value || null }).eq('id', att.id)
          setAttendances((prev) => prev.map((a) => a.id === att.id ? { ...a, [attendanceField]: value || null } : a))
        }
      }
    }
  }

  // ── Toggle transport in daily_attendance ────────────────────
  const toggleTransport = async (dateStr: string, type: 'pickup' | 'dropoff', currentlyOn: boolean) => {
    const att = attendances.find((a) => a.date === dateStr)
    if (!att) return
    const field = type === 'pickup' ? 'pickup_arrival_time' : 'dropoff_arrival_time'
    const newValue = currentlyOn ? null : '09:00:00'
    await supabase.from('daily_attendance').update({ [field]: newValue }).eq('id', att.id)
    setAttendances((prev) => prev.map((a) => a.id === att.id ? { ...a, [field]: newValue } : a))
  }

  // ── Toggle daytime support in daily_attendance ─────────────
  const toggleDaytimeSupport = async (dateStr: string) => {
    const att = attendances.find((a) => a.date === dateStr)
    if (!att) return
    const newValue = !att.daytime_support
    await supabase.from('daily_attendance').update({ daytime_support: newValue }).eq('id', att.id)
    setAttendances((prev) => prev.map((a) => a.id === att.id ? { ...a, daytime_support: newValue } : a))
  }

  // ── Toggle daytime transport in daily_attendance ───────────
  const toggleDaytimeTransport = async (dateStr: string, type: 'pickup' | 'dropoff') => {
    const att = attendances.find((a) => a.date === dateStr)
    if (!att) return
    const field = type === 'pickup' ? 'daytime_pickup_arrival_time' : 'daytime_dropoff_arrival_time'
    const current = att[field]
    const newValue = (current != null && current > '00:00:00') ? null : '09:00:00'
    await supabase.from('daily_attendance').update({ [field]: newValue }).eq('id', att.id)
    setAttendances((prev) => prev.map((a) => a.id === att.id ? { ...a, [field]: newValue } : a))
  }

  // ── Update daytime support times in daily_attendance ────────
  const updateDaytimeTimes = async (dateStr: string, field: 'daytime_support_start_time' | 'daytime_support_end_time', value: string) => {
    const att = attendances.find((a) => a.date === dateStr)
    if (!att) return
    await supabase.from('daily_attendance').update({ [field]: value || null }).eq('id', att.id)
    setAttendances((prev) => prev.map((a) => a.id === att.id ? { ...a, [field]: value || null } : a))
  }

  // ── Delete a day's record (誤登録した実績を未記録に戻す) ────
  // 「欠席」にする操作ではなく、利用予定そのものを消して未記録に戻す
  // 出欠記録がなく加算のみチェックされている日は、その加算だけを取り消す
  const deleteDayRecord = async (dateStr: string) => {
    const att = attendances.find((a) => a.date === dateStr)

    setDeleting(dateStr)
    // 請求側の上書きレコードを先に削除
    await supabase
      .from('billing_daily_records')
      .delete()
      .eq('child_id', childId)
      .eq('unit_id', unitId)
      .eq('date', dateStr)

    if (att) {
      const { error } = await supabase.from('daily_attendance').delete().eq('id', att.id)
      if (error) {
        alert(`削除できませんでした: ${error.message}`)
        setDeleting(null)
        return
      }

      // 利用予定（予約）も削除して、その日をなかったことにする
      await supabase
        .from('usage_reservations')
        .delete()
        .eq('child_id', childId)
        .eq('unit_id', unitId)
        .eq('date', dateStr)

      setAttendances((prev) => prev.filter((a) => a.id !== att.id))
    }

    setManualRecords((prev) => prev.filter((r) => r.date !== dateStr))
    setCancelledDates((prev) => {
      const next = new Set(prev)
      next.delete(dateStr)
      return next
    })
    setConfirmDate(null)
    setDeleting(null)
    router.refresh()
  }

  const renderDeleteCell = (dateStr: string) => (
    <td className="border border-gray-200 px-1 py-1 text-center">
      <button
        type="button"
        onClick={() => setConfirmDate(dateStr)}
        disabled={deleting === dateStr}
        title={
          attendances.some((a) => a.date === dateStr)
            ? 'この日の実績を削除（利用予定ごと未記録に戻す）'
            : 'この日にチェックした加算を取り消す'
        }
        className="p-1 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
      >
        {deleting === dateStr
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </td>
  )

  // ── Add default service items ───────────────────────────────
  const addDefaultItems = async () => {
    const defaults: Omit<ServiceItem, 'id' | 'billing_code'>[] = [
      { unit_id: unitId, name: '放デイ基本報酬', category: '基本', trigger_field: 'basic', is_active: true, sort_order: 1 },
      { unit_id: unitId, name: '日中一時支援', category: '基本', trigger_field: 'daytime_support', is_active: true, sort_order: 2 },
      { unit_id: unitId, name: '日中一時支援・送迎加算（往）', category: '加算', trigger_field: 'daytime_pickup', is_active: true, sort_order: 3 },
      { unit_id: unitId, name: '日中一時支援・送迎加算（復）', category: '加算', trigger_field: 'daytime_dropoff', is_active: true, sort_order: 4 },
      { unit_id: unitId, name: '送迎加算（迎え）', category: '加算', trigger_field: 'transport_pickup', is_active: true, sort_order: 5 },
      { unit_id: unitId, name: '送迎加算（送り）', category: '加算', trigger_field: 'transport_dropoff', is_active: true, sort_order: 6 },
      { unit_id: unitId, name: '欠席時対応加算', category: '加算', trigger_field: 'absent', is_active: true, sort_order: 7 },
      { unit_id: unitId, name: '延長加算', category: '加算', trigger_field: 'extension', is_active: true, sort_order: 8 },
      { unit_id: unitId, name: '専門的支援実施加算', category: '加算', trigger_field: 'manual', is_active: true, sort_order: 9 },
      { unit_id: unitId, name: 'おやつ', category: '保険外', trigger_field: 'manual', is_active: true, sort_order: 10 },
      { unit_id: unitId, name: '学習教材', category: '保険外', trigger_field: 'manual', is_active: true, sort_order: 11 },
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

  // 延長加算も区分ごとに1日1回の算定なので、日数を返す
  const getTotalUnits = (item: ServiceItem) => countChecked(item)

  const isDaytimeItem = (item: ServiceItem) =>
    ['daytime_support', 'daytime_pickup', 'daytime_dropoff'].includes(item.trigger_field)

  const isDaytimeTransportItem = (item: ServiceItem) =>
    item.trigger_field === 'daytime_pickup' || item.trigger_field === 'daytime_dropoff'

  // 月次グリッド表示順: daytime_pickup / daytime_dropoff は daytime_support の直後に固定
  const daytimeSupportSortOrder =
    serviceItems.find((i) => i.trigger_field === 'daytime_support')?.sort_order ?? Infinity
  const gridServiceItems = [...serviceItems].sort((a, b) => {
    const effectiveOrder = (item: ServiceItem) => {
      if (item.trigger_field === 'daytime_pickup') return daytimeSupportSortOrder + 0.1
      if (item.trigger_field === 'daytime_dropoff') return daytimeSupportSortOrder + 0.2
      return item.sort_order
    }
    return effectiveOrder(a) - effectiveOrder(b)
  })

  const hasDaytimeItems = serviceItems.some((i) => i.trigger_field === 'daytime_support')
  const absentItem = serviceItems.find((i) => i.trigger_field === 'absent') ?? null
  const hasAbsentItems = absentItem !== null
  const extensionItem = serviceItems.find((i) => i.trigger_field === 'extension') ?? null
  const hasExtensionItems = extensionItem !== null

  // その日に手動チェックされているサービス項目（月次グリッドでのチェック分）
  const getCheckedManualItems = (dateStr: string) =>
    manualRecords
      .filter((r) => r.date === dateStr && r.is_checked)
      .map((r) => serviceItems.find((i) => i.id === r.service_item_id))
      .filter((i): i is ServiceItem => i !== undefined)

  // 日別明細に表示する日
  // 出席／欠席の記録がある日に加え、月次グリッドで加算をチェックした日も表示する
  // （出欠記録がない日に欠席時対応加算だけを付けたケースを取りこぼさないため）
  const detailDays = days.filter((dateStr) => {
    const d = dayDataMap.get(dateStr)!
    return d.isAttended || d.isAbsent || getCheckedManualItems(dateStr).length > 0
  })

  // 欠席時加算セル（出席・欠席・加算のみ の全行で共通）
  const renderAbsentAdditionCell = (dateStr: string, d: DayComputed) => {
    if (!absentItem) return null
    const checked = isItemChecked(absentItem, dateStr, d)
    const isSavingAbsent = saving === `${absentItem.id}-${dateStr}`
    return (
      <td
        className="border border-gray-200 px-1 py-1 text-center bg-yellow-50/40 cursor-pointer hover:bg-yellow-100/60"
        onClick={() => toggleItem(absentItem, dateStr, !checked)}
        title="クリックで欠席時加算を切替"
      >
        {isSavingAbsent ? (
          <Loader2 className="h-3 w-3 animate-spin text-gray-400 mx-auto" />
        ) : checked ? (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-500 text-white text-[10px] font-bold">✓</span>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>
    )
  }

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
                              isSat ? 'text-blue-600 bg-blue-50' : (isSun || isJapaneseNationalHoliday(d)) ? 'text-red-500 bg-red-50' : ''
                            }`}
                          >
                            <div>{day.getDate()}</div>
                            <div className="text-[8px] font-normal">{DAY_LABELS[dow]}</div>
                            {dd.isAbsent && (
                              <div className="text-[7px] text-gray-400 font-normal leading-none mt-0.5">欠</div>
                            )}
                            {dd.isCancelled && (
                              <div className="text-[7px] text-orange-400 font-normal leading-none mt-0.5">キ</div>
                            )}
                          </th>
                        )
                      })}
                      <th className="border border-gray-300 px-2 py-1.5 text-center w-12">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gridServiceItems.map((item) => {
                      const total = getTotalUnits(item)
                      return [
                        // 実績行
                        <tr key={`${item.id}-actual`}>
                          <td
                            className={`border border-gray-300 px-2 py-1 sticky left-0 z-10 ${isDaytimeItem(item) ? 'bg-purple-50' : 'bg-white'}`}
                            rowSpan={1}
                          >
                            <div className={`flex items-center gap-1.5 ${isDaytimeTransportItem(item) ? 'pl-3' : ''}`}>
                              {isDaytimeTransportItem(item)
                                ? <span className="text-purple-400 text-[11px] leading-none flex-shrink-0">└</span>
                                : isDaytimeItem(item) && <div className="w-1 h-4 rounded-full bg-purple-400 flex-shrink-0" />
                              }
                              <span className={`text-[10px] px-1 rounded font-medium ${CATEGORY_COLORS[item.category]}`}>
                                {item.category}
                              </span>
                              <span className="text-gray-800 font-medium leading-tight">{item.name}</span>
                            </div>
                          </td>
                          <td className={`border border-gray-300 px-1 py-1 text-center sticky left-[160px] z-10 text-gray-500 text-[10px] ${isDaytimeItem(item) ? 'bg-purple-50' : 'bg-white'}`}>
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
                                className={`border border-gray-300 w-7 p-0.5 text-center cursor-pointer transition-colors ${
                                  isDaytimeItem(item)
                                    ? 'bg-purple-50/50 hover:bg-purple-100/60'
                                    : `hover:bg-gray-50 ${dow === 6 ? 'bg-blue-50/50' : (dow === 0 || isJapaneseNationalHoliday(d)) ? 'bg-red-50/50' : dd.isAbsent ? 'bg-gray-100/70' : dd.isCancelled ? 'bg-orange-50/70' : ''}`
                                }`}
                                onClick={() => toggleItem(item, d, !checked)}
                                title={dd.isAbsent ? `${d} (欠席)` : dd.isCancelled ? `${d} (キャンセル)` : d}
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
                    <th className="border border-gray-300 px-2 py-2 text-center font-medium text-teal-700 w-24">開始時間</th>
                    <th className="border border-gray-300 px-2 py-2 text-center font-medium text-teal-700 w-24">終了時間</th>
                    <th className="border border-gray-300 px-2 py-2 text-center font-medium text-teal-700 w-24">算定時間数</th>
                    <th className="border border-gray-300 px-1 py-2 text-center font-medium text-teal-700 w-14" colSpan={2}>送迎加算</th>
                    {hasDaytimeItems && (
                      <th className="border border-gray-300 px-1 py-2 text-center font-medium text-purple-700 bg-purple-50 w-14" colSpan={5}>日中一時利用</th>
                    )}
                    {hasAbsentItems && (
                      <th className="border border-gray-300 px-1 py-2 text-center font-medium text-gray-600 bg-yellow-50 w-16">欠席時加算</th>
                    )}
                    {hasExtensionItems && (
                      <th className="border border-gray-300 px-1 py-2 text-center font-medium text-gray-600 bg-green-50 w-16">延長加算</th>
                    )}
                    <th className="border border-gray-300 px-1 py-2 text-center font-medium text-gray-600 w-12">操作</th>
                  </tr>
                  <tr className="bg-[#f5f0e8] text-[10px]">
                    <th className="border border-gray-300" />
                    <th className="border border-gray-300" />
                    <th className="border border-gray-300" />
                    <th className="border border-gray-300" />
                    <th className="border border-gray-300" />
                    <th className="border border-gray-300 px-0 py-1 text-center text-gray-500 w-7">往</th>
                    <th className="border border-gray-300 px-0 py-1 text-center text-gray-500 w-7">復</th>
                    {hasDaytimeItems && (
                      <>
                        <th className="border border-gray-300 px-0 py-1 text-center text-purple-600 bg-purple-50 w-20">開始</th>
                        <th className="border border-gray-300 px-0 py-1 text-center text-purple-600 bg-purple-50 w-20">終了</th>
                        <th className="border border-gray-300 px-0 py-1 text-center text-purple-600 bg-purple-50 w-16">算定</th>
                        <th className="border border-gray-300 px-0 py-1 text-center text-purple-600 bg-purple-50 w-7">往</th>
                        <th className="border border-gray-300 px-0 py-1 text-center text-purple-600 bg-purple-50 w-7">復</th>
                      </>
                    )}
                    {hasAbsentItems && <th className="border border-gray-300 bg-yellow-50" />}
                    {hasExtensionItems && <th className="border border-gray-300 px-0 py-1 text-center text-gray-500 bg-green-50">時間</th>}
                    <th className="border border-gray-300" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detailDays.map((dateStr) => {
                    const d = dayDataMap.get(dateStr)!

                    const dow = new Date(dateStr + 'T00:00:00').getDay()
                    const dayLabel = `${parseInt(dateStr.slice(8))}日（${DAY_LABELS[dow]}）`
                    const basicItem = serviceItems.find((i) => i.trigger_field === 'basic')
                    const basicRec = basicItem ? getManualRecord(basicItem.id, dateStr) : null

                    // 欠席行／加算のみ行（出欠記録がなく月次グリッドで加算だけチェックした日）
                    if (!d.isAttended) {
                      const checkedItems = getCheckedManualItems(dateStr)
                      return (
                        <tr key={`${dateStr}-${d.isAbsent ? 'absent' : 'addition'}`} className={d.isAbsent ? 'bg-gray-50 text-gray-400' : 'bg-yellow-50/30 text-gray-400'}>
                          <td className="border border-gray-200 px-3 py-2 text-gray-500 font-medium">
                            {dayLabel}
                            {!d.isAbsent && checkedItems.length > 0 && (
                              <div className="text-[9px] text-gray-400 font-normal leading-tight mt-0.5">
                                {checkedItems.map((i) => i.name).join('・')}
                              </div>
                            )}
                          </td>
                          <td className="border border-gray-200 px-2 py-2 text-center">
                            {d.isAbsent ? (
                              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 text-[10px] font-medium whitespace-nowrap">
                                欠席
                              </span>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-[10px] font-medium whitespace-nowrap">
                                  加算のみ
                                </span>
                                {saving === `register-${dateStr}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                                ) : (
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => registerDayAs(dateStr, 'attended')}
                                      title="この日を出席として登録し、時間などを入力できるようにします"
                                      className="px-1.5 py-0.5 rounded border border-teal-300 text-teal-700 bg-white text-[9px] font-medium hover:bg-teal-50 whitespace-nowrap"
                                    >
                                      出席にする
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => registerDayAs(dateStr, 'absent')}
                                      title="この日を欠席として登録します"
                                      className="px-1.5 py-0.5 rounded border border-gray-300 text-gray-600 bg-white text-[9px] font-medium hover:bg-gray-50 whitespace-nowrap"
                                    >
                                      欠席にする
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
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
                              <td className="border border-gray-200 px-2 py-2 text-center text-gray-300 text-xs bg-purple-50/30">—</td>
                            </>
                          )}
                          {hasAbsentItems && renderAbsentAdditionCell(dateStr, d)}
                          {hasExtensionItems && (
                            <td className="border border-gray-200 px-2 py-2 text-center text-gray-300 text-xs bg-green-50/30">—</td>
                          )}
                          {renderDeleteCell(dateStr)}
                        </tr>
                      )
                    }

                    const startTimeVal = basicRec?.billing_start_time?.slice(0, 5) ?? d.startTime ?? ''
                    const endTimeVal = basicRec?.billing_end_time?.slice(0, 5) ?? d.endTime ?? ''

                    // Recompute category and extension if overridden
                    const overriddenHours = calcHours(startTimeVal, endTimeVal)
                    const overriddenMinutes = startTimeVal && endTimeVal
                      ? Math.max(0, timeToMinutes(endTimeVal) - timeToMinutes(startTimeVal))
                      : 0
                    const overriddenCategory = getBillingCategory(
                      overriddenMinutes,
                      startTimeVal !== '' && endTimeVal !== '',
                      d.serviceFormType,
                    )
                    const overriddenExtensionMinutes = Math.max(
                      0,
                      overriddenMinutes - extensionThresholdMinutes(d.serviceFormType),
                    )
                    const overriddenExtensionLevel = getExtensionLevel(overriddenExtensionMinutes)


                    return (
                      <tr key={`${dateStr}-attended`} className={`hover:bg-gray-50 ${d.isSchoolHoliday ? 'bg-blue-50/30' : ''}`}>
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
                              updateBillingTimes(basicItem.id, dateStr, 'billing_start_time', e.target.value, 'service_start_time')
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
                              updateBillingTimes(basicItem.id, dateStr, 'billing_end_time', e.target.value, 'service_end_time')
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
                        <td
                          className="border border-gray-200 px-1 py-1 text-center cursor-pointer hover:bg-orange-50"
                          onClick={() => toggleTransport(dateStr, 'pickup', d.transportPickup)}
                          title="クリックで送迎（迎え）を切替"
                        >
                          {d.transportPickup ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold">1</span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td
                          className="border border-gray-200 px-1 py-1 text-center cursor-pointer hover:bg-orange-50"
                          onClick={() => toggleTransport(dateStr, 'dropoff', d.transportDropoff)}
                          title="クリックで送迎（送り）を切替"
                        >
                          {d.transportDropoff ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold">1</span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        {hasDaytimeItems && (
                          <>
                            {/* 日中一時 開始時間 */}
                            <td className="border border-gray-200 px-1 py-1 text-center bg-purple-50/30">
                              {d.daytimeSupport ? (
                                <input
                                  type="time"
                                  defaultValue={d.attendance?.daytime_support_start_time?.slice(0, 5) ?? ''}
                                  className="text-xs border border-purple-200 rounded px-1 py-0.5 w-full text-center"
                                  onBlur={(e) => updateDaytimeTimes(dateStr, 'daytime_support_start_time', e.target.value)}
                                />
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            {/* 日中一時 終了時間 */}
                            <td className="border border-gray-200 px-1 py-1 text-center bg-purple-50/30">
                              {d.daytimeSupport ? (
                                <input
                                  type="time"
                                  defaultValue={d.attendance?.daytime_support_end_time?.slice(0, 5) ?? ''}
                                  className="text-xs border border-purple-200 rounded px-1 py-0.5 w-full text-center"
                                  onBlur={(e) => updateDaytimeTimes(dateStr, 'daytime_support_end_time', e.target.value)}
                                />
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            {/* 日中一時 利用有無 */}
                            <td
                              className="border border-gray-200 px-1 py-2 text-center bg-purple-50/30 cursor-pointer hover:bg-purple-100/50"
                              onClick={() => toggleDaytimeSupport(dateStr)}
                              title="クリックで日中一時支援の利用有無を切替"
                            >
                              {d.daytimeSupport ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-500 text-white text-[10px] font-bold">✓</span>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            {/* 日中一時 送迎往（基本送迎とは独立） */}
                            <td
                              className={`border border-gray-200 px-1 py-1 text-center bg-purple-50/30 ${d.daytimeSupport ? 'cursor-pointer hover:bg-purple-100/50' : ''}`}
                              onClick={() => { if (d.daytimeSupport) toggleDaytimeTransport(dateStr, 'pickup') }}
                              title={d.daytimeSupport ? 'クリックで日中一時支援の送迎（往）を切替' : undefined}
                            >
                              {d.daytimeSupport && d.daytimeTransportPickup ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-500 text-white text-[10px] font-bold">1</span>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            {/* 日中一時 送迎復（基本送迎とは独立） */}
                            <td
                              className={`border border-gray-200 px-1 py-1 text-center bg-purple-50/30 ${d.daytimeSupport ? 'cursor-pointer hover:bg-purple-100/50' : ''}`}
                              onClick={() => { if (d.daytimeSupport) toggleDaytimeTransport(dateStr, 'dropoff') }}
                              title={d.daytimeSupport ? 'クリックで日中一時支援の送迎（復）を切替' : undefined}
                            >
                              {d.daytimeSupport && d.daytimeTransportDropoff ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-500 text-white text-[10px] font-bold">1</span>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                          </>
                        )}
                        {hasAbsentItems && renderAbsentAdditionCell(dateStr, d)}
                        {hasExtensionItems && (
                          <td
                            className="border border-gray-200 px-1 py-1 text-center bg-green-50/30"
                            title={
                              overriddenExtensionLevel > 0
                                ? `延長 ${formatMinutes(overriddenExtensionMinutes)}（基準 ${d.serviceFormType === 1 ? '平日3時間' : '休業日5時間'}）`
                                : undefined
                            }
                          >
                            {overriddenExtensionLevel > 0 ? (
                              <div>
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold">{overriddenExtensionLevel}</span>
                                <div className="text-[9px] text-gray-400 mt-0.5">{formatMinutes(overriddenExtensionMinutes)}</div>
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                        )}
                        {renderDeleteCell(dateStr)}
                      </tr>
                    )
                  })}
                  {detailDays.length === 0 && (
                    <tr>
                      <td colSpan={(hasDaytimeItems ? 12 : 7) + (hasAbsentItems ? 1 : 0) + (hasExtensionItems ? 1 : 0) + 1} className="border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
                        この月の実績記録がありません
                      </td>
                    </tr>
                  )}
                </tbody>
                {detailDays.length > 0 && (
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
                          <td className="border border-gray-300 bg-purple-50/30" />
                          <td className="border border-gray-300 text-center text-xs font-bold text-purple-700 bg-purple-50/30">
                            {attendedDays.filter((d) => d.daytimeTransportPickup).length}
                          </td>
                          <td className="border border-gray-300 text-center text-xs font-bold text-purple-700 bg-purple-50/30">
                            {attendedDays.filter((d) => d.daytimeTransportDropoff).length}
                          </td>
                        </>
                      )}
                      {hasAbsentItems && absentItem && (
                        <td className="border border-gray-300 text-center text-xs font-bold text-gray-700 bg-yellow-50/30">
                          {days.filter((dateStr) => isItemChecked(absentItem, dateStr, dayDataMap.get(dateStr)!)).length}
                        </td>
                      )}
                      {hasExtensionItems && extensionItem && (
                        <td className="border border-gray-300 text-center text-xs font-bold text-green-700 bg-green-50/30">
                          {days.filter((dateStr) => isItemChecked(extensionItem, dateStr, dayDataMap.get(dateStr)!)).length}
                        </td>
                      )}
                      <td className="border border-gray-300" />
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
                  <option value="daytime_pickup">日中一時支援・送迎往時（自動）</option>
                  <option value="daytime_dropoff">日中一時支援・送迎復時（自動）</option>
                  <option value="absent">欠席時（自動）</option>
                  <option value="extension">延長加算（自動）</option>
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
              算定時間数0 30分未満（算定対象外）
            </span>
            <span className="flex items-center gap-1">
              <BillingCircle value={1} small />
              算定時間数1 30分以上〜1時間30分以下
            </span>
            <span className="flex items-center gap-1">
              <BillingCircle value={2} small />
              算定時間数2 1時間30分超〜3時間以下
            </span>
            <span className="flex items-center gap-1">
              <BillingCircle value={3} small />
              算定時間数3 3時間超〜5時間以下
            </span>
            <span className="flex items-center gap-1">
              <BillingCircle value={4} small />
              算定時間数4 5時間超（学校休業日のみ／平日は5時間を超えても3）
            </span>
            <span className="text-gray-400">
              ※ 延長加算欄の番号は延長時間の区分です（1: 30分以上1時間未満／2: 1時間以上2時間未満／3: 2時間以上）。
              延長時間は平日3時間・学校休業日5時間を超えた分で判定します
            </span>
            <span className="text-gray-400">※ 月次グリッドのセルをクリックでチェックのオン/オフが切り替えられます</span>
            <span className="text-gray-400">※ 出欠記録がない日に「放デイ基本報酬」をチェックすると、その日は出席として登録され、日別表で時間・送迎・日中一時を入力できるようになります（欠席時対応加算のチェックなら欠席として登録）</span>
            <span className="text-gray-400">※ 日別表の「操作」列のゴミ箱は、欠席にする操作ではなく利用予定ごと削除して未記録に戻す操作です</span>
          </div>
        </>
      )}

      {/* ── 削除確認ダイアログ ───────────────────────────────── */}
      {confirmDate && (() => {
        const dow = new Date(confirmDate + 'T00:00:00').getDay()
        const dayLabel = `${parseInt(confirmDate.slice(8))}日（${DAY_LABELS[dow]}）`
        const isDeleting = deleting === confirmDate
        // 出欠記録がなく加算だけチェックした日は、加算の取り消しのみ
        const hasAttendanceRecord = attendances.some((a) => a.date === confirmDate)
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => { if (!isDeleting) setConfirmDate(null) }}
          >
            <div
              className="bg-white rounded-xl shadow-xl max-w-md w-full p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-red-50 flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900">
                    {ey}年{em}月{dayLabel}の
                    {hasAttendanceRecord ? '実績' : 'チェックした加算'}を削除します
                  </h3>
                  {hasAttendanceRecord ? (
                    <p className="text-sm text-red-700 font-medium mt-2 leading-relaxed">
                      これは「欠席」にする操作ではありません。<br />
                      この日の<span className="underline">利用予定そのものが削除され</span>、記録がなかった状態に戻ります。
                    </p>
                  ) : (
                    <p className="text-sm text-gray-700 font-medium mt-2 leading-relaxed">
                      この日は出席／欠席の記録がなく、月次グリッドでチェックした加算だけが登録されています。
                    </p>
                  )}
                </div>
              </div>

              <ul className="mt-3 space-y-1 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                {hasAttendanceRecord ? (
                  <>
                    <li>・利用予定（予約）を削除します</li>
                    <li>・出席管理の出席／欠席記録を削除します</li>
                    <li>・この日の支援記録・活動記録も削除されます</li>
                    <li>・国保連請求の対象からも外れます</li>
                  </>
                ) : (
                  <>
                    <li>・この日にチェックした加算をすべて取り消します</li>
                    <li>・出席管理の記録には影響しません</li>
                    <li>・月次グリッドのチェックも外れます</li>
                  </>
                )}
              </ul>

              {hasAttendanceRecord && (
                <p className="mt-3 text-xs text-gray-500 leading-relaxed">
                  削除すると元に戻せません。欠席として記録を残したい場合（欠席時対応加算を算定する場合など）は「いいえ」を選び、出席管理で「欠席」に変更してください。
                </p>
              )}

              <p className="mt-4 text-sm font-semibold text-gray-900 text-center">
                削除してもよろしいですか？
              </p>

              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={isDeleting}
                  onClick={() => setConfirmDate(null)}
                >
                  いいえ
                </Button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => deleteDayRecord(confirmDate)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                  はい、削除する
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
