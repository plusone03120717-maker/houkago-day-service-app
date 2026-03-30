'use client'

import { useState, useTransition } from 'react'
import { Pencil, Check, X, AlertCircle } from 'lucide-react'
import { updateBillingDetail } from '@/app/actions/billing'

type Detail = {
  id: string
  child_id: string
  total_days: number
  total_units: number
  service_code: string | null
  unit_price: number
  copay_amount: number
  billed_amount: number
  errors: string[]
  children: { name: string; name_kana: string | null } | null
}

export function BillingDetailRow({ detail, onUpdated }: { detail: Detail; onUpdated: (updated: Detail) => void }) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    total_days: detail.total_days,
    total_units: detail.total_units,
    unit_price: detail.unit_price,
    billed_amount: detail.billed_amount,
    copay_amount: detail.copay_amount,
    service_code: detail.service_code ?? '',
  })
  const [error, setError] = useState('')

  const handleSave = () => {
    setError('')
    startTransition(async () => {
      const result = await updateBillingDetail(detail.id, {
        total_days: Number(form.total_days),
        total_units: Number(form.total_units),
        unit_price: Number(form.unit_price),
        billed_amount: Number(form.billed_amount),
        copay_amount: Number(form.copay_amount),
        service_code: form.service_code,
      })
      if (result.error) {
        setError(result.error)
      } else {
        onUpdated({ ...detail, ...form, service_code: form.service_code || null })
        setEditing(false)
      }
    })
  }

  const handleCancel = () => {
    setForm({
      total_days: detail.total_days,
      total_units: detail.total_units,
      unit_price: detail.unit_price,
      billed_amount: detail.billed_amount,
      copay_amount: detail.copay_amount,
      service_code: detail.service_code ?? '',
    })
    setError('')
    setEditing(false)
  }

  const num = (field: keyof typeof form) => (
    <input
      type="number"
      min={0}
      value={form[field]}
      onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.value as unknown as number }))}
      className="w-24 text-right border border-indigo-300 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
    />
  )

  if (editing) {
    return (
      <>
        <tr className="border-b border-gray-100 bg-indigo-50">
          <td className="py-2 pr-3">
            <div>
              <p className="font-medium text-sm">{detail.children?.name ?? '—'}</p>
              <input
                value={form.service_code}
                onChange={(e) => setForm((p) => ({ ...p, service_code: e.target.value }))}
                placeholder="サービスコード"
                className="mt-0.5 w-full border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </td>
          <td className="text-right py-2 px-3">{num('total_days')}</td>
          <td className="text-right py-2 px-3">{num('total_units')}</td>
          <td className="text-right py-2 px-3">{num('unit_price')}</td>
          <td className="text-right py-2 px-3">{num('billed_amount')}</td>
          <td className="text-right py-2 pl-3">{num('copay_amount')}</td>
          <td className="py-2 pl-2">
            <div className="flex gap-1">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="p-1 rounded text-green-600 hover:bg-green-100 disabled:opacity-50"
                title="保存"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={handleCancel}
                className="p-1 rounded text-gray-400 hover:bg-gray-100"
                title="キャンセル"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </td>
        </tr>
        {error && (
          <tr>
            <td colSpan={7} className="px-3 pb-2 text-xs text-red-600">{error}</td>
          </tr>
        )}
      </>
    )
  }

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-2 pr-3 font-medium text-sm">
        <div>
          <span>{detail.children?.name ?? '—'}</span>
          {Array.isArray(detail.errors) && detail.errors.length > 0 && (
            <AlertCircle className="inline h-3 w-3 ml-1 text-red-500" />
          )}
          {detail.service_code && (
            <span className="ml-1.5 text-xs text-gray-400">({detail.service_code})</span>
          )}
        </div>
      </td>
      <td className="text-right py-2 px-3 text-sm">{detail.total_days}日</td>
      <td className="text-right py-2 px-3 text-sm">{detail.total_units.toLocaleString()}</td>
      <td className="text-right py-2 px-3 text-sm">{detail.unit_price.toLocaleString()}円</td>
      <td className="text-right py-2 px-3 text-sm font-medium text-indigo-600">
        {detail.billed_amount.toLocaleString()}円
      </td>
      <td className="text-right py-2 pl-3 text-sm text-orange-600">
        {detail.copay_amount.toLocaleString()}円
      </td>
      <td className="py-2 pl-2">
        <button
          onClick={() => setEditing(true)}
          className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
          title="編集"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}
