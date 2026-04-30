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

export function ChildAttendanceCalendar({ year, month, childId, attendances, basePath }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
    }
  }, [selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    await supabase
      .from('daily_attendance')
      .update({
        pickup_departure_time: pickupDeparture || null,
        pickup_arrival_time: pickupArrival || null,
        dropoff_departure_time: dropoffDeparture || null,
        dropoff_arrival_time: dropoffArrival || null,
        service_start_time: serviceStart || null,
        service_end_time: serviceEnd || null,
        daytime_support: daytimeSupport,
        daytime_support_start_time: daytimeSupport ? (daytimeSupportStart || null) : null,
        daytime_support_end_time: daytimeSupport ? (daytimeSupportEnd || null) : null,
      })
      .eq('id', selected.id)
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
              <Badge variant={selected.status === 'attended' ? 'success' : 'secondary'}>
                {selected.status === 'attended' ? '出席' : '欠席'}
              </Badge>
            ) : (
              <span className="text-xs text-gray-400">記録なし</span>
            )}
          </div>

          {!selected ? (
            <p className="text-sm text-gray-400 text-center py-2">この日の出席記録がありません</p>
          ) : (
            <>
              {/* ユニット */}
              {selected.units?.name && (
                <p className="text-xs text-gray-500">ユニット: {selected.units.name}</p>
              )}

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
              <Button onClick={handleSave} disabled={saving} size="sm" className="w-full">
                {saved ? (
                  <><CheckCircle className="h-4 w-4" />保存しました</>
                ) : (
                  <><Save className="h-4 w-4" />{saving ? '保存中...' : '変更を保存'}</>
                )}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
