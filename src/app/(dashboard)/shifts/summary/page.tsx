import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Clock, AlertTriangle, Fingerprint } from 'lucide-react'

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

type TCRecord = { staff_member_id: string; type: string; recorded_at: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SHIFT_LABELS: Record<string, string> = {
  full: '全日', morning: '午前', afternoon: '午後', off: '休み', holiday: '祝休',
}

function toJSTDate(isoStr: string): string {
  return new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function toJSTTime(isoStr: string): string {
  return new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16)
}

function toJSTEpochMin(isoStr: string): number {
  return Math.floor((new Date(isoStr).getTime() + 9 * 60 * 60 * 1000) / 60000)
}

function minToHHMM(m: number): string {
  const mod = ((m % 1440) + 1440) % 1440
  return `${String(Math.floor(mod / 60)).padStart(2, '0')}:${String(mod % 60).padStart(2, '0')}`
}

function toMinutes(time: string | null): number {
  if (!time) return 0
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0分'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}分`
  if (m === 0) return `${h}時間`
  return `${h}時間${m}分`
}

function calcShiftMinutes(
  start: string | null, end: string | null,
  brkStart?: string | null, brkEnd?: string | null,
): number {
  if (!start || !end) return 0
  const diff = toMinutes(end) - toMinutes(start)
  if (diff <= 0) return 0
  const brkMins = brkStart && brkEnd ? Math.max(0, toMinutes(brkEnd) - toMinutes(brkStart)) : 0
  const afterBreak = Math.max(0, diff - brkMins)
  return Math.max(0, afterBreak - (afterBreak >= 300 ? 60 : 0))
}

// タイムカード打刻から日次データを構築（timecard-board と同ロジック）
type TCDay = {
  date: string
  clockIn: string | null    // HH:MM
  clockOut: string | null   // HH:MM
  hours: number | null
}

function buildTCDays(
  records: TCRecord[],
  shiftsMap: Map<string, Pick<StaffShift, 'break_start_time' | 'break_end_time'>>,
): TCDay[] {
  // raw データ（最早 clock_in・最遅 clock_out を選択）
  const byDate = new Map<string, { inIso: string | null; outIso: string | null }>()
  for (const r of records) {
    const date = toJSTDate(r.recorded_at)
    if (!byDate.has(date)) byDate.set(date, { inIso: null, outIso: null })
    const d = byDate.get(date)!
    if (r.type === 'clock_in') {
      if (!d.inIso || r.recorded_at < d.inIso) d.inIso = r.recorded_at
    } else if (r.type === 'clock_out') {
      if (!d.outIso || r.recorded_at > d.outIso) d.outIso = r.recorded_at
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { inIso, outIso }]) => {
      let hours: number | null = null
      if (inIso && outIso) {
        const inM = Math.ceil(toJSTEpochMin(inIso) / 30) * 30   // 切り上げ30分
        const outM = Math.floor(toJSTEpochMin(outIso) / 30) * 30  // 切り捨て30分
        const diff = outM - inM
        if (diff > 0) {
          const shift = shiftsMap.get(date)
          const brkMins = shift?.break_start_time && shift?.break_end_time
            ? Math.max(0, toMinutes(shift.break_end_time.slice(0, 5)) - toMinutes(shift.break_start_time.slice(0, 5)))
            : 0
          const afterBreak = Math.max(0, diff - brkMins)
          const net = Math.max(0, afterBreak - (afterBreak >= 300 ? 60 : 0))
          hours = Math.round((net / 60) * 100) / 100
        }
      }
      return {
        date,
        clockIn: inIso ? toJSTTime(inIso) : null,
        clockOut: outIso ? toJSTTime(outIso) : null,
        hours,
      }
    })
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

  const [{ data: shiftsRaw }, { data: tcRaw }] = await Promise.all([
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
          .select('staff_member_id, type, recorded_at')
          .in('staff_member_id', memberIds)
          .gte('recorded_at', recordsStart)
          .lt('recorded_at', recordsEnd)
          .in('type', ['clock_in', 'clock_out'])
          .order('recorded_at')
      : Promise.resolve({ data: [] }),
  ])

  const shifts = (shiftsRaw ?? []) as StaffShift[]
  const tcRecords = (tcRaw ?? []) as TCRecord[]

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
                  <th className="text-right px-3 py-2.5 font-medium">計画時間</th>
                  <th className="text-right px-3 py-2.5 font-medium">
                    <span className="flex items-center justify-end gap-1">
                      <Fingerprint className="h-3 w-3" />打刻時間
                    </span>
                  </th>
                  <th className="text-center px-4 py-2.5 font-medium">確認状況</th>
                </tr>
              </thead>
              <tbody>
                {staffStats.map(({ member, hasShifts, shiftWorkDays, plannedMinutes, offDays, typeCounts, tcWorkDays, tcTotalHours, confirmedDays, unconfirmedCount }) => (
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
                    {/* 計画時間 */}
                    <td className="px-3 py-3 text-right text-gray-600">
                      {hasShifts && plannedMinutes > 0 ? formatDuration(plannedMinutes) : <span className="text-gray-300">—</span>}
                    </td>
                    {/* 打刻実績時間 */}
                    <td className="px-3 py-3 text-right">
                      {tcTotalHours > 0 ? (
                        <span className="font-medium text-teal-700">{tcTotalHours}h</span>
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
                    <td className="px-3 py-2.5 text-right text-gray-600">{formatDuration(totalPlanned)}</td>
                    <td className="px-3 py-2.5 text-right text-teal-700">{totalTCHours}h</td>
                    <td className="px-4 py-2.5" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* スタッフ別 日次詳細 */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">スタッフ別 日次詳細</h2>
        {staffStats.map(({ member, myShifts, tcDays, hasShifts }) => {
          // シフトと打刻をdateでマージ
          const allDates = new Set([
            ...myShifts.map((s) => s.date),
            ...tcDays.map((d) => d.date),
          ])
          const sortedDates = Array.from(allDates).sort()
          if (sortedDates.length === 0) return null

          const shiftByDate = new Map(myShifts.map((s) => [s.date, s]))
          const tcByDate = new Map(tcDays.map((d) => [d.date, d]))

          return (
            <Card key={member.id}>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-semibold text-gray-800">{member.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100">
                  {sortedDates.map((date) => {
                    const shift = shiftByDate.get(date)
                    const tc = tcByDate.get(date)
                    const isWork = shift ? !['off', 'holiday'].includes(shift.shift_type) : true
                    const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(date + 'T00:00:00').getDay()]
                    const isWeekend = dow === '日' || dow === '土'

                    return (
                      <div key={date} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                        {/* 日付 */}
                        <span className={`text-xs w-20 flex-shrink-0 ${isWeekend ? 'text-red-500' : 'text-gray-500'}`}>
                          {date.slice(5).replace('-', '/')}（{dow}）
                        </span>

                        {/* シフト種別 */}
                        {shift && (
                          <Badge
                            variant={isWork ? 'secondary' : 'outline'}
                            className={`text-xs flex-shrink-0 ${!isWork ? 'text-gray-400' : ''}`}
                          >
                            {SHIFT_LABELS[shift.shift_type] ?? shift.shift_type}
                          </Badge>
                        )}

                        {/* シフト計画時間 */}
                        {shift && isWork && shift.start_time && shift.end_time && (
                          <span className="text-gray-400 text-xs">
                            予定: {shift.start_time.slice(0, 5)}〜{shift.end_time.slice(0, 5)}
                          </span>
                        )}

                        {/* タイムカード打刻 */}
                        {tc ? (
                          <span className="flex items-center gap-1 text-xs text-teal-700">
                            <Fingerprint className="h-3 w-3 flex-shrink-0" />
                            {tc.clockIn ?? '?'}〜{tc.clockOut ?? '未退勤'}
                            {tc.hours != null && (
                              <span className="text-gray-400 ml-0.5">({tc.hours}h)</span>
                            )}
                            {tc.clockIn && !tc.clockOut && (
                              <AlertTriangle className="h-3 w-3 text-red-500 ml-1" />
                            )}
                          </span>
                        ) : (
                          isWork && hasShifts && (
                            <span className="text-xs text-gray-300">打刻なし</span>
                          )
                        )}

                        {/* 確認済バッジ */}
                        {shift?.is_attendance_confirmed && (
                          <Badge variant="success" className="text-xs ml-auto flex-shrink-0">確認済</Badge>
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

      <p className="text-xs text-gray-400">
        <Fingerprint className="h-3 w-3 inline mr-0.5" />
        マークはLINEタイムカードの打刻データです（30分丸め・5時間以上で休憩1時間自動控除）
      </p>
    </div>
  )
}
