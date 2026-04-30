'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, Car, Clock, CalendarDays, Save, CheckCircle } from 'lucide-react'
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

export function ChildAttendanceCalendar({ year, month, childId, attendances, units = [], basePath }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newUnitId, setNewUnitId] = useState('')

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
  const selected = selectedDate ? (attendanceMap[selectedDate] ?? null) : null

  // 日付が変わったら編集フィールドを初期化
  useEffect(() => {
    if (selected) {
      setPickupDeparture(fmt(selected.pickup_departure_time))
      setPickupArrival(fmt(selected.pickup_arrival_time))
      setDropoffDeparture(fmt(selected.dropoff_departure_time))
      setDropoffArrival(fmt(selected.dropoff_arrival_time))
      setServiceStart(fmt(selected.service_start_time))
      setServiceEnd(fmt(selected.service_end_time))
      setDaytimeSupport(selected.daytime_support)
      setDaytimeSupportStart(fmt(selected.daytime_support_start_time))
      setDaytimeSupportEnd(fmt(selected.daytime_support_end_time))
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
      setNewUnitId(units.length === 1 ? units[0].id : '')
    }
  }, [selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

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

    if (selected) {
      // 既存レコードを更新
      await supabase
        .from('daily_attendance')
        .update(timeFields)
        .eq('id', selected.id)
      unitId = selected.unit_id
    } else {
      // 新規レコードを追加
      const resolvedUnitId = newUnitId || (units.length === 1 ? units[0].id : '')
      if (!resolvedUnitId) {
        setSaving(false)
        return
      }
      await supabase.from('daily_attendance').insert({
        child_id: childId,
        unit_id: resolvedUnitId,
        date: selectedDate,
        status: 'scheduled',
        ...timeFields,
      })
      unitId = resolvedUnitId
    }

    // 送迎スケジュールの出発時間を同期
    if (unitId) {
      await syncTransportSchedules(unitId, selectedDate)
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    startTransition(() => router.refresh())
  }

  const changeMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1)
    const path = basePath ?? `/children/${childId}/schedule`
    router.push(`${path}?year=${d.getFullYear()}&month=${d.getMonth() + 1}`)
    setSelectedDate(null)
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
            const isSelected = date === selectedDate
            const dow = new Date(date).getDay()
            const isAttended = att?.status === 'attended'
            const isAbsent = att?.status === 'absent'
            const isScheduled = att?.status === 'scheduled'

            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date === selectedDate ? null : date)}
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
              </button>
            )
          })}
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />出席
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-300" />欠席
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-400" />利用予定
        </div>
      </div>

      {/* 日付詳細・編集パネル */}
      {selectedDate && (
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
              <><Save className="h-4 w-4" />{saving ? '保存中...' : selected ? '変更を保存' : '出席として記録'}</>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
