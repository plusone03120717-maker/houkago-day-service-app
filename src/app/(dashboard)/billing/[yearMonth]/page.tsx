import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { BillingExportButton } from '@/components/billing/billing-export-button'
import { AiCheckButton } from '@/components/billing/ai-check-button'
import { ActualCostForm } from '@/components/billing/actual-cost-form'
import { BillingDetailsTable } from '@/components/billing/billing-details-table'

type BillingDetail = {
  id: string
  child_id: string
  total_days: number
  total_units: number
  service_code: string | null
  unit_price: number
  copay_amount: number
  billed_amount: number
  errors: string[]
  children: { name: string; name_kana: string | null } | null
}

type BillingMonthly = {
  id: string
  unit_id: string
  year_month: string
  status: string
  billing_details: BillingDetail[]
  units: { name: string; service_type: string; facilities: { name: string; facility_number: string } | null } | null
}

type ActualCost = {
  id: string
  child_id: string
  date: string
  item_name: string
  amount: number
  billing_monthly_id: string | null
  children: { name: string } | null
}

type ExtraChargeRow = {
  child_id: string
  child_name: string
  program_name: string
  extra_charge: number
  unit_id: string
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

export default async function BillingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ yearMonth: string }>
  searchParams: Promise<{ unit?: string }>
}) {
  const { yearMonth } = await params
  const { unit: unitId } = await searchParams
  const supabase = await createClient()
  const year = yearMonth.slice(0, 4)
  const month = yearMonth.slice(4, 6)

  let query = supabase
    .from('billing_monthly')
    .select(`
      id, unit_id, year_month, status,
      units (name, service_type, facilities (name, facility_number)),
      billing_details (id, child_id, total_days, total_units, service_code, unit_price, copay_amount, billed_amount, errors, children (name, name_kana))
    `)
    .eq('year_month', yearMonth)

  if (unitId) {
    query = query.eq('unit_id', unitId)
  }

  const { data: billingRaw } = await query
  const billings = (billingRaw ?? []) as unknown as BillingMonthly[]

  const billingIds = billings.map((b) => b.id)
  const { data: actualCostsRaw } = billingIds.length > 0
    ? await supabase
        .from('billing_actual_costs')
        .select('id, child_id, date, item_name, amount, billing_monthly_id, children(name)')
        .in('billing_monthly_id', billingIds)
        .order('date')
    : { data: [] }
  const actualCosts = (actualCostsRaw ?? []) as unknown as ActualCost[]

  // 保険適用外料金の集計
  const unitIds = billings.map((b) => b.unit_id)
  const nextMonthYear = month === '12' ? String(parseInt(year) + 1) : year
  const nextMonthNum = month === '12' ? '01' : String(parseInt(month) + 1).padStart(2, '0')
  const dateStart = `${year}-${month}-01`
  const dateEnd = `${nextMonthYear}-${nextMonthNum}-01`

  const extraChargeRows: ExtraChargeRow[] = []
  if (unitIds.length > 0) {
    const { data: attendancesRaw } = await supabase
      .from('daily_attendance')
      .select('id, child_id, unit_id, children(name)')
      .in('unit_id', unitIds)
      .gte('date', dateStart)
      .lt('date', dateEnd)
    const attendances = (attendancesRaw ?? []) as unknown as { id: string; child_id: string; unit_id: string; children: { name: string } | null }[]

    if (attendances.length > 0) {
      const attendanceIds = attendances.map((a) => a.id)
      const attendanceMap = Object.fromEntries(attendances.map((a) => [a.id, a]))

      const { data: activitiesRaw } = await supabase
        .from('daily_activities')
        .select('attendance_id, activity_programs(name, extra_charge)')
        .in('attendance_id', attendanceIds)
        .eq('participated', true)
        .not('program_id', 'is', null)
      const activities = (activitiesRaw ?? []) as unknown as { attendance_id: string; activity_programs: { name: string; extra_charge: number | null } | null }[]

      for (const act of activities) {
        const prog = act.activity_programs
        if (!prog || prog.extra_charge == null) continue
        const att = attendanceMap[act.attendance_id]
        if (!att) continue
        extraChargeRows.push({
          child_id: att.child_id,
          child_name: att.children?.name ?? '—',
          program_name: prog.name,
          extra_charge: prog.extra_charge,
          unit_id: att.unit_id,
        })
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/billing" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{year}年{month}月 請求明細</h1>
          <p className="text-sm text-gray-500 mt-0.5">ユニット別・児童別の請求詳細</p>
        </div>
      </div>

      {billings.map((billing) => {
        const unit = billing.units
        const details = billing.billing_details ?? []
        const totalBilled = details.reduce((s, d) => s + d.billed_amount, 0)
        const totalCopay = details.reduce((s, d) => s + d.copay_amount, 0)
        const errorDetails = details.filter((d) => Array.isArray(d.errors) && d.errors.length > 0)

        const billCosts = actualCosts.filter((c) => c.billing_monthly_id === billing.id)
        const unitExtraCharges = extraChargeRows.filter((r) => r.unit_id === billing.unit_id)
        // 児童ごとに集計
        const extraByChild = unitExtraCharges.reduce<Record<string, { name: string; items: { program: string; amount: number }[]; total: number }>>((acc, r) => {
          if (!acc[r.child_id]) acc[r.child_id] = { name: r.child_name, items: [], total: 0 }
          acc[r.child_id].items.push({ program: r.program_name, amount: r.extra_charge })
          acc[r.child_id].total += r.extra_charge
          return acc
        }, {})
        const extraTotal = unitExtraCharges.reduce((s, r) => s + r.extra_charge, 0)

        const childOptions = details.map((d) => ({
          child_id: d.child_id,
          name: d.children?.name ?? '—',
        }))

        return (
          <Card key={billing.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{unit?.name ?? 'ユニット不明'}</CardTitle>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {unit?.facilities?.name} | 事業所番号: {unit?.facilities?.facility_number}
                  </p>
                </div>
                <Badge variant={statusVariant[billing.status] ?? 'secondary'}>
                  {statusLabel[billing.status] ?? billing.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* サマリ */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-gray-50 rounded text-center">
                  <p className="text-xl font-bold text-gray-900">{details.length}</p>
                  <p className="text-xs text-gray-500">児童数</p>
                </div>
                <div className="p-3 bg-gray-50 rounded text-center">
                  <p className="text-xl font-bold text-gray-900">{details.reduce((s, d) => s + d.total_days, 0)}</p>
                  <p className="text-xs text-gray-500">総利用日数</p>
                </div>
                <div className="p-3 bg-indigo-50 rounded text-center">
                  <p className="text-xl font-bold text-indigo-600">{totalBilled.toLocaleString()}円</p>
                  <p className="text-xs text-gray-500">給付費請求額</p>
                </div>
                <div className="p-3 bg-orange-50 rounded text-center">
                  <p className="text-xl font-bold text-orange-600">{totalCopay.toLocaleString()}円</p>
                  <p className="text-xs text-gray-500">利用者負担合計</p>
                </div>
              </div>

              {/* エラー表示 */}
              {errorDetails.length > 0 && (
                <div className="border border-red-200 rounded p-3 bg-red-50 space-y-1">
                  <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {errorDetails.length}件のエラーがあります
                  </div>
                  {errorDetails.map((d) => (
                    <div key={d.id} className="text-xs text-red-600 ml-6">
                      {d.children?.name}: {(d.errors as string[]).join(', ')}
                    </div>
                  ))}
                </div>
              )}

              {/* 児童別明細（編集可） */}
              <BillingDetailsTable initial={details} />

              {/* 保険適用外料金集計 */}
              {Object.keys(extraByChild).length > 0 && (
                <div className="border border-amber-200 rounded-lg overflow-hidden">
                  <div className="bg-amber-50 px-3 py-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-amber-800">保険適用外料金</p>
                    <p className="text-sm font-bold text-amber-700">合計: {extraTotal.toLocaleString()}円</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-amber-100">
                        <th className="px-3 py-1.5 text-left font-medium">氏名</th>
                        <th className="px-3 py-1.5 text-left font-medium">プログラム</th>
                        <th className="px-3 py-1.5 text-right font-medium">料金</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-50">
                      {Object.values(extraByChild).map((child) =>
                        child.items.map((item, idx) => (
                          <tr key={`${child.name}-${idx}`} className="bg-white">
                            <td className="px-3 py-1.5 text-gray-900">{idx === 0 ? child.name : ''}</td>
                            <td className="px-3 py-1.5 text-gray-700">{item.program}</td>
                            <td className="px-3 py-1.5 text-right text-gray-900">{item.amount.toLocaleString()}円</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-amber-50 border-t border-amber-200">
                        <td colSpan={2} className="px-3 py-1.5 text-xs font-medium text-amber-700">児童数: {Object.keys(extraByChild).length}名</td>
                        <td className="px-3 py-1.5 text-right text-sm font-bold text-amber-700">{extraTotal.toLocaleString()}円</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* AIチェック */}
              <AiCheckButton billingMonthlyId={billing.id} />

              {/* 実費管理 */}
              <ActualCostForm
                billingMonthlyId={billing.id}
                unitId={billing.unit_id}
                yearMonth={yearMonth}
                children={childOptions}
                costs={billCosts}
              />

              {/* CSV出力 */}
              <div className="flex gap-2 flex-wrap pt-2 border-t border-gray-100">
                <BillingExportButton
                  billingMonthlyId={billing.id}
                  exportType="service_record"
                  label="サービス提供実績CSV"
                />
                <BillingExportButton
                  billingMonthlyId={billing.id}
                  exportType="billing"
                  label="請求情報CSV"
                />
              </div>
            </CardContent>
          </Card>
        )
      })}

      {billings.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">この月の請求データがありません</p>
          <Link href="/billing" className="mt-3 inline-block">
            <Button variant="outline" size="sm">請求管理に戻る</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
