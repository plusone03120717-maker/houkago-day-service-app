'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'

type Props = {
  billingDetailId: string
  initialConfirmed: boolean
}

export function BillingConfirmToggle({ billingDetailId, initialConfirmed }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [confirmed, setConfirmed] = useState(initialConfirmed)
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()

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
    if (error) {
      alert(`確定状態を保存できませんでした: ${error.message}`)
      setSaving(false)
      return
    }
    setConfirmed(next)
    setSaving(false)
    // クライアントのルーターキャッシュを破棄する。
    // これがないと「明細を見る」等で遷移して戻ったとき、確定前の
    // キャッシュ済みページが再表示されて全員が未確定に見えてしまう。
    startTransition(() => router.refresh())
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
