import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { ServiceCodeForm, type ServiceItemRow } from '@/components/settings/service-code-form'

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
    .select('id, unit_id, name, category, trigger_field, billing_code')
    .eq('is_active', true)
    .order('sort_order')
  const items = (itemsRaw ?? []) as unknown as (ServiceItemRow & { unit_id: string })[]

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">国保連サービスコード設定</h1>
          <p className="text-sm text-gray-500 mt-0.5">サービス項目ごとの6桁コードを登録します</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 text-sm text-gray-600 space-y-1">
          <p className="font-medium text-gray-900">サービスコードについて</p>
          <p>
            国保連へ提出する請求CSVには、サービス項目ごとの6桁のサービスコードが必要です。
            基本報酬のコードを登録すると、以降に生成する請求データへ自動的に設定されます。
          </p>
          <p className="text-xs text-gray-400">
            ※ コードは厚生労働省の「障害福祉サービス費等の額の算定に関する基準」別表のサービスコード表でご確認ください。
            時間区分・定員規模・児童区分（重症心身障害児・医療的ケア児）により異なります。
          </p>
          <p className="text-xs text-gray-400">
            ※ 既に生成済みの請求データには反映されません。請求データを再生成するか、請求明細画面で修正してください。
          </p>
        </CardContent>
      </Card>

      {units.map((unit) => (
        <Card key={unit.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{unit.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceCodeForm items={items.filter((i) => i.unit_id === unit.id)} />
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
