'use client'

import { useState } from 'react'
import { KeyRound, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  userId: string
  staffName: string
  email: string
}

export function ResetStaffPasswordButton({ userId, staffName, email }: Props) {
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleReset = async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/staff/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setError(json.error ?? 'パスワードの再発行に失敗しました')
      return
    }
    setTempPassword(json.tempPassword)
    setConfirm(false)
  }

  const handleCopy = async () => {
    if (!tempPassword) return
    await navigator.clipboard.writeText(`メールアドレス: ${email}\n仮パスワード: ${tempPassword}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 発行済み表示
  if (tempPassword) {
    return (
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-indigo-700">
          <KeyRound className="h-4 w-4" />
          パスワードを再発行しました
        </div>
        <p className="text-xs text-indigo-600">
          以下のログイン情報を {staffName} さんにお伝えください。
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-28 shrink-0">メールアドレス</span>
            <span className="text-sm font-mono text-gray-800 flex-1">{email}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-28 shrink-0">仮パスワード</span>
            <span className="text-sm font-mono font-bold text-gray-900 flex-1 tracking-widest">{tempPassword}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="shrink-0 border-indigo-300 text-indigo-700 hover:bg-indigo-100"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'コピー済' : 'コピー'}
            </Button>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setTempPassword(null)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          確認しました
        </Button>
      </div>
    )
  }

  // 確認ダイアログ
  if (confirm) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
        <p className="text-sm font-medium text-amber-700">
          {staffName} の仮パスワードを再発行しますか？
        </p>
        <p className="text-xs text-amber-600">
          現在のパスワードは無効になります。新しい仮パスワードをスタッフにお伝えください。
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleReset}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {loading ? '処理中...' : '再発行する'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirm(false)}
            disabled={loading}
          >
            キャンセル
          </Button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      className="flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-800 transition-colors"
    >
      <KeyRound className="h-4 w-4" />
      仮パスワードを再発行
    </button>
  )
}
