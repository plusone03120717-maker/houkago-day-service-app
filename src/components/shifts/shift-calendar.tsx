'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, X, Check, Layers, CalendarClock } from 'lucide-react'
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

type OvertimeRequest = {
  id: string
  staff_id: string
  date: string
  overtime_minutes: number
  status: string
}

interface Props {
  year: number
  month: number
  staffList: Staff[]
  shifts: ShiftEntry[]
  units: Unit[]
  overtimeRequests?: OvertimeRequest[]
}

const SHIFT_TYPES = [
  { value: 'full',     label: '全日', color: 'bg-indigo-500 text-white' },
  { value: 'morning',  label: '午前', color: 'bg-blue-400 text-white' },
  { value: 'afternoon',label: '午後', color: 'bg-teal-400 text-white' },
  { value: 'off',      label: '休み', color: 'bg-gray-300 text-gray-600' },
  { value: 'holiday',  label: '有休', color: 'bg-orange-400 text-white' },
]

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function formatDateLabel(date: string) {
  return new Date(date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
}

export function ShiftCalendar({ year, month, staffList, shifts, units, overtimeRequests = [] }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [selectedStaff, setSelectedStaff] = useState<string>(staffList[0]?.id ?? '')
  // 複数日選択: Set<dateString>
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  // 複数選択モード（ボタン or Ctrl/⌘キー）
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const ctrlHeldRef = useRef(false)

  // window レベルで Ctrl/⌘ キーの押下状態を追跡（e.ctrlKey より確実）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') ctrlHeldRef.current = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') ctrlHeldRef.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])
  const [shiftType, setShiftType]   = useState('full')
  const [startTime, setStartTime]   = useState('09:00')
  const [endTime, setEndTime]       = useState('18:00')
  const [unitId, setUnitId]         = useState(units[0]?.id ?? '')
  const [saving, setSaving]         = useState(false)

  // 残業申請フォーム（事前・事後共用）
  const [showOTForm, setShowOTForm] = useState(false)
  const [otForm, setOtForm] = useState({ date: '', overtime_minutes: '30', note: '' })
  const [savingOT, setSavingOT] = useState(false)
  const [otResult, setOtResult] = useState<'ok' | 'error' | null>(null)

  // カレンダーグリッド
  const firstDay  = new Date(year, month - 1, 1)
  const lastDay   = new Date(year, month, 0)
  const startPad  = firstDay.getDay()
  const totalCells = startPad + lastDay.getDate()
  const cells = Array.from({ length: Math.ceil(totalCells / 7) * 7 }, (_, i) => {
    const dayNum = i - startPad + 1
    if (dayNum < 1 || dayNum > lastDay.getDate()) return null
    return `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
  })

  // シフトマップ
  const shiftMap: Record<string, Record<string, ShiftEntry>> = {}
  shifts.forEach((s) => {
    if (!shiftMap[s.staff_id]) shiftMap[s.staff_id] = {}
    shiftMap[s.staff_id][s.date] = s
  })
  const currentStaffShifts = shiftMap[selectedStaff] ?? {}

  // 残業マップ（staff_id -> date -> minutes）
  const overtimeMap: Record<string, Record<string, number>> = {}
  overtimeRequests.forEach((o) => {
    if (!overtimeMap[o.staff_id]) overtimeMap[o.staff_id] = {}
    overtimeMap[o.staff_id][o.date] = (overtimeMap[o.staff_id][o.date] ?? 0) + o.overtime_minutes
  })
  const currentStaffOvertime = overtimeMap[selectedStaff] ?? {}

  // 日単位の出勤人数
  const dailyCount: Record<string, number> = {}
  shifts.forEach((s) => {
    if (s.shift_type !== 'off' && s.shift_type !== 'holiday') {
      dailyCount[s.date] = (dailyCount[s.date] ?? 0) + 1
    }
  })

  // 単一選択時のみ有効な派生値（複数選択時は null）
  const selectedDate = selectedDates.size === 1 ? [...selectedDates][0] : null

  // 選択日が変わったらフォームを初期化（child-attendance-calendar と同じパターン）
  useEffect(() => {
    if (selectedDate) {
      const shift = currentStaffShifts[selectedDate]
      if (shift) {
        setShiftType(shift.shift_type)
        setStartTime(shift.start_time ?? '09:00')
        setEndTime(shift.end_time ?? '18:00')
        setUnitId(shift.unit_id ?? units[0]?.id ?? '')
      } else {
        setShiftType('full')
        setStartTime('09:00')
        setEndTime('18:00')
        setUnitId(units[0]?.id ?? '')
      }
    }
  }, [selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // クリックハンドラーは setSelectedDates のみ更新（フォーム初期化は useEffect に委譲）
  function handleCellClick(date: string) {
    const isMulti = multiSelectMode || ctrlHeldRef.current
    if (isMulti) {
      setSelectedDates((prev) => {
        const next = new Set(prev)
        if (next.has(date)) next.delete(date)
        else next.add(date)
        return next
      })
    } else {
      setSelectedDates((prev) => {
        if (prev.size === 1 && prev.has(date)) return new Set()
        return new Set([date])
      })
    }
  }

  const changeMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1)
    setSelectedDates(new Set())
    router.push(`/shifts?year=${d.getFullYear()}&month=${d.getMonth() + 1}`)
  }

  const handleSaveShift = async () => {
    if (selectedDates.size === 0 || !selectedStaff) return
    setSaving(true)

    const isOff = shiftType === 'off' || shiftType === 'holiday'
    const payload = {
      shift_type: shiftType,
      start_time: isOff ? null : startTime,
      end_time:   isOff ? null : endTime,
      unit_id:    isOff ? null : (unitId || null),
    }

    for (const date of selectedDates) {
      const existing = currentStaffShifts[date]
      if (existing) {
        await supabase.from('staff_shifts').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('staff_shifts').insert({ staff_id: selectedStaff, date, ...payload })
      }
    }

    setSaving(false)
    setSelectedDates(new Set())
    startTransition(() => router.refresh())
  }

  const handleDeleteShift = async () => {
    const ids = [...selectedDates]
      .map((d) => currentStaffShifts[d]?.id)
      .filter(Boolean) as string[]
    if (ids.length === 0) return
    setSaving(true)
    await supabase.from('staff_shifts').delete().in('id', ids)
    setSaving(false)
    setSelectedDates(new Set())
    startTransition(() => router.refresh())
  }

  function openOTForm() {
    const defaultDate = [...selectedDates].sort()[0]
      ?? `${year}-${String(month).padStart(2, '0')}-01`
    setOtForm({ date: defaultDate, overtime_minutes: '30', note: '' })
    setOtResult(null)
    setShowOTForm(true)
  }

  async function handleSubmitOT() {
    const ot = parseInt(otForm.overtime_minutes)
    if (!otForm.date || !ot || ot <= 0) return
    setSavingOT(true)
    setOtResult(null)
    const shift = currentStaffShifts[otForm.date]
    const res = await fetch('/api/staff/overtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: selectedStaff,
        date: otForm.date,
        scheduled_end_time: shift?.end_time ?? null,
        actual_end_time: null,
        overtime_minutes: ot,
        request_type: 'pre',
        status: 'approved',
        note: otForm.note || null,
      }),
    })
    setSavingOT(false)
    if (res.ok) {
      setOtResult('ok')
      setOtForm({ date: '', overtime_minutes: '30', note: '' })
      setTimeout(() => { setShowOTForm(false); setOtResult(null) }, 1500)
    } else {
      setOtResult('error')
    }
  }

  const sortedSelected = [...selectedDates].sort()
  const hasExistingInSelection = sortedSelected.some((d) => !!currentStaffShifts[d])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">シフト管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">スタッフの勤務シフト</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setMultiSelectMode((m) => !m)
              setSelectedDates(new Set())
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              multiSelectMode
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
            title="複数の日付をまとめて編集"
          >
            <Layers className="h-4 w-4" />
            複数選択
          </button>
          <Button
            size="sm"
            variant="outline"
            onClick={openOTForm}
            className="text-orange-700 border-orange-300 hover:bg-orange-50"
          >
            <CalendarClock className="h-3.5 w-3.5 mr-1" />
            残業申請
          </Button>
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

      {/* 残業申請フォーム */}
      {showOTForm && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-orange-800 flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4" />
              残業申請 — {staffList.find((s) => s.id === selectedStaff)?.name}
            </p>
            <button onClick={() => setShowOTForm(false)} className="p-1 rounded hover:bg-orange-100 text-gray-400">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">日付</label>
              <input
                type="date"
                value={otForm.date}
                min={`${year}-${String(month).padStart(2, '0')}-01`}
                max={`${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`}
                onChange={(e) => setOtForm({ ...otForm, date: e.target.value })}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">残業時間（分）</label>
              <input
                type="number"
                min="30"
                step="30"
                value={otForm.overtime_minutes}
                onChange={(e) => setOtForm({ ...otForm, overtime_minutes: e.target.value })}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>
            <div className="flex-1 min-w-40">
              <label className="text-xs text-gray-600 mb-1 block">メモ（任意）</label>
              <input
                type="text"
                value={otForm.note}
                onChange={(e) => setOtForm({ ...otForm, note: e.target.value })}
                placeholder="理由など"
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => void handleSubmitOT()}
                disabled={savingOT || !otForm.date || !otForm.overtime_minutes}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {savingOT ? '保存中...' : '申請する'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowOTForm(false)}>キャンセル</Button>
            </div>
          </div>

          {otResult === 'ok' && (
            <p className="text-sm text-green-700 flex items-center gap-1">
              <Check className="h-4 w-4" />
              残業申請を登録しました
            </p>
          )}
          {otResult === 'error' && (
            <p className="text-sm text-red-600">保存に失敗しました。もう一度お試しください。</p>
          )}
        </div>
      )}

      {/* 複数選択モードバナー */}
      {multiSelectMode && (
        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
          <span className="text-xs text-indigo-700 font-medium">
            <Layers className="h-3.5 w-3.5 inline mr-1" />
            複数選択モード — 日付をクリックして追加／解除（Ctrl+クリックでも可）
          </span>
          <button
            onClick={() => { setMultiSelectMode(false); setSelectedDates(new Set()) }}
            className="text-xs text-indigo-500 hover:text-indigo-700 underline ml-4"
          >
            解除
          </button>
        </div>
      )}

      {/* スタッフ選択 */}
      <div className="flex gap-2 flex-wrap">
        {staffList.map((s) => (
          <button
            key={s.id}
            onClick={() => { setSelectedStaff(s.id); setSelectedDates(new Set()) }}
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
            const isSelected = selectedDates.has(date)
            const shiftInfo = shift ? SHIFT_TYPES.find((t) => t.value === shift.shift_type) : null
            const count = dailyCount[date] ?? 0
            const overtimeMinutes = currentStaffOvertime[date] ?? 0

            return (
              <button
                key={date}
                onClick={() => handleCellClick(date)}
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
                {overtimeMinutes > 0 && (
                  <div className="text-xs px-1 rounded truncate bg-red-500 text-white mt-0.5">
                    残業{overtimeMinutes >= 60
                      ? `${Math.floor(overtimeMinutes / 60)}h${overtimeMinutes % 60 > 0 ? `${overtimeMinutes % 60}m` : ''}`
                      : `${overtimeMinutes}m`}
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

      {/* ヒント */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-3 flex-wrap text-xs text-gray-500">
          {SHIFT_TYPES.map((t) => (
            <div key={t.value} className="flex items-center gap-1">
              <div className={cn('w-3 h-3 rounded', t.color.split(' ')[0])} />
              {t.label}
            </div>
          ))}
        </div>
        <span className="text-xs text-gray-400 flex items-center gap-1 ml-auto">
          <Layers className="h-3 w-3" />
          「複数選択」ボタン または Ctrl（Mac: ⌘）+クリックで複数日を選択
        </span>
      </div>

      {/* 編集パネル */}
      {selectedDates.size > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              {selectedDates.size === 1 ? (
                <h2 className="font-semibold text-gray-900">
                  {formatDateLabel(sortedSelected[0])}
                  {' — '}
                  {staffList.find((s) => s.id === selectedStaff)?.name}
                </h2>
              ) : (
                <div>
                  <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-indigo-500" />
                    {selectedDates.size}日選択中
                    {' — '}
                    {staffList.find((s) => s.id === selectedStaff)?.name}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {sortedSelected.map((d) => {
                      const [, , day] = d.split('-')
                      const dow = DAY_LABELS[new Date(d).getDay()]
                      return `${parseInt(day)}日(${dow})`
                    }).join('・')}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              {hasExistingInSelection && (
                <button
                  onClick={handleDeleteShift}
                  disabled={saving}
                  className="p-1 text-red-400 hover:bg-red-50 rounded"
                  title="シフトを削除"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setSelectedDates(new Set())}
                className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                title="選択を解除"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
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
            {saving
              ? '保存中...'
              : selectedDates.size > 1
                ? `${selectedDates.size}日分を保存`
                : 'シフトを保存'}
          </Button>
        </div>
      )}
    </div>
  )
}
