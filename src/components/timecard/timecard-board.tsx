'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Edit2, Check, X, ChevronLeft, ChevronRight, Plus, Pencil, AlertTriangle, CheckCircle, CalendarClock } from 'lucide-react'

// ─── exported types ────────────────────────────────────────────────────────────

export type StaffMember = {
  id: string
  name: string
  user_id: string | null
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

export type ShiftEntry = {
  id: string
  date: string
  shift_type: string
  start_time: string | null
  end_time: string | null
}

export type OvertimeRequest = {
  id: string
  date: string
  scheduled_end_time: string | null
  actual_end_time: string | null
  overtime_minutes: number
  request_type: 'pre' | 'auto'
  status: 'pending' | 'approved' | 'rejected'
  note: string | null
}

// ─── internal types ────────────────────────────────────────────────────────────

type DayRecord = {
  date: string
  clock_in: TimeRecord | null
  clock_out: TimeRecord | null
  rounded_in: string | null
  rounded_out: string | null
  hours: number | null
}

type EditState = { recordId: string; field: 'clock_in' | 'clock_out'; value: string }

// ─── date / time helpers ──────────────────────────────────────────────────────

function toJSTDatetime(isoStr: string): { date: string; time: string } {
  const jst = new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000)
  return { date: jst.toISOString().slice(0, 10), time: jst.toISOString().slice(11, 16) }
}

function toJSTEpochMinutes(isoStr: string): number {
  return Math.floor((new Date(isoStr).getTime() + 9 * 60 * 60 * 1000) / 60000)
}

function epochMinutesToHHMM(m: number): string {
  const mOfDay = ((m % 1440) + 1440) % 1440
  return `${String(Math.floor(mOfDay / 60)).padStart(2, '0')}:${String(mOfDay % 60).padStart(2, '0')}`
}

function roundInUp30(isoStr: string): { minutes: number; time: string } {
  const m = Math.ceil(toJSTEpochMinutes(isoStr) / 30) * 30
  return { minutes: m, time: epochMinutesToHHMM(m) }
}

function roundOutDown30(isoStr: string): { minutes: number; time: string } {
  const m = Math.floor(toJSTEpochMinutes(isoStr) / 30) * 30
  return { minutes: m, time: epochMinutesToHHMM(m) }
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
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
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

// ─── build day records ────────────────────────────────────────────────────────

function buildDayRecords(records: TimeRecord[]): DayRecord[] {
  const byDate = new Map<string, { clock_in: TimeRecord | null; clock_out: TimeRecord | null }>()

  for (const r of records) {
    const { date } = toJSTDatetime(r.recorded_at)
    if (!byDate.has(date)) byDate.set(date, { clock_in: null, clock_out: null })
    const day = byDate.get(date)!
    if (r.type === 'clock_in' && (!day.clock_in || r.recorded_at < day.clock_in.recorded_at)) day.clock_in = r
    if (r.type === 'clock_out' && (!day.clock_out || r.recorded_at > day.clock_out.recorded_at)) day.clock_out = r
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { clock_in, clock_out }]) => {
      let hours: number | null = null
      let rounded_in: string | null = null
      let rounded_out: string | null = null
      if (clock_in) rounded_in = roundInUp30(clock_in.recorded_at).time
      if (clock_out) rounded_out = roundOutDown30(clock_out.recorded_at).time
      if (clock_in && clock_out) {
        const inM = roundInUp30(clock_in.recorded_at).minutes
        const outM = roundOutDown30(clock_out.recorded_at).minutes
        const diff = outM - inM
        hours = diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0
      }
      return { date, clock_in, clock_out, rounded_in, rounded_out, hours }
    })
}

// ─── component ────────────────────────────────────────────────────────────────

interface Props {
  staffMembers: StaffMember[]
  initialRecords: TimeRecord[]
  initialMonth: string
  staffId: string
  initialShifts: ShiftEntry[]
  initialOvertimeRequests: OvertimeRequest[]
}

export function TimecardBoard({
  staffMembers: initialStaffMembers,
  initialRecords,
  initialMonth,
  staffId,
  initialShifts,
  initialOvertimeRequests,
}: Props) {
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(initialStaffMembers)
  const [selectedStaffId, setSelectedStaffId] = useState(staffId || (initialStaffMembers[0]?.id ?? ''))
  const [month, setMonth] = useState(initialMonth)
  const [records, setRecords] = useState<TimeRecord[]>(initialRecords)
  const [shifts, setShifts] = useState<ShiftEntry[]>(initialShifts)
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>(initialOvertimeRequests)
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

  // 事前残業申請フォーム
  const [showPreOTForm, setShowPreOTForm] = useState(false)
  const [preOTForm, setPreOTForm] = useState({ date: '', overtime_minutes: '30', note: '' })
  const [savingPreOT, setSavingPreOT] = useState(false)

  const selectedStaff = staffMembers.find((s) => s.id === selectedStaffId)

  // derived maps
  const shiftsMap = new Map(shifts.map((s) => [s.date, s]))
  const overtimeMap = new Map<string, OvertimeRequest[]>()
  for (const o of overtimeRequests) {
    if (!overtimeMap.has(o.date)) overtimeMap.set(o.date, [])
    overtimeMap.get(o.date)!.push(o)
  }

  // ─── fetch helpers ────────────────────────────────────────────────────────

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

  async function fetchShiftsAndOvertime(member: StaffMember, ym: string) {
    const userId = member.user_id
    const monthStart = `${ym}-01`
    const monthEnd = getLastDayOfMonth(ym)
    if (!userId) { setShifts([]); setOvertimeRequests([]); return }

    const [{ data: sData }, { data: oData }] = await Promise.all([
      supabase.from('staff_shifts').select('id, date, shift_type, start_time, end_time')
        .eq('staff_id', userId).gte('date', monthStart).lte('date', monthEnd),
      supabase.from('overtime_requests')
        .select('id, date, scheduled_end_time, actual_end_time, overtime_minutes, request_type, status, note')
        .eq('staff_id', userId).gte('date', monthStart).lte('date', monthEnd),
    ])
    setShifts((sData ?? []) as ShiftEntry[])
    setOvertimeRequests((oData ?? []) as OvertimeRequest[])
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
      prev.map((s) => s.id === sId ? { ...s, hourly_rate: rate?.hourly_rate ?? null, hourly_rate_id: rate?.id ?? null } : s)
    )
  }

  async function handleStaffChange(id: string) {
    setSelectedStaffId(id)
    setEditing(null)
    setShowAddForm(false)
    setShowPreOTForm(false)
    setEditingRate(false)
    const member = staffMembers.find((s) => s.id === id)!
    await Promise.all([fetchRecords(id, month), fetchRateForMonth(id, month), fetchShiftsAndOvertime(member, month)])
  }

  async function handleMonthChange(ym: string) {
    setMonth(ym)
    setEditing(null)
    setShowAddForm(false)
    setShowPreOTForm(false)
    setEditingRate(false)
    const member = staffMembers.find((s) => s.id === selectedStaffId)!
    await Promise.all([fetchRecords(selectedStaffId, ym), fetchRateForMonth(selectedStaffId, ym), fetchShiftsAndOvertime(member, ym)])
  }

  // ─── record edit / add / delete ───────────────────────────────────────────

  async function handleSaveEdit() {
    if (!editing) return
    setSaving(true)
    const { date } = toJSTDatetime(records.find((r) => r.id === editing.recordId)?.recorded_at ?? '')
    const [hh, mm] = editing.value.split(':').map(Number)
    const jstDate = new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`)
    await supabase.from('time_records').update({ recorded_at: jstDate.toISOString(), edited_at: new Date().toISOString() }).eq('id', editing.recordId)
    setEditing(null)
    setSaving(false)
    await fetchRecords(selectedStaffId, month)
  }

  async function handleAddRecord(date: string, type: 'clock_in' | 'clock_out', timeStr: string) {
    const [hh, mm] = timeStr.split(':').map(Number)
    const jstDate = new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`)
    await supabase.from('time_records').insert({ staff_member_id: selectedStaffId, type, recorded_at: jstDate.toISOString() })
    await fetchRecords(selectedStaffId, month)
  }

  async function handleDeleteRecord(recordId: string) {
    if (!confirm('この打刻記録を削除しますか？')) return
    await supabase.from('time_records').delete().eq('id', recordId)
    await fetchRecords(selectedStaffId, month)
  }

  async function handleManualAdd() {
    if (!addForm.date) return
    setSavingAdd(true)
    const inserts = []
    if (addForm.clock_in) {
      const [hh, mm] = addForm.clock_in.split(':').map(Number)
      inserts.push({ staff_member_id: selectedStaffId, type: 'clock_in', recorded_at: new Date(`${addForm.date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`).toISOString() })
    }
    if (addForm.clock_out) {
      const [hh, mm] = addForm.clock_out.split(':').map(Number)
      inserts.push({ staff_member_id: selectedStaffId, type: 'clock_out', recorded_at: new Date(`${addForm.date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`).toISOString() })
    }
    if (inserts.length > 0) await supabase.from('time_records').insert(inserts)
    setShowAddForm(false)
    setAddForm({ date: '', clock_in: '09:00', clock_out: '17:00' })
    setSavingAdd(false)
    await fetchRecords(selectedStaffId, month)
  }

  // ─── 時給保存 ─────────────────────────────────────────────────────────────

  async function handleSaveRate(scope: 'month' | 'future') {
    const rate = parseInt(rateValue)
    if (!rate || rate <= 0) return
    setSavingRate(true)
    const monthStart = `${month}-01`
    const monthEnd = getLastDayOfMonth(month)
    const prevMonthEnd = getLastDayOfPrevMonth(month)
    const nextMonthStart = getFirstDayOfNextMonth(month)

    type RateRow = { id: string; hourly_rate: number; effective_from: string; effective_to: string | null }
    const { data: existingRaw } = await supabase
      .from('staff_hourly_rates').select('id, hourly_rate, effective_from, effective_to')
      .eq('staff_member_id', selectedStaffId).lte('effective_from', monthEnd)
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
      const { data: newRate } = await supabase.from('staff_hourly_rates')
        .insert({ staff_member_id: selectedStaffId, hourly_rate: rate, effective_from: monthStart, effective_to: null })
        .select('id').single()
      setStaffMembers((prev) => prev.map((s) => s.id === selectedStaffId ? { ...s, hourly_rate: rate, hourly_rate_id: (newRate as { id: string } | null)?.id ?? null } : s))
    } else {
      if (existing) {
        const originalTo = existing.effective_to
        if (existing.effective_from < monthStart) {
          await supabase.from('staff_hourly_rates').update({ effective_to: prevMonthEnd }).eq('id', existing.id)
          if (originalTo === null || originalTo > monthEnd) {
            await supabase.from('staff_hourly_rates').insert({ staff_member_id: selectedStaffId, hourly_rate: existing.hourly_rate, effective_from: nextMonthStart, effective_to: originalTo })
          }
        } else {
          if (originalTo === null || originalTo > monthEnd) {
            await supabase.from('staff_hourly_rates').insert({ staff_member_id: selectedStaffId, hourly_rate: existing.hourly_rate, effective_from: nextMonthStart, effective_to: originalTo })
          }
          await supabase.from('staff_hourly_rates').delete().eq('id', existing.id)
        }
      }
      const { data: newRate } = await supabase.from('staff_hourly_rates')
        .insert({ staff_member_id: selectedStaffId, hourly_rate: rate, effective_from: monthStart, effective_to: monthEnd })
        .select('id').single()
      setStaffMembers((prev) => prev.map((s) => s.id === selectedStaffId ? { ...s, hourly_rate: rate, hourly_rate_id: (newRate as { id: string } | null)?.id ?? null } : s))
    }
    setEditingRate(false)
    setRateValue('')
    setSavingRate(false)
  }

  // ─── 残業承認 ─────────────────────────────────────────────────────────────

  // ─── 事前残業申請 ─────────────────────────────────────────────────────────

  async function handlePreOTSubmit() {
    const userId = selectedStaff?.user_id
    if (!userId || !preOTForm.date) return
    const ot = parseInt(preOTForm.overtime_minutes)
    if (!ot || ot <= 0) return
    setSavingPreOT(true)
    const shift = shiftsMap.get(preOTForm.date)
    await fetch('/api/staff/overtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: userId,
        date: preOTForm.date,
        scheduled_end_time: shift?.end_time ?? null,
        actual_end_time: null,
        overtime_minutes: ot,
        request_type: 'pre',
        status: 'approved',
        note: preOTForm.note || null,
      }),
    })
    const member = staffMembers.find((s) => s.id === selectedStaffId)!
    await fetchShiftsAndOvertime(member, month)
    setShowPreOTForm(false)
    setPreOTForm({ date: '', overtime_minutes: '30', note: '' })
    setSavingPreOT(false)
  }

  // ─── derived values ────────────────────────────────────────────────────────

  const dayRecords = buildDayRecords(records.filter((r) => r.staff_member_id === selectedStaffId))
  const missingClockOutCount = dayRecords.filter((d) => d.clock_in !== null && d.clock_out === null).length
  const missingClockInCount = dayRecords.filter((d) => d.clock_out !== null && d.clock_in === null).length
  const totalHours = dayRecords.reduce((sum, d) => sum + (d.hours ?? 0), 0)
  const roundedHours = Math.round(totalHours * 100) / 100
  const salary = selectedStaff?.hourly_rate != null ? Math.floor(roundedHours * selectedStaff.hourly_rate) : null

  // 残業合計（承認済みのみ・30分単位切り捨て）
  const approvedOvertimeMinutes = overtimeRequests
    .filter((o) => o.status === 'approved')
    .reduce((sum, o) => sum + Math.floor(o.overtime_minutes / 30) * 30, 0)

  const hasShifts = selectedStaff?.user_id != null

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* フィルター */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedStaffId}
          onChange={(e) => { startTransition(() => {}); void handleStaffChange(e.target.value) }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {staffMembers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <div className="flex items-center gap-1">
          <button onClick={() => void handleMonthChange(prevMonth(month))} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-3 text-sm font-medium min-w-[90px] text-center">{formatMonth(month)}</span>
          <button onClick={() => void handleMonthChange(nextMonth(month))} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
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
              <p className="text-sm text-red-700 font-medium">退勤が記録されていない日が{missingClockOutCount}件あります。確認・修正してください。</p>
            </div>
          )}
          {missingClockInCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-700 font-medium">出勤が記録されていない日が{missingClockInCount}件あります。確認・修正してください。</p>
            </div>
          )}
        </div>
      )}

      {/* 月次サマリー */}
      {selectedStaff && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* 時給 */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">時給</p>
              {editingRate ? (
                <div className="mt-1 space-y-2">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-500">¥</span>
                    <input type="number" min="1" value={rateValue} onChange={(e) => setRateValue(e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-indigo-500" autoFocus />
                    <button onClick={() => setEditingRate(false)} className="text-gray-400 hover:text-gray-600 ml-1"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={() => void handleSaveRate('month')} disabled={savingRate || !rateValue}
                      className="text-xs px-2 py-1 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">この月のみ</button>
                    <button onClick={() => void handleSaveRate('future')} disabled={savingRate || !rateValue}
                      className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">この月以降すべて</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-gray-900">{selectedStaff.hourly_rate != null ? `¥${selectedStaff.hourly_rate.toLocaleString()}` : '未設定'}</p>
                  <button onClick={() => { setRateValue(String(selectedStaff.hourly_rate ?? '')); setEditingRate(true) }} className="text-gray-400 hover:text-gray-600">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 月間勤務 */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">月間勤務時間</p>
              <p className="text-lg font-bold text-gray-900">{roundedHours}h</p>
            </CardContent>
          </Card>

          {/* 残業（承認済み） */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">残業時間（承認済）</p>
              <p className="text-lg font-bold text-orange-600">
                {approvedOvertimeMinutes > 0 ? `${Math.floor(approvedOvertimeMinutes / 60)}h${approvedOvertimeMinutes % 60 > 0 ? `${approvedOvertimeMinutes % 60}m` : ''}` : '—'}
              </p>
            </CardContent>
          </Card>

          {/* 月間給与 */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">月間給与（概算）</p>
              <p className="text-lg font-bold text-indigo-600">{salary != null ? `¥${salary.toLocaleString()}` : '—'}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 打刻テーブル */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">打刻履歴</CardTitle>
          <div className="flex gap-2">
            {hasShifts && (
              <Button size="sm" variant="outline" onClick={() => { setShowPreOTForm(true); setPreOTForm({ date: `${month}-01`, overtime_minutes: '30', note: '' }) }}>
                <CalendarClock className="h-3.5 w-3.5 mr-1" />
                事前残業申請
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => { setShowAddForm(true); setAddForm({ date: `${month}-01`, clock_in: '09:00', clock_out: '17:00' }) }}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              手動追加
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* 事前残業申請フォーム */}
          {showPreOTForm && (
            <div className="mx-4 mb-4 border border-orange-200 rounded-lg p-3 bg-orange-50/50">
              <p className="text-xs font-medium text-orange-700 mb-2">事前残業申請</p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">日付</label>
                  <input type="date" value={preOTForm.date} onChange={(e) => setPreOTForm({ ...preOTForm, date: e.target.value })}
                    className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">残業時間（分）</label>
                  <input type="number" min="30" step="30" value={preOTForm.overtime_minutes}
                    onChange={(e) => setPreOTForm({ ...preOTForm, overtime_minutes: e.target.value })}
                    className="border border-gray-200 rounded px-2 py-1.5 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-orange-400" />
                </div>
                <div className="flex-1 min-w-32">
                  <label className="text-xs text-gray-500 mb-1 block">メモ（任意）</label>
                  <input type="text" value={preOTForm.note} onChange={(e) => setPreOTForm({ ...preOTForm, note: e.target.value })}
                    placeholder="理由など" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void handlePreOTSubmit()} disabled={savingPreOT || !preOTForm.date}
                    className="bg-orange-600 hover:bg-orange-700 text-white">
                    {savingPreOT ? '保存中...' : '申請'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowPreOTForm(false)}>キャンセル</Button>
                </div>
              </div>
            </div>
          )}

          {/* 手動追加フォーム */}
          {showAddForm && (
            <div className="mx-4 mb-4 border border-indigo-200 rounded-lg p-3 bg-indigo-50/50">
              <p className="text-xs font-medium text-indigo-700 mb-2">打刻を手動追加</p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">日付</label>
                  <input type="date" value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                    className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">出勤時刻</label>
                  <input type="time" value={addForm.clock_in} onChange={(e) => setAddForm({ ...addForm, clock_in: e.target.value })}
                    className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">退勤時刻</label>
                  <input type="time" value={addForm.clock_out} onChange={(e) => setAddForm({ ...addForm, clock_out: e.target.value })}
                    className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void handleManualAdd()} disabled={savingAdd || !addForm.date}>
                    {savingAdd ? '保存中...' : '追加'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>キャンセル</Button>
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
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-24">日付</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-36">出勤時刻</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-36">退勤時刻</th>
                    {hasShifts && <th className="text-left px-4 py-2 font-medium text-gray-600 w-28">予定</th>}
                    <th className="text-left px-4 py-2 font-medium text-gray-600">勤務時間</th>
                    {hasShifts && <th className="text-left px-4 py-2 font-medium text-gray-600 w-36">残業</th>}
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

                    const shift = shiftsMap.get(day.date)
                    const preOT = (overtimeMap.get(day.date) ?? []).find((o) => o.request_type === 'pre')

                    return (
                      <tr key={day.date} className={`border-b hover:bg-opacity-80 ${
                        missingClockOut ? 'bg-red-50 border-red-100' :
                        missingClockIn ? 'bg-amber-50 border-amber-100' :
                        'border-gray-50 hover:bg-gray-50/50'
                      }`}>
                        {/* 日付 */}
                        <td className="px-4 py-2 font-medium">
                          <div className="flex items-center gap-1">
                            {missingClockOut && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                            {missingClockIn && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                            <span className={missingClockOut ? 'text-red-700' : missingClockIn ? 'text-amber-700' : 'text-gray-700'}>
                              {day.date.slice(5).replace('-', '/')}
                            </span>
                            {day.clock_in?.edited_at || day.clock_out?.edited_at ? <span className="text-xs text-amber-500">*</span> : null}
                          </div>
                        </td>

                        {/* 出勤 */}
                        <td className="px-4 py-2">
                          {isEditingIn ? (
                            <div className="flex items-center gap-1">
                              <input type="time" value={editing!.value} onChange={(e) => setEditing({ ...editing!, value: e.target.value })}
                                className="border border-gray-200 rounded px-2 py-0.5 text-sm w-24" />
                              <button onClick={() => void handleSaveEdit()} disabled={saving} className="text-green-600 hover:text-green-700"><Check className="h-4 w-4" /></button>
                              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                            </div>
                          ) : clockInTime ? (
                            <div className="flex items-center gap-2">
                              <span className="text-green-700">{clockInTime}</span>
                              <button onClick={() => setEditing({ recordId: day.clock_in!.id, field: 'clock_in', value: clockInTime })} className="text-gray-400 hover:text-indigo-600"><Edit2 className="h-3.5 w-3.5" /></button>
                              <button onClick={() => void handleDeleteRecord(day.clock_in!.id)} className="text-gray-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          ) : (
                            <AddTimeCell date={day.date} type="clock_in" onAdd={handleAddRecord} />
                          )}
                        </td>

                        {/* 退勤 */}
                        <td className="px-4 py-2">
                          {isEditingOut ? (
                            <div className="flex items-center gap-1">
                              <input type="time" value={editing!.value} onChange={(e) => setEditing({ ...editing!, value: e.target.value })}
                                className="border border-gray-200 rounded px-2 py-0.5 text-sm w-24" />
                              <button onClick={() => void handleSaveEdit()} disabled={saving} className="text-green-600 hover:text-green-700"><Check className="h-4 w-4" /></button>
                              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                            </div>
                          ) : clockOutTime ? (
                            <div className="flex items-center gap-2">
                              <span className="text-red-600">{clockOutTime}</span>
                              <button onClick={() => setEditing({ recordId: day.clock_out!.id, field: 'clock_out', value: clockOutTime })} className="text-gray-400 hover:text-indigo-600"><Edit2 className="h-3.5 w-3.5" /></button>
                              <button onClick={() => void handleDeleteRecord(day.clock_out!.id)} className="text-gray-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          ) : (
                            <AddTimeCell date={day.date} type="clock_out" onAdd={handleAddRecord} />
                          )}
                        </td>

                        {/* 予定シフト */}
                        {hasShifts && (
                          <td className="px-4 py-2 text-xs text-gray-500">
                            {shift ? (
                              shift.shift_type === 'off' ? <span className="text-gray-400">休み</span> :
                              shift.shift_type === 'holiday' ? <span className="text-indigo-500">有休</span> :
                              shift.start_time && shift.end_time
                                ? `${shift.start_time.slice(0, 5)}〜${shift.end_time.slice(0, 5)}`
                                : <span className="text-gray-400">—</span>
                            ) : <span className="text-gray-300">未登録</span>}
                          </td>
                        )}

                        {/* 勤務時間 */}
                        <td className="px-4 py-2 text-gray-700">
                          {day.hours != null ? (
                            <span>
                              {day.hours}h
                              <span className="ml-1 text-xs text-gray-400">({day.rounded_in}〜{day.rounded_out})</span>
                            </span>
                          ) : '—'}
                        </td>

                        {/* 残業（事前申請のみ） */}
                        {hasShifts && (
                          <td className="px-4 py-2">
                            {preOT && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-orange-600 font-medium">
                                  {preOT.overtime_minutes}分
                                </span>
                                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={hasShifts ? 4 : 3} className="px-4 py-2 text-right text-sm font-medium text-gray-600">合計</td>
                    <td className="px-4 py-2 font-bold text-gray-900">
                      {roundedHours}h
                      {salary != null && <span className="ml-3 text-indigo-600">¥{salary.toLocaleString()}</span>}
                    </td>
                    {hasShifts && (
                      <td className="px-4 py-2 text-sm text-orange-600">
                        {approvedOvertimeMinutes > 0 && `残業 ${Math.floor(approvedOvertimeMinutes / 60)}h${approvedOvertimeMinutes % 60 > 0 ? `${approvedOvertimeMinutes % 60}m` : ''}`}
                      </td>
                    )}
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

// ─── AddTimeCell ──────────────────────────────────────────────────────────────

function AddTimeCell({ date, type, onAdd }: {
  date: string
  type: 'clock_in' | 'clock_out'
  onAdd: (date: string, type: 'clock_in' | 'clock_out', time: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [time, setTime] = useState('09:00')
  const [saving, setSaving] = useState(false)

  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-xs text-gray-300 hover:text-gray-500">+ 追加</button>
  )

  return (
    <div className="flex items-center gap-1">
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
        className="border border-gray-200 rounded px-2 py-0.5 text-sm w-24" />
      <button onClick={async () => { setSaving(true); await onAdd(date, type, time); setOpen(false); setSaving(false) }}
        disabled={saving} className="text-green-600 hover:text-green-700">
        <Check className="h-4 w-4" />
      </button>
      <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
    </div>
  )
}
