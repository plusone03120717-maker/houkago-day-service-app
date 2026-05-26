'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Edit2, Check, X, ChevronLeft, ChevronRight, Plus, Pencil, AlertTriangle } from 'lucide-react'

export type StaffMember = {
  id: string
  name: string
  hourly_rate: number | null
  hourly_rate_id: string | null
}

export type TimeRecord = {
  id: string
  staff_member_id: string
  type: 'clock_in' | 'clock_out'
  recorded_at: string
  note: string | null
  edited_at: string | null
}

type DayRecord = {
  date: string
  clock_in: TimeRecord | null
  clock_out: TimeRecord | null
  rounded_in: string | null   // 丸め後の出勤時刻 HH:MM
  rounded_out: string | null  // 丸め後の退勤時刻 HH:MM
  hours: number | null
}

function toJSTDatetime(isoStr: string): { date: string; time: string } {
  const d = new Date(isoStr)
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const date = jst.toISOString().slice(0, 10)
  const time = jst.toISOString().slice(11, 16)
  return { date, time }
}

/** UTC ISO → JST の分（エポック基準）。30分丸めに使う */
function toJSTEpochMinutes(isoStr: string): number {
  return Math.floor((new Date(isoStr).getTime() + 9 * 60 * 60 * 1000) / 60000)
}

/** JST エポック分 → "HH:MM" */
function epochMinutesToHHMM(m: number): string {
  const mOfDay = ((m % 1440) + 1440) % 1440
  return `${String(Math.floor(mOfDay / 60)).padStart(2, '0')}:${String(mOfDay % 60).padStart(2, '0')}`
}

/** 出勤：30分切り上げ（事業者有利） */
function roundInUp30(isoStr: string): { minutes: number; time: string } {
  const m = Math.ceil(toJSTEpochMinutes(isoStr) / 30) * 30
  return { minutes: m, time: epochMinutesToHHMM(m) }
}

/** 退勤：30分切り捨て（事業者有利） */
function roundOutDown30(isoStr: string): { minutes: number; time: string } {
  const m = Math.floor(toJSTEpochMinutes(isoStr) / 30) * 30
  return { minutes: m, time: epochMinutesToHHMM(m) }
}

function buildDayRecords(records: TimeRecord[]): DayRecord[] {
  const byDate = new Map<string, { clock_in: TimeRecord | null; clock_out: TimeRecord | null }>()

  for (const r of records) {
    const { date } = toJSTDatetime(r.recorded_at)
    if (!byDate.has(date)) byDate.set(date, { clock_in: null, clock_out: null })
    const day = byDate.get(date)!
    if (r.type === 'clock_in' && (!day.clock_in || r.recorded_at < day.clock_in.recorded_at)) {
      day.clock_in = r
    }
    if (r.type === 'clock_out' && (!day.clock_out || r.recorded_at > day.clock_out.recorded_at)) {
      day.clock_out = r
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { clock_in, clock_out }]) => {
      let hours: number | null = null
      let rounded_in: string | null = null
      let rounded_out: string | null = null

      if (clock_in) {
        rounded_in = roundInUp30(clock_in.recorded_at).time
      }
      if (clock_out) {
        rounded_out = roundOutDown30(clock_out.recorded_at).time
      }
      if (clock_in && clock_out) {
        const inM = roundInUp30(clock_in.recorded_at).minutes
        const outM = roundOutDown30(clock_out.recorded_at).minutes
        const diffMinutes = outM - inM
        hours = diffMinutes > 0 ? Math.round((diffMinutes / 60) * 100) / 100 : 0
      }
      return { date, clock_in, clock_out, rounded_in, rounded_out, hours }
    })
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}年${parseInt(m)}月`
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getLastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return `${ym}-${String(lastDay).padStart(2, '0')}`
}

function getLastDayOfPrevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getFirstDayOfNextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

type EditState = {
  recordId: string
  field: 'clock_in' | 'clock_out'
  value: string
}

interface Props {
  staffMembers: StaffMember[]
  initialRecords: TimeRecord[]
  initialMonth: string
  staffId: string
}

export function TimecardBoard({ staffMembers: initialStaffMembers, initialRecords, initialMonth, staffId }: Props) {
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(initialStaffMembers)
  const [selectedStaffId, setSelectedStaffId] = useState<string>(staffId || (initialStaffMembers[0]?.id ?? ''))
  const [month, setMonth] = useState(initialMonth)
  const [records, setRecords] = useState<TimeRecord[]>(initialRecords)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)

  // 時給編集
  const [editingRate, setEditingRate] = useState(false)
  const [rateValue, setRateValue] = useState('')
  const [savingRate, setSavingRate] = useState(false)

  // 手動追加フォーム
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ date: '', clock_in: '09:00', clock_out: '17:00' })
  const [savingAdd, setSavingAdd] = useState(false)

  const selectedStaff = staffMembers.find((s) => s.id === selectedStaffId)

  async function fetchRecords(sId: string, ym: string) {
    setLoading(true)
    const [y, m] = ym.split('-').map(Number)
    const start = new Date(y, m - 1, 1).toISOString()
    const end = new Date(y, m, 1).toISOString()
    const { data } = await supabase
      .from('time_records')
      .select('id, staff_member_id, type, recorded_at, note, edited_at')
      .eq('staff_member_id', sId)
      .gte('recorded_at', start)
      .lt('recorded_at', end)
      .order('recorded_at')
    setRecords((data ?? []) as TimeRecord[])
    setLoading(false)
  }

  async function fetchRateForMonth(sId: string, ym: string) {
    const monthStart = `${ym}-01`
    const monthEnd = getLastDayOfMonth(ym)
    const { data } = await supabase
      .from('staff_hourly_rates')
      .select('id, hourly_rate')
      .eq('staff_member_id', sId)
      .lte('effective_from', monthEnd)
      .or(`effective_to.is.null,effective_to.gte.${monthStart}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle()
    const rate = data as { id: string; hourly_rate: number } | null
    setStaffMembers((prev) =>
      prev.map((s) =>
        s.id === sId
          ? { ...s, hourly_rate: rate?.hourly_rate ?? null, hourly_rate_id: rate?.id ?? null }
          : s
      )
    )
  }

  async function handleStaffChange(id: string) {
    setSelectedStaffId(id)
    setEditing(null)
    setShowAddForm(false)
    setEditingRate(false)
    await Promise.all([fetchRecords(id, month), fetchRateForMonth(id, month)])
  }

  async function handleMonthChange(ym: string) {
    setMonth(ym)
    setEditing(null)
    setShowAddForm(false)
    setEditingRate(false)
    await Promise.all([fetchRecords(selectedStaffId, ym), fetchRateForMonth(selectedStaffId, ym)])
  }

  async function handleSaveEdit() {
    if (!editing) return
    setSaving(true)
    const { date } = toJSTDatetime(
      records.find((r) => r.id === editing.recordId)?.recorded_at ?? ''
    )
    const [hh, mm] = editing.value.split(':').map(Number)
    const jstDate = new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`)
    await supabase
      .from('time_records')
      .update({ recorded_at: jstDate.toISOString(), edited_at: new Date().toISOString() })
      .eq('id', editing.recordId)
    setEditing(null)
    setSaving(false)
    await fetchRecords(selectedStaffId, month)
  }

  async function handleAddRecord(date: string, type: 'clock_in' | 'clock_out', timeStr: string) {
    const [hh, mm] = timeStr.split(':').map(Number)
    const jstDate = new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`)
    await supabase.from('time_records').insert({
      staff_member_id: selectedStaffId,
      type,
      recorded_at: jstDate.toISOString(),
    })
    await fetchRecords(selectedStaffId, month)
  }

  async function handleDeleteRecord(recordId: string) {
    if (!confirm('この打刻記録を削除しますか？')) return
    await supabase.from('time_records').delete().eq('id', recordId)
    await fetchRecords(selectedStaffId, month)
  }

  // 手動で日付ごと追加
  async function handleManualAdd() {
    if (!addForm.date) return
    setSavingAdd(true)
    const inserts = []
    if (addForm.clock_in) {
      const [hh, mm] = addForm.clock_in.split(':').map(Number)
      inserts.push({
        staff_member_id: selectedStaffId,
        type: 'clock_in',
        recorded_at: new Date(`${addForm.date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`).toISOString(),
      })
    }
    if (addForm.clock_out) {
      const [hh, mm] = addForm.clock_out.split(':').map(Number)
      inserts.push({
        staff_member_id: selectedStaffId,
        type: 'clock_out',
        recorded_at: new Date(`${addForm.date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`).toISOString(),
      })
    }
    if (inserts.length > 0) {
      await supabase.from('time_records').insert(inserts)
    }
    setShowAddForm(false)
    setAddForm({ date: '', clock_in: '09:00', clock_out: '17:00' })
    setSavingAdd(false)
    await fetchRecords(selectedStaffId, month)
  }

  // 時給を保存（scope: 'month'=この月のみ, 'future'=この月以降すべて）
  async function handleSaveRate(scope: 'month' | 'future') {
    const rate = parseInt(rateValue)
    if (!rate || rate <= 0) return
    setSavingRate(true)

    const monthStart = `${month}-01`
    const monthEnd = getLastDayOfMonth(month)
    const prevMonthEnd = getLastDayOfPrevMonth(month)
    const nextMonthStart = getFirstDayOfNextMonth(month)

    // この月と重なる既存レートを取得
    type RateRow = { id: string; hourly_rate: number; effective_from: string; effective_to: string | null }
    const { data: existingRaw } = await supabase
      .from('staff_hourly_rates')
      .select('id, hourly_rate, effective_from, effective_to')
      .eq('staff_member_id', selectedStaffId)
      .lte('effective_from', monthEnd)
      .or(`effective_to.is.null,effective_to.gte.${monthStart}`)
      .order('effective_from', { ascending: false })
    const existing = ((existingRaw ?? []) as RateRow[])[0] ?? null

    if (scope === 'future') {
      if (existing) {
        if (existing.effective_from < monthStart) {
          await supabase.from('staff_hourly_rates').update({ effective_to: prevMonthEnd }).eq('id', existing.id)
        } else {
          await supabase.from('staff_hourly_rates').delete().eq('id', existing.id)
        }
      }
      const { data: newRate } = await supabase
        .from('staff_hourly_rates')
        .insert({ staff_member_id: selectedStaffId, hourly_rate: rate, effective_from: monthStart, effective_to: null })
        .select('id').single()
      setStaffMembers((prev) =>
        prev.map((s) => s.id === selectedStaffId ? { ...s, hourly_rate: rate, hourly_rate_id: (newRate as { id: string } | null)?.id ?? null } : s)
      )
    } else {
      // この月のみ
      if (existing) {
        const originalTo = existing.effective_to
        if (existing.effective_from < monthStart) {
          await supabase.from('staff_hourly_rates').update({ effective_to: prevMonthEnd }).eq('id', existing.id)
          if (originalTo === null || originalTo > monthEnd) {
            await supabase.from('staff_hourly_rates').insert({
              staff_member_id: selectedStaffId,
              hourly_rate: existing.hourly_rate,
              effective_from: nextMonthStart,
              effective_to: originalTo,
            })
          }
        } else {
          if (originalTo === null || originalTo > monthEnd) {
            await supabase.from('staff_hourly_rates').insert({
              staff_member_id: selectedStaffId,
              hourly_rate: existing.hourly_rate,
              effective_from: nextMonthStart,
              effective_to: originalTo,
            })
          }
          await supabase.from('staff_hourly_rates').delete().eq('id', existing.id)
        }
      }
      const { data: newRate } = await supabase
        .from('staff_hourly_rates')
        .insert({ staff_member_id: selectedStaffId, hourly_rate: rate, effective_from: monthStart, effective_to: monthEnd })
        .select('id').single()
      setStaffMembers((prev) =>
        prev.map((s) => s.id === selectedStaffId ? { ...s, hourly_rate: rate, hourly_rate_id: (newRate as { id: string } | null)?.id ?? null } : s)
      )
    }

    setEditingRate(false)
    setRateValue('')
    setSavingRate(false)
  }

  const dayRecords = buildDayRecords(
    records.filter((r) => r.staff_member_id === selectedStaffId)
  )
  const missingClockOutCount = dayRecords.filter((d) => d.clock_in !== null && d.clock_out === null).length
  const missingClockInCount = dayRecords.filter((d) => d.clock_out !== null && d.clock_in === null).length
  const totalHours = dayRecords.reduce((sum, d) => sum + (d.hours ?? 0), 0)
  const roundedHours = Math.round(totalHours * 100) / 100
  const salary = selectedStaff?.hourly_rate != null
    ? Math.floor(roundedHours * selectedStaff.hourly_rate)
    : null

  return (
    <div className="space-y-5">
      {/* フィルター */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedStaffId}
          onChange={(e) => { startTransition(() => {}); void handleStaffChange(e.target.value) }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {staffMembers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <button
            onClick={() => void handleMonthChange(prevMonth(month))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-3 text-sm font-medium min-w-[90px] text-center">{formatMonth(month)}</span>
          <button
            onClick={() => void handleMonthChange(nextMonth(month))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* アラートバナー */}
      {(missingClockOutCount > 0 || missingClockInCount > 0) && (
        <div className="space-y-2">
          {missingClockOutCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium">
                退勤が記録されていない日が{missingClockOutCount}件あります。確認・修正してください。
              </p>
            </div>
          )}
          {missingClockInCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-700 font-medium">
                出勤が記録されていない日が{missingClockInCount}件あります。確認・修正してください。
              </p>
            </div>
          )}
        </div>
      )}

      {/* 月次サマリー */}
      {selectedStaff && (
        <div className="grid grid-cols-3 gap-3">
          {/* 時給カード（編集可能） */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">時給</p>
              {editingRate ? (
                <div className="mt-1 space-y-2">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-500">¥</span>
                    <input
                      type="number"
                      min="1"
                      value={rateValue}
                      onChange={(e) => setRateValue(e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      autoFocus
                    />
                    <button onClick={() => setEditingRate(false)} className="text-gray-400 hover:text-gray-600 ml-1">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => void handleSaveRate('month')}
                      disabled={savingRate || !rateValue}
                      className="text-xs px-2 py-1 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
                    >
                      この月のみ
                    </button>
                    <button
                      onClick={() => void handleSaveRate('future')}
                      disabled={savingRate || !rateValue}
                      className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
                    >
                      この月以降すべて
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-gray-900">
                    {selectedStaff.hourly_rate != null ? `¥${selectedStaff.hourly_rate.toLocaleString()}` : '未設定'}
                  </p>
                  <button
                    onClick={() => { setRateValue(String(selectedStaff.hourly_rate ?? '')); setEditingRate(true) }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">月間勤務時間</p>
              <p className="text-lg font-bold text-gray-900">{roundedHours}h</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">月間給与（概算）</p>
              <p className="text-lg font-bold text-indigo-600">
                {salary != null ? `¥${salary.toLocaleString()}` : '—'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 打刻テーブル */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">打刻履歴</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setShowAddForm(true); setAddForm({ date: `${month}-01`, clock_in: '09:00', clock_out: '17:00' }) }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            手動追加
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {/* 手動追加フォーム */}
          {showAddForm && (
            <div className="mx-4 mb-4 border border-indigo-200 rounded-lg p-3 bg-indigo-50/50">
              <p className="text-xs font-medium text-indigo-700 mb-2">打刻を手動追加</p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">日付</label>
                  <input
                    type="date"
                    value={addForm.date}
                    onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                    className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">出勤時刻</label>
                  <input
                    type="time"
                    value={addForm.clock_in}
                    onChange={(e) => setAddForm({ ...addForm, clock_in: e.target.value })}
                    className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">退勤時刻</label>
                  <input
                    type="time"
                    value={addForm.clock_out}
                    onChange={(e) => setAddForm({ ...addForm, clock_out: e.target.value })}
                    className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void handleManualAdd()} disabled={savingAdd || !addForm.date}>
                    {savingAdd ? '保存中...' : '追加'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
                    キャンセル
                  </Button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-6 text-center text-sm text-gray-400">読み込み中...</div>
          ) : dayRecords.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">打刻記録がありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-20">日付</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-40">出勤時刻</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-40">退勤時刻</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">勤務時間</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRecords.map((day) => {
                    const clockInTime = day.clock_in ? toJSTDatetime(day.clock_in.recorded_at).time : null
                    const clockOutTime = day.clock_out ? toJSTDatetime(day.clock_out.recorded_at).time : null
                    const isEditingIn = editing !== null && editing.recordId === day.clock_in?.id && editing.field === 'clock_in'
                    const isEditingOut = editing !== null && editing.recordId === day.clock_out?.id && editing.field === 'clock_out'
                    const missingClockOut = day.clock_in !== null && day.clock_out === null
                    const missingClockIn = day.clock_out !== null && day.clock_in === null

                    return (
                      <tr key={day.date} className={`border-b hover:bg-opacity-80 ${
                        missingClockOut ? 'bg-red-50 border-red-100' :
                        missingClockIn ? 'bg-amber-50 border-amber-100' :
                        'border-gray-50 hover:bg-gray-50/50'
                      }`}>
                        {/* 日付 */}
                        <td className="px-4 py-2 font-medium">
                          <div className="flex items-center gap-1">
                            {missingClockOut && (
                              <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                            )}
                            {missingClockIn && (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                            )}
                            <span className={missingClockOut ? 'text-red-700' : missingClockIn ? 'text-amber-700' : 'text-gray-700'}>
                              {day.date.slice(5).replace('-', '/')}
                            </span>
                            {day.clock_in?.edited_at || day.clock_out?.edited_at ? (
                              <span className="text-xs text-amber-500">*</span>
                            ) : null}
                          </div>
                        </td>

                        {/* 出勤 */}
                        <td className="px-4 py-2">
                          {isEditingIn ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="time"
                                value={editing!.value}
                                onChange={(e) => setEditing({ ...editing!, value: e.target.value })}
                                className="border border-gray-200 rounded px-2 py-0.5 text-sm w-24"
                              />
                              <button onClick={() => void handleSaveEdit()} disabled={saving} className="text-green-600 hover:text-green-700">
                                <Check className="h-4 w-4" />
                              </button>
                              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : clockInTime ? (
                            <div className="flex items-center gap-2">
                              <span className="text-green-700">{clockInTime}</span>
                              <button
                                onClick={() => setEditing({ recordId: day.clock_in!.id, field: 'clock_in', value: clockInTime })}
                                className="text-gray-400 hover:text-indigo-600"
                                title="編集"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => void handleDeleteRecord(day.clock_in!.id)}
                                className="text-gray-300 hover:text-red-500"
                                title="削除"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <AddTimeCell date={day.date} type="clock_in" onAdd={handleAddRecord} />
                          )}
                        </td>

                        {/* 退勤 */}
                        <td className="px-4 py-2">
                          {isEditingOut ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="time"
                                value={editing!.value}
                                onChange={(e) => setEditing({ ...editing!, value: e.target.value })}
                                className="border border-gray-200 rounded px-2 py-0.5 text-sm w-24"
                              />
                              <button onClick={() => void handleSaveEdit()} disabled={saving} className="text-green-600 hover:text-green-700">
                                <Check className="h-4 w-4" />
                              </button>
                              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : clockOutTime ? (
                            <div className="flex items-center gap-2">
                              <span className="text-red-600">{clockOutTime}</span>
                              <button
                                onClick={() => setEditing({ recordId: day.clock_out!.id, field: 'clock_out', value: clockOutTime })}
                                className="text-gray-400 hover:text-indigo-600"
                                title="編集"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => void handleDeleteRecord(day.clock_out!.id)}
                                className="text-gray-300 hover:text-red-500"
                                title="削除"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <AddTimeCell date={day.date} type="clock_out" onAdd={handleAddRecord} />
                          )}
                        </td>

                        {/* 勤務時間 */}
                        <td className="px-4 py-2 text-gray-700">
                          {day.hours != null ? (
                            <span>
                              {day.hours}h
                              <span className="ml-1 text-xs text-gray-400">
                                ({day.rounded_in}〜{day.rounded_out})
                              </span>
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={3} className="px-4 py-2 text-right text-sm font-medium text-gray-600">合計</td>
                    <td className="px-4 py-2 font-bold text-gray-900">
                      {roundedHours}h
                      {salary != null && (
                        <span className="ml-3 text-indigo-600">¥{salary.toLocaleString()}</span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-gray-400">* は管理者が修正した記録です</p>
    </div>
  )
}

function AddTimeCell({
  date,
  type,
  onAdd,
}: {
  date: string
  type: 'clock_in' | 'clock_out'
  onAdd: (date: string, type: 'clock_in' | 'clock_out', time: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [time, setTime] = useState('09:00')
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-gray-300 hover:text-gray-500"
      >
        + 追加
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="border border-gray-200 rounded px-2 py-0.5 text-sm w-24"
      />
      <button
        onClick={async () => {
          setSaving(true)
          await onAdd(date, type, time)
          setOpen(false)
          setSaving(false)
        }}
        disabled={saving}
        className="text-green-600 hover:text-green-700"
      >
        <Check className="h-4 w-4" />
      </button>
      <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
