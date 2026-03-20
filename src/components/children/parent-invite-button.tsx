'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { UserPlus, X, Check, AlertTriangle } from 'lucide-react'

interface Props {
  childId: string
  childName: string
}

export function ParentInviteButton({ childId, childName }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) return
    if (password.length < 8) {
      setResult({ ok: false, message: 'パスワードは8文字以上で入力してください' })
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/parents/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), childId, password }),
      })
      const json = await res.json() as { success?: boolean; resent?: boolean; error?: string }
      if (res.ok && json.success) {
        setResult({ ok: true, message: `${email} のアカウントを作成しました。ログイン情報を保護者に伝えてください。` })
        setName('')
        setEmail('')
        setPassword('')
      } else {
        setResult({ ok: false, message: json.error ?? '招待に失敗しました' })
      }
    } catch {
      setResult({ ok: false, message: '通信エラーが発生しました' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Button variant="outline" size="sm" onClick={() => { setOpen(true); setResult(null) }}>
        <UserPlus className="h-4 w-4" />
        保護者アカウント招待
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">保護者アカウント招待</h2>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{childName}</span> の保護者にアカウントを招待します。
              入力したメールアドレスに招待メールが届きます。
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  保護者名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例：山田 花子"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  メールアドレス <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@mail.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  初期パスワード <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8文字以上"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-400 mt-1">保護者に口頭・書面で伝えてください</p>
              </div>
            </div>

            {result && (
              <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {result.ok
                  ? <Check className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  : <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                }
                {result.message}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setOpen(false)}>
                閉じる
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={loading || !name.trim() || !email.trim() || !password.trim()}
                onClick={handleSubmit}
              >
                {loading ? '送信中...' : '招待メールを送信'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
