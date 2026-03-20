import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Clock, AlertTriangle } from 'lucide-react'

type StaffShift = {
  id: string
  staff_id: string
  date: string
  shift_type: string
  start_time: string | null
  end_time: string | null
  actual_start_time: string | null
  actual_end_time: string | null
  is_attendance_confirmed: boolean
}

type User = {
  id: string
  name: string
  role: string
}

const SHIFT_LABELS: Record<string, string> = {
  full: '全日',
  morning: '午前',
  afternoon: '午後',
  off: '休み',
  holiday: '祝休',
}

/** "HH:MM" → 分に変換 */
function toMinutes(time: string | null): number {
  if (!time) return 0
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

/** 分 → "H時間M分" 表示 */
function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0分'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}分`
  if (m === 0) return `${h}時間`
  return `${h}時間${m}分`
}

function calcMinutes(start: string | null, end: string | null): number {
  if (!start || !end) return 0
  const diff = toMinutes(end) - toMinutes(start)
  return diff > 0 ? diff : 0
}

export default async function ShiftSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
  const prevDate = new Date(year, month - 2, 1)
  const nextDate = new Date(year, month, 1)

  const [{ data: usersRaw }, { data: shiftsRaw }] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, role')
      .in('role', ['admin', 'staff'])
      .order('name'),
    supabase
      .from('staff_shifts')
      .select('id, staff_id, date, shift_type, start_time, end_time, actual_start_time, actual_end_time, is_attendance_confirmed')
      .gte('date', monthStart)
      .lte('date', monthEnd),
  ])

  const users = (usersRaw ?? []) as unknown as User[]
  const shifts = (shiftsRaw ?? []) as unknown as StaffShift[]

  // スタッフごとにシフトを集計
  const staffStats = users.map((user) => {
    const myShifts = shifts.filter((s) => s.staff_id === user.id)
    const workShifts = myShifts.filter((s) => !['off', 'holiday'].includes(s.shift_type))

    // 計画時間
    const plannedMinutes = workShifts.reduce((sum, s) => sum + calcMinutes(s.start_time, s.end_time), 0)
    // 実績時間
    const actualMinutes = workShifts.reduce((sum, s) => sum + calcMinutes(s.actual_start_time, s.end_time ?? s.actual_end_time), 0)
    // 実績確定済みシフト
    const confirmedShifts = workShifts.filter((s) => s.is_attendance_confirmed)
    // 残業（実績 - 計画 > 0 のシフトを集計）
    const overtimeMinutes = workShifts.reduce((sum, s) => {
      const planned = calcMinutes(s.start_time, s.end_time)
      const actual = calcMinutes(s.actual_start_time, s.end_time ?? s.actual_end_time)
      return sum + Math.max(0, actual - planned)
    }, 0)

    // シフト種別カウント
    const typeCounts = myShifts.reduce<Record<string, number>>((acc, s) => {
      acc[s.shift_type] = (acc[s.shift_type] ?? 0) + 1
      return acc
    }, {})

    // 未確認の出勤日数
    const unconfirmedCount = workShifts.filter((s) => !s.is_attendance_confirmed).length

    return {
      user,
      workDays: workShifts.length,
      confirmedDays: confirmedShifts.length,
      unconfirmedCount,
      plannedMinutes,
      actualMinutes,
      overtimeMinutes,
      typeCounts,
      offDays: (typeCounts['off'] ?? 0) + (typeCounts['holiday'] ?? 0),
    }
  })

  const totalPlanned = staffStats.reduce((s, st) => s + st.plannedMinutes, 0)
  const totalActual = staffStats.reduce((s, st) => s + st.actualMinutes, 0)
  const totalOvertime = staffStats.reduce((s, st) => s + st.overtimeMinutes, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">勤務時間集計</h1>
          <p className="text-sm text-gray-500 mt-0.5">スタッフ別の月次勤務時間・残業状況</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/shifts/summary?year=${prevDate.getFullYear()}&month=${prevDate.getMonth() + 1}`}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm font-semibold min-w-[80px] text-center">{year}年{month}月</span>
          <Link
            href={`/shifts/summary?year=${nextDate.getFullYear()}&month=${nextDate.getMonth() + 1}`}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* 月次サマリー */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-indigo-600">{formatDuration(totalPlanned)}</p>
            <p className="text-xs text-gray-500 mt-0.5">計画勤務時間（合計）</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-teal-600">{formatDuration(totalActual)}</p>
            <p className="text-xs text-gray-500 mt-0.5">実績勤務時間（合計）</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className={`text-2xl font-bold ${totalOvertime > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
              {formatDuration(totalOvertime)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">残業時間（合計）</p>
          </CardContent>
        </Card>
      </div>

      {/* スタッフ別テーブル */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-indigo-500" />
            スタッフ別 勤務実績
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="text-left px-4 py-2.5 font-medium">氏名</th>
                  <th className="text-center px-3 py-2.5 font-medium">出勤日数</th>
                  <th className="text-center px-3 py-2.5 font-medium">休み</th>
                  <th className="text-right px-3 py-2.5 font-medium">計画時間</th>
                  <th className="text-right px-3 py-2.5 font-medium">実績時間</th>
                  <th className="text-right px-3 py-2.5 font-medium">残業</th>
                  <th className="text-center px-4 py-2.5 font-medium">確認状況</th>
                </tr>
              </thead>
              <tbody>
                {staffStats.map(({ user, workDays, confirmedDays, unconfirmedCount, plannedMinutes, actualMinutes, overtimeMinutes, offDays, typeCounts }) => (
                  <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{user.name}</p>
                      <p className="text-xs text-gray-400">
                        {Object.entries(typeCounts)
                          .filter(([k]) => !['off', 'holiday'].includes(k))
                          .map(([k, v]) => `${SHIFT_LABELS[k] ?? k}×${v}`)
                          .join('、')}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="font-semibold text-gray-900">{workDays}</span>
                      <span className="text-gray-400 ml-0.5">日</span>
                    </td>
                    <td className="px-3 py-3 text-center text-gray-500">{offDays}日</td>
                    <td className="px-3 py-3 text-right text-gray-600">
                      {plannedMinutes > 0 ? formatDuration(plannedMinutes) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-gray-900">
                      {actualMinutes > 0 ? formatDuration(actualMinutes) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {overtimeMinutes > 0 ? (
                        <span className="text-orange-500 font-medium flex items-center justify-end gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {formatDuration(overtimeMinutes)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {workDays === 0 ? (
                        <span className="text-xs text-gray-300">シフトなし</span>
                      ) : unconfirmedCount === 0 ? (
                        <Badge variant="success" className="text-xs">確認済 {confirmedDays}日</Badge>
                      ) : (
                        <Badge variant="warning" className="text-xs">未確認 {unconfirmedCount}日</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {staffStats.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-sm">
                    <td className="px-4 py-2.5 text-gray-700">合計</td>
                    <td className="px-3 py-2.5 text-center text-gray-700">
                      {staffStats.reduce((s, st) => s + st.workDays, 0)}日
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-500">
                      {staffStats.reduce((s, st) => s + st.offDays, 0)}日
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{formatDuration(totalPlanned)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-900">{formatDuration(totalActual)}</td>
                    <td className="px-3 py-2.5 text-right text-orange-500">
                      {totalOvertime > 0 ? formatDuration(totalOvertime) : '—'}
                    </td>
                    <td className="px-4 py-2.5" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* スタッフ別 日次詳細（折りたたみ） */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">スタッフ別 日次詳細</h2>
        {staffStats.map(({ user, typeCounts }) => {
          const myShifts = shifts
            .filter((s) => s.staff_id === user.id)
            .sort((a, b) => a.date.localeCompare(b.date))
          if (myShifts.length === 0) return null

          return (
            <Card key={user.id}>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-semibold text-gray-800">{user.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100">
                  {myShifts.map((shift) => {
                    const isWork = !['off', 'holiday'].includes(shift.shift_type)
                    const plannedMin = calcMinutes(shift.start_time, shift.end_time)
                    const actualMin = calcMinutes(shift.actual_start_time, shift.end_time ?? shift.actual_end_time)
                    const overtime = Math.max(0, actualMin - plannedMin)
                    const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(shift.date).getDay()]

                    return (
                      <div key={shift.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <span className={`text-xs w-20 flex-shrink-0 ${['日', '土'].includes(dow) ? 'text-red-500' : 'text-gray-500'}`}>
                          {shift.date.slice(5).replace('-', '/')}（{dow}）
                        </span>
                        <Badge
                          variant={isWork ? 'secondary' : 'outline'}
                          className={`text-xs flex-shrink-0 ${!isWork ? 'text-gray-400' : ''}`}
                        >
                          {SHIFT_LABELS[shift.shift_type] ?? shift.shift_type}
                        </Badge>
                        {isWork && (
                          <>
                            <span className="text-gray-500 text-xs">
                              {shift.start_time?.slice(0, 5) ?? '?'}〜{shift.end_time?.slice(0, 5) ?? '?'}
                            </span>
                            {shift.actual_start_time && (
                              <span className="text-gray-700 text-xs">
                                実績: {shift.actual_start_time.slice(0, 5)}〜{(shift.actual_end_time ?? shift.end_time)?.slice(0, 5) ?? '?'}
                                {actualMin > 0 && (
                                  <span className="ml-1 text-gray-400">({formatDuration(actualMin)})</span>
                                )}
                              </span>
                            )}
                            {overtime > 0 && (
                              <span className="text-orange-500 text-xs ml-auto">+{formatDuration(overtime)}</span>
                            )}
                            {shift.is_attendance_confirmed && (
                              <Badge variant="success" className="text-xs ml-auto flex-shrink-0">確認済</Badge>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
