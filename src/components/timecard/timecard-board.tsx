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
  hours: number | null
}

function toJSTDatetime(isoStr: string): { date: string; time: string } {
  const d = new Date(isoStr)
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const date = jst.toISOString().slice(0, 10)
  const time = jst.toISOString().slice(11, 16)
  return { date, time }
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
      if (clock_in && clock_out) {
        const diffMinutes = (new Date(clock_out.recorded_at).getTime() - new Date(clock_in.recorded_at).getTime()) / 60000
        const ceilMinutes = Math.ceil(diffMinutes / 5) * 5
        hours = Math.round((ceilMinutes / 60) * 100) / 100
      }
      return { date, clock_in, clock_out, hours }
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

  async function handleStaffChange(id: string) {
    setSelectedStaffId(id)
    setEditing(null)
    setShowAddForm(false)
    await fetchRecords(id, month)
  }

  async function handleMonthChange(ym: string) {
    setMonth(ym)
    setEditing(null)
    setShowAddForm(false)
    await fetchRecords(selectedStaffId, ym)
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

  // 時給を保存
  async function handleSaveRate() {
    if (!selectedStaff || !rateValue) return
    const rate = parseInt(rateValue)
    if (!rate || rate <= 0) return
    setSavingRate(true)
    const today = new Date().toISOString().slice(0, 10)

    if (selectedStaff.hourly_rate_id) {
      // 既存レコードを終了させて新しいレートを追加
      await supabase
        .from('staff_hourly_rates')
        .update({ effective_to: today })
        .eq('id', selectedStaff.hourly_rate_id)
    }
    const { data: newRate } = await supabase
      .from('staff_hourly_rates')
      .insert({ staff_member_id: selectedStaffId, hourly_rate: rate, effective_from: today })
      .select('id')
      .single()

    setStaffMembers((prev) =>
      prev.map((s) =>
        s.id === selectedStaffId
          ? { ...s, hourly_rate: rate, hourly_rate_id: (newRate as { id: string } | null)?.id ?? null }
          : s
      )
    )
    setEditingRate(false)
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
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-sm text-gray-500">¥</span>
                  <input
                    type="number"
                    min="1"
                    value={rateValue}
                    onChange={(e) => setRateValue(e.target.value)}
                    className="border border-gray-200 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                  />
                  <button onClick={() => void handleSaveRate()} disabled={savingRate} className="text-green-600 hover:text-green-700">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditingRate(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
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
                          {day.hours != null ? `${day.hours}h` : '—'}
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
