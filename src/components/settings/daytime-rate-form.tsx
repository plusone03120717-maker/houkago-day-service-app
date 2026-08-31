'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Save, Check } from 'lucide-react'
import { TIME_CATEGORY_LABEL } from '@/lib/billing/copay-invoice'

export type RateRow = {
  time_category: number
  child_category: number
  unit_count: number
}

const TIME_CATEGORIES = [1, 2, 3, 4, 5]
const CHILD_CATEGORIES = [3, 2, 1]

export function DaytimeRateForm({
  facilityId,
  unitPrice,
  transportFee,
  rates,
}: {
  facilityId: string
  unitPrice: number
  transportFee: number
  rates: RateRow[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const initial: Record<string, string> = {}
  for (const t of TIME_CATEGORIES) {
    for (const c of CHILD_CATEGORIES) {
      const row = rates.find((r) => r.time_category === t && r.child_category === c)
      initial[`${t}-${c}`] = String(row?.unit_count ?? 0)
    }
  }

  const [values, setValues] = useState(initial)
  const [fee, setFee] = useState(String(transportFee))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    const rows = TIME_CATEGORIES.flatMap((t) =>
      CHILD_CATEGORIES.map((c) => ({
        facility_id: facilityId,
        time_category: t,
        child_category: c,
        unit_count: parseInt(values[`${t}-${c}`] || '0', 10) || 0,
        updated_at: new Date().toISOString(),
      })),
    )

    const { error: rateError } = await supabase
      .from('daytime_support_rates')
      .upsert(rows, { onConflict: 'facility_id,time_category,child_category' })

    const { error: feeError } = await supabase
      .from('facilities')
      .update({ daytime_transport_fee: parseInt(fee || '0', 10) || 0 })
      .eq('id', facilityId)

    setSaving(false)
    if (rateError || feeError) {
      setError((rateError ?? feeError)!.message)
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">単位数表（利用時間区分 × 児区分）</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500">
                <th className="py-2 text-left font-medium">利用時間</th>
                {CHILD_CATEGORIES.map((c) => (
                  <th key={c} className="w-24 py-2 text-center font-medium">
                    児区分{c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {TIME_CATEGORIES.map((t) => (
                <tr key={t}>
                  <td className="py-2 text-gray-700">{TIME_CATEGORY_LABEL[t]}</td>
                  {CHILD_CATEGORIES.map((c) => (
                    <td key={c} className="py-1.5 text-center">
                      <input
                        type="number"
                        min="0"
                        value={values[`${t}-${c}`]}
                        onChange={(e) => setValues((p) => ({ ...p, [`${t}-${c}`]: e.target.value }))}
                        className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-right text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          単位数 × 単位数単価（{unitPrice}円）の1割が利用者負担になります。
          例：児区分3で1時間利用 → 235単位 → 総額2,350円 → 自己負担235円
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">送迎費（片道あたり）</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-right text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-600">円</span>
        </div>
        <p className="mt-1 text-xs text-gray-400">往復の場合は2回分（片道 × 2）を請求します。</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? '保存中...' : '保存する'}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <Check className="h-4 w-4" />
            保存しました
          </span>
        )}
      </div>
    </div>
  )
}
