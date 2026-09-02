import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import {
  ServiceCodeForm,
  type BasicRateRow,
  type ExtensionRateRow,
  type ServiceItemRow,
} from '@/components/settings/service-code-form'

type Unit = { id: string; name: string }

export default async function ServiceCodesSettingsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as Unit[]

  const { data: itemsRaw } = await supabase
    .from('billing_service_items')
    .select('id, unit_id, name, category, trigger_field, billing_code, unit_count')
    .eq('is_active', true)
    .order('sort_order')
  const items = (itemsRaw ?? []) as unknown as (ServiceItemRow & { unit_id: string })[]

  const { data: ratesRaw } = await supabase
    .from('billing_basic_rates')
    .select('unit_id, service_form_type, billing_category, unit_count, billing_code')
  const rates = (ratesRaw ?? []) as unknown as (BasicRateRow & { unit_id: string })[]

  const { data: extRatesRaw } = await supabase
    .from('billing_extension_rates')
    .select('unit_id, extension_level, unit_count, billing_code')
  const extensionRates = (extRatesRaw ?? []) as unknown as (ExtensionRateRow & { unit_id: string })[]

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">国保連サービスコード・単位数設定</h1>
          <p className="text-sm text-gray-500 mt-0.5">サービス項目ごとの6桁コードと単位数を登録します</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 text-sm text-gray-600 space-y-1">
          <p className="font-medium text-gray-900">サービスコード・単位数について</p>
          <p>
            ここで登録した単位数とサービスコードをもとに、国保連請求の
            <strong>「出席実績から再集計」</strong>が児童ごとの利用日数・単位数・請求額を自動計算します。
          </p>
          <p className="text-xs text-gray-400">
            ※ コード・単位数は厚生労働省の「障害福祉サービス費等の額の算定に関する基準」別表のサービスコード表でご確認ください。
            時間区分・定員規模・児童区分（重症心身障害児・医療的ケア児）により異なります。
          </p>
          <p className="text-xs text-gray-400">
            ※ 変更しても既存の請求明細は自動では変わりません。請求明細画面で「出席実績から再集計」を実行してください。
          </p>
        </CardContent>
      </Card>

      {units.map((unit) => (
        <Card key={unit.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{unit.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceCodeForm
              unitId={unit.id}
              items={items.filter((i) => i.unit_id === unit.id)}
              rates={rates.filter((r) => r.unit_id === unit.id)}
              extensionRates={extensionRates.filter((r) => r.unit_id === unit.id)}
            />
          </CardContent>
        </Card>
      ))}

      {units.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          ユニットが登録されていません
        </div>
      )}
    </div>
  )
}
