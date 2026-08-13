'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Save } from 'lucide-react'

export type ServiceItemRow = {
  id: string
  name: string
  category: string
  trigger_field: string
  billing_code: string | null
  unit_count: number
}

export type BasicRateRow = {
  service_form_type: number
  billing_category: number
  unit_count: number
  billing_code: string | null
}

interface Props {
  unitId: string
  items: ServiceItemRow[]
  rates: BasicRateRow[]
}

/** 基本報酬の入力欄。30分未満（区分0）は算定対象外なので持たない */
const BASIC_SLOTS: { form: 1 | 2; category: 1 | 2; label: string; hint: string }[] = [
  { form: 1, category: 1, label: '平日・区分1', hint: '30分以上90分以下' },
  { form: 1, category: 2, label: '平日・区分2', hint: '90分超' },
  { form: 2, category: 1, label: '休日・区分1', hint: '30分以上90分以下' },
  { form: 2, category: 2, label: '休日・区分2', hint: '90分超' },
]

const CODE_PATTERN = /^[0-9A-Z]{6}$/

export function ServiceCodeForm({ unitId, items, rates }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const rateKey = (form: number, category: number) => `${form}-${category}`
  const rateMap = new Map(rates.map((r) => [rateKey(r.service_form_type, r.billing_category), r]))

  const [basic, setBasic] = useState<Record<string, { units: string; code: string }>>(
    Object.fromEntries(
      BASIC_SLOTS.map((s) => {
        const r = rateMap.get(rateKey(s.form, s.category))
        return [rateKey(s.form, s.category), {
          units: r && r.unit_count > 0 ? String(r.unit_count) : '',
          code: r?.billing_code ?? '',
        }]
      }),
    ),
  )
  const [itemValues, setItemValues] = useState<Record<string, { units: string; code: string }>>(
    Object.fromEntries(
      items.map((i) => [i.id, {
        units: i.unit_count > 0 ? String(i.unit_count) : '',
        code: i.billing_code ?? '',
      }]),
    ),
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  // 基本報酬は下の表で設定するため、項目一覧からは除く
  const addonItems = items.filter((i) => i.trigger_field !== 'basic')

  const setBasicField = (key: string, field: 'units' | 'code', value: string) =>
    setBasic((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }))

  const setItemField = (id: string, field: 'units' | 'code', value: string) =>
    setItemValues((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))

  const parseUnits = (v: string): number | null => {
    if (v.trim() === '') return 0
    const n = Number(v)
    if (!Number.isInteger(n) || n < 0) return null
    return n
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    setErrors([])

    const invalid: string[] = []
    for (const slot of BASIC_SLOTS) {
      const v = basic[rateKey(slot.form, slot.category)]
      if (v.code && !CODE_PATTERN.test(v.code)) {
        invalid.push(`${slot.label}: サービスコード「${v.code}」は6桁の半角英数字ではありません`)
      }
      if (parseUnits(v.units) === null) {
        invalid.push(`${slot.label}: 単位数「${v.units}」は0以上の整数で入力してください`)
      }
    }
    for (const item of addonItems) {
      const v = itemValues[item.id]
      if (v.code && !CODE_PATTERN.test(v.code)) {
        invalid.push(`${item.name}: サービスコード「${v.code}」は6桁の半角英数字ではありません`)
      }
      if (parseUnits(v.units) === null) {
        invalid.push(`${item.name}: 単位数「${v.units}」は0以上の整数で入力してください`)
      }
    }
    if (invalid.length > 0) {
      setErrors(invalid)
      setSaving(false)
      return
    }

    const failed: string[] = []

    const ratePayload = BASIC_SLOTS.map((slot) => {
      const v = basic[rateKey(slot.form, slot.category)]
      return {
        unit_id: unitId,
        service_form_type: slot.form,
        billing_category: slot.category,
        unit_count: parseUnits(v.units) ?? 0,
        billing_code: v.code ? v.code.toUpperCase() : null,
      }
    })
    const { error: rateError } = await supabase
      .from('billing_basic_rates')
      .upsert(ratePayload, { onConflict: 'unit_id,service_form_type,billing_category' })
    if (rateError) failed.push(`基本報酬: ${rateError.message}`)

    for (const item of addonItems) {
      const v = itemValues[item.id]
      const nextCode = v.code ? v.code.toUpperCase() : null
      const nextUnits = parseUnits(v.units) ?? 0
      if (nextCode === (item.billing_code ?? null) && nextUnits === item.unit_count) continue
      const { error } = await supabase
        .from('billing_service_items')
        .update({ billing_code: nextCode, unit_count: nextUnits })
        .eq('id', item.id)
      if (error) failed.push(`${item.name}: ${error.message}`)
    }

    setSaving(false)
    if (failed.length > 0) {
      setErrors(failed)
      return
    }
    setMessage('保存しました。請求明細画面の「出席実績から再集計」で反映されます')
    router.refresh()
  }

  const basicMissing = BASIC_SLOTS.some((s) => {
    const v = basic[rateKey(s.form, s.category)]
    return !v.units || !v.code
  })

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        このユニットにはサービス項目が登録されていません。国保連請求 → 児童別の月次実績画面で項目を作成してください。
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {basicMissing && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          基本報酬の単位数・サービスコードが未設定です。設定するまで、出席実績から再集計しても基本報酬分の単位数が計算されません。
        </div>
      )}

      {/* 基本報酬 */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-900">基本報酬</p>
        <p className="text-xs text-gray-400">
          提供形態（平日／学校休業日・土日祝）と算定時間の区分ごとに、1日あたりの単位数とサービスコードを登録します。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-200">
                <th className="text-left py-1.5 pr-3 font-medium">区分</th>
                <th className="text-right py-1.5 px-3 font-medium w-28">単位数</th>
                <th className="text-left py-1.5 pl-3 font-medium w-36">サービスコード</th>
              </tr>
            </thead>
            <tbody>
              {BASIC_SLOTS.map((slot) => {
                const key = rateKey(slot.form, slot.category)
                return (
                  <tr key={key} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3">
                      <span className="text-gray-900">{slot.label}</span>
                      <span className="ml-1.5 text-xs text-gray-400">{slot.hint}</span>
                    </td>
                    <td className="py-1.5 px-3">
                      <Input
                        type="number"
                        min={0}
                        value={basic[key].units}
                        onChange={(e) => setBasicField(key, 'units', e.target.value)}
                        placeholder="604"
                        className="w-24 text-right"
                      />
                    </td>
                    <td className="py-1.5 pl-3">
                      <Input
                        value={basic[key].code}
                        onChange={(e) => setBasicField(key, 'code', e.target.value.toUpperCase())}
                        placeholder="631111"
                        maxLength={6}
                        className="w-32 font-mono"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 加算・その他の項目 */}
      {addonItems.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-900">加算・その他の項目</p>
          <p className="text-xs text-gray-400">
            1回あたりの単位数を登録します。延長加算は「1時間あたりの単位数」として扱われます。
            保険外の項目は給付費の対象外のため、単位数は集計されません。
          </p>
          <div className="space-y-2">
            {addonItems.map((item) => {
              const isOutOfScope = item.category === '保険外'
              return (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{item.name}</p>
                    <Badge variant="secondary" className="text-xs mt-0.5">{item.category}</Badge>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    value={itemValues[item.id].units}
                    onChange={(e) => setItemField(item.id, 'units', e.target.value)}
                    placeholder={isOutOfScope ? '—' : '54'}
                    disabled={isOutOfScope}
                    className="w-24 text-right"
                  />
                  <Input
                    value={itemValues[item.id].code}
                    onChange={(e) => setItemField(item.id, 'code', e.target.value.toUpperCase())}
                    placeholder="636701"
                    maxLength={6}
                    className="w-32 font-mono"
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-0.5">
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save className="h-4 w-4" />
          {saving ? '保存中...' : '保存'}
        </Button>
        {message && <span className="text-xs text-gray-500">{message}</span>}
      </div>
    </div>
  )
}
