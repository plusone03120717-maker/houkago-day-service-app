import Link from 'next/link'
import { ChevronLeft, ChevronRight, ArrowLeft, Clock, Umbrella, Coffee } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireMoneyAccess } from '@/lib/require-admin'
import { usageLabel } from '@/lib/paid-leave'
import {
  parseMonth,
  monthRange,
  shiftMonth,
  monthLabel,
  formatDay,
  formatReviewedAt,
  loadReviewerNames,
  byReviewedDesc,
} from '@/lib/review-history'

// スタッフ申請（残業・有給・中抜け）のうち、確認済みにしたものの履歴。
// 月は「申請の日（残業・有給の日／中抜けの日）」で区切る。
//
// 残業・有給は LINE から来た申請（source=line・migration 181）か、確認の記録（reviewed_at）があるものだけ出す。
// 管理者が画面から直接入れた有給・残業は申請ではないので出さない。
// 中抜けは申請の印がないので、確認の記録が残るようになった 2026-11-12 以降の分だけ出る。

type Kind = 'overtime' | 'leave' | 'break'

type Row = {
  key: string
  kind: Kind
  staffName: string
  date: string
  detail: string
  result: string
  reviewed_at: string | null
  reviewed_by: string | null
}

const KIND_LABEL: Record<Kind, string> = { overtime: '残業', leave: '有給', break: '中抜け' }
const KIND_ICON = { overtime: Clock, leave: Umbrella, break: Coffee }
const KIND_COLOR: Record<Kind, string> = {
  overtime: 'bg-orange-100 text-orange-700',
  leave: 'bg-blue-100 text-blue-700',
  break: 'bg-purple-100 text-purple-700',
}

function toJST(iso: string): { date: string; time: string } {
  const jst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString()
  return { date: jst.slice(0, 10), time: jst.slice(11, 16) }
}

export default async function StaffRequestsHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; kind?: string }>
}) {
  await requireMoneyAccess()
  const sp = await searchParams
  const month = parseMonth(sp.month)
  const kindFilter: Kind | 'all' =
    sp.kind === 'overtime' || sp.kind === 'leave' || sp.kind === 'break' ? sp.kind : 'all'
  const { from, to } = monthRange(month)
  // 中抜けは recorded_at（日時）なので、日本時間の月の区切りで絞る
  const fromIso = new Date(`${from}T00:00:00+09:00`).toISOString()
  const toIso = new Date(`${to}T00:00:00+09:00`).toISOString()

  const supabase = await createClient()
  const [overtimeRes, leaveRes, breakRes] = await Promise.all([
    supabase
      .from('overtime_requests')
      .select('id, date, actual_end_time, overtime_minutes, status, request_type, reviewed_at, reviewed_by, staff_members(name)')
      .eq('is_new', false)
      .gte('date', from)
      .lt('date', to)
      .or('source.eq.line,reviewed_at.not.is.null'),
    supabase
      .from('paid_leave_usages')
      .select('id, date, unit, days_used, hours_used, reviewed_at, reviewed_by, staff_members(name)')
      .eq('is_new', false)
      .gte('date', from)
      .lt('date', to)
      .or('source.eq.line,reviewed_at.not.is.null'),
    supabase
      .from('time_records')
      .select('id, staff_member_id, recorded_at, reviewed_at, reviewed_by, staff_members(name)')
      .eq('type', 'break_start')
      .eq('is_new', false)
      .not('reviewed_at', 'is', null)
      .gte('recorded_at', fromIso)
      .lt('recorded_at', toIso),
  ])

  type OvertimeRow = {
    id: string
    date: string
    actual_end_time: string | null
    overtime_minutes: number | null
    status: string
    request_type: string
    reviewed_at: string | null
    reviewed_by: string | null
    staff_members: { name: string } | null
  }
  type LeaveRow = {
    id: string
    date: string
    unit: string | null
    days_used: number
    hours_used: number | null
    reviewed_at: string | null
    reviewed_by: string | null
    staff_members: { name: string } | null
  }
  type BreakRow = {
    id: string
    staff_member_id: string
    recorded_at: string
    reviewed_at: string | null
    reviewed_by: string | null
    staff_members: { name: string } | null
  }

  const overtimes = (overtimeRes.data ?? []) as unknown as OvertimeRow[]
  const leaves = (leaveRes.data ?? []) as unknown as LeaveRow[]
  const breakStarts = (breakRes.data ?? []) as unknown as BreakRow[]

  // 中抜けの終わりの時刻（同じスタッフ・同じ日で、開始より後の最初の break_end）
  let breakEnds: { staff_member_id: string; recorded_at: string }[] = []
  if (breakStarts.length > 0) {
    const { data } = await supabase
      .from('time_records')
      .select('staff_member_id, recorded_at')
      .eq('type', 'break_end')
      .in('staff_member_id', [...new Set(breakStarts.map((b) => b.staff_member_id))])
      .gte('recorded_at', fromIso)
      .lt('recorded_at', toIso)
      .order('recorded_at')
    breakEnds = (data ?? []) as { staff_member_id: string; recorded_at: string }[]
  }

  const rows: Row[] = [
    ...overtimes.map((o): Row => ({
      key: `o-${o.id}`,
      kind: 'overtime',
      staffName: o.staff_members?.name ?? '—',
      date: o.date,
      detail: o.request_type === 'no_break'
        ? '休憩なし（昼休憩の1時間を勤務に入れる）'
        : [
          o.actual_end_time ? `終了 ${o.actual_end_time.slice(0, 5)}` : null,
          o.overtime_minutes ? `残業 ${o.overtime_minutes}分` : null,
        ].filter(Boolean).join('　') || '—',
      result: o.status === 'rejected' ? '却下' : '承認（自動）',
      reviewed_at: o.reviewed_at,
      reviewed_by: o.reviewed_by,
    })),
    ...leaves.map((l): Row => ({
      key: `l-${l.id}`,
      kind: 'leave',
      staffName: l.staff_members?.name ?? '—',
      date: l.date,
      detail: usageLabel(l),
      result: '確認済み',
      reviewed_at: l.reviewed_at,
      reviewed_by: l.reviewed_by,
    })),
    ...breakStarts.map((b): Row => {
      const start = toJST(b.recorded_at)
      const end = breakEnds.find(
        (e) => e.staff_member_id === b.staff_member_id
          && e.recorded_at > b.recorded_at
          && toJST(e.recorded_at).date === start.date,
      )
      return {
        key: `b-${b.id}`,
        kind: 'break',
        staffName: b.staff_members?.name ?? '—',
        date: start.date,
        detail: `${start.time}〜${end ? toJST(end.recorded_at).time : '?'}`,
        result: '確認済み',
        reviewed_at: b.reviewed_at,
        reviewed_by: b.reviewed_by,
      }
    }),
  ]
    .filter((r) => kindFilter === 'all' || r.kind === kindFilter)
    .sort((a, b) => byReviewedDesc(a, b) || b.date.localeCompare(a.date))

  const names = await loadReviewerNames(supabase, rows.map((r) => r.reviewed_by))
  const counts = {
    overtime: overtimes.length,
    leave: leaves.length,
    break: breakStarts.length,
  }
  const href = (m: string, k: Kind | 'all') =>
    `/staff-requests/history?month=${m}${k === 'all' ? '' : `&kind=${k}`}`

  return (
    <div className="space-y-5">
      <div>
        <Link href="/staff-requests" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" />
          スタッフ申請にもどる
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">スタッフ申請の承認の履歴</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          LINEから申請された残業・有給・中抜けのうち、確認済みにしたものです。月は申請した日で区切っています。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Link href={href(shiftMonth(month, -1), kindFilter)} className="rounded-md border border-gray-200 p-1.5 hover:bg-gray-50" aria-label="前の月">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-[7rem] text-center font-bold text-gray-900">{monthLabel(month)}</span>
          <Link href={href(shiftMonth(month, 1), kindFilter)} className="rounded-md border border-gray-200 p-1.5 hover:bg-gray-50" aria-label="次の月">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'overtime', 'leave', 'break'] as const).map((k) => (
            <Link
              key={k}
              href={href(month, k)}
              className={`rounded-full border px-3 py-1 text-xs ${
                kindFilter === k
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {k === 'all'
                ? `すべて（${counts.overtime + counts.leave + counts.break}）`
                : `${KIND_LABEL[k]}（${counts[k]}）`}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          この月の承認の履歴はありません
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">種類</th>
                <th className="px-3 py-2 font-medium">スタッフ</th>
                <th className="px-3 py-2 font-medium">申請の日</th>
                <th className="px-3 py-2 font-medium">内容</th>
                <th className="px-3 py-2 font-medium">結果</th>
                <th className="px-3 py-2 font-medium">確認した人</th>
                <th className="px-3 py-2 font-medium">確認した日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const Icon = KIND_ICON[r.kind]
                return (
                  <tr key={r.key}>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${KIND_COLOR[r.kind]}`}>
                        <Icon className="h-3 w-3" />
                        {KIND_LABEL[r.kind]}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{r.staffName}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDay(r.date)}</td>
                    <td className="px-3 py-2 text-gray-600">{r.detail}</td>
                    <td className={`px-3 py-2 whitespace-nowrap ${r.result === '却下' ? 'text-red-600' : 'text-green-700'}`}>{r.result}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.reviewed_by ? names.get(r.reviewed_by) ?? '—' : <span className="text-gray-400">記録なし</span>}
                    </td>
                    <td className={`px-3 py-2 whitespace-nowrap ${r.reviewed_at ? '' : 'text-gray-400'}`}>
                      {formatReviewedAt(r.reviewed_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400">
        「記録なし」は、だれが・いつ確認したかを残すようになった 2026年11月12日より前に確認したものです。
        中抜けはそれ以降に確認した分だけ出ます。取り消した有給は記録ごと消えるため出ません。
      </p>
    </div>
  )
}
