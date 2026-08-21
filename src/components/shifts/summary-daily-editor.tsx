'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Fingerprint, Loader2 } from 'lucide-react'
import { getJapaneseHolidayName } from '@/lib/japanese-holidays'

export type DailyRow = {
  date: string
  shiftId: string | null
  shiftType: string | null
  planStart: string | null
  planEnd: string | null
  breakStart: string | null
  breakEnd: string | null
  clockInId: string | null
  clockOutId: string | null
  clockIn: string | null
  clockOut: string | null
  hours: number | null
  breakMinutes: number
  lunchDeduction: number
  isConfirmed: boolean
  overtimeMinutes: number | null
  leaveDays: number | null
}

const SHIFT_LABELS: Record<string, string> = {
  full: '全日', morning: '午前', afternoon: '午後', off: '休み', holiday: '祝休',
}

const DOW = ['日', '月', '火', '水', '木', '金', '土']

/** その日のJST時刻をISO文字列にする */
function jstIso(date: string, hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map(Number)
  return new Date(
    `${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`
  ).toISOString()
}

export function SummaryDailyEditor({
  staffMemberId,
  userId,
  rows,
}: {
  staffMemberId: string
  userId: string | null
  rows: DailyRow[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState<string | null>(null)

  const done = () => {
    setSaving(null)
    startTransition(() => router.refresh())
  }

  /** 出退勤の打刻を編集する。タイムカードと同じ time_records を書き換えるので双方に反映される */
  const saveClock = async (row: DailyRow, type: 'clock_in' | 'clock_out', value: string) => {
    const current = type === 'clock_in' ? row.clockIn : row.clockOut
    if ((current ?? '') === value) return
    const recordId = type === 'clock_in' ? row.clockInId : row.clockOutId
    setSaving(`${row.date}-${type}`)

    if (!value) {
      if (recordId) {
        const { error } = await supabase.from('time_records').delete().eq('id', recordId)
        if (error) { alert(`打刻の削除に失敗しました: ${error.message}`); setSaving(null); return }
      }
    } else if (recordId) {
      const { error } = await supabase
        .from('time_records')
        .update({ recorded_at: jstIso(row.date, value), edited_at: new Date().toISOString() })
        .eq('id', recordId)
      if (error) { alert(`打刻の保存に失敗しました: ${error.message}`); setSaving(null); return }
    } else {
      const { error } = await supabase.from('time_records').insert({
        staff_member_id: staffMemberId,
        type,
        recorded_at: jstIso(row.date, value),
        edited_at: new Date().toISOString(),
      })
      if (error) { alert(`打刻の追加に失敗しました: ${error.message}`); setSaving(null); return }
    }
    done()
  }

  /**
   * 中抜け休憩を編集する。タイムカードの実働時間もこの staff_shifts を見ているため、
   * ここで変えるとタイムカード側の計算にもそのまま反映される。
   */
  const saveBreak = async (
    row: DailyRow,
    field: 'break_start_time' | 'break_end_time',
    value: string
  ) => {
    const current = field === 'break_start_time' ? row.breakStart : row.breakEnd
    if ((current ?? '') === value) return
    if (!userId) return
    setSaving(`${row.date}-${field}`)

    if (row.shiftId) {
      const { error } = await supabase
        .from('staff_shifts')
        .update({ [field]: value || null })
        .eq('id', row.shiftId)
      if (error) { alert(`休憩の保存に失敗しました: ${error.message}`); setSaving(null); return }
    } else {
      // シフト未登録の日に休憩だけ入れる場合、勤務日としてシフト行を作る
      const { error } = await supabase.from('staff_shifts').insert({
        staff_id: userId,
        date: row.date,
        shift_type: 'full',
        [field]: value || null,
      })
      if (error) { alert(`休憩の保存に失敗しました: ${error.message}`); setSaving(null); return }
    }
    done()
  }

  return (
    <div className="divide-y divide-gray-100">
      {rows.map((row) => {
        const isWork = row.shiftType ? !['off', 'holiday'].includes(row.shiftType) : true
        const dow = DOW[new Date(row.date + 'T00:00:00').getDay()]
        const holidayName = getJapaneseHolidayName(row.date)
        const isWeekend = dow === '日' || dow === '土' || holidayName !== null
        const totalBreak = row.breakMinutes + row.lunchDeduction

        return (
          <div key={row.date} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-sm">
            {/* 日付 */}
            <span
              className={`text-xs w-20 flex-shrink-0 ${isWeekend ? 'text-red-500' : 'text-gray-500'}`}
              title={holidayName ?? undefined}
            >
              {row.date.slice(5).replace('-', '/')}（{holidayName ? '祝' : dow}）
            </span>

            {/* シフト種別 */}
            {row.shiftType && (
              <Badge
                variant={isWork ? 'secondary' : 'outline'}
                className={`text-xs flex-shrink-0 ${!isWork ? 'text-gray-400' : ''}`}
              >
                {SHIFT_LABELS[row.shiftType] ?? row.shiftType}
              </Badge>
            )}

            {/* シフト計画時間（表示のみ・変更はシフト管理から） */}
            {isWork && row.planStart && row.planEnd && (
              <span className="text-gray-400 text-xs flex-shrink-0">
                予定 {row.planStart}〜{row.planEnd}
              </span>
            )}

            {/* 出退勤の打刻（編集可・タイムカードと同じデータ） */}
            <span className="flex items-center gap-1 flex-shrink-0">
              <Fingerprint className="h-3 w-3 text-teal-600 flex-shrink-0" />
              <input
                key={`in-${row.date}-${row.clockIn ?? ''}`}
                type="time"
                defaultValue={row.clockIn ?? ''}
                onBlur={(e) => saveClock(row, 'clock_in', e.target.value)}
                title="出勤打刻（タイムカードにも反映されます）"
                className="text-xs border border-gray-200 rounded px-1 py-0.5 w-[74px] text-center focus:border-teal-400 outline-none"
              />
              <span className="text-gray-300 text-xs">〜</span>
              <input
                key={`out-${row.date}-${row.clockOut ?? ''}`}
                type="time"
                defaultValue={row.clockOut ?? ''}
                onBlur={(e) => saveClock(row, 'clock_out', e.target.value)}
                title="退勤打刻（タイムカードにも反映されます）"
                className="text-xs border border-gray-200 rounded px-1 py-0.5 w-[74px] text-center focus:border-teal-400 outline-none"
              />
              {(saving === `${row.date}-clock_in` || saving === `${row.date}-clock_out`) && (
                <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
              )}
              {row.clockIn && !row.clockOut && (
                <AlertTriangle className="h-3 w-3 text-red-500" />
              )}
            </span>

            {/* 中抜け休憩（編集可） */}
            <span className="flex items-center gap-1 flex-shrink-0">
              <span className="text-xs text-gray-400">休憩</span>
              {userId ? (
                <>
                  <input
                    key={`bs-${row.date}-${row.breakStart ?? ''}`}
                    type="time"
                    defaultValue={row.breakStart ?? ''}
                    onBlur={(e) => saveBreak(row, 'break_start_time', e.target.value)}
                    title="中抜け休憩の開始時刻（タイムカードの実働時間にも反映されます）"
                    className="text-xs border border-gray-200 rounded px-1 py-0.5 w-[74px] text-center focus:border-indigo-400 outline-none"
                  />
                  <span className="text-gray-300 text-xs">〜</span>
                  <input
                    key={`be-${row.date}-${row.breakEnd ?? ''}`}
                    type="time"
                    defaultValue={row.breakEnd ?? ''}
                    onBlur={(e) => saveBreak(row, 'break_end_time', e.target.value)}
                    title="中抜け休憩の終了時刻（タイムカードの実働時間にも反映されます）"
                    className="text-xs border border-gray-200 rounded px-1 py-0.5 w-[74px] text-center focus:border-indigo-400 outline-none"
                  />
                  {(saving === `${row.date}-break_start_time` || saving === `${row.date}-break_end_time`) && (
                    <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                  )}
                </>
              ) : (
                <span className="text-xs text-gray-300">アカウントなし</span>
              )}
              {totalBreak > 0 && (
                <span
                  className="text-xs text-gray-400"
                  title={
                    row.lunchDeduction > 0
                      ? `中抜け${row.breakMinutes}分 ＋ 5時間以上のため自動控除${row.lunchDeduction}分`
                      : `中抜け${row.breakMinutes}分`
                  }
                >
                  計{totalBreak}分
                </span>
              )}
            </span>

            {/* 実働時間（打刻・休憩から自動計算） */}
            <span className="text-xs flex-shrink-0">
              {row.hours != null ? (
                <span className="font-medium text-teal-700">実働 {row.hours}h</span>
              ) : (
                <span className="text-gray-300">実働 —</span>
              )}
            </span>

            {/* 有給バッジ */}
            {row.leaveDays != null && (
              <Badge variant="secondary" className="text-xs flex-shrink-0 bg-blue-100 text-blue-700 border-blue-200">
                有給{row.leaveDays === 0.5 ? ' 半日' : ''}
              </Badge>
            )}

            {/* 残業バッジ */}
            {row.overtimeMinutes != null && (
              <span className="text-xs text-orange-600 flex-shrink-0">
                残業 {row.overtimeMinutes}分
              </span>
            )}

            {/* 確認済バッジ */}
            {row.isConfirmed && (
              <Badge variant="success" className="text-xs ml-auto flex-shrink-0">確認済</Badge>
            )}
          </div>
        )
      })}
    </div>
  )
}
