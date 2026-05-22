'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Edit2, Check, X, ChevronLeft, ChevronRight } from 'lucide-react'

export type StaffMember = {
  id: string
  name: string
  hourly_rate: number | null
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

export function TimecardBoard({ staffMembers, initialRecords, initialMonth, staffId }: Props) {
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [selectedStaffId, setSelectedStaffId] = useState<string>(staffId || (staffMembers[0]?.id ?? ''))
  const [month, setMonth] = useState(initialMonth)
  const [records, setRecords] = useState<TimeRecord[]>(initialRecords)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)

  const selectedStaff = staffMembers.find((s) => s.id === selectedStaffId)

  async function fetchRecords(staffId: string, ym: string) {
    setLoading(true)
    const [y, m] = ym.split('-').map(Number)
    const start = new Date(y, m - 1, 1).toISOString()
    const end = new Date(y, m, 1).toISOString()
    const { data } = await supabase
      .from('time_records')
      .select('id, staff_member_id, type, recorded_at, note, edited_at')
      .eq('staff_member_id', staffId)
      .gte('recorded_at', start)
      .lt('recorded_at', end)
      .order('recorded_at')
    setRecords((data ?? []) as TimeRecord[])
    setLoading(false)
  }

  async function handleStaffChange(id: string) {
    setSelectedStaffId(id)
    setEditing(null)
    await fetchRecords(id, month)
  }

  async function handleMonthChange(ym: string) {
    setMonth(ym)
    setEditing(null)
    await fetchRecords(selectedStaffId, ym)
  }

  async function handleSaveEdit() {
    if (!editing) return
    setSaving(true)

    const { date, time } = toJSTDatetime(
      records.find((r) => r.id === editing.recordId)?.recorded_at ?? ''
    )
    const newDateStr = editing.field === 'clock_in' || editing.field === 'clock_out'
      ? date
      : date

    // editing.value は "HH:MM" 形式（JST）→ UTCに変換
    const [hh, mm] = editing.value.split(':').map(Number)
    const jstDate = new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`)

    await supabase
      .from('time_records')
      .update({
        recorded_at: jstDate.toISOString(),
        edited_at: new Date().toISOString(),
      })
      .eq('id', editing.recordId)

    setEditing(null)
    setSaving(false)
    void newDateStr
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

  const dayRecords = buildDayRecords(
    records.filter((r) => r.staff_member_id === selectedStaffId)
  )

  const totalHours = dayRecords.reduce((sum, d) => sum + (d.hours ?? 0), 0)
  const roundedHours = Math.round(totalHours * 10) / 10
  const salary = selectedStaff?.hourly_rate != null
    ? Math.floor(roundedHours * selectedStaff.hourly_rate)
    : null

  return (
    <div className="space-y-5">
      {/* フィルター */}
      <div className="flex flex-wrap items-center gap-3">
        {/* スタッフ選択 */}
        <select
          value={selectedStaffId}
          onChange={(e) => { startTransition(() => {}); void handleStaffChange(e.target.value) }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {staffMembers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* 月選択 */}
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

      {/* 月次サマリー */}
      {selectedStaff && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">時給</p>
              <p className="text-lg font-bold text-gray-900">
                {selectedStaff.hourly_rate != null ? `¥${selectedStaff.hourly_rate.toLocaleString()}` : '未設定'}
              </p>
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
        <CardHeader className="pb-3">
          <CardTitle className="text-base">打刻履歴</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-32">出勤時刻</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-32">退勤時刻</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-20">勤務時間</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRecords.map((day) => {
                    const clockInTime = day.clock_in ? toJSTDatetime(day.clock_in.recorded_at).time : null
                    const clockOutTime = day.clock_out ? toJSTDatetime(day.clock_out.recorded_at).time : null
                    const isEditingIn = editing !== null && editing.recordId === day.clock_in?.id && editing.field === 'clock_in'
                    const isEditingOut = editing !== null && editing.recordId === day.clock_out?.id && editing.field === 'clock_out'

                    return (
                      <tr key={day.date} className="border-b border-gray-50 hover:bg-gray-50/50">
                        {/* 日付 */}
                        <td className="px-4 py-2 text-gray-700 font-medium">
                          {day.date.slice(5).replace('-', '/')}
                          {day.clock_in?.edited_at || day.clock_out?.edited_at ? (
                            <span className="ml-1 text-xs text-amber-500">*</span>
                          ) : null}
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
                            <div className="flex items-center gap-1 group">
                              <span className="text-green-700">{clockInTime}</span>
                              <button
                                onClick={() => setEditing({ recordId: day.clock_in!.id, field: 'clock_in', value: clockInTime })}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => void handleDeleteRecord(day.clock_in!.id)}
                                className="opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500"
                              >
                                <X className="h-3 w-3" />
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
                            <div className="flex items-center gap-1 group">
                              <span className="text-red-600">{clockOutTime}</span>
                              <button
                                onClick={() => setEditing({ recordId: day.clock_out!.id, field: 'clock_out', value: clockOutTime })}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => void handleDeleteRecord(day.clock_out!.id)}
                                className="opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500"
                              >
                                <X className="h-3 w-3" />
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

                        {/* 操作（空欄） */}
                        <td className="px-4 py-2" />
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={3} className="px-4 py-2 text-right text-sm font-medium text-gray-600">合計</td>
                    <td className="px-4 py-2 font-bold text-gray-900">{roundedHours}h</td>
                    <td className="px-4 py-2 font-bold text-indigo-600">
                      {salary != null ? `¥${salary.toLocaleString()}` : ''}
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
