import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, AlertCircle, CheckCircle, Download } from 'lucide-react'
import { generateBilling } from '@/app/actions/billing'

type BillingDetail = {
  id: string
  child_id: string
  total_days: number
  total_units: number
  copay_amount: number
  billed_amount: number
  errors: unknown[]
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

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))
  const yearMonth = `${year}${String(month).padStart(2, '0')}`

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name, service_type, facilities(name, facility_number)')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as UnitWithFacility[]

  const { data: billingMonthlyRaw } = await supabase
    .from('billing_monthly')
    .select('id, unit_id, year_month, status, billing_details (id, child_id, total_days, total_units, copay_amount, billed_amount, errors, children (name))')
    .eq('year_month', yearMonth)
  const billingMonthly = (billingMonthlyRaw ?? []) as unknown as BillingMonthly[]

  const billingByUnit = Object.fromEntries(billingMonthly.map((b) => [b.unit_id, b]))

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
          href={`/billing?year=${prevDate.getFullYear()}&month=${prevDate.getMonth() + 1}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          ‹
        </Link>
        <span className="text-lg font-semibold text-gray-900">{year}年{month}月</span>
        <Link
          href={`/billing?year=${nextDate.getFullYear()}&month=${nextDate.getMonth() + 1}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          ›
        </Link>
      </div>

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
                    <div className="flex gap-2 flex-wrap">
                      <Link href={`/billing/${yearMonth}?unit=${unit.id}`}>
                        <Button variant="outline" size="sm">
                          <FileText className="h-4 w-4" />
                          詳細確認
                        </Button>
                      </Link>
                      {billing.status === 'checked' && (
                        <Button size="sm" variant="outline">
                          <Download className="h-4 w-4" />
                          CSV出力
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-400">この月の請求データがありません</p>
                    <form action={generateBilling}>
                      <input type="hidden" name="unitId" value={unit.id} />
                      <input type="hidden" name="yearMonth" value={yearMonth} />
                      <Button type="submit" size="sm">
                        <FileText className="h-4 w-4" />
                        請求データ生成
                      </Button>
                    </form>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
