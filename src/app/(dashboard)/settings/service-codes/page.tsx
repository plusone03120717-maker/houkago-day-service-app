import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { FACILITY_ADDITION_MAP, additionGroup, additionLineName } from '@/lib/billing/facility-additions'
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

  // 事業所につく加算・減算（児童指導員等加配加算など）は別画面で登録する。ここでは確認用に一覧だけ出す
  const { data: additionsRaw } = await supabase
    .from('unit_addition_settings')
    .select('unit_id, addition_key, option_value, unit_count, rate, billing_code')
  const facilityAdditions = ((additionsRaw ?? []) as Array<{
    unit_id: string
    addition_key: string
    option_value: string | null
    unit_count: number
    rate: number | null
    billing_code: string | null
  }>).flatMap((a) => {
    const def = FACILITY_ADDITION_MAP.get(a.addition_key)
    if (!def || !a.option_value) return []
    const isRate = additionGroup(def) !== '加算'
    if (isRate ? !a.rate : a.unit_count <= 0) return []
    return [{
      unitId: a.unit_id,
      name: additionLineName(def, a.option_value),
      value: isRate ? `${a.rate}%` : `${a.unit_count}単位`,
      code: a.billing_code,
    }]
  })

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

      <Link
        href="/settings/facility-additions"
        className="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 hover:bg-indigo-100"
      >
        <span>
          <strong>児童指導員等加配加算・専門的支援体制加算・福祉専門職員配置等加算・処遇改善加算・各種減算</strong>は、
          この画面ではなく<strong>「事業所の加算・減算設定」</strong>で単位数・サービスコードを登録します
        </span>
        <ArrowRight className="h-4 w-4 shrink-0" />
      </Link>

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
            {facilityAdditions.some((a) => a.unitId === unit.id) && (
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">事業所の加算・減算（確認用）</p>
                  <Link href="/settings/facility-additions" className="text-xs text-indigo-600 hover:underline">
                    変更は「事業所の加算・減算設定」で →
                  </Link>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {facilityAdditions
                      .filter((a) => a.unitId === unit.id)
                      .map((a) => (
                        <tr key={a.name} className="border-t border-gray-100">
                          <td className="py-1.5 text-gray-700">{a.name}</td>
                          <td className="py-1.5 text-right text-gray-700 w-20">{a.value}</td>
                          <td className="py-1.5 text-right font-mono text-gray-700 w-24">{a.code ?? '未設定'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
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
