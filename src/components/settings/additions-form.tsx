'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-react'

type AdditionType = {
  readonly key: string
  readonly label: string
  readonly rate: number
}

type AdditionSetting = {
  unit_id: string
  addition_type: string
  enabled: boolean
  custom_rate: number | null
}

interface Props {
  unitId: string
  additionTypes: readonly AdditionType[]
  initialSettings: Record<string, AdditionSetting>
}

export function AdditionsForm({ unitId, additionTypes, initialSettings }: Props) {
  const supabase = createClient()

  const [settings, setSettings] = useState<Record<string, { enabled: boolean; customRate: string }>>(
    () => Object.fromEntries(
      additionTypes.map((t) => [
        t.key,
        {
          enabled: initialSettings[t.key]?.enabled ?? false,
          customRate: String(initialSettings[t.key]?.custom_rate ?? t.rate),
        },
      ])
    )
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const toggleEnabled = (key: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }))
    setSaved(false)
  }

  const setRate = (key: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], customRate: value },
    }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    const upsertData = additionTypes.map((t) => ({
      unit_id: unitId,
      addition_type: t.key,
      enabled: settings[t.key]?.enabled ?? false,
      custom_rate: parseFloat(settings[t.key]?.customRate ?? '0') || t.rate,
    }))

    await supabase
      .from('addition_settings')
      .upsert(upsertData, { onConflict: 'unit_id,addition_type' })

    setSaving(false)
    setSaved(true)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {additionTypes.map((t) => {
          const s = settings[t.key]
          return (
            <div
              key={t.key}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                s?.enabled ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={s?.enabled ?? false}
                onChange={() => toggleEnabled(t.key)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${s?.enabled ? 'text-indigo-900' : 'text-gray-600'}`}>
                  {t.label}
                </p>
              </div>
              {t.rate > 0 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <input
                    type="number"
                    value={s?.customRate ?? t.rate}
                    onChange={(e) => setRate(t.key, e.target.value)}
                    disabled={!s?.enabled}
                    step={0.1}
                    min={0}
                    className="w-16 border border-gray-300 rounded px-2 py-1 text-xs text-right disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-gray-500">%</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save className="h-4 w-4" />
          {saving ? '保存中...' : '設定を保存'}
        </Button>
        {saved && <span className="text-xs text-green-600">保存しました</span>}
      </div>
    </div>
  )
}
