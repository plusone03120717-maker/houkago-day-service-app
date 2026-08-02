'use client'

import { getTodayJST } from '@/lib/utils'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, Car, Clock, CalendarDays, Save, CheckCircle, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils' 
import { isJapaneseNationalHoliday, getJapaneseHolidayName } from '@/lib/japanese-holidays'

export type AttendanceRecord = {
  id: string
  unit_id: string
  date: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  pickup_departure_time: string | null
  pickup_arrival_time: string | null
  dropoff_departure_time: string | null
  dropoff_arrival_time: string | null
  service_start_time: string | null
  service_end_time: string | null
  daytime_support: boolean
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
  daytime_pickup_departure_time: string | null
  daytime_pickup_arrival_time: string | null
  daytime_dropoff_departure_time: string | null
  daytime_dropoff_arrival_time: string | null
  daytime_pickup_driver_member_id: string | null
  daytime_pickup_vehicle_id: string | null
  daytime_dropoff_driver_member_id: string | null
  daytime_dropoff_vehicle_id: string | null
  units: { name: string } | null
}

/** LINEの利用連絡（保護者からの申告）。読み取り専用で出席カレンダーに重ねて表示する。 */
export type ParentContact = {
  date: string
  status: 'attending' | 'absent'
  service_type: 'regular' | 'daytime_support'
  service_start_time: string | null
  service_end_time: string | null
  transport_type: 'none' | 'pickup_only' | 'dropoff_only' | 'both'
  pickup_time: string | null
  dropoff_time: string | null
  note: string | null
  reported_at: string
  approval_status: 'pending' | 'approved' | 'rejected'
}

const PARENT_TRANSPORT_LABELS: Record<ParentContact['transport_type'], string> = {
  none: '送迎なし',
  both: '送り迎え',
  pickup_only: '迎えのみ',
  dropoff_only: '送りのみ',
}

/** 保護者連絡の区分ごとの色・ラベル */
function parentContactMeta(c: ParentContact) {
  if (c.status === 'absent') return { color: 'bg-red-400', label: 'お休み', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-100' }
  if (c.service_type === 'daytime_support') return { color: 'bg-orange-400', label: '日中一時', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-100' }
  return { color: 'bg-green-500', label: '放デイ', text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-100' }
}

interface Props {
  year: number
  month: number
  childId: string
  attendances: AttendanceRecord[]
  parentContacts?: ParentContact[]
  units?: Array<{ id: string; name: string }>
  plannedDates?: string[]
  plannedDateUnitId?: Record<string, string>
  plannedDatePlanId?: Record<string, string>
  plannedDatePickupTime?: Record<string, string | null>
  plannedDateDropoffTime?: Record<string, string | null>
  plannedDateServiceStartTime?: Record<string, string | null>
  plannedDateServiceEndTime?: Record<string, string | null>
  cancelledPlanDates?: Record<string, { planId: string; overrideId: string; unitId: string }>
  basePath?: string
  staffMembers?: Array<{ id: string; name: string }>
  vehicles?: Array<{ id: string; name: string }>
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function fmt(time: string | null | undefined) {
  return time ? time.slice(0, 5) : ''
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
      />
    </div>
  )
}

export function ChildAttendanceCalendar({ year, month, childId, attendances, parentContacts = [], units = [], plannedDates = [], plannedDateUnitId = {}, plannedDatePlanId = {}, plannedDatePickupTime = {}, plannedDateDropoffTime = {}, plannedDateServiceStartTime = {}, plannedDateServiceEndTime = {}, cancelledPlanDates = {}, basePath, staffMembers = [], vehicles = [] }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [newUnitId, setNewUnitId] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmCancelPlan, setConfirmCancelPlan] = useState(false)
  const [cancellingPlan, setCancellingPlan] = useState(false)
  const [confirmBulkCancelPlan, setConfirmBulkCancelPlan] = useState(false)
  const [bulkCancellingPlan, setBulkCancellingPlan] = useState(false)
  const [confirmRestorePlan, setConfirmRestorePlan] = useState(false)
  const [restoringPlan, setRestoringPlan] = useState(false)

  // 編集フィールドの状態
  const [pickupDeparture, setPickupDeparture] = useState('')
  const [pickupArrival, setPickupArrival] = useState('')
  const [dropoffDeparture, setDropoffDeparture] = useState('')
  const [dropoffArrival, setDropoffArrival] = useState('')
  const [serviceStart, setServiceStart] = useState('')
  const [serviceEnd, setServiceEnd] = useState('')
  const [daytimeSupport, setDaytimeSupport] = useState(false)
  const [daytimeSupportStart, setDaytimeSupportStart] = useState('')
  const [daytimeSupportEnd, setDaytimeSupportEnd] = useState('')
  const [daytimePickupDeparture, setDaytimePickupDeparture] = useState('')
  const [daytimePickupArrival, setDaytimePickupArrival] = useState('')
  const [daytimeDropoffDeparture, setDaytimeDropoffDeparture] = useState('')
  const [daytimeDropoffArrival, setDaytimeDropoffArrival] = useState('')
  const [daytimePickupDriverId, setDaytimePickupDriverId] = useState('')
  const [daytimePickupVehicleId, setDaytimePickupVehicleId] = useState('')
  const [daytimeDropoffDriverId, setDaytimeDropoffDriverId] = useState('')
  const [daytimeDropoffVehicleId, setDaytimeDropoffVehicleId] = useState('')

  const attendanceMap = Object.fromEntries(attendances.map((a) => [a.date, a]))
  const parentContactMap = Object.fromEntries(parentContacts.map((c) => [c.date, c]))
  const plannedSet = new Set(plannedDates)

  // 単一選択時のみ有効な派生値
  const selectedDate = selectedDates.size === 1 ? [...selectedDates][0] : null
  const selected = selectedDate ? (attendanceMap[selectedDate] ?? null) : null
  const isMultiSelect = selectedDates.size > 1

  // 日付選択が変わったら編集フィールドを初期化
  useEffect(() => {
    if (selectedDate) {
      // 単一選択: 既存レコードがあればその値をロード
      const att = attendanceMap[selectedDate]
      if (att) {
        setPickupDeparture(fmt(att.pickup_departure_time))
        setPickupArrival(fmt(att.pickup_arrival_time))
        setDropoffDeparture(fmt(att.dropoff_departure_time))
        setDropoffArrival(fmt(att.dropoff_arrival_time))
        setServiceStart(fmt(att.service_start_time))
        setServiceEnd(fmt(att.service_end_time))
        setDaytimeSupport(att.daytime_support)
        setDaytimeSupportStart(fmt(att.daytime_support_start_time))
        setDaytimeSupportEnd(fmt(att.daytime_support_end_time))
        setDaytimePickupDeparture(fmt(att.daytime_pickup_departure_time))
        setDaytimePickupArrival(fmt(att.daytime_pickup_arrival_time))
        setDaytimeDropoffDeparture(fmt(att.daytime_dropoff_departure_time))
        setDaytimeDropoffArrival(fmt(att.daytime_dropoff_arrival_time))
        setDaytimePickupDriverId(att.daytime_pickup_driver_member_id ?? '')
        setDaytimePickupVehicleId(att.daytime_pickup_vehicle_id ?? '')
        setDaytimeDropoffDriverId(att.daytime_dropoff_driver_member_id ?? '')
        setDaytimeDropoffVehicleId(att.daytime_dropoff_vehicle_id ?? '')
      } else {
        // 利用スケジュールのお迎え・お送り・利用時間を初期値として設定
        setPickupDeparture(fmt(plannedDatePickupTime[selectedDate]))
        setPickupArrival('')
        setDropoffDeparture(fmt(plannedDateDropoffTime[selectedDate]))
        setDropoffArrival('')
        setServiceStart(fmt(plannedDateServiceStartTime[selectedDate]))
        setServiceEnd(fmt(plannedDateServiceEndTime[selectedDate]))
        setDaytimeSupport(false)
        setDaytimeSupportStart('')
        setDaytimeSupportEnd('')
        setDaytimePickupDeparture('')
        setDaytimePickupArrival('')
        setDaytimeDropoffDeparture('')
        setDaytimeDropoffArrival('')
        setDaytimePickupDriverId('')
        setDaytimePickupVehicleId('')
        setDaytimeDropoffDriverId('')
        setDaytimeDropoffVehicleId('')
        const plannedUnitId = plannedDateUnitId[selectedDate] ?? ''
        setNewUnitId(plannedUnitId || (units.length === 1 ? units[0].id : ''))
      }
    } else {
      // 複数選択 or 選択なし: 空にリセット
      setPickupDeparture('')
      setPickupArrival('')
      setDropoffDeparture('')
      setDropoffArrival('')
      setServiceStart('')
      setServiceEnd('')
      setDaytimeSupport(false)
      setDaytimeSupportStart('')
      setDaytimeSupportEnd('')
      setDaytimePickupDeparture('')
      setDaytimePickupArrival('')
      setDaytimeDropoffDeparture('')
      setDaytimeDropoffArrival('')
      setDaytimePickupDriverId('')
      setDaytimePickupVehicleId('')
      setDaytimeDropoffDriverId('')
      setDaytimeDropoffVehicleId('')
    }
  }, [selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDateClick = (date: string, ctrlKey: boolean) => {
    setSaved(false)
    setConfirmDelete(false)
    setConfirmCancelPlan(false)
    setConfirmRestorePlan(false)
    if (ctrlKey) {
      // Ctrl+クリック: 複数選択トグル
      setSelectedDates((prev) => {
        const next = new Set(prev)
        if (next.has(date)) next.delete(date)
        else next.add(date)
        return next
      })
    } else {
      // 通常クリック: 単一選択（同じ日なら解除）
      setSelectedDates((prev) => {
        if (prev.size === 1 && prev.has(date)) return new Set()
        return new Set([date])
      })
    }
  }

  const syncTransportSchedules = async (unitId: string, date: string) => {
    const { data: schedules } = await supabase
      .from('transport_schedules')
      .select('id, direction')
      .eq('unit_id', unitId)
      .eq('date', date)

    if (!schedules || schedules.length === 0) return

    const scheduleIds = schedules.map((s) => s.id)
    // この児童が属している transport_details を取得
    const { data: childDetails } = await supabase
      .from('transport_details')
      .select('id, schedule_id')
      .eq('child_id', childId)
      .in('schedule_id', scheduleIds)

    if (!childDetails || childDetails.length === 0) return

    const scheduleMap = new Map(schedules.map((s) => [s.id as string, s.direction as string]))
    for (const detail of childDetails) {
      const direction = scheduleMap.get(detail.schedule_id as string)
      // 児童個人の実績お迎え・お送り時刻を actual_pickup_time に保存
      // (transport_schedules.departure_time は変更しない：他の児童のスケジュールに影響するため)
      const actualTime =
        direction === 'pickup' ? (pickupDeparture || null)
        : direction === 'dropoff' ? (dropoffDeparture || null)
        : null
      await supabase
        .from('transport_details')
        .update({ actual_pickup_time: actualTime })
        .eq('id', detail.id as string)
    }
  }

  const handleSave = async () => {
    if (!selectedDate) return
    setSaving(true)

    const timeFields = {
      pickup_departure_time: pickupDeparture || null,
      pickup_arrival_time: pickupArrival || null,
      dropoff_departure_time: dropoffDeparture || null,
      dropoff_arrival_time: dropoffArrival || null,
      service_start_time: serviceStart || null,
      service_end_time: serviceEnd || null,
      daytime_support: daytimeSupport,
      daytime_support_start_time: daytimeSupport ? (daytimeSupportStart || null) : null,
      daytime_support_end_time: daytimeSupport ? (daytimeSupportEnd || null) : null,
      daytime_pickup_departure_time: daytimeSupport ? (daytimePickupDeparture || null) : null,
      daytime_pickup_arrival_time: daytimeSupport ? (daytimePickupArrival || null) : null,
      daytime_dropoff_departure_time: daytimeSupport ? (daytimeDropoffDeparture || null) : null,
      daytime_dropoff_arrival_time: daytimeSupport ? (daytimeDropoffArrival || null) : null,
      daytime_pickup_driver_member_id: daytimeSupport ? (daytimePickupDriverId || null) : null,
      daytime_pickup_vehicle_id: daytimeSupport ? (daytimePickupVehicleId || null) : null,
      daytime_dropoff_driver_member_id: daytimeSupport ? (daytimeDropoffDriverId || null) : null,
      daytime_dropoff_vehicle_id: daytimeSupport ? (daytimeDropoffVehicleId || null) : null,
    }

    let unitId: string

    setSaveError(null)

    if (selected) {
      const { error } = await supabase
        .from('daily_attendance')
        .update(timeFields)
        .eq('id', selected.id)
      if (error) {
        setSaveError(error.message)
        setSaving(false)
        return
      }
      unitId = selected.unit_id
    } else {
      const resolvedUnitId = newUnitId || (units.length === 1 ? units[0].id : '')
      if (!resolvedUnitId) {
        setSaving(false)
        return
      }
      const { error } = await supabase.from('daily_attendance').insert({
        child_id: childId,
        unit_id: resolvedUnitId,
        date: selectedDate,
        status: 'scheduled',
        ...timeFields,
      })
      if (error) {
        setSaveError(error.message)
        setSaving(false)
        return
      }
      unitId = resolvedUnitId
    }

    if (unitId) {
      await syncTransportSchedules(unitId, selectedDate)
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    startTransition(() => router.refresh())
  }

  const handleBulkSave = async () => {
    if (selectedDates.size === 0) return
    setSaving(true)
    setSaveError(null)

    const timeFields = {
      pickup_departure_time: pickupDeparture || null,
      pickup_arrival_time: pickupArrival || null,
      dropoff_departure_time: dropoffDeparture || null,
      dropoff_arrival_time: dropoffArrival || null,
      service_start_time: serviceStart || null,
      service_end_time: serviceEnd || null,
      daytime_support: daytimeSupport,
      daytime_support_start_time: daytimeSupport ? (daytimeSupportStart || null) : null,
      daytime_support_end_time: daytimeSupport ? (daytimeSupportEnd || null) : null,
      daytime_pickup_departure_time: daytimeSupport ? (daytimePickupDeparture || null) : null,
      daytime_pickup_arrival_time: daytimeSupport ? (daytimePickupArrival || null) : null,
      daytime_dropoff_departure_time: daytimeSupport ? (daytimeDropoffDeparture || null) : null,
      daytime_dropoff_arrival_time: daytimeSupport ? (daytimeDropoffArrival || null) : null,
      daytime_pickup_driver_member_id: daytimeSupport ? (daytimePickupDriverId || null) : null,
      daytime_pickup_vehicle_id: daytimeSupport ? (daytimePickupVehicleId || null) : null,
      daytime_dropoff_driver_member_id: daytimeSupport ? (daytimeDropoffDriverId || null) : null,
      daytime_dropoff_vehicle_id: daytimeSupport ? (daytimeDropoffVehicleId || null) : null,
    }

    for (const date of selectedDates) {
      const att = attendanceMap[date]
      if (att) {
        const { error } = await supabase.from('daily_attendance').update(timeFields).eq('id', att.id)
        if (error) {
          setSaveError(error.message)
          setSaving(false)
          return
        }
      } else {
        const unitId = plannedDateUnitId[date] || (units.length === 1 ? units[0].id : '')
        if (unitId) {
          const { error } = await supabase.from('daily_attendance').insert({
            child_id: childId,
            unit_id: unitId,
            date,
            status: 'scheduled',
            ...timeFields,
          })
          if (error) {
            setSaveError(error.message)
            setSaving(false)
            return
          }
        }
      }
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    startTransition(() => router.refresh())
  }

  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    await supabase.from('daily_attendance').delete().eq('id', selected.id)
    setDeleting(false)
    setConfirmDelete(false)
    setSelectedDates(new Set())
    startTransition(() => router.refresh())
  }

  const handleRestorePlan = async () => {
    if (!selectedDate) return
    const info = cancelledPlanDates[selectedDate]
    if (!info) return
    setRestoringPlan(true)
    await supabase.from('usage_plan_date_overrides').update({ is_cancelled: false }).eq('id', info.overrideId)
    await supabase
      .from('usage_reservations')
      .update({ status: 'confirmed' })
      .eq('child_id', childId)
      .eq('unit_id', info.unitId)
      .eq('date', selectedDate)
      .eq('status', 'cancelled')
    setRestoringPlan(false)
    setConfirmRestorePlan(false)
    setSelectedDates(new Set())
    startTransition(() => router.refresh())
  }

  const handleCancelPlan = async () => {
    if (!selectedDate) return
    const planId = plannedDatePlanId[selectedDate]
    if (!planId) return
    setCancellingPlan(true)
    const { data: existing } = await supabase
      .from('usage_plan_date_overrides')
      .select('id')
      .eq('plan_id', planId)
      .eq('date', selectedDate)
      .maybeSingle()
    if (existing) {
      await supabase
        .from('usage_plan_date_overrides')
        .update({ is_cancelled: true })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('usage_plan_date_overrides')
        .insert({ plan_id: planId, date: selectedDate, is_cancelled: true, transport_type: 'none', pickup_location_type: 'home', dropoff_location_type: 'home' })
    }
    // usage_reservationsも同時にキャンセル
    const unitId = plannedDateUnitId[selectedDate]
    if (unitId) {
      await supabase
        .from('usage_reservations')
        .update({ status: 'cancelled' })
        .eq('child_id', childId)
        .eq('unit_id', unitId)
        .eq('date', selectedDate)
        .in('status', ['confirmed', 'reserved', 'cancel_waiting'])
    }
    setCancellingPlan(false)
    setConfirmCancelPlan(false)
    setSelectedDates(new Set())
    startTransition(() => router.refresh())
  }

  const handleBulkCancelPlan = async () => {
    setBulkCancellingPlan(true)
    for (const date of selectedDates) {
      const planId = plannedDatePlanId[date]
      if (!planId || attendanceMap[date]) continue
      const { data: existing } = await supabase
        .from('usage_plan_date_overrides')
        .select('id')
        .eq('plan_id', planId)
        .eq('date', date)
        .maybeSingle()
      if (existing) {
        await supabase.from('usage_plan_date_overrides').update({ is_cancelled: true }).eq('id', existing.id)
      } else {
        await supabase.from('usage_plan_date_overrides').insert({ plan_id: planId, date, is_cancelled: true, transport_type: 'none', pickup_location_type: 'home', dropoff_location_type: 'home' })
      }
      // usage_reservationsも同時にキャンセル
      const unitId = plannedDateUnitId[date]
      if (unitId) {
        await supabase
          .from('usage_reservations')
          .update({ status: 'cancelled' })
          .eq('child_id', childId)
          .eq('unit_id', unitId)
          .eq('date', date)
          .in('status', ['confirmed', 'reserved', 'cancel_waiting'])
      }
    }
    setBulkCancellingPlan(false)
    setConfirmBulkCancelPlan(false)
    setSelectedDates(new Set())
    startTransition(() => router.refresh())
  }

  const changeMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1)
    const path = basePath ?? `/children/${childId}/schedule`
    router.push(`${path}?year=${d.getFullYear()}&month=${d.getMonth() + 1}`)
    setSelectedDates(new Set())
  }

  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startPad = firstDay.getDay()
  const cells = Array.from(
    { length: Math.ceil((startPad + lastDay.getDate()) / 7) * 7 },
    (_, i) => {
      const dayNum = i - startPad + 1
      if (dayNum < 1 || dayNum > lastDay.getDate()) return null
      return `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    }
  )

  const today = getTodayJST()

  return (
    <div className="space-y-3">
      {/* 月ナビ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-semibold text-gray-900">{year}年{month}月の出席記録</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => changeMonth(1)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 複数選択中のバッジ */}
      {isMultiSelect && (
        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
          <span className="text-xs text-indigo-700 font-medium">{selectedDates.size}日を選択中（Ctrl+クリックで追加/解除）</span>
          <button
            onClick={() => setSelectedDates(new Set())}
            className="text-xs text-indigo-500 hover:text-indigo-700 underline"
          >
            選択を解除
          </button>
        </div>
      )}

      {/* カレンダーグリッド */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
          {DAY_LABELS.map((d, i) => (
            <div
              key={d}
              className={cn(
                'text-center text-xs font-medium py-2',
                i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
              )}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, idx) => {
            if (!date) return <div key={idx} className="h-12 border-b border-r border-gray-50" />
            const att = attendanceMap[date]
            const isToday = date === today
            const isSelected = selectedDates.has(date)
            const dow = new Date(date).getDay()
            const isAttended = att?.status === 'attended'
            const isAbsent = att?.status === 'absent'
            const isScheduled = att?.status === 'scheduled'
            const isPlanned = plannedSet.has(date) && !att
            const isCancelledPlan = !!cancelledPlanDates[date] && !att && !plannedSet.has(date)
            const contact = parentContactMap[date]

            return (
              <button
                key={date}
                onClick={(e) => handleDateClick(date, e.ctrlKey || e.metaKey)}
                title={getJapaneseHolidayName(date) ?? undefined}
                className={cn(
                  'relative h-12 border-b border-r border-gray-50 p-1 flex flex-col items-center transition-colors hover:bg-indigo-50',
                  getJapaneseHolidayName(date) && !isSelected && 'bg-red-50/60',
                  isSelected && 'bg-indigo-100 ring-1 ring-inset ring-indigo-400'
                )}
              >
                {/* 保護者からのLINE利用連絡（右上の四角マーカー） */}
                {contact && (
                  <span
                    className={cn('absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-sm', parentContactMeta(contact).color)}
                    title={`保護者連絡: ${parentContactMeta(contact).label}`}
                  />
                )}
                <div
                  className={cn(
                    'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                    isToday
                      ? 'bg-indigo-600 text-white'
                      : (dow === 0 || isJapaneseNationalHoliday(date))
                      ? 'text-red-500'
                      : dow === 6
                      ? 'text-blue-500'
                      : 'text-gray-700'
                  )}
                >
                  {new Date(date).getDate()}
                </div>
                {isAttended && <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-0.5" />}
                {isAbsent && <div className="w-1.5 h-1.5 rounded-full bg-red-300 mt-0.5" />}
                {isScheduled && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-0.5" />}
                {isPlanned && <div className="w-1.5 h-1.5 rounded-full bg-indigo-300 mt-0.5" />}
                {isCancelledPlan && <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-0.5" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />出席
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-300" />欠席
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-400" />利用予定
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-indigo-300" />スケジュール
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-gray-300" />キャンセル済み予定
        </div>
        <div className="flex items-center gap-1.5 text-gray-400">
          Ctrl+クリックで複数選択
        </div>
      </div>

      {/* 保護者連絡（LINE）の凡例：マス目右上の四角マーカー */}
      <div className="flex gap-4 text-xs text-gray-500 flex-wrap items-center">
        <span className="text-gray-400">保護者連絡（右上の■）:</span>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-sm bg-green-500" />放デイ
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-sm bg-orange-400" />日中一時
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-sm bg-red-400" />お休み
        </div>
      </div>

      {/* 一括編集パネル（複数選択時） */}
      {isMultiSelect && (
        <div className="bg-white rounded-xl border border-indigo-200 p-4 space-y-4">
          <h3 className="font-semibold text-sm text-indigo-700">
            {selectedDates.size}日を一括編集
          </h3>
          <p className="text-xs text-gray-400">入力した時間が選択中の全日程に適用されます。空欄の項目は変更されません。</p>

          {/* 送迎時間 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Car className="h-3.5 w-3.5 text-teal-500" />
              <span className="text-xs font-semibold text-gray-600">送迎時間</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TimeField label="お迎え出発" value={pickupDeparture} onChange={setPickupDeparture} />
              <TimeField label="事務所到着" value={pickupArrival} onChange={setPickupArrival} />
              <TimeField label="事務所出発" value={dropoffDeparture} onChange={setDropoffDeparture} />
              <TimeField label="自宅到着" value={dropoffArrival} onChange={setDropoffArrival} />
            </div>
          </div>

          {/* 利用時間 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-semibold text-gray-600">利用時間</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TimeField label="開始時間" value={serviceStart} onChange={setServiceStart} />
              <TimeField label="終了時間" value={serviceEnd} onChange={setServiceEnd} />
            </div>
          </div>

          {/* 日中一時利用 */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={daytimeSupport}
                onChange={(e) => setDaytimeSupport(e.target.checked)}
                className="w-4 h-4 accent-purple-500"
              />
              <Clock className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-xs font-semibold text-gray-600">日中一時利用</span>
            </label>
            {daytimeSupport && (
              <div className="space-y-2 pl-2 border-l-2 border-purple-100">
                <div className="grid grid-cols-2 gap-2">
                  <TimeField label="提供開始時間" value={daytimeSupportStart} onChange={setDaytimeSupportStart} />
                  <TimeField label="提供終了時間" value={daytimeSupportEnd} onChange={setDaytimeSupportEnd} />
                </div>
                <p className="text-[10px] font-semibold text-gray-500">お迎え（日中一時）</p>
                <div className="grid grid-cols-2 gap-2">
                  <TimeField label="お迎え出発" value={daytimePickupDeparture} onChange={setDaytimePickupDeparture} />
                  <TimeField label="事務所到着" value={daytimePickupArrival} onChange={setDaytimePickupArrival} />
                </div>
                {staffMembers.length > 0 && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ドライバー（お迎え）</label>
                    <select value={daytimePickupDriverId} onChange={(e) => setDaytimePickupDriverId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white">
                      <option value="">未選択</option>
                      {staffMembers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                {vehicles.length > 0 && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">車種（お迎え）</label>
                    <select value={daytimePickupVehicleId} onChange={(e) => setDaytimePickupVehicleId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white">
                      <option value="">未選択</option>
                      {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                )}
                <p className="text-[10px] font-semibold text-gray-500">送り（日中一時）</p>
                <div className="grid grid-cols-2 gap-2">
                  <TimeField label="事務所出発" value={daytimeDropoffDeparture} onChange={setDaytimeDropoffDeparture} />
                  <TimeField label="自宅到着" value={daytimeDropoffArrival} onChange={setDaytimeDropoffArrival} />
                </div>
                {staffMembers.length > 0 && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ドライバー（送り）</label>
                    <select value={daytimeDropoffDriverId} onChange={(e) => setDaytimeDropoffDriverId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white">
                      <option value="">未選択</option>
                      {staffMembers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                {vehicles.length > 0 && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">車種（送り）</label>
                    <select value={daytimeDropoffVehicleId} onChange={(e) => setDaytimeDropoffVehicleId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white">
                      <option value="">未選択</option>
                      {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          <Button
            onClick={handleBulkSave}
            disabled={saving}
            size="sm"
            className="w-full"
          >
            {saved ? (
              <><CheckCircle className="h-4 w-4" />保存しました</>
            ) : (
              <><Save className="h-4 w-4" />{saving ? '保存中...' : `${selectedDates.size}日分を一括保存`}</>
            )}
          </Button>
          {saveError && (
            <p className="text-xs text-red-500 text-center">{saveError}</p>
          )}

          {/* 一括予定削除（スケジュールドットがあり出席記録のない日のみ対象） */}
          {(() => {
            const cancellable = [...selectedDates].filter(d => plannedDatePlanId[d] && !attendanceMap[d])
            if (cancellable.length === 0) return null
            return confirmBulkCancelPlan ? (
              <div className="flex gap-2">
                <Button
                  onClick={handleBulkCancelPlan}
                  disabled={bulkCancellingPlan}
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                >
                  <Trash2 className="h-4 w-4" />
                  {bulkCancellingPlan ? '削除中...' : `${cancellable.length}日の予定を削除する`}
                </Button>
                <Button
                  onClick={() => setConfirmBulkCancelPlan(false)}
                  size="sm"
                  variant="outline"
                  className="flex-1"
                >
                  キャンセル
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setConfirmBulkCancelPlan(true)}
                size="sm"
                variant="outline"
                className="w-full text-red-500 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                {cancellable.length}日の予定を一括削除
              </Button>
            )
          })()}
        </div>
      )}

      {/* 日付詳細・編集パネル（単一選択時） */}
      {selectedDate && !isMultiSelect && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-gray-900">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ja-JP', {
                month: 'long',
                day: 'numeric',
                weekday: 'short',
              })}
            </h3>
            {selected ? (
              <Badge variant={selected.status === 'attended' ? 'success' : selected.status === 'scheduled' ? 'default' : 'secondary'}>
                {selected.status === 'attended' ? '出席' : selected.status === 'scheduled' ? '利用予定' : '欠席'}
              </Badge>
            ) : (
              <span className="text-xs text-gray-400">記録なし（新規追加）</span>
            )}
          </div>

          {/* 保護者からのLINE利用連絡 */}
          {(() => {
            const contact = parentContactMap[selectedDate]
            if (!contact) return null
            const meta = parentContactMeta(contact)
            return (
              <div className={cn('rounded-lg border p-3 space-y-1.5', meta.bg, meta.border)}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-sm shrink-0', meta.color)} />
                    <span className="text-xs font-semibold text-gray-600">保護者からの連絡（LINE）</span>
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {new Date(contact.reported_at).toLocaleString('ja-JP', {
                      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })} 受信
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap pl-4">
                  <span className={cn('text-sm font-semibold', meta.text)}>{meta.label}</span>
                  {contact.status === 'attending' && (
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                      contact.transport_type !== 'none' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                    )}>
                      {PARENT_TRANSPORT_LABELS[contact.transport_type]}
                    </span>
                  )}
                  {contact.status === 'attending' && (
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                      contact.approval_status === 'approved' ? 'bg-emerald-600 text-white'
                      : contact.approval_status === 'rejected' ? 'bg-gray-500 text-white'
                      : 'bg-amber-100 text-amber-700'
                    )}>
                      {contact.approval_status === 'approved' ? '承認済み'
                        : contact.approval_status === 'rejected' ? '非承認'
                        : '承認待ち'}
                    </span>
                  )}
                </div>
                {contact.status === 'attending' && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-4">
                    {(fmt(contact.service_start_time) || fmt(contact.service_end_time)) && (
                      <span className="text-xs text-gray-600">
                        利用希望 {fmt(contact.service_start_time) || '—'}〜{fmt(contact.service_end_time) || '—'}
                      </span>
                    )}
                    {fmt(contact.pickup_time) && (
                      <span className="text-xs text-gray-600">迎え希望 {fmt(contact.pickup_time)}</span>
                    )}
                    {fmt(contact.dropoff_time) && (
                      <span className="text-xs text-gray-600">送り希望 {fmt(contact.dropoff_time)}</span>
                    )}
                  </div>
                )}
                {contact.note && (
                  <p className="text-xs text-gray-600 pl-4 whitespace-pre-wrap">{contact.note}</p>
                )}
              </div>
            )
          })()}

          {/* ユニット表示 or 選択 */}
          {selected ? (
            selected.units?.name && (
              <p className="text-xs text-gray-500">ユニット: {selected.units.name}</p>
            )
          ) : units.length > 1 ? (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ユニット</label>
              <select
                value={newUnitId}
                onChange={(e) => setNewUnitId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">選択してください</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          ) : units.length === 1 ? (
            <p className="text-xs text-gray-500">ユニット: {units[0].name}</p>
          ) : null}

          {/* 送迎時間 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Car className="h-3.5 w-3.5 text-teal-500" />
              <span className="text-xs font-semibold text-gray-600">送迎時間</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TimeField label="お迎え出発" value={pickupDeparture} onChange={setPickupDeparture} />
              <TimeField label="事務所到着" value={pickupArrival} onChange={setPickupArrival} />
              <TimeField label="事務所出発" value={dropoffDeparture} onChange={setDropoffDeparture} />
              <TimeField label="自宅到着" value={dropoffArrival} onChange={setDropoffArrival} />
            </div>
          </div>

          {/* 利用時間 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-semibold text-gray-600">利用時間</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TimeField label="開始時間" value={serviceStart} onChange={setServiceStart} />
              <TimeField label="終了時間" value={serviceEnd} onChange={setServiceEnd} />
            </div>
          </div>

          {/* 日中一時利用 */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={daytimeSupport}
                onChange={(e) => setDaytimeSupport(e.target.checked)}
                className="w-4 h-4 accent-purple-500"
              />
              <Clock className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-xs font-semibold text-gray-600">日中一時利用</span>
            </label>
            {daytimeSupport && (
              <div className="space-y-2 pl-2 border-l-2 border-purple-100">
                <div className="grid grid-cols-2 gap-2">
                  <TimeField label="提供開始時間" value={daytimeSupportStart} onChange={setDaytimeSupportStart} />
                  <TimeField label="提供終了時間" value={daytimeSupportEnd} onChange={setDaytimeSupportEnd} />
                </div>
                <p className="text-[10px] font-semibold text-gray-500">お迎え（日中一時）</p>
                <div className="grid grid-cols-2 gap-2">
                  <TimeField label="お迎え出発" value={daytimePickupDeparture} onChange={setDaytimePickupDeparture} />
                  <TimeField label="事務所到着" value={daytimePickupArrival} onChange={setDaytimePickupArrival} />
                </div>
                {staffMembers.length > 0 && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ドライバー（お迎え）</label>
                    <select value={daytimePickupDriverId} onChange={(e) => setDaytimePickupDriverId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white">
                      <option value="">未選択</option>
                      {staffMembers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                {vehicles.length > 0 && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">車種（お迎え）</label>
                    <select value={daytimePickupVehicleId} onChange={(e) => setDaytimePickupVehicleId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white">
                      <option value="">未選択</option>
                      {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                )}
                <p className="text-[10px] font-semibold text-gray-500">送り（日中一時）</p>
                <div className="grid grid-cols-2 gap-2">
                  <TimeField label="事務所出発" value={daytimeDropoffDeparture} onChange={setDaytimeDropoffDeparture} />
                  <TimeField label="自宅到着" value={daytimeDropoffArrival} onChange={setDaytimeDropoffArrival} />
                </div>
                {staffMembers.length > 0 && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ドライバー（送り）</label>
                    <select value={daytimeDropoffDriverId} onChange={(e) => setDaytimeDropoffDriverId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white">
                      <option value="">未選択</option>
                      {staffMembers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                {vehicles.length > 0 && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">車種（送り）</label>
                    <select value={daytimeDropoffVehicleId} onChange={(e) => setDaytimeDropoffVehicleId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white">
                      <option value="">未選択</option>
                      {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 保存ボタン */}
          <Button
            onClick={handleSave}
            disabled={saving || (!selected && units.length > 1 && !newUnitId)}
            size="sm"
            className="w-full"
          >
            {saved ? (
              <><CheckCircle className="h-4 w-4" />保存しました</>
            ) : (
              <><Save className="h-4 w-4" />{saving ? '保存中...' : selected ? '変更を保存' : '利用予定として記録'}</>
            )}
          </Button>
          {saveError && (
            <p className="text-xs text-red-500 text-center">{saveError}</p>
          )}

          {/* 削除ボタン（既存レコードのみ） */}
          {selected && (
            confirmDelete ? (
              <div className="flex gap-2">
                <Button
                  onClick={handleDelete}
                  disabled={deleting}
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? '削除中...' : '本当に削除する'}
                </Button>
                <Button
                  onClick={() => setConfirmDelete(false)}
                  size="sm"
                  variant="outline"
                  className="flex-1"
                >
                  キャンセル
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setConfirmDelete(true)}
                size="sm"
                variant="outline"
                className="w-full text-red-500 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                この記録を削除
              </Button>
            )
          )}

          {/* キャンセル解除ボタン（キャンセル済み予定の日、既存レコードなし） */}
          {!selected && selectedDate && cancelledPlanDates[selectedDate] && (
            confirmRestorePlan ? (
              <div className="flex gap-2">
                <Button
                  onClick={handleRestorePlan}
                  disabled={restoringPlan}
                  size="sm"
                  variant="outline"
                  className="flex-1 text-green-600 border-green-300 hover:bg-green-50"
                >
                  {restoringPlan ? '解除中...' : '予定を復元する'}
                </Button>
                <Button
                  onClick={() => setConfirmRestorePlan(false)}
                  size="sm"
                  variant="outline"
                  className="flex-1"
                >
                  キャンセル
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setConfirmRestorePlan(true)}
                size="sm"
                variant="outline"
                className="w-full text-green-600 border-green-300 hover:bg-green-50"
              >
                この日のキャンセルを解除する
              </Button>
            )
          )}

          {/* 予定削除ボタン（スケジュールドットの日、既存レコードなし） */}
          {!selected && selectedDate && plannedDatePlanId[selectedDate] && (
            confirmCancelPlan ? (
              <div className="flex gap-2">
                <Button
                  onClick={handleCancelPlan}
                  disabled={cancellingPlan}
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                >
                  <Trash2 className="h-4 w-4" />
                  {cancellingPlan ? '削除中...' : '本当に削除する'}
                </Button>
                <Button
                  onClick={() => setConfirmCancelPlan(false)}
                  size="sm"
                  variant="outline"
                  className="flex-1"
                >
                  キャンセル
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setConfirmCancelPlan(true)}
                size="sm"
                variant="outline"
                className="w-full text-red-500 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                この日の予定を削除
              </Button>
            )
          )}
        </div>
      )}
    </div>
  )
}
