import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { DaytimeRateForm, type RateRow } from '@/components/settings/daytime-rate-form'

export default async function DaytimeRatesSettingsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: facility } = await supabase
    .from('facilities')
    .select('id, name, unit_price, daytime_transport_fee')
    .limit(1)
    .maybeSingle()

  const fac = facility as {
    id: string
    name: string
    unit_price: number
    daytime_transport_fee: number
  } | null

  const { data: ratesRaw } = fac
    ? await supabase
        .from('daytime_support_rates')
        .select('time_category, child_category, unit_count')
        .eq('facility_id', fac.id)
    : { data: [] }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">日中一時支援の単位数・送迎費</h1>
          <p className="mt-0.5 text-sm text-gray-500">利用者負担額（1割）の計算に使います</p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-1 p-4 text-sm text-gray-600">
          <p className="font-medium text-gray-900">この設定の使われ方</p>
          <p>
            日々の記録で「日中一時利用」にチェックし利用時間を入力すると、
            <strong>利用時間区分 × 児童ごとの児区分</strong>で単位数が決まり、その1割が利用者負担になります。
          </p>
          <p className="text-xs text-gray-400">
            ※ 児区分（1〜3）は児童ごとに設定します（児童詳細 → 基本情報）。
          </p>
          <p className="text-xs text-gray-400">
            ※ 日中一時支援の利用者負担は、放デイの負担上限月額とは別枠で計算します。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{fac?.name ?? '施設'}</CardTitle>
        </CardHeader>
        <CardContent>
          {fac ? (
            <DaytimeRateForm
              facilityId={fac.id}
              unitPrice={Number(fac.unit_price ?? 10)}
              transportFee={Number(fac.daytime_transport_fee ?? 140)}
              rates={(ratesRaw ?? []) as RateRow[]}
            />
          ) : (
            <p className="text-sm text-gray-400">施設が登録されていません</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
