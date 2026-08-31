import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Clock, Fingerprint } from 'lucide-react'
import { SummaryDailyEditor, type DailyRow } from '@/components/shifts/summary-daily-editor'
import {
  toMinutes, formatDuration, calcShiftMinutes, buildTCDays,
} from '@/lib/work-time'

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffMember = { id: string; name: string; user_id: string | null }

type StaffShift = {
  id: string
  staff_id: string
  date: string
  shift_type: string
  start_time: string | null
  end_time: string | null
  break_start_time: string | null
  break_end_time: string | null
  actual_start_time: string | null
  actual_end_time: string | null
  is_attendance_confirmed: boolean
}

type TCRecord = { id: string; staff_member_id: string; type: string; recorded_at: string }
type OvertimeRow = { staff_id: string; date: string; overtime_minutes: number | null }
type PaidLeaveRow = { staff_member_id: string; date: string; days_used: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SHIFT_LABELS: Record<string, string> = {
  full: '全日', morning: '午前', afternoon: '午後', off: '休み', holiday: '祝休',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ShiftSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  await requireAdmin()
  const params = await searchParams
  const supabase = await createClient()
  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
  const recordsStart = new Date(year, month - 1, 1).toISOString()
  const recordsEnd = new Date(year, month, 1).toISOString()
  const prevDate = new Date(year, month - 2, 1)
  const nextDate = new Date(year, month, 1)

  // スタッフ一覧（全員）
  const { data: membersRaw } = await supabase
    .from('staff_members')
    .select('id, name, user_id')
    .order('name')
  const members = (membersRaw ?? []) as StaffMember[]
  const memberIds = members.map((m) => m.id)
  const userIds = members.map((m) => m.user_id).filter(Boolean) as string[]

  const [{ data: shiftsRaw }, { data: tcRaw }, { data: otRaw }, { data: lvRaw }] = await Promise.all([
    userIds.length > 0
      ? supabase
          .from('staff_shifts')
          .select('id, staff_id, date, shift_type, start_time, end_time, break_start_time, break_end_time, actual_start_time, actual_end_time, is_attendance_confirmed')
          .in('staff_id', userIds)
          .gte('date', monthStart)
          .lte('date', monthEnd)
      : Promise.resolve({ data: [] }),
    memberIds.length > 0
      ? supabase
          .from('time_records')
          .select('id, staff_member_id, type, recorded_at')
          .in('staff_member_id', memberIds)
          .gte('recorded_at', recordsStart)
          .lt('recorded_at', recordsEnd)
          .in('type', ['clock_in', 'clock_out'])
          .order('recorded_at')
      : Promise.resolve({ data: [] }),
    memberIds.length > 0
      ? supabase
          .from('overtime_requests')
          .select('staff_id, date, overtime_minutes')
          .in('staff_id', memberIds)
          .eq('status', 'approved')
          .gte('date', monthStart)
          .lte('date', monthEnd)
      : Promise.resolve({ data: [] }),
    memberIds.length > 0
      ? supabase
          .from('paid_leave_usages')
          .select('staff_member_id, date, days_used')
          .in('staff_member_id', memberIds)
          .gte('date', monthStart)
          .lte('date', monthEnd)
      : Promise.resolve({ data: [] }),
  ])

  const shifts = (shiftsRaw ?? []) as StaffShift[]
  const tcRecords = (tcRaw ?? []) as TCRecord[]
  const overtimes = (otRaw ?? []) as OvertimeRow[]
  const leaves = (lvRaw ?? []) as PaidLeaveRow[]

  // ─── スタッフ別集計 ────────────────────────────────────────────────────────

  const staffStats = members.map((member) => {
    const myShifts = shifts.filter((s) => s.staff_id === member.user_id)
    const workShifts = myShifts.filter((s) => !['off', 'holiday'].includes(s.shift_type))
    const shiftsMap = new Map(
      myShifts.map((s) => [
        s.date,
        { break_start_time: s.break_start_time, break_end_time: s.break_end_time },
      ]),
    )

    // シフトベース集計
    const typeCounts = myShifts.reduce<Record<string, number>>((acc, s) => {
      acc[s.shift_type] = (acc[s.shift_type] ?? 0) + 1
      return acc
    }, {})
    const plannedMinutes = workShifts.reduce(
      (sum, s) => sum + calcShiftMinutes(s.start_time, s.end_time, s.break_start_time, s.break_end_time),
      0,
    )
    const confirmedDays = workShifts.filter((s) => s.is_attendance_confirmed).length
    const unconfirmedCount = workShifts.filter((s) => !s.is_attendance_confirmed).length

    // タイムカードベース集計
    const myTC = tcRecords.filter((r) => r.staff_member_id === member.id)
    const tcDays = buildTCDays(myTC, shiftsMap)
    const tcWorkDays = tcDays.filter((d) => d.clockIn !== null).length
    const tcTotalHours = Math.round(tcDays.reduce((sum, d) => sum + (d.hours ?? 0), 0) * 100) / 100
    // 実働から差し引いた休憩の合計（中抜け＋5時間以上の自動控除）
    const totalBreakMinutes = tcDays.reduce((sum, d) => sum + d.breakMinutes + d.lunchDeduction, 0)

    // 残業集計（承認済み・30分単位切り捨て）
    const myOvertimes = overtimes.filter((o) => o.staff_id === member.id)
    const approvedOvertimeMinutes = myOvertimes.reduce(
      (sum, o) => sum + Math.floor((o.overtime_minutes ?? 0) / 30) * 30, 0,
    )
    const overtimeByDate = new Map(myOvertimes.map((o) => [o.date, o.overtime_minutes]))

    // 有給集計
    const myLeaves = leaves.filter((l) => l.staff_member_id === member.id)
    const paidLeaveDays = myLeaves.reduce((sum, l) => sum + l.days_used, 0)
    const leaveByDate = new Map(myLeaves.map((l) => [l.date, l.days_used]))

    // ── 日次詳細（編集可）の行を組み立てる ──
    const shiftByDate = new Map(myShifts.map((s) => [s.date, s]))
    const tcByDate = new Map(tcDays.map((d) => [d.date, d]))
    const allDates = new Set([
      ...myShifts.map((s) => s.date),
      ...tcDays.map((d) => d.date),
      ...myOvertimes.map((o) => o.date),
      ...myLeaves.map((l) => l.date),
    ])
    const dailyRows: DailyRow[] = Array.from(allDates)
      .sort()
      .map((date) => {
        const shift = shiftByDate.get(date)
        const tc = tcByDate.get(date)
        return {
          date,
          shiftId: shift?.id ?? null,
          shiftType: shift?.shift_type ?? null,
          planStart: shift?.start_time?.slice(0, 5) ?? null,
          planEnd: shift?.end_time?.slice(0, 5) ?? null,
          breakStart: shift?.break_start_time?.slice(0, 5) ?? null,
          breakEnd: shift?.break_end_time?.slice(0, 5) ?? null,
          clockInId: tc?.clockInId ?? null,
          clockOutId: tc?.clockOutId ?? null,
          clockIn: tc?.clockIn ?? null,
          clockOut: tc?.clockOut ?? null,
          hours: tc?.hours ?? null,
          breakMinutes: tc?.breakMinutes
            ?? (shift?.break_start_time && shift?.break_end_time
              ? Math.max(0, toMinutes(shift.break_end_time.slice(0, 5)) - toMinutes(shift.break_start_time.slice(0, 5)))
              : 0),
          lunchDeduction: tc?.lunchDeduction ?? 0,
          isConfirmed: shift?.is_attendance_confirmed ?? false,
          overtimeMinutes: overtimeByDate.get(date) ?? null,
          leaveDays: leaveByDate.get(date) ?? null,
        }
      })

    return {
      member,
      hasShifts: !!member.user_id,
      // shift-based
      shiftWorkDays: workShifts.length,
      plannedMinutes,
      offDays: (typeCounts['off'] ?? 0) + (typeCounts['holiday'] ?? 0),
      typeCounts,
      confirmedDays,
      unconfirmedCount,
      // timecard-based
      tcWorkDays,
      tcTotalHours,
      tcDays,
      totalBreakMinutes,
      dailyRows,
      // overtime / leave
      approvedOvertimeMinutes,
      overtimeByDate,
      paidLeaveDays,
      leaveByDate,
      // 日次詳細用
      myShifts: myShifts.sort((a, b) => a.date.localeCompare(b.date)),
    }
  })

  const totalPlanned = staffStats.reduce((s, st) => s + st.plannedMinutes, 0)
  const totalTCHours = Math.round(staffStats.reduce((s, st) => s + st.tcTotalHours, 0) * 100) / 100

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">勤務時間集計</h1>
          <p className="text-sm text-gray-500 mt-0.5">スタッフ別の月次勤務時間・タイムカード打刻</p>
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

      {/* 月次サマリーカード */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-indigo-600">{formatDuration(totalPlanned)}</p>
            <p className="text-xs text-gray-500 mt-0.5">計画勤務時間（合計）</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-teal-600">{totalTCHours}h</p>
            <p className="text-xs text-gray-500 mt-0.5">打刻実績時間（合計）</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-700">
              {staffStats.reduce((s, st) => s + st.tcWorkDays, 0)}日
            </p>
            <p className="text-xs text-gray-500 mt-0.5">打刻出勤日数（合計）</p>
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
                  <th className="text-center px-3 py-2.5 font-medium">
                    <span className="flex items-center justify-center gap-1">
                      <Fingerprint className="h-3 w-3" />打刻出勤
                    </span>
                  </th>
                  <th className="text-center px-3 py-2.5 font-medium">シフト予定</th>
                  <th className="text-center px-3 py-2.5 font-medium">休み</th>
                  <th className="text-center px-3 py-2.5 font-medium text-blue-600">有給</th>
                  <th className="text-right px-3 py-2.5 font-medium">計画時間</th>
                  <th className="text-right px-3 py-2.5 font-medium" title="実働時間から差し引いた休憩の合計（中抜け＋5時間以上の自動控除）">休憩</th>
                  <th className="text-right px-3 py-2.5 font-medium">
                    <span className="flex items-center justify-end gap-1">
                      <Fingerprint className="h-3 w-3" />打刻時間
                    </span>
                  </th>
                  <th className="text-right px-3 py-2.5 font-medium text-orange-600">残業</th>
                  <th className="text-center px-4 py-2.5 font-medium">確認状況</th>
                </tr>
              </thead>
              <tbody>
                {staffStats.map(({ member, hasShifts, shiftWorkDays, plannedMinutes, offDays, typeCounts, tcWorkDays, tcTotalHours, totalBreakMinutes, confirmedDays, unconfirmedCount, approvedOvertimeMinutes, paidLeaveDays }) => (
                  <tr key={member.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{member.name}</p>
                      {hasShifts ? (
                        <p className="text-xs text-gray-400">
                          {Object.entries(typeCounts)
                            .filter(([k]) => !['off', 'holiday'].includes(k))
                            .map(([k, v]) => `${SHIFT_LABELS[k] ?? k}×${v}`)
                            .join('、') || 'シフト登録なし'}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">アカウントなし</p>
                      )}
                    </td>
                    {/* 打刻出勤日数 */}
                    <td className="px-3 py-3 text-center">
                      {tcWorkDays > 0 ? (
                        <span className="font-semibold text-teal-700">{tcWorkDays}<span className="font-normal text-gray-400 ml-0.5">日</span></span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {/* シフト予定日数 */}
                    <td className="px-3 py-3 text-center text-gray-500">
                      {hasShifts ? `${shiftWorkDays}日` : <span className="text-gray-300">—</span>}
                    </td>
                    {/* 休み */}
                    <td className="px-3 py-3 text-center text-gray-500">
                      {hasShifts ? `${offDays}日` : <span className="text-gray-300">—</span>}
                    </td>
                    {/* 有給 */}
                    <td className="px-3 py-3 text-center">
                      {paidLeaveDays > 0 ? (
                        <span className="font-semibold text-blue-600">{paidLeaveDays}<span className="font-normal text-gray-400 ml-0.5">日</span></span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {/* 計画時間 */}
                    <td className="px-3 py-3 text-right text-gray-600">
                      {hasShifts && plannedMinutes > 0 ? formatDuration(plannedMinutes) : <span className="text-gray-300">—</span>}
                    </td>
                    {/* 休憩（実働から差し引いた合計） */}
                    <td className="px-3 py-3 text-right text-gray-600">
                      {totalBreakMinutes > 0 ? formatDuration(totalBreakMinutes) : <span className="text-gray-300">—</span>}
                    </td>
                    {/* 打刻実績時間 */}
                    <td className="px-3 py-3 text-right">
                      {tcTotalHours > 0 ? (
                        <span className="font-medium text-teal-700">{tcTotalHours}h</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {/* 残業 */}
                    <td className="px-3 py-3 text-right">
                      {approvedOvertimeMinutes > 0 ? (
                        <span className="font-medium text-orange-600">{formatDuration(approvedOvertimeMinutes)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {/* 確認状況 */}
                    <td className="px-4 py-3 text-center">
                      {!hasShifts ? (
                        <span className="text-xs text-gray-300">シフトなし</span>
                      ) : shiftWorkDays === 0 ? (
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
                    <td className="px-3 py-2.5 text-center text-teal-700">
                      {staffStats.reduce((s, st) => s + st.tcWorkDays, 0)}日
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-500">
                      {staffStats.reduce((s, st) => s + st.shiftWorkDays, 0)}日
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-500">
                      {staffStats.reduce((s, st) => s + st.offDays, 0)}日
                    </td>
                    <td className="px-3 py-2.5 text-center text-blue-600">
                      {staffStats.reduce((s, st) => s + st.paidLeaveDays, 0) > 0
                        ? `${staffStats.reduce((s, st) => s + st.paidLeaveDays, 0)}日`
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{formatDuration(totalPlanned)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">
                      {staffStats.reduce((s, st) => s + st.totalBreakMinutes, 0) > 0
                        ? formatDuration(staffStats.reduce((s, st) => s + st.totalBreakMinutes, 0))
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-teal-700">{totalTCHours}h</td>
                    <td className="px-3 py-2.5 text-right text-orange-600">
                      {staffStats.reduce((s, st) => s + st.approvedOvertimeMinutes, 0) > 0
                        ? formatDuration(staffStats.reduce((s, st) => s + st.approvedOvertimeMinutes, 0))
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* スタッフ別 日次詳細（出退勤・休憩をここで編集できる） */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">スタッフ別 日次詳細</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            出退勤の打刻と中抜け休憩はこの画面で直接編集できます。変更はタイムカードにもそのまま反映されます。
          </p>
        </div>
        {staffStats.map(({ member, dailyRows }) => {
          if (dailyRows.length === 0) return null
          return (
            <Card key={member.id}>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-semibold text-gray-800">{member.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <SummaryDailyEditor
                  staffMemberId={member.id}
                  userId={member.user_id}
                  rows={dailyRows}
                />
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="text-xs text-gray-400">
        <Fingerprint className="h-3 w-3 inline mr-0.5" />
        マークはLINEタイムカードの打刻データです。実働時間は打刻を30分丸め（出勤は切り上げ・退勤は切り捨て）し、
        中抜け休憩を引いたうえで、5時間以上なら休憩1時間を自動控除して計算します。
      </p>
    </div>
  )
}
