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
}

interface Props {
  items: ServiceItemRow[]
}

export function ServiceCodeForm({ items }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [codes, setCodes] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.billing_code ?? ''])),
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    setErrors([])

    const invalid = items
      .filter((i) => codes[i.id] && !/^[0-9A-Z]{6}$/.test(codes[i.id]))
      .map((i) => `${i.name}: 「${codes[i.id]}」は6桁の半角英数字ではありません`)
    if (invalid.length > 0) {
      setErrors(invalid)
      setSaving(false)
      return
    }

    const failed: string[] = []
    for (const item of items) {
      const next = codes[item.id] ? codes[item.id].toUpperCase() : null
      if (next === (item.billing_code ?? null)) continue
      const { error } = await supabase
        .from('billing_service_items')
        .update({ billing_code: next })
        .eq('id', item.id)
      if (error) failed.push(`${item.name}: ${error.message}`)
    }

    setSaving(false)
    if (failed.length > 0) {
      setErrors(failed)
      return
    }
    setMessage('保存しました')
    router.refresh()
  }

  const basicMissing = items.some((i) => i.trigger_field === 'basic' && !codes[i.id])

  return (
    <div className="space-y-3">
      {basicMissing && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          基本報酬のサービスコードが未設定です。設定するまで、このユニットの請求データには国保連サービスコードが入りません。
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 truncate">{item.name}</p>
              <Badge variant="secondary" className="text-xs mt-0.5">{item.category}</Badge>
            </div>
            <Input
              value={codes[item.id] ?? ''}
              onChange={(e) => setCodes((prev) => ({ ...prev, [item.id]: e.target.value.toUpperCase() }))}
              placeholder="631111"
              maxLength={6}
              className="w-32 font-mono"
            />
          </div>
        ))}
      </div>

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

      {items.length === 0 && (
        <p className="text-sm text-gray-400">
          このユニットにはサービス項目が登録されていません。国保連請求 → 児童別の月次実績画面で項目を作成してください。
        </p>
      )}
    </div>
  )
}
