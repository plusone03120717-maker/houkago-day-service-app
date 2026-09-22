'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save } from 'lucide-react'
import {
  additionGroup,
  additionsForServiceType,
  type FacilityAdditionDef,
} from '@/lib/billing/facility-additions'

export type UnitAdditionSettingRow = {
  unit_id: string
  addition_key: string
  option_value: string | null
  unit_count: number
  rate: number | string | null
  billing_code: string | null
}

interface Props {
  unitId: string
  serviceType: string
  settings: UnitAdditionSettingRow[]
}

type FieldState = { option: string; value: string; code: string }

const CODE_PATTERN = /^[0-9A-Z]{6}$/

/** 率で算定するもの（減算・処遇改善加算）は「％」、それ以外は「単位数」を入力する */
function isRateBased(def: FacilityAdditionDef): boolean {
  return def.calc === 'deduction' || def.calc === 'treatment'
}

const GROUP_ORDER: Array<'加算' | '減算' | '処遇改善加算'> = ['加算', '減算', '処遇改善加算']

const GROUP_HINT: Record<string, string> = {
  加算: '利用日ごと（基本報酬を算定した日数分）に自動で加算します。1日あたりの単位数を入力してください。',
  減算: '基本報酬の単位数に対する割合でマイナス計上します。該当しない場合は「なし」のままにしてください。',
  処遇改善加算: '基本報酬＋加算−減算の合計に、届出区分の加算率をかけた単位数を月1行で計上します。',
}

export function FacilityAdditionForm({ unitId, serviceType, settings }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const defs = additionsForServiceType(serviceType)
  const settingMap = new Map(settings.map((s) => [s.addition_key, s]))

  const [fields, setFields] = useState<Record<string, FieldState>>(
    Object.fromEntries(
      defs.map((def) => {
        const s = settingMap.get(def.key)
        const rate = s?.rate == null ? '' : String(Number(s.rate))
        const units = s && s.unit_count > 0 ? String(s.unit_count) : ''
        return [def.key, {
          option: s?.option_value ?? '',
          value: isRateBased(def) ? rate : units,
          code: s?.billing_code ?? '',
        }]
      }),
    ),
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  const setField = (key: string, patch: Partial<FieldState>) =>
    setFields((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  /** 区分を選んだら、初期値のある減算率・加算率を空欄のときだけ補う */
  const changeOption = (def: FacilityAdditionDef, option: string) => {
    const current = fields[def.key]
    const defaultRate = def.options.find((o) => o.value === option)?.defaultRate
    const nextValue =
      isRateBased(def) && option !== '' && current.value === '' && defaultRate != null
        ? String(defaultRate)
        : current.value
    setField(def.key, { option, value: nextValue })
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    setErrors([])

    const invalid: string[] = []
    for (const def of defs) {
      const f = fields[def.key]
      if (!f.option) continue
      if (f.code && !CODE_PATTERN.test(f.code)) {
        invalid.push(`${def.label}: サービスコード「${f.code}」は6桁の半角英数字ではありません`)
      }
      if (f.value !== '') {
        const n = Number(f.value)
        if (!Number.isFinite(n) || n < 0) {
          invalid.push(`${def.label}: ${isRateBased(def) ? '率' : '単位数'}「${f.value}」は0以上の数値で入力してください`)
        } else if (!isRateBased(def) && !Number.isInteger(n)) {
          invalid.push(`${def.label}: 単位数「${f.value}」は整数で入力してください`)
        }
      }
    }
    if (invalid.length > 0) {
      setErrors(invalid)
      setSaving(false)
      return
    }

    const payload = defs.map((def) => {
      const f = fields[def.key]
      const numeric = f.value === '' ? null : Number(f.value)
      return {
        unit_id: unitId,
        addition_key: def.key,
        option_value: f.option || null,
        unit_count: !isRateBased(def) && numeric != null ? Math.trunc(numeric) : 0,
        rate: isRateBased(def) ? numeric : null,
        billing_code: f.code ? f.code.toUpperCase() : null,
      }
    })

    const { error } = await supabase
      .from('unit_addition_settings')
      .upsert(payload, { onConflict: 'unit_id,addition_key' })

    setSaving(false)
    if (error) {
      setErrors([error.message])
      return
    }
    setMessage('保存しました。請求明細画面の「出席実績から再集計」で反映されます')
    router.refresh()
  }

  return (
    <div className="space-y-5">
      {GROUP_ORDER.map((group) => {
        const groupDefs = defs.filter((d) => additionGroup(d) === group)
        if (groupDefs.length === 0) return null
        return (
          <div key={group} className="space-y-2">
            <p className="text-sm font-medium text-gray-900">{group}</p>
            <p className="text-xs text-gray-400">{GROUP_HINT[group]}</p>
            <div className="space-y-2">
              {groupDefs.map((def) => {
                const f = fields[def.key]
                const active = f.option !== ''
                return (
                  <div key={def.key} className="border-b border-gray-100 pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-gray-900 flex-1 min-w-[12rem]">{def.label}</p>
                      <select
                        value={f.option}
                        onChange={(e) => changeOption(def, e.target.value)}
                        className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
                      >
                        <option value="">なし</option>
                        {def.options.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          step={isRateBased(def) ? '0.1' : '1'}
                          value={f.value}
                          onChange={(e) => setField(def.key, { value: e.target.value })}
                          disabled={!active}
                          placeholder={isRateBased(def) ? '率' : '単位数'}
                          className="w-24 text-right"
                        />
                        <span className="text-xs text-gray-400 w-8">
                          {isRateBased(def) ? '％' : '単位'}
                        </span>
                      </div>
                      <Input
                        value={f.code}
                        onChange={(e) => setField(def.key, { code: e.target.value.toUpperCase() })}
                        disabled={!active}
                        placeholder="サービスコード"
                        maxLength={6}
                        className="w-36 font-mono"
                      />
                    </div>
                    {def.note && (
                      <p className="text-xs text-gray-400 mt-1">{def.note}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

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
