'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, Car, Clock, CalendarDays, Save, CheckCircle, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
  units: { name: string } | null
}

interface Props {
  year: number
  month: number
  childId: string
  attendances: AttendanceRecord[]
  units?: Array<{ id: string; name: string }>
  plannedDates?: string[]
  plannedDateUnitId?: Record<string, string>
  plannedDatePlanId?: Record<string, string>
  basePath?: string
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

export function ChildAttendanceCalendar({ year, month, childId, attendances, units = [], plannedDates = [], plannedDateUnitId = {}, plannedDatePlanId = {}, basePath }: Props) {
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

  const attendanceMap = Object.fromEntries(attendances.map((a) => [a.date, a]))
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
      } else {
        setPickupDeparture('')
        setPickupArrival('')
        setDropoffDeparture('')
        setDropoffArrival('')
        setServiceStart('')
        setServiceEnd('')
        setDaytimeSupport(false)
        setDaytimeSupportStart('')
        setDaytimeSupportEnd('')
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
    }
  }, [selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDateClick = (date: string, ctrlKey: boolean) => {
    setSaved(false)
    setConfirmDelete(false)
    setConfirmCancelPlan(false)
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
    const { data: childDetails } = await supabase
      .from('transport_details')
      .select('schedule_id')
      .eq('child_id', childId)
      .in('schedule_id', scheduleIds)

    const childScheduleIds = new Set((childDetails ?? []).map((d) => d.schedule_id))
    for (const schedule of schedules) {
      if (!childScheduleIds.has(schedule.id)) continue
      const newDeparture =
        schedule.direction === 'pickup' ? (pickupDeparture || null)
        : schedule.direction === 'dropoff' ? (dropoffDeparture || null)
        : null
      if (newDeparture !== undefined) {
        await supabase
          .from('transport_schedules')
          .update({ departure_time: newDeparture })
          .eq('id', schedule.id)
      }
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

  const today = new Date().toISOString().slice(0, 10)

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

            return (
              <button
                key={date}
                onClick={(e) => handleDateClick(date, e.ctrlKey || e.metaKey)}
                className={cn(
                  'h-12 border-b border-r border-gray-50 p-1 flex flex-col items-center transition-colors hover:bg-indigo-50',
                  isSelected && 'bg-indigo-100 ring-1 ring-inset ring-indigo-400'
                )}
              >
                <div
                  className={cn(
                    'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                    isToday
                      ? 'bg-indigo-600 text-white'
                      : dow === 0
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
        <div className="flex items-center gap-1.5 text-gray-400">
          Ctrl+クリックで複数選択
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

          {/* 提供時間 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-semibold text-gray-600">提供時間</span>
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
                className="w-4 h-4 accent-orange-500"
              />
              <Clock className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-xs font-semibold text-gray-600">日中一時利用</span>
            </label>
            {daytimeSupport && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                <TimeField label="開始時間" value={daytimeSupportStart} onChange={setDaytimeSupportStart} />
                <TimeField label="終了時間" value={daytimeSupportEnd} onChange={setDaytimeSupportEnd} />
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

          {/* 提供時間 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-semibold text-gray-600">提供時間</span>
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
                className="w-4 h-4 accent-orange-500"
              />
              <Clock className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-xs font-semibold text-gray-600">日中一時利用</span>
            </label>
            {daytimeSupport && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                <TimeField label="開始時間" value={daytimeSupportStart} onChange={setDaytimeSupportStart} />
                <TimeField label="終了時間" value={daytimeSupportEnd} onChange={setDaytimeSupportEnd} />
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
