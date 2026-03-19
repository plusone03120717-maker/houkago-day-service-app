import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, CheckCircle, AlertCircle, Filter } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'

type ChildBenefitRow = {
  childId: string
  name: string
  unitName: string | null
  maxDays: number
  usedDays: number
  remaining: number
  status: 'ok' | 'warning' | 'over'
}

export default async function MonthlyBenefitPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; month?: string }>
}) {
  const { unit: unitFilter, month: monthParam } = await searchParams
  const supabase = await createClient()

  const now = new Date()
  // monthParam format: "2026-03"
  const targetDate = monthParam ? new Date(`${monthParam}-01`) : now
  const year = targetDate.getFullYear()
  const month = targetDate.getMonth() + 1
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonthStart = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`
  const monthLabel = `${year}年${month}月`
  const monthValue = `${year}-${String(month).padStart(2, '0')}`

  // 全ユニット取得（フィルタ用）
  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name')
    .order('name')
  const units = (unitsRaw ?? []) as { id: string; name: string }[]

  // 有効な受給者証を持つ児童を取得（今月の範囲に重なるもの）
  const { data: certsRaw } = await supabase
    .from('benefit_certificates')
    .select('id, child_id, max_days_per_month, children(id, name, children_units(unit_id, units(name)))')
    .lte('start_date', nextMonthStart)
    .gte('end_date', monthStart)
    .order('child_id')

  type CertRow = {
    id: string
    child_id: string
    max_days_per_month: number
    children: {
      id: string
      name: string
      children_units: { unit_id: string; units: { name: string } | null }[]
    } | null
  }
  const certs = (certsRaw ?? []) as unknown as CertRow[]

  // 今月の出席済み日数を児童ごとに集計
  const { data: attendanceRaw } = await supabase
    .from('daily_attendance')
    .select('child_id')
    .gte('date', monthStart)
    .lt('date', nextMonthStart)
    .eq('status', 'attended')

  const usedDaysMap = new Map<string, number>()
  for (const row of (attendanceRaw ?? [])) {
    const r = row as { child_id: string }
    usedDaysMap.set(r.child_id, (usedDaysMap.get(r.child_id) ?? 0) + 1)
  }

  // ユニットでフィルタ後、集計
  const rows: ChildBenefitRow[] = []
  const seenChildIds = new Set<string>()

  for (const cert of certs) {
    if (!cert.children) continue
    const childId = cert.children.id
    if (seenChildIds.has(childId)) continue // 同一児童の重複排除
    seenChildIds.add(childId)

    const unitNames = cert.children.children_units
      .map((cu) => cu.units?.name)
      .filter(Boolean)
    const firstUnitId = cert.children.children_units[0]?.unit_id ?? null

    // ユニットフィルタ
    if (unitFilter) {
      const hasUnit = cert.children.children_units.some((cu) => cu.unit_id === unitFilter)
      if (!hasUnit) continue
    }

    const usedDays = usedDaysMap.get(childId) ?? 0
    const maxDays = cert.max_days_per_month
    const remaining = maxDays - usedDays
    const status: 'ok' | 'warning' | 'over' =
      remaining < 0 ? 'over' : remaining <= 3 ? 'warning' : 'ok'

    rows.push({
      childId,
      name: cert.children.name,
      unitName: unitNames.length > 0 ? unitNames.join('・') : null,
      maxDays,
      usedDays,
      remaining,
      status,
    })
  }

  // status順（over→warning→ok）でソート
  const statusOrder = { over: 0, warning: 1, ok: 2 }
  rows.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name, 'ja'))

  const overCount = rows.filter((r) => r.status === 'over').length
  const warningCount = rows.filter((r) => r.status === 'warning').length

  // 月移動用
  const prevDate = new Date(year, month - 2, 1)
  const nextDate = new Date(year, month, 1)
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
  const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/attendance" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">月次給付量チェック</h1>
          <p className="text-sm text-gray-500 mt-0.5">受給日数の消化状況・超過警告</p>
        </div>
      </div>

      {/* 月選択 + ユニットフィルタ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1">
          <Link
            href={`/attendance/monthly?month=${prevMonth}${unitFilter ? `&unit=${unitFilter}` : ''}`}
            className="px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            ＜
          </Link>
          <span className="px-3 py-1 text-sm font-medium text-gray-900">{monthLabel}</span>
          <Link
            href={`/attendance/monthly?month=${nextMonth}${unitFilter ? `&unit=${unitFilter}` : ''}`}
            className="px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            ＞
          </Link>
        </div>

        {units.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-gray-400" />
            <Link
              href={`/attendance/monthly?month=${monthValue}`}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                !unitFilter
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              全員
            </Link>
            {units.map((u) => (
              <Link
                key={u.id}
                href={`/attendance/monthly?month=${monthValue}&unit=${u.id}`}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  unitFilter === u.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {u.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* サマリーバッジ */}
      {(overCount > 0 || warningCount > 0) && (
        <div className="flex gap-3 flex-wrap">
          {overCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium text-red-700">超過: {overCount}名</span>
            </div>
          )}
          {warningCount > 0 && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium text-yellow-700">残3日以下: {warningCount}名</span>
            </div>
          )}
        </div>
      )}

      {/* 児童一覧 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {monthLabel}の給付日数消化状況（{rows.length}名）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">対象の児童がいません</p>
          ) : (
            <div className="space-y-0 divide-y divide-gray-100">
              {rows.map((row) => {
                const pct = Math.min(100, Math.round((row.usedDays / row.maxDays) * 100))
                return (
                  <div key={row.childId} className="py-3 flex items-center gap-4">
                    {/* ステータスアイコン */}
                    <div className="flex-shrink-0">
                      {row.status === 'over' && (
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                      )}
                      {row.status === 'warning' && (
                        <AlertCircle className="h-5 w-5 text-yellow-500" />
                      )}
                      {row.status === 'ok' && (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                    </div>

                    {/* 名前・ユニット */}
                    <div className="w-36 flex-shrink-0">
                      <p className="text-sm font-medium text-gray-900">{row.name}</p>
                      {row.unitName && (
                        <p className="text-xs text-gray-400">{row.unitName}</p>
                      )}
                    </div>

                    {/* プログレスバー */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>{row.usedDays}日 / {row.maxDays}日</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            row.status === 'over'
                              ? 'bg-red-500'
                              : row.status === 'warning'
                              ? 'bg-yellow-400'
                              : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>

                    {/* 残日数バッジ */}
                    <div className="flex-shrink-0 w-20 text-right">
                      {row.status === 'over' ? (
                        <Badge variant="destructive">
                          {Math.abs(row.remaining)}日超過
                        </Badge>
                      ) : row.status === 'warning' ? (
                        <Badge variant="warning">
                          残{row.remaining}日
                        </Badge>
                      ) : (
                        <span className="text-sm text-gray-500">残{row.remaining}日</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-gray-400">
        ※ 受給者証の月間上限日数と、当月の出席済み日数を比較しています。
      </p>
    </div>
  )
}
