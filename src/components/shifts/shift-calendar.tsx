'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type Staff = {
  id: string
  name: string
  employment_type: string | null
}

type ShiftEntry = {
  id: string
  staff_id: string
  date: string
  shift_type: string
  start_time: string | null
  end_time: string | null
  unit_id: string | null
  note: string | null
}

type Unit = {
  id: string
  name: string
}

interface Props {
  year: number
  month: number
  staffList: Staff[]
  shifts: ShiftEntry[]
  units: Unit[]
}

const SHIFT_TYPES = [
  { value: 'full', label: '全日', color: 'bg-indigo-500 text-white' },
  { value: 'morning', label: '午前', color: 'bg-blue-400 text-white' },
  { value: 'afternoon', label: '午後', color: 'bg-teal-400 text-white' },
  { value: 'off', label: '休み', color: 'bg-gray-300 text-gray-600' },
  { value: 'holiday', label: '有休', color: 'bg-orange-400 text-white' },
]

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export function ShiftCalendar({ year, month, staffList, shifts, units }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [selectedStaff, setSelectedStaff] = useState<string>(staffList[0]?.id ?? '')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [shiftType, setShiftType] = useState('full')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('18:00')
  const [unitId, setUnitId] = useState(units[0]?.id ?? '')
  const [saving, setSaving] = useState(false)

  const changeMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1)
    router.push(`/shifts?year=${d.getFullYear()}&month=${d.getMonth() + 1}`)
  }

  // カレンダーグリッド
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startPad = firstDay.getDay()
  const totalCells = startPad + lastDay.getDate()
  const cells = Array.from({ length: Math.ceil(totalCells / 7) * 7 }, (_, i) => {
    const dayNum = i - startPad + 1
    if (dayNum < 1 || dayNum > lastDay.getDate()) return null
    return `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
  })

  // シフトマップ: staffId -> date -> shift
  const shiftMap: Record<string, Record<string, ShiftEntry>> = {}
  shifts.forEach((s) => {
    if (!shiftMap[s.staff_id]) shiftMap[s.staff_id] = {}
    shiftMap[s.staff_id][s.date] = s
  })

  const currentStaffShifts = shiftMap[selectedStaff] ?? {}
  const selectedShift = selectedDate ? currentStaffShifts[selectedDate] : null

  const handleSaveShift = async () => {
    if (!selectedDate || !selectedStaff) return
    setSaving(true)

    if (selectedShift) {
      // 更新
      await supabase
        .from('staff_shifts')
        .update({
          shift_type: shiftType,
          start_time: shiftType === 'off' || shiftType === 'holiday' ? null : startTime,
          end_time: shiftType === 'off' || shiftType === 'holiday' ? null : endTime,
          unit_id: unitId || null,
        })
        .eq('id', selectedShift.id)
    } else {
      // 新規
      await supabase.from('staff_shifts').insert({
        staff_id: selectedStaff,
        date: selectedDate,
        shift_type: shiftType,
        start_time: shiftType === 'off' || shiftType === 'holiday' ? null : startTime,
        end_time: shiftType === 'off' || shiftType === 'holiday' ? null : endTime,
        unit_id: unitId || null,
      })
    }

    setSaving(false)
    setSelectedDate(null)
    startTransition(() => router.refresh())
  }

  const handleDeleteShift = async () => {
    if (!selectedShift) return
    setSaving(true)
    await supabase.from('staff_shifts').delete().eq('id', selectedShift.id)
    setSaving(false)
    setSelectedDate(null)
    startTransition(() => router.refresh())
  }

  // 日ごとの出勤人数
  const dailyCount: Record<string, number> = {}
  shifts.forEach((s) => {
    if (s.shift_type !== 'off' && s.shift_type !== 'holiday') {
      dailyCount[s.date] = (dailyCount[s.date] ?? 0) + 1
    }
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">シフト管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">スタッフの勤務シフト</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="p-2 rounded-lg hover:bg-gray-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold min-w-[80px] text-center">
            {year}年{month}月
          </span>
          <button onClick={() => changeMonth(1)} className="p-2 rounded-lg hover:bg-gray-100">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* スタッフ選択 */}
      <div className="flex gap-2 flex-wrap">
        {staffList.map((s) => (
          <button
            key={s.id}
            onClick={() => { setSelectedStaff(s.id); setSelectedDate(null) }}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              selectedStaff === s.id
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* カレンダー */}
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
            if (!date) {
              return <div key={idx} className="h-16 border-b border-r border-gray-50" />
            }
            const dayOfWeek = new Date(date).getDay()
            const shift = currentStaffShifts[date]
            const isSelected = date === selectedDate
            const shiftInfo = shift ? SHIFT_TYPES.find((t) => t.value === shift.shift_type) : null
            const count = dailyCount[date] ?? 0

            return (
              <button
                key={date}
                onClick={() => {
                  setSelectedDate(date === selectedDate ? null : date)
                  if (shift) {
                    setShiftType(shift.shift_type)
                    setStartTime(shift.start_time ?? '09:00')
                    setEndTime(shift.end_time ?? '18:00')
                  } else {
                    setShiftType('full')
                    setStartTime('09:00')
                    setEndTime('18:00')
                  }
                }}
                className={cn(
                  'h-16 border-b border-r border-gray-50 p-1 text-left transition-colors hover:bg-indigo-50',
                  isSelected && 'bg-indigo-100 ring-1 ring-inset ring-indigo-400'
                )}
              >
                <div
                  className={cn(
                    'text-xs font-medium mb-0.5',
                    dayOfWeek === 0 && 'text-red-500',
                    dayOfWeek === 6 && 'text-blue-500',
                    dayOfWeek > 0 && dayOfWeek < 6 && 'text-gray-700'
                  )}
                >
                  {new Date(date).getDate()}
                </div>
                {shiftInfo && (
                  <div className={cn('text-xs px-1 rounded truncate', shiftInfo.color)}>
                    {shiftInfo.label}
                  </div>
                )}
                {count > 0 && (
                  <div className="text-xs text-gray-400 mt-0.5">{count}人</div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex gap-3 flex-wrap text-xs text-gray-500">
        {SHIFT_TYPES.map((t) => (
          <div key={t.value} className="flex items-center gap-1">
            <div className={cn('w-3 h-3 rounded', t.color.split(' ')[0])} />
            {t.label}
          </div>
        ))}
      </div>

      {/* 編集パネル */}
      {selectedDate && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              {new Date(selectedDate).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
              {' — '}
              {staffList.find((s) => s.id === selectedStaff)?.name}
            </h2>
            {selectedShift && (
              <button
                onClick={handleDeleteShift}
                disabled={saving}
                className="p-1 text-red-400 hover:bg-red-50 rounded"
                title="シフトを削除"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">シフト種別</label>
            <div className="flex gap-2 flex-wrap">
              {SHIFT_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setShiftType(t.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                    shiftType === t.value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {shiftType !== 'off' && shiftType !== 'holiday' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">開始時間</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">終了時間</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {units.length > 0 && shiftType !== 'off' && shiftType !== 'holiday' && (
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">担当ユニット</label>
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">未割当</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          <Button onClick={handleSaveShift} disabled={saving} size="sm">
            <Check className="h-4 w-4" />
            {saving ? '保存中...' : 'シフトを保存'}
          </Button>
        </div>
      )}
    </div>
  )
}
