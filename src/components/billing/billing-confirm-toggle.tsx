'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'

type Props = {
  billingDetailId: string
  initialConfirmed: boolean
}

export function BillingConfirmToggle({ billingDetailId, initialConfirmed }: Props) {
  const supabase = createClient()
  const [confirmed, setConfirmed] = useState(initialConfirmed)
  const [saving, setSaving] = useState(false)

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (saving) return
    setSaving(true)
    const next = !confirmed
    const { error } = await supabase
      .from('billing_details')
      .update({ is_confirmed: next })
      .eq('id', billingDetailId)
    if (!error) setConfirmed(next)
    setSaving(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title={confirmed ? '確定済み（クリックで取消）' : 'クリックで確定'}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors border ${
        confirmed
          ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'
          : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
      }`}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : confirmed ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <Circle className="h-3.5 w-3.5" />
      )}
      {confirmed ? '確定済' : '未確定'}
    </button>
  )
}
