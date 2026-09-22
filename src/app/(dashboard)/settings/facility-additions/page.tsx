import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import {
  FacilityAdditionForm,
  type UnitAdditionSettingRow,
} from '@/components/settings/facility-addition-form'

type Unit = { id: string; name: string; service_type: string; is_billing_target: boolean }

const SERVICE_TYPE_LABEL: Record<string, string> = {
  afterschool: '放課後等デイサービス',
  development_support: '児童発達支援',
}

export default async function FacilityAdditionsSettingsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name, service_type, is_billing_target')
    .order('name')
  const units = ((unitsRaw ?? []) as unknown as Unit[]).filter((u) => u.is_billing_target)

  const { data: settingsRaw } = await supabase
    .from('unit_addition_settings')
    .select('unit_id, addition_key, option_value, unit_count, rate, billing_code')
  const settings = (settingsRaw ?? []) as unknown as UnitAdditionSettingRow[]

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">事業所の加算・減算設定</h1>
          <p className="text-sm text-gray-500 mt-0.5">体制届で届け出た区分を登録します（算定情報）</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 text-sm text-gray-600 space-y-2">
          <p className="font-medium text-gray-900">事業所につく加算と、利用者ごとにつく加算</p>
          <p>
            ここで登録するのは<strong>事業所につく加算・減算</strong>です。区分を選んで単位数（または率）と
            サービスコードを入れておくと、請求明細画面の「出席実績から再集計」で
            <strong>全児童の明細に自動で積まれます</strong>。
          </p>
          <p>
            <strong>利用者ごとにつく加算</strong>（送迎加算・欠席時対応加算・延長支援加算・専門的支援実施加算・
            個別サポート加算など）は、日々の出席実績から児童ごとに判定します。単位数とサービスコードは
            「設定 → 国保連サービスコード・単位数設定」で登録してください。
          </p>
          <p className="text-xs text-gray-400">
            ※ 単位数・率・サービスコードは定員規模・地域区分・年度改定で変わります。単位数表と体制届の控えでご確認ください。
          </p>
          <p className="text-xs text-gray-400">
            ※ 変更しても既存の請求明細は自動では変わりません。請求明細画面で「出席実績から再集計」を実行してください。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-sm text-gray-600 space-y-2">
          <p className="font-medium text-gray-900">この画面で設定しない項目</p>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-1.5 pr-3 text-gray-900">地域区分・単位数単価</td>
                <td className="py-1.5 text-gray-500">設定 → 施設・ユニット管理 →「国保連請求設定」</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-1.5 pr-3 text-gray-900">サービス給付費の区分・有資格者配置・未就学児</td>
                <td className="py-1.5 text-gray-500">
                  基本報酬のサービスコードに含まれます（設定 → 国保連サービスコード・単位数設定）
                </td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3 text-gray-900">個別サポート加算（Ⅰ）（Ⅱ）（Ⅲ）など</td>
                <td className="py-1.5 text-gray-500">
                  対象児童だけに算定するため、国保連請求 → 児童別の月次サービス実績で加算項目をチェックします
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {units.map((unit) => (
        <Card key={unit.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {unit.name}
              <Badge variant="secondary" className="text-xs font-normal">
                {SERVICE_TYPE_LABEL[unit.service_type] ?? unit.service_type}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FacilityAdditionForm
              unitId={unit.id}
              serviceType={unit.service_type}
              settings={settings.filter((s) => s.unit_id === unit.id)}
            />
          </CardContent>
        </Card>
      ))}

      {units.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          国保連請求の対象ユニットが登録されていません
        </div>
      )}
    </div>
  )
}
