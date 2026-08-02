'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, X, Check, Layers, CalendarClock, Repeat, Trash2, User, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isJapaneseNationalHoliday, getJapaneseHolidayName } from '@/lib/japanese-holidays'

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
  break_start_time: string | null
  break_end_time: string | null
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
  { value: 'full',     label: '全日', short: '全', color: 'bg-indigo-500 text-white' },
  { value: 'morning',  label: '午前', short: '前', color: 'bg-blue-400 text-white' },
  { value: 'afternoon',label: '午後', short: '後', color: 'bg-teal-400 text-white' },
  { value: 'off',      label: '休み', short: '休', color: 'bg-gray-300 text-gray-600' },
  { value: 'holiday',  label: '有休', short: '有', color: 'bg-orange-400 text-white' },
]

/** 勤務としてカウントするシフト種別か（休み・有休以外） */
function isWorkingShift(shiftType: string): boolean {
  return shiftType !== 'off' && shiftType !== 'holiday'
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

/** 利用者スケジュールと同じ曜日ボタンの配色 */
const DAY_COLORS: Record<number, string> = {
  0: 'bg-red-100 text-red-700 border-red-300',
  1: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  2: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  3: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  4: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  5: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  6: 'bg-blue-100 text-blue-700 border-blue-300',
}

function formatDateLabel(date: string) {
  return new Date(date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 勤務内容（種別・時間・中抜け・ユニット）の入力フォーム。単日編集と曜日一括登録で共用 */
type ShiftForm = {
  shiftType: string
  startTime: string
  endTime: string
  hasBreak: boolean
  breakStartTime: string
  breakEndTime: string
  unitId: string
}

function isOffType(shiftType: string): boolean {
  return shiftType === 'off' || shiftType === 'holiday'
}

/** ShiftForm → staff_shifts の保存用ペイロード */
function toShiftPayload(f: ShiftForm) {
  const off = isOffType(f.shiftType)
  return {
    shift_type:       f.shiftType,
    start_time:       off ? null : f.startTime,
    end_time:         off ? null : f.endTime,
    unit_id:          off ? null : (f.unitId || null),
    break_start_time: (!off && f.hasBreak) ? f.breakStartTime : null,
    break_end_time:   (!off && f.hasBreak) ? f.breakEndTime   : null,
  }
}

function ShiftFields({
  form,
  onChange,
  units,
  accent = 'indigo',
}: {
  form: ShiftForm
  onChange: (patch: Partial<ShiftForm>) => void
  units: Unit[]
  accent?: 'indigo' | 'teal'
}) {
  const ring = accent === 'teal' ? 'focus:ring-teal-500' : 'focus:ring-indigo-500'
  const active = accent === 'teal'
    ? 'border-teal-500 bg-teal-50 text-teal-700'
    : 'border-indigo-500 bg-indigo-50 text-indigo-700'
  const inputCls = `w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 ${ring}`
  const off = isOffType(form.shiftType)

  return (
    <>
      <div>
        <label className="text-xs font-medium text-gray-700 mb-2 block">シフト種別</label>
        <div className="flex gap-2 flex-wrap">
          {SHIFT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onChange({ shiftType: t.value })}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                form.shiftType === t.value ? active : 'border-gray-200 text-gray-600 hover:border-gray-300'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {!off && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">開始時間</label>
              <input type="time" value={form.startTime}
                onChange={(e) => onChange({ startTime: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">終了時間</label>
              <input type="time" value={form.endTime}
                onChange={(e) => onChange({ endTime: e.target.value })} className={inputCls} />
            </div>
          </div>

          {/* 中抜け */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={form.hasBreak}
                onChange={(e) => onChange({ hasBreak: e.target.checked })}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs font-medium text-gray-700">中抜けあり</span>
            </label>
            {form.hasBreak && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">中抜け開始</label>
                  <input type="time" value={form.breakStartTime}
                    onChange={(e) => onChange({ breakStartTime: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">中抜け終了</label>
                  <input type="time" value={form.breakEndTime}
                    onChange={(e) => onChange({ breakEndTime: e.target.value })} className={inputCls} />
                </div>
              </div>
            )}
          </div>

          {units.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">担当ユニット</label>
              <select
                value={form.unitId}
                onChange={(e) => onChange({ unitId: e.target.value })}
                className={inputCls}
              >
                <option value="">未割当</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
        </>
      )}
    </>
  )
}

export function ShiftCalendar({ year, month, staffList, shifts, units, overtimeRequests = [] }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  // 個人カレンダー / 全スタッフの月間マトリクス
  const [view, setView] = useState<'personal' | 'all'>('personal')
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
  const [shiftType, setShiftType]       = useState('full')
  const [startTime, setStartTime]       = useState('09:00')
  const [endTime, setEndTime]           = useState('18:00')
  const [hasBreak, setHasBreak]         = useState(false)
  const [breakStartTime, setBreakStart] = useState('12:00')
  const [breakEndTime, setBreakEnd]     = useState('13:00')
  const [unitId, setUnitId]             = useState(units[0]?.id ?? '')
  const [saving, setSaving]             = useState(false)

  // 曜日パターンでの一括登録（利用者スケジュールと同じ曜日選択）
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
  const [showPattern, setShowPattern] = useState(false)
  const [patternDays, setPatternDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [patternStart, setPatternStart] = useState(monthStart)
  const [patternEnd, setPatternEnd] = useState(monthEnd)
  const [patternSkipHolidays, setPatternSkipHolidays] = useState(true)
  const [patternOverwrite, setPatternOverwrite] = useState(true)
  const [patternForm, setPatternForm] = useState<ShiftForm>({
    shiftType: 'full',
    startTime: '09:00',
    endTime: '18:00',
    hasBreak: false,
    breakStartTime: '12:00',
    breakEndTime: '13:00',
    unitId: units[0]?.id ?? '',
  })
  const [patternSaving, setPatternSaving] = useState(false)
  const [patternResult, setPatternResult] = useState<string | null>(null)

  // 表示月が変わったら対象期間を新しい月に合わせる（レンダー中に調整する公式パターン）
  const [patternMonthKey, setPatternMonthKey] = useState(monthStart)
  if (patternMonthKey !== monthStart) {
    setPatternMonthKey(monthStart)
    setPatternStart(monthStart)
    setPatternEnd(monthEnd)
    setPatternResult(null)
  }

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

  // マトリクス表示用: 当月の全日付
  const monthDays = Array.from(
    { length: lastDay.getDate() },
    (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
  )

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

  // 選択日・対象スタッフが変わったらフォームを初期化（child-attendance-calendar と同じパターン）
  useEffect(() => {
    if (selectedDate) {
      const shift = currentStaffShifts[selectedDate]
      if (shift) {
        setShiftType(shift.shift_type)
        setStartTime(shift.start_time ?? '09:00')
        setEndTime(shift.end_time ?? '18:00')
        setUnitId(shift.unit_id ?? units[0]?.id ?? '')
        const hasB = !!(shift.break_start_time && shift.break_end_time)
        setHasBreak(hasB)
        setBreakStart(shift.break_start_time?.slice(0, 5) ?? '12:00')
        setBreakEnd(shift.break_end_time?.slice(0, 5) ?? '13:00')
      } else {
        setShiftType('full')
        setStartTime('09:00')
        setEndTime('18:00')
        setUnitId(units[0]?.id ?? '')
        setHasBreak(false)
        setBreakStart('12:00')
        setBreakEnd('13:00')
      }
    }
  }, [selectedDate, selectedStaff]) // eslint-disable-line react-hooks/exhaustive-deps

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

    const payload = toShiftPayload({
      shiftType, startTime, endTime, hasBreak, breakStartTime, breakEndTime, unitId,
    })

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

  const togglePatternDay = (d: number) =>
    setPatternDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort())

  /** 選択した曜日・期間に該当する日付を列挙（祝日除外オプションつき） */
  const patternDates = (() => {
    if (!patternStart || !patternEnd || patternDays.length === 0) return []
    const cur = new Date(`${patternStart}T00:00:00`)
    const end = new Date(`${patternEnd}T00:00:00`)
    if (isNaN(cur.getTime()) || isNaN(end.getTime()) || end < cur) return []
    const out: string[] = []
    // 1年分を上限に安全弁を設ける
    while (cur <= end && out.length < 400) {
      if (patternDays.includes(cur.getDay())) {
        const ds = toDateString(cur)
        if (!(patternSkipHolidays && isJapaneseNationalHoliday(ds))) out.push(ds)
      }
      cur.setDate(cur.getDate() + 1)
    }
    return out
  })()

  const handleApplyPattern = async () => {
    if (patternDates.length === 0 || !selectedStaff) return
    setPatternSaving(true)
    setPatternResult(null)

    // 既存シフトの有無を調べて、新規／上書きの件数を出す
    const { data: existingRaw } = await supabase
      .from('staff_shifts')
      .select('date')
      .eq('staff_id', selectedStaff)
      .in('date', patternDates)
    const existingDates = new Set((existingRaw ?? []).map((r: { date: string }) => r.date))

    const targets = patternOverwrite
      ? patternDates
      : patternDates.filter((d) => !existingDates.has(d))
    const newCount = patternDates.filter((d) => !existingDates.has(d)).length
    const overwriteCount = patternOverwrite ? patternDates.length - newCount : 0
    const skipCount = patternOverwrite ? 0 : patternDates.length - newCount

    if (targets.length > 0) {
      const payload = toShiftPayload(patternForm)
      const { error } = await supabase
        .from('staff_shifts')
        .upsert(
          targets.map((date) => ({ staff_id: selectedStaff, date, ...payload })),
          { onConflict: 'staff_id,date' }
        )
      if (error) {
        setPatternSaving(false)
        setPatternResult(`保存に失敗しました: ${error.message}`)
        return
      }
    }

    setPatternSaving(false)
    setPatternResult(
      [
        newCount > 0 ? `${newCount}日を新規登録` : null,
        overwriteCount > 0 ? `${overwriteCount}日を上書き` : null,
        skipCount > 0 ? `${skipCount}日は既存のためスキップ` : null,
      ].filter(Boolean).join('／') + 'しました'
    )
    startTransition(() => router.refresh())
  }

  const handleDeletePattern = async () => {
    if (patternDates.length === 0 || !selectedStaff) return
    const staffName = staffList.find((s) => s.id === selectedStaff)?.name ?? ''
    if (!confirm(`${staffName} さんの ${patternDates.length} 日分のシフトを削除します。よろしいですか？`)) return
    setPatternSaving(true)
    setPatternResult(null)
    const { error } = await supabase
      .from('staff_shifts')
      .delete()
      .eq('staff_id', selectedStaff)
      .in('date', patternDates)
    setPatternSaving(false)
    setPatternResult(error ? `削除に失敗しました: ${error.message}` : '該当日のシフトを削除しました')
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
        <div className="flex items-center gap-2 flex-wrap">
          {/* 表示切替 */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('personal')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                view === 'personal' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <User className="h-3.5 w-3.5" />
              個人
            </button>
            <button
              onClick={() => {
                setView('all')
                setMultiSelectMode(false)
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                view === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Users className="h-3.5 w-3.5" />
              全員
            </button>
          </div>
          {view === 'personal' && (
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
          )}
          <button
            onClick={() => {
              setShowPattern((v) => !v)
              setSelectedDates(new Set())
              setPatternResult(null)
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              showPattern
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
            title="毎週の曜日を選んでまとめて登録"
          >
            <Repeat className="h-4 w-4" />
            曜日で一括登録
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

      {/* 曜日パターンで一括登録 */}
      {showPattern && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-teal-800 flex items-center gap-1.5">
              <Repeat className="h-4 w-4" />
              曜日で一括登録 — {staffList.find((s) => s.id === selectedStaff)?.name}
            </p>
            <button onClick={() => setShowPattern(false)} className="p-1 rounded hover:bg-teal-100 text-gray-400">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 繰り返す曜日 */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">繰り返す曜日</label>
            <div className="flex gap-2 flex-wrap">
              {DAY_LABELS.map((label, d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => togglePatternDay(d)}
                  className={cn(
                    'w-10 h-10 rounded-full text-sm font-bold border-2 transition-colors',
                    patternDays.includes(d)
                      ? `${DAY_COLORS[d]} border-current`
                      : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-3 mt-2">
              <button type="button" onClick={() => setPatternDays([1, 2, 3, 4, 5])}
                className="text-xs text-teal-700 underline hover:text-teal-900">平日のみ</button>
              <button type="button" onClick={() => setPatternDays([0, 6])}
                className="text-xs text-teal-700 underline hover:text-teal-900">土日のみ</button>
              <button type="button" onClick={() => setPatternDays([0, 1, 2, 3, 4, 5, 6])}
                className="text-xs text-teal-700 underline hover:text-teal-900">毎日</button>
            </div>
            {patternDays.length === 0 && (
              <p className="text-xs text-red-500 mt-1">曜日を1つ以上選択してください</p>
            )}
          </div>

          {/* 対象期間 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">開始日</label>
              <input type="date" value={patternStart}
                onChange={(e) => setPatternStart(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-teal-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">終了日</label>
              <input type="date" value={patternEnd} min={patternStart}
                onChange={(e) => setPatternEnd(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-teal-500" />
            </div>
          </div>
          <div className="flex gap-3 -mt-2">
            <button type="button" onClick={() => { setPatternStart(monthStart); setPatternEnd(monthEnd) }}
              className="text-xs text-teal-700 underline hover:text-teal-900">今月（{month}月）</button>
            <button type="button"
              onClick={() => {
                const n = new Date(year, month, 1)
                setPatternStart(toDateString(n))
                setPatternEnd(toDateString(new Date(n.getFullYear(), n.getMonth() + 1, 0)))
              }}
              className="text-xs text-teal-700 underline hover:text-teal-900">翌月</button>
          </div>

          {/* 勤務内容 */}
          <div className="space-y-4 border-t border-teal-200 pt-3">
            <ShiftFields
              form={patternForm}
              onChange={(patch) => setPatternForm((p) => ({ ...p, ...patch }))}
              units={units}
              accent="teal"
            />
          </div>

          {/* オプション */}
          <div className="border-t border-teal-200 pt-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input type="checkbox" checked={patternSkipHolidays}
                onChange={(e) => setPatternSkipHolidays(e.target.checked)}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
              <span className="text-xs font-medium text-gray-700">祝日を除く</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input type="checkbox" checked={patternOverwrite}
                onChange={(e) => setPatternOverwrite(e.target.checked)}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
              <span className="text-xs font-medium text-gray-700">既存のシフトを上書きする</span>
            </label>
          </div>

          {/* 対象日プレビュー */}
          <div className="bg-white border border-teal-200 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500">
              対象 <span className="font-bold text-teal-700">{patternDates.length}</span> 日
            </p>
            {patternDates.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                {patternDates.slice(0, 14).map((d) => {
                  const dt = new Date(`${d}T00:00:00`)
                  return `${dt.getMonth() + 1}/${dt.getDate()}(${DAY_LABELS[dt.getDay()]})`
                }).join('・')}
                {patternDates.length > 14 ? ` ほか${patternDates.length - 14}日` : ''}
              </p>
            )}
          </div>

          {patternResult && (
            <p className="text-sm text-green-700 flex items-center gap-1">
              <Check className="h-4 w-4" />
              {patternResult}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleApplyPattern}
              disabled={patternSaving || patternDates.length === 0 || !selectedStaff}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Check className="h-4 w-4" />
              {patternSaving ? '登録中...' : `${patternDates.length}日分を登録`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDeletePattern}
              disabled={patternSaving || patternDates.length === 0 || !selectedStaff}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              該当日を削除
            </Button>
          </div>
        </div>
      )}

      {/* 全スタッフ月間マトリクス */}
      {view === 'all' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50">
                  <th className="sticky left-0 z-20 bg-gray-50 border-b border-r border-gray-200 px-3 py-2 text-left font-medium text-gray-500 min-w-[104px]">
                    スタッフ
                  </th>
                  {monthDays.map((date) => {
                    const d = new Date(`${date}T00:00:00`)
                    const dow = d.getDay()
                    const holiday = isJapaneseNationalHoliday(date)
                    return (
                      <th
                        key={date}
                        className={cn(
                          'border-b border-gray-100 px-0 py-1 font-medium min-w-[30px] w-[30px]',
                          dow === 0 || holiday ? 'text-red-500 bg-red-50' : dow === 6 ? 'text-blue-500 bg-blue-50' : 'text-gray-500'
                        )}
                        title={getJapaneseHolidayName(date) ?? undefined}
                      >
                        <div className="leading-tight">{d.getDate()}</div>
                        <div className="text-[10px] font-normal opacity-70">{DAY_LABELS[dow]}</div>
                      </th>
                    )
                  })}
                  <th className="sticky right-0 z-20 bg-gray-50 border-b border-l border-gray-200 px-2 py-2 font-medium text-gray-500 min-w-[52px]">
                    出勤
                  </th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((s) => {
                  const staffShifts = shiftMap[s.id] ?? {}
                  const staffOvertime = overtimeMap[s.id] ?? {}
                  const workDays = monthDays.filter((d) => staffShifts[d] && isWorkingShift(staffShifts[d].shift_type)).length
                  return (
                    <tr key={s.id} className="group">
                      <td
                        className={cn(
                          'sticky left-0 z-10 border-b border-r border-gray-200 px-3 py-1.5 whitespace-nowrap font-medium transition-colors',
                          selectedStaff === s.id ? 'bg-indigo-50 text-indigo-700' : 'bg-white text-gray-700 group-hover:bg-indigo-50/60'
                        )}
                      >
                        <button type="button" onClick={() => setSelectedStaff(s.id)} className="hover:underline">
                          {s.name}
                        </button>
                      </td>
                      {monthDays.map((date) => {
                        const d = new Date(`${date}T00:00:00`)
                        const dow = d.getDay()
                        const holiday = isJapaneseNationalHoliday(date)
                        const shift = staffShifts[date]
                        const info = shift ? SHIFT_TYPES.find((t) => t.value === shift.shift_type) : null
                        const ot = staffOvertime[date] ?? 0
                        const isSel = selectedStaff === s.id && selectedDates.has(date)
                        return (
                          <td
                            key={date}
                            className={cn(
                              'border-b border-gray-100 p-0 text-center',
                              dow === 0 || holiday ? 'bg-red-50/60' : dow === 6 ? 'bg-blue-50/60' : '',
                              isSel && 'ring-1 ring-inset ring-indigo-500'
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => { setSelectedStaff(s.id); setSelectedDates(new Set([date])) }}
                              title={`${s.name} ${month}/${d.getDate()}（${DAY_LABELS[dow]}）${info?.label ?? '未登録'}${
                                shift?.start_time ? ` ${shift.start_time.slice(0, 5)}〜${shift.end_time?.slice(0, 5) ?? ''}` : ''
                              }${ot > 0 ? ` 残業${ot}分` : ''}`}
                              className="relative w-full h-7 flex items-center justify-center hover:bg-indigo-100 transition-colors"
                            >
                              {info ? (
                                <span className={cn('inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold', info.color)}>
                                  {info.short}
                                </span>
                              ) : (
                                <span className="text-gray-200">·</span>
                              )}
                              {ot > 0 && (
                                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />
                              )}
                            </button>
                          </td>
                        )
                      })}
                      <td
                        className={cn(
                          'sticky right-0 z-10 border-b border-l border-gray-200 px-2 py-1.5 text-center font-semibold',
                          selectedStaff === s.id ? 'bg-indigo-50 text-indigo-700' : 'bg-white text-gray-600 group-hover:bg-indigo-50/60'
                        )}
                      >
                        {workDays > 0 ? workDays : '—'}
                      </td>
                    </tr>
                  )
                })}
                {staffList.length === 0 && (
                  <tr>
                    <td colSpan={monthDays.length + 2} className="px-3 py-6 text-center text-gray-400">
                      スタッフが登録されていません
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td className="sticky left-0 z-10 bg-gray-50 border-t border-r border-gray-200 px-3 py-1.5 font-medium text-gray-500 whitespace-nowrap">
                    出勤人数
                  </td>
                  {monthDays.map((date) => {
                    const count = dailyCount[date] ?? 0
                    return (
                      <td
                        key={date}
                        className={cn(
                          'border-t border-gray-200 px-0 py-1.5 text-center font-semibold',
                          count === 0 ? 'text-red-400' : 'text-gray-700'
                        )}
                      >
                        {count > 0 ? count : '0'}
                      </td>
                    )
                  })}
                  <td className="sticky right-0 z-10 bg-gray-50 border-t border-l border-gray-200" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {view === 'all' && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-3 flex-wrap text-xs text-gray-500">
            {SHIFT_TYPES.map((t) => (
              <div key={t.value} className="flex items-center gap-1">
                <span className={cn('inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold', t.color)}>
                  {t.short}
                </span>
                {t.label}
              </div>
            ))}
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              残業あり
            </div>
          </div>
          <span className="text-xs text-gray-400 ml-auto">
            セルをクリックすると、そのスタッフ・日付の編集パネルが下に開きます
          </span>
        </div>
      )}

      {/* カレンダー */}
      {view === 'personal' && (
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
            const holidayName = getJapaneseHolidayName(date)

            return (
              <button
                key={date}
                onClick={() => handleCellClick(date)}
                title={holidayName ?? undefined}
                className={cn(
                  'h-16 border-b border-r border-gray-50 p-1 text-left transition-colors hover:bg-indigo-50',
                  holidayName && !isSelected && 'bg-red-50/60',
                  isSelected && 'bg-indigo-100 ring-1 ring-inset ring-indigo-400'
                )}
              >
                <div
                  className={cn(
                    'text-xs font-medium mb-0.5 flex items-baseline gap-1',
                    (dayOfWeek === 0 || holidayName) && 'text-red-500',
                    dayOfWeek === 6 && !holidayName && 'text-blue-500',
                    dayOfWeek > 0 && dayOfWeek < 6 && !holidayName && 'text-gray-700'
                  )}
                >
                  {new Date(date).getDate()}
                  {holidayName && (
                    <span className="text-[9px] font-normal truncate">{holidayName}</span>
                  )}
                </div>
                {shiftInfo && (
                  <div className={cn('text-xs px-1 rounded truncate', shiftInfo.color)}>
                    {shiftInfo.label}
                  </div>
                )}
                {shift?.break_start_time && shift?.break_end_time && (
                  <div className="text-xs px-1 rounded truncate bg-gray-400 text-white mt-0.5">
                    中抜け{shift.break_start_time.slice(0, 5)}〜{shift.break_end_time.slice(0, 5)}
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
      )}

      {/* ヒント */}
      {view === 'personal' && (
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
      )}

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

          <ShiftFields
            form={{ shiftType, startTime, endTime, hasBreak, breakStartTime, breakEndTime, unitId }}
            onChange={(patch) => {
              if (patch.shiftType !== undefined) setShiftType(patch.shiftType)
              if (patch.startTime !== undefined) setStartTime(patch.startTime)
              if (patch.endTime !== undefined) setEndTime(patch.endTime)
              if (patch.hasBreak !== undefined) setHasBreak(patch.hasBreak)
              if (patch.breakStartTime !== undefined) setBreakStart(patch.breakStartTime)
              if (patch.breakEndTime !== undefined) setBreakEnd(patch.breakEndTime)
              if (patch.unitId !== undefined) setUnitId(patch.unitId)
            }}
            units={units}
          />

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
