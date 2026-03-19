'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Check, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

type Staff = {
  id: string
  name: string
}

type ShiftEntry = {
  id: string
  staff_id: string
  date: string
  shift_type: string
  start_time: string | null
  end_time: string | null
  actual_start_time: string | null
  actual_end_time: string | null
  actual_note: string | null
  is_attendance_confirmed: boolean
}

interface Props {
  date: string
  staffList: Staff[]
  shifts: ShiftEntry[]
}

const SHIFT_LABEL: Record<string, string> = {
  full: '全日',
  morning: '午前',
  afternoon: '午後',
  off: '休み',
  holiday: '有休',
}

export function ActualAttendanceTable({ date, staffList, shifts }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  // shiftId -> { actualStart, actualEnd, note, confirmed }
  const [edits, setEdits] = useState<
    Record<string, { actualStart: string; actualEnd: string; note: string; confirmed: boolean }>
  >(() =>
    Object.fromEntries(
      shifts
        .filter((s) => s.shift_type !== 'off' && s.shift_type !== 'holiday')
        .map((s) => [
          s.id,
          {
            actualStart: s.actual_start_time ?? s.start_time ?? '',
            actualEnd: s.actual_end_time ?? s.end_time ?? '',
            note: s.actual_note ?? '',
            confirmed: s.is_attendance_confirmed,
          },
        ])
    )
  )
  const [saving, setSaving] = useState(false)
  const [savedAll, setSavedAll] = useState(false)

  const update = (shiftId: string, field: string, value: string | boolean) => {
    setEdits((prev) => ({
      ...prev,
      [shiftId]: { ...prev[shiftId], [field]: value },
    }))
    setSavedAll(false)
  }

  const handleSaveAll = async () => {
    setSaving(true)
    const targets = shifts.filter((s) => s.shift_type !== 'off' && s.shift_type !== 'holiday')
    await Promise.all(
      targets.map((s) => {
        const e = edits[s.id]
        if (!e) return Promise.resolve()
        return supabase
          .from('staff_shifts')
          .update({
            actual_start_time: e.actualStart || null,
            actual_end_time: e.actualEnd || null,
            actual_note: e.note || null,
            is_attendance_confirmed: e.confirmed,
          })
          .eq('id', s.id)
      })
    )
    setSaving(false)
    setSavedAll(true)
    startTransition(() => router.refresh())
  }

  const workingShifts = shifts.filter((s) => s.shift_type !== 'off' && s.shift_type !== 'holiday')
  const offShifts = shifts.filter((s) => s.shift_type === 'off' || s.shift_type === 'holiday')

  // シフト未登録のスタッフ
  const shiftStaffIds = new Set(shifts.map((s) => s.staff_id))
  const noShiftStaff = staffList.filter((s) => !shiftStaffIds.has(s.id))

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 font-medium text-gray-600 w-28">スタッフ</th>
              <th className="text-left py-2 px-3 font-medium text-gray-600 w-20">予定</th>
              <th className="text-left py-2 px-3 font-medium text-gray-600 w-24">実績・出勤</th>
              <th className="text-left py-2 px-3 font-medium text-gray-600 w-24">実績・退勤</th>
              <th className="text-left py-2 px-3 font-medium text-gray-600">備考</th>
              <th className="text-center py-2 px-3 font-medium text-gray-600 w-16">確認</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {workingShifts.map((shift) => {
              const staff = staffList.find((s) => s.id === shift.staff_id)
              const edit = edits[shift.id]
              if (!edit) return null
              return (
                <tr key={shift.id} className={cn('hover:bg-gray-50', edit.confirmed && 'bg-green-50')}>
                  <td className="py-2 px-3 font-medium text-gray-800">
                    {staff?.name ?? '—'}
                  </td>
                  <td className="py-2 px-3 text-gray-500">
                    <div>{SHIFT_LABEL[shift.shift_type]}</div>
                    {shift.start_time && (
                      <div className="text-xs text-gray-400">
                        {shift.start_time.slice(0, 5)}〜{shift.end_time?.slice(0, 5)}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="time"
                      value={edit.actualStart}
                      onChange={(e) => update(shift.id, 'actualStart', e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="time"
                      value={edit.actualEnd}
                      onChange={(e) => update(shift.id, 'actualEnd', e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={edit.note}
                      onChange={(e) => update(shift.id, 'note', e.target.value)}
                      placeholder="遅刻・早退など"
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button
                      onClick={() => update(shift.id, 'confirmed', !edit.confirmed)}
                      className={cn(
                        'w-6 h-6 rounded-full border-2 flex items-center justify-center mx-auto transition-colors',
                        edit.confirmed
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-gray-300 hover:border-green-400'
                      )}
                    >
                      {edit.confirmed && <Check className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              )
            })}

            {offShifts.map((shift) => {
              const staff = staffList.find((s) => s.id === shift.staff_id)
              return (
                <tr key={shift.id} className="bg-gray-50 text-gray-400">
                  <td className="py-2 px-3">{staff?.name ?? '—'}</td>
                  <td className="py-2 px-3">{SHIFT_LABEL[shift.shift_type]}</td>
                  <td className="py-2 px-3" colSpan={4} />
                </tr>
              )
            })}

            {noShiftStaff.map((staff) => (
              <tr key={staff.id} className="text-gray-300">
                <td className="py-2 px-3">{staff.name}</td>
                <td className="py-2 px-3 text-xs">未登録</td>
                <td className="py-2 px-3" colSpan={4} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSaveAll} disabled={saving || workingShifts.length === 0} size="sm">
          <Save className="h-4 w-4" />
          {saving ? '保存中...' : '実績を一括保存'}
        </Button>
        {savedAll && <span className="text-xs text-green-600">保存しました</span>}
        <span className="text-xs text-gray-400 ml-auto">
          確認済: {Object.values(edits).filter((e) => e.confirmed).length} / {workingShifts.length}人
        </span>
      </div>
    </div>
  )
}
