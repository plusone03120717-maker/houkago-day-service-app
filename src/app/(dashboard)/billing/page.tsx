import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, AlertCircle, User } from 'lucide-react'
import { BillingConfirmToggle } from '@/components/billing/billing-confirm-toggle'
import { RecalcBillingButton } from '@/components/billing/recalc-billing-button'

type BillingDetail = {
  id: string
  child_id: string
  total_days: number
  total_units: number
  copay_amount: number
  billed_amount: number
  errors: unknown[]
  is_confirmed: boolean
  children: { name: string } | null
}

type BillingMonthly = {
  id: string
  unit_id: string
  year_month: string
  status: string
  billing_details: BillingDetail[]
}

type UnitWithFacility = {
  id: string
  name: string
  service_type: string
  facilities: { name: string; facility_number: string } | null
}

type ChildWithUnit = {
  child_id: string
  children: {
    id: string
    name: string
    name_kana: string | null
  } | null
  units: {
    id: string
    name: string
    service_type: string
  } | null
}

type CertRow = {
  child_id: string
  upper_limit_manager: string | null
  start_date: string
  end_date: string
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; tab?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))
  const yearMonth = `${year}${String(month).padStart(2, '0')}`
  const activeTab = params.tab ?? 'children'

  // 該当月に有効な受給者証の範囲（下の並列取得で使う）
  const certMonthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const certMonthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  // ユニット・月次請求・児童一覧・受給者証は互いに独立しているため並列取得
  const [
    { data: unitsRaw },
    { data: billingMonthlyRaw },
    { data: childrenUnitsRaw },
    { data: certsRaw },
  ] = await Promise.all([
    supabase
      .from('units')
      .select('id, name, service_type, facilities(name, facility_number)')
      .order('name'),
    supabase
      .from('billing_monthly')
      .select('id, unit_id, year_month, status, billing_details (id, child_id, total_days, total_units, copay_amount, billed_amount, errors, is_confirmed, children (name))')
      .eq('year_month', yearMonth),
    // 児童一覧（ユニット別）
    supabase
      .from('children_units')
      .select('child_id, children(id, name, name_kana), units(id, name, service_type)')
      .order('children(name_kana)'),
    // 該当月に有効な受給者証から上限管理事業所を取得
    supabase
      .from('benefit_certificates')
      .select('child_id, upper_limit_manager, start_date, end_date')
      .lte('start_date', certMonthEnd)
      .gte('end_date', certMonthStart)
      .not('upper_limit_manager', 'is', null),
  ])

  const units = (unitsRaw ?? []) as unknown as UnitWithFacility[]
  const billingMonthly = (billingMonthlyRaw ?? []) as unknown as BillingMonthly[]

  const billingByUnit = Object.fromEntries(billingMonthly.map((b) => [b.unit_id, b]))

  // unitId -> childId -> { id, is_confirmed } のルックアップ
  // billing_details は (billing_monthly_id, child_id) に一意制約がないため、
  // 同じ児童の行が重複しうる。重複時は確定済みの行を優先し、未確定の重複行に
  // 上書きされて「確定したはずが未確定に見える」状態にならないようにする。
  const detailByUnitChild: Record<string, Record<string, { id: string; is_confirmed: boolean }>> = {}
  for (const b of billingMonthly) {
    const byChild = detailByUnitChild[b.unit_id] ?? (detailByUnitChild[b.unit_id] = {})
    for (const d of b.billing_details) {
      const prev = byChild[d.child_id]
      if (prev && (prev.is_confirmed || !d.is_confirmed)) continue
      byChild[d.child_id] = { id: d.id, is_confirmed: d.is_confirmed }
    }
  }

  const childrenUnits = (childrenUnitsRaw ?? []) as unknown as ChildWithUnit[]
  const certs = (certsRaw ?? []) as CertRow[]
  // child_id → 最新の上限管理事業所（複数ある場合は start_date 最新を優先）
  const upperLimitMap = new Map<string, string>()
  for (const c of certs.sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    if (c.upper_limit_manager) upperLimitMap.set(c.child_id, c.upper_limit_manager)
  }

  const statusLabel: Record<string, string> = {
    draft: '作成中',
    checked: 'チェック済',
    exported: 'CSV出力済',
    submitted: '提出済',
    finalized: '確定',
  }
  const statusVariant: Record<string, 'secondary' | 'warning' | 'default' | 'success'> = {
    draft: 'secondary',
    checked: 'warning',
    exported: 'default',
    submitted: 'success',
    finalized: 'success',
  }

  const prevDate = new Date(year, month - 2, 1)
  const nextDate = new Date(year, month, 1)

  // 児童をユニット別にグループ化
  const childrenByUnit = childrenUnits.reduce<Record<string, ChildWithUnit[]>>((acc, cu) => {
    const uid = (cu.units as unknown as { id: string })?.id ?? 'unknown'
    if (!acc[uid]) acc[uid] = []
    acc[uid].push(cu)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">国保連請求</h1>
          <p className="text-sm text-gray-500 mt-0.5">月次請求データの管理・CSV出力</p>
        </div>
      </div>

      {/* 月選択 */}
      <div className="flex items-center gap-3">
        <Link
          href={`/billing?year=${prevDate.getFullYear()}&month=${prevDate.getMonth() + 1}&tab=${activeTab}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          ‹
        </Link>
        <span className="text-lg font-semibold text-gray-900">{year}年{month}月</span>
        <Link
          href={`/billing?year=${nextDate.getFullYear()}&month=${nextDate.getMonth() + 1}&tab=${activeTab}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          ›
        </Link>
      </div>

      {/* タブ切替 */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <Link
          href={`/billing?year=${year}&month=${month}&tab=children`}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'children' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <User className="h-3.5 w-3.5" />
          児童別
        </Link>
        <Link
          href={`/billing?year=${year}&month=${month}&tab=units`}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'units' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          ユニット別
        </Link>
      </div>

      {/* 児童一覧タブ */}
      {activeTab === 'children' && (
        <div className="space-y-4">
          {units.map((unit) => {
            const children = childrenByUnit[unit.id] ?? []
            if (children.length === 0) return null
            const effYearMonth = `${year}-${String(month).padStart(2, '0')}`
            return (
              <Card key={unit.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-700">{unit.name}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-100">
                    {children
                      .filter((cu) => cu.children)
                      .sort((a, b) => {
                        const ka = a.children?.name_kana ?? a.children?.name ?? ''
                        const kb = b.children?.name_kana ?? b.children?.name ?? ''
                        return ka.localeCompare(kb, 'ja')
                      })
                      .map((cu) => {
                        const child = cu.children!
                        const detail = detailByUnitChild[unit.id]?.[child.id]
                        return (
                          <div key={child.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                            <Link
                              href={`/billing/child/${child.id}?month=${effYearMonth}&unit=${unit.id}`}
                              className="flex items-center gap-3 flex-1 min-w-0"
                            >
                              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-bold flex-shrink-0">
                                {child.name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900">{child.name}</p>
                                {child.name_kana && (
                                  <p className="text-xs text-gray-400">{child.name_kana}</p>
                                )}
                                {upperLimitMap.get(child.id) && (
                                  <p className="text-xs text-indigo-600 mt-0.5">
                                    上限管理: {upperLimitMap.get(child.id)}
                                  </p>
                                )}
                              </div>
                            </Link>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                              {detail ? (
                                <BillingConfirmToggle
                                  billingDetailId={detail.id}
                                  initialConfirmed={detail.is_confirmed}
                                />
                              ) : (
                                <span className="text-xs text-gray-400">未作成</span>
                              )}
                              <Link
                                href={`/billing/child/${child.id}?month=${effYearMonth}&unit=${unit.id}`}
                                className="text-xs text-indigo-600 font-medium whitespace-nowrap"
                              >
                                明細を見る →
                              </Link>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ユニット別タブ（既存） */}
      {activeTab === 'units' && (
      <div className="space-y-4">
        {units.map((unit) => {
          const billing = billingByUnit[unit.id]
          const details = billing?.billing_details ?? []
          const totalBilled = details.reduce((sum, d) => sum + d.billed_amount, 0)
          const errorCount = details.filter((d) => Array.isArray(d.errors) && d.errors.length > 0).length

          return (
            <Card key={unit.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{unit.name}</CardTitle>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {unit.facilities?.name} | 事業所番号: {unit.facilities?.facility_number}
                    </p>
                  </div>
                  <Badge variant={billing ? (statusVariant[billing.status] ?? 'secondary') : 'secondary'}>
                    {billing ? (statusLabel[billing.status] ?? billing.status) : '未作成'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {billing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="p-2 bg-gray-50 rounded">
                        <p className="text-lg font-bold text-gray-900">{details.length}</p>
                        <p className="text-xs text-gray-500">対象児童数</p>
                      </div>
                      <div className="p-2 bg-gray-50 rounded">
                        <p className="text-lg font-bold text-indigo-600">{totalBilled.toLocaleString()}円</p>
                        <p className="text-xs text-gray-500">総請求額</p>
                      </div>
                      <div className={`p-2 rounded ${errorCount > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                        <p className={`text-lg font-bold ${errorCount > 0 ? 'text-red-600' : 'text-green-600'}`}>{errorCount}</p>
                        <p className="text-xs text-gray-500">エラー件数</p>
                      </div>
                    </div>
                    {errorCount > 0 && (
                      <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        {errorCount}件のエラーがあります
                      </div>
                    )}
                    <RecalcBillingButton unitId={unit.id} yearMonth={yearMonth} variant="outline" />
                    <div className="flex gap-2 flex-wrap">
                      <Link href={`/billing/${yearMonth}?unit=${unit.id}`}>
                        <Button variant="outline" size="sm">
                          <FileText className="h-4 w-4" />
                          詳細確認
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-400">
                      この月の請求データはまだありません。「出席実績から再集計」で出席記録から作成できます。
                    </p>
                    <RecalcBillingButton unitId={unit.id} yearMonth={yearMonth} variant="outline" />
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
      )}
    </div>
  )
}
