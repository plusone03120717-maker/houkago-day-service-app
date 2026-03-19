import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { BillingExportButton } from '@/components/billing/billing-export-button'
import { AiCheckButton } from '@/components/billing/ai-check-button'

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

              {/* 児童別明細 */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                      <th className="text-left py-2 pr-3 font-medium">氏名</th>
                      <th className="text-right py-2 px-3 font-medium">利用日数</th>
                      <th className="text-right py-2 px-3 font-medium">単位数</th>
                      <th className="text-right py-2 px-3 font-medium">給付単価</th>
                      <th className="text-right py-2 px-3 font-medium">給付費請求額</th>
                      <th className="text-right py-2 pl-3 font-medium">利用者負担</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((d) => (
                      <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 pr-3 font-medium">
                          {d.children?.name ?? '—'}
                          {Array.isArray(d.errors) && d.errors.length > 0 && (
                            <AlertCircle className="inline h-3 w-3 ml-1 text-red-500" />
                          )}
                        </td>
                        <td className="text-right py-2 px-3">{d.total_days}日</td>
                        <td className="text-right py-2 px-3">{d.total_units.toLocaleString()}</td>
                        <td className="text-right py-2 px-3">{d.unit_price.toLocaleString()}円</td>
                        <td className="text-right py-2 px-3 font-medium text-indigo-600">
                          {d.billed_amount.toLocaleString()}円
                        </td>
                        <td className="text-right py-2 pl-3 text-orange-600">
                          {d.copay_amount.toLocaleString()}円
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 font-semibold">
                      <td className="py-2 pr-3">合計</td>
                      <td className="text-right py-2 px-3">{details.reduce((s, d) => s + d.total_days, 0)}日</td>
                      <td className="text-right py-2 px-3">
                        {details.reduce((s, d) => s + d.total_units, 0).toLocaleString()}
                      </td>
                      <td className="text-right py-2 px-3">—</td>
                      <td className="text-right py-2 px-3 text-indigo-600">{totalBilled.toLocaleString()}円</td>
                      <td className="text-right py-2 pl-3 text-orange-600">{totalCopay.toLocaleString()}円</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* AIチェック */}
              <AiCheckButton billingMonthlyId={billing.id} />

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
