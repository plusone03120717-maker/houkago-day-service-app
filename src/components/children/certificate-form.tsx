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
    certificate_number?: string
    service_type?: string
    start_date?: string
    end_date?: string
    max_days_per_month?: number
    copay_limit?: number
    copay_category?: string
    municipality?: string
  }
}

export function CertificateForm({ childId, initial }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    certificate_number: initial?.certificate_number ?? '',
    service_type: initial?.service_type ?? 'afterschool',
    start_date: initial?.start_date ?? '',
    end_date: initial?.end_date ?? '',
    max_days_per_month: String(initial?.max_days_per_month ?? 23),
    copay_limit: String(initial?.copay_limit ?? 0),
    copay_category: initial?.copay_category ?? '',
    municipality: initial?.municipality ?? '',
  })

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.certificate_number || !form.start_date || !form.end_date) {
      setError('受給者証番号・有効期間は必須です')
      return
    }
    setSaving(true)
    setError('')

    const payload = {
      child_id: childId,
      certificate_number: form.certificate_number,
      service_type: form.service_type,
      start_date: form.start_date,
      end_date: form.end_date,
      max_days_per_month: parseInt(form.max_days_per_month) || 23,
      copay_limit: parseInt(form.copay_limit) || 0,
      copay_category: form.copay_category || null,
      municipality: form.municipality || null,
    }

    if (initial?.id) {
      const { error: e } = await supabase.from('benefit_certificates').update(payload).eq('id', initial.id)
      if (e) { setError(e.message); setSaving(false); return }
    } else {
      const { error: e } = await supabase.from('benefit_certificates').insert(payload)
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
          <label className="text-xs font-medium text-gray-700 mb-1 block">受給者証番号 *</label>
          <Input
            value={form.certificate_number}
            onChange={set('certificate_number')}
            placeholder="0000000000"
            required
            maxLength={10}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">サービス種別</label>
          <select
            value={form.service_type}
            onChange={set('service_type')}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="afterschool">放課後等デイサービス</option>
            <option value="development_support">児童発達支援</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">有効期間 開始日 *</label>
          <input
            type="date"
            value={form.start_date}
            onChange={set('start_date')}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">有効期間 終了日 *</label>
          <input
            type="date"
            value={form.end_date}
            onChange={set('end_date')}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">月の給付量（日数）</label>
          <Input
            type="number"
            value={form.max_days_per_month}
            onChange={set('max_days_per_month')}
            min={1}
            max={31}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">負担上限月額（円）</label>
          <Input
            type="number"
            value={form.copay_limit}
            onChange={set('copay_limit')}
            min={0}
            step={100}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">負担上限月額の区分</label>
          <Input
            value={form.copay_category}
            onChange={set('copay_category')}
            placeholder="例: 区分1"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">支給決定自治体（市区町村番号）</label>
          <Input
            value={form.municipality}
            onChange={set('municipality')}
            placeholder="例: 131016"
          />
        </div>
      </div>

      <Button type="submit" disabled={saving}>
        <Save className="h-4 w-4" />
        {saving ? '保存中...' : initial?.id ? '変更を保存' : '受給者証を登録'}
      </Button>
    </form>
  )
}
