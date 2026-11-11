import Link from 'next/link'
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
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

// 保護者の利用連絡のうち、承認・非承認・確認済みにしたものの履歴。
// 月は利用日で区切る。保護者が同じ日を出し直すと1件に上書きされるので、
// 出るのはその日の最後の連絡と、それへの最後の処理だけ。

type Kind = 'approved' | 'rejected' | 'absent'

const TRANSPORT_LABEL: Record<string, string> = {
  none: '送迎なし',
  pickup_only: '迎えのみ',
  dropoff_only: '送りのみ',
  both: '迎え・送り',
}

type ContactRow = {
  id: string
  date: string
  status: 'attending' | 'absent'
  service_start_time: string | null
  service_end_time: string | null
  assigned_service_start_time: string | null
  assigned_service_end_time: string | null
  assigned_daytime_start_time: string | null
  assigned_daytime_end_time: string | null
  transport_type: string | null
  note: string | null
  reported_at: string
  approval_status: 'pending' | 'approved' | 'rejected'
  absent_handling: 'absent' | 'delete' | null
  reviewed_at: string | null
  reviewed_by: string | null
  children: { name: string } | null
}

const t = (v: string | null) => (v ? v.slice(0, 5) : '?')

function kindOf(c: ContactRow): Kind | null {
  if (c.status === 'absent') return 'absent'
  if (c.approval_status === 'approved') return 'approved'
  if (c.approval_status === 'rejected') return 'rejected'
  return null
}

function resultLabel(c: ContactRow): { text: string; className: string } {
  if (c.status === 'absent') {
    if (c.absent_handling === 'delete') return { text: 'お休み（予定から削除）', className: 'text-gray-700' }
    return { text: 'お休み（欠席として記録）', className: 'text-gray-700' }
  }
  if (c.approval_status === 'approved') return { text: '承認', className: 'text-green-700' }
  return { text: '非承認', className: 'text-red-600' }
}

function assignedLabel(c: ContactRow): string | null {
  const parts: string[] = []
  if (c.assigned_service_start_time || c.assigned_service_end_time) {
    parts.push(`放デイ ${t(c.assigned_service_start_time)}〜${t(c.assigned_service_end_time)}`)
  }
  if (c.assigned_daytime_start_time || c.assigned_daytime_end_time) {
    parts.push(`日中一時 ${t(c.assigned_daytime_start_time)}〜${t(c.assigned_daytime_end_time)}`)
  }
  return parts.length > 0 ? parts.join('＋') : null
}

export default async function ParentContactsHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; kind?: string }>
}) {
  const sp = await searchParams
  const month = parseMonth(sp.month)
  const kindFilter: Kind | 'all' =
    sp.kind === 'approved' || sp.kind === 'rejected' || sp.kind === 'absent' ? sp.kind : 'all'
  const { from, to } = monthRange(month)

  const supabase = await createClient()
  const { data } = await supabase
    .from('parent_attendance_contacts')
    .select(
      'id, date, status, service_start_time, service_end_time, assigned_service_start_time, assigned_service_end_time, assigned_daytime_start_time, assigned_daytime_end_time, transport_type, note, reported_at, approval_status, absent_handling, reviewed_at, reviewed_by, children (name)'
    )
    .eq('is_new', false)
    .gte('date', from)
    .lt('date', to)
    .order('date', { ascending: false })

  const all = ((data ?? []) as unknown as ContactRow[]).filter((c) => kindOf(c) !== null)
  const counts = {
    approved: all.filter((c) => kindOf(c) === 'approved').length,
    rejected: all.filter((c) => kindOf(c) === 'rejected').length,
    absent: all.filter((c) => kindOf(c) === 'absent').length,
  }
  const rows = all
    .filter((c) => kindFilter === 'all' || kindOf(c) === kindFilter)
    .sort((a, b) => byReviewedDesc(a, b) || b.date.localeCompare(a.date))
  const names = await loadReviewerNames(supabase, rows.map((r) => r.reviewed_by))

  const href = (m: string, k: Kind | 'all') =>
    `/parent-contacts/history?month=${m}${k === 'all' ? '' : `&kind=${k}`}`
  const FILTERS: { key: Kind | 'all'; label: string }[] = [
    { key: 'all', label: `すべて（${all.length}）` },
    { key: 'approved', label: `承認（${counts.approved}）` },
    { key: 'rejected', label: `非承認（${counts.rejected}）` },
    { key: 'absent', label: `お休み（${counts.absent}）` },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <Link href="/parent-contacts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" />
          利用連絡にもどる
        </Link>
        <h1 className="mt-2 text-xl font-bold text-gray-900">利用連絡の承認の履歴</h1>
        <p className="mt-1 text-xs text-gray-500">
          保護者からの利用連絡のうち、承認・非承認・確認済みにしたものです。月は利用日で区切っています。
          保護者が同じ日の連絡を出し直したときは、最後の連絡とそれへの処理だけが出ます。
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
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href(month, f.key)}
              className={`rounded-full border px-3 py-1 text-xs ${
                kindFilter === f.key
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
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
                <th className="px-3 py-2 font-medium">利用日</th>
                <th className="px-3 py-2 font-medium">児童</th>
                <th className="px-3 py-2 font-medium">保護者の希望</th>
                <th className="px-3 py-2 font-medium">結果</th>
                <th className="px-3 py-2 font-medium">連絡が届いた日時</th>
                <th className="px-3 py-2 font-medium">処理した人</th>
                <th className="px-3 py-2 font-medium">処理した日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((c) => {
                const result = resultLabel(c)
                const assigned = c.approval_status === 'approved' && c.status === 'attending' ? assignedLabel(c) : null
                return (
                  <tr key={c.id} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDay(c.date)}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{c.children?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600 min-w-[10rem]">
                      {c.status === 'absent' ? (
                        'お休み'
                      ) : (
                        <>
                          {t(c.service_start_time)}〜{t(c.service_end_time)}
                          <span className="ml-1.5 text-xs text-gray-500">{TRANSPORT_LABEL[c.transport_type ?? 'none'] ?? ''}</span>
                        </>
                      )}
                      {c.note && <p className="mt-0.5 text-xs text-gray-500">「{c.note}」</p>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`whitespace-nowrap ${result.className}`}>{result.text}</span>
                      {assigned && <p className="mt-0.5 text-xs text-gray-500 whitespace-nowrap">{assigned}</p>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatReviewedAt(c.reported_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {c.reviewed_by ? names.get(c.reviewed_by) ?? '—' : <span className="text-gray-400">記録なし</span>}
                    </td>
                    <td className={`px-3 py-2 whitespace-nowrap ${c.reviewed_at ? '' : 'text-gray-400'}`}>
                      {formatReviewedAt(c.reviewed_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400">
        「記録なし」は、だれが・いつ処理したかを残すようになった 2026年11月12日より前に処理したものです。
      </p>
    </div>
  )
}
