'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save } from 'lucide-react'

interface Props {
  childId: string
  initial?: {
    id?: string
    start_date?: string
    facility_name?: string
  }
}

export function LimitManagementForm({ childId, initial }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    start_date: initial?.start_date ?? '',
    facility_name: initial?.facility_name ?? '',
  })

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.start_date || !form.facility_name.trim()) {
      setError('適用開始年月日・上限管理事業所名は必須です')
      return
    }
    setSaving(true)
    setError('')

    const payload = {
      child_id: childId,
      start_date: form.start_date,
      facility_name: form.facility_name.trim(),
    }

    if (initial?.id) {
      const { error: e } = await supabase
        .from('child_limit_management')
        .update(payload)
        .eq('id', initial.id)
      if (e) { setError(e.message); setSaving(false); return }
    } else {
      const { error: e } = await supabase
        .from('child_limit_management')
        .insert(payload)
      if (e) { setError(e.message); setSaving(false); return }
    }

    setSaving(false)
    startTransition(() => router.push(`/children/${childId}`))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">適用開始年月日 *</label>
          <input
            type="date"
            value={form.start_date}
            onChange={set('start_date')}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">上限管理事業所名 *</label>
        <Input
          value={form.facility_name}
          onChange={set('facility_name')}
          placeholder="例: ○○障害児通所支援事業所"
          required
        />
      </div>

      <Button type="submit" disabled={saving}>
        <Save className="h-4 w-4" />
        {saving ? '保存中...' : initial?.id ? '変更を保存' : '上限管理事業所を登録'}
      </Button>
    </form>
  )
}
