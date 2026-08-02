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
    upper_limit_manager?: string
    decision_service_code?: string
    contract_amount?: number
    contract_start_date?: string
    contract_end_date?: string
    contract_line_number?: number
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
    upper_limit_manager: initial?.upper_limit_manager ?? '',
    decision_service_code: initial?.decision_service_code ?? '631000',
    contract_amount: initial?.contract_amount != null ? String(initial.contract_amount) : '',
    contract_start_date: initial?.contract_start_date ?? '',
    contract_end_date: initial?.contract_end_date ?? '',
    contract_line_number: String(initial?.contract_line_number ?? 1),
  })

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
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
      upper_limit_manager: form.upper_limit_manager || null,
      decision_service_code: form.decision_service_code || '631000',
      contract_amount: form.contract_amount ? parseInt(form.contract_amount) : null,
      contract_start_date: form.contract_start_date || null,
      contract_end_date: form.contract_end_date || null,
      contract_line_number: parseInt(form.contract_line_number) || 1,
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

      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">上限管理事業所</label>
        <Input
          value={form.upper_limit_manager}
          onChange={set('upper_limit_manager')}
          placeholder="例: ○○放課後デイサービス"
        />
        <p className="text-xs text-gray-400 mt-1">上限管理を行う事業所名を入力してください（任意）</p>
      </div>

      <div className="pt-4 border-t border-gray-100">
        <p className="text-sm font-semibold text-gray-900 mb-1">契約情報（国保連請求用）</p>
        <p className="text-xs text-gray-400 mb-3">
          受給者証の事業者記入欄の内容を入力してください。国保連請求CSVの契約情報レコードに使用されます。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">決定サービスコード</label>
            <Input
              value={form.decision_service_code}
              onChange={set('decision_service_code')}
              placeholder="631000"
              maxLength={6}
            />
            <p className="text-xs text-gray-400 mt-1">631000=放デイ基本決定 / 632000=重心 / 633000〜=医ケア児</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">契約支給量（日数）</label>
            <Input
              type="number"
              value={form.contract_amount}
              onChange={set('contract_amount')}
              min={1}
              max={31}
              placeholder="未入力時は月の給付量を使用"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">契約開始日</label>
            <input
              type="date"
              value={form.contract_start_date}
              onChange={set('contract_start_date')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">契約終了日</label>
            <input
              type="date"
              value={form.contract_end_date}
              onChange={set('contract_end_date')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">事業者記入欄番号</label>
            <Input
              type="number"
              value={form.contract_line_number}
              onChange={set('contract_line_number')}
              min={1}
              max={99}
            />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={saving}>
        <Save className="h-4 w-4" />
        {saving ? '保存中...' : initial?.id ? '変更を保存' : '受給者証を登録'}
      </Button>
    </form>
  )
}
