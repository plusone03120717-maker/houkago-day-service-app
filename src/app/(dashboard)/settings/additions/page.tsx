import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { AdditionsForm } from '@/components/settings/additions-form'

// 処遇改善加算の種類（放デイ・児発共通）
export const ADDITION_TYPES = [
  { key: 'treatment_improvement_1', label: '福祉・介護職員処遇改善加算（Ⅰ）', rate: 10.9 },
  { key: 'treatment_improvement_2', label: '福祉・介護職員処遇改善加算（Ⅱ）', rate: 7.9 },
  { key: 'treatment_improvement_3', label: '福祉・介護職員処遇改善加算（Ⅲ）', rate: 4.7 },
  { key: 'specific_treatment_1', label: '福祉・介護職員等特定処遇改善加算（Ⅰ）', rate: 3.0 },
  { key: 'specific_treatment_2', label: '福祉・介護職員等特定処遇改善加算（Ⅱ）', rate: 2.0 },
  { key: 'base_improvement_1', label: '福祉・介護職員等ベースアップ等支援加算', rate: 2.4 },
  { key: 'placement_support', label: '配置加算（専門職）', rate: 0 },
  { key: 'small_group', label: '小集団活動加算', rate: 0 },
  { key: 'individual_support', label: '個別サポート加算（Ⅰ）', rate: 0 },
] as const

type Unit = { id: string; name: string }
type AdditionSetting = {
  unit_id: string
  addition_type: string
  enabled: boolean
  custom_rate: number | null
}

export default async function AdditionsSettingsPage() {
  const supabase = await createClient()

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as Unit[]

  // 現在の設定を取得（テーブルがなければ空）
  const { data: settingsRaw } = await supabase
    .from('addition_settings')
    .select('unit_id, addition_type, enabled, custom_rate')
  const settings = (settingsRaw ?? []) as unknown as AdditionSetting[]

  const settingsMap: Record<string, Record<string, AdditionSetting>> = {}
  settings.forEach((s) => {
    if (!settingsMap[s.unit_id]) settingsMap[s.unit_id] = {}
    settingsMap[s.unit_id][s.addition_type] = s
  })

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">処遇改善加算設定</h1>
          <p className="text-sm text-gray-500 mt-0.5">ユニットごとの加算区分を設定します</p>
        </div>
      </div>

      {/* 加算説明 */}
      <Card>
        <CardContent className="p-4 text-sm text-gray-600 space-y-1">
          <p className="font-medium text-gray-900">加算について</p>
          <p>各加算の算定率は基本報酬に対する割合です。実際の加算額は請求データ生成時に自動計算されます。</p>
          <p className="text-xs text-gray-400">※ 算定率は法改正により変更される場合があります。最新の情報をご確認ください。</p>
        </CardContent>
      </Card>

      {/* ユニット別設定 */}
      {units.map((unit) => (
        <Card key={unit.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{unit.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <AdditionsForm
              unitId={unit.id}
              additionTypes={ADDITION_TYPES}
              initialSettings={settingsMap[unit.id] ?? {}}
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
