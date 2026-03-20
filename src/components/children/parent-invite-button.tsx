'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { UserPlus, X, Check, AlertTriangle, Copy } from 'lucide-react'

interface Props {
  childId: string
  childName: string
}

export function ParentInviteButton({ childId, childName }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginCode, setLoginCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim() || !password.trim()) return
    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/parents/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), childId, password }),
      })
      const json = await res.json() as { success?: boolean; loginCode?: string; error?: string }
      if (res.ok && json.success && json.loginCode) {
        setLoginCode(json.loginCode)
        setName('')
        setPassword('')
      } else {
        setError(json.error ?? 'アカウント作成に失敗しました')
      }
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (!loginCode) return
    navigator.clipboard.writeText(loginCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    setOpen(false)
    setLoginCode(null)
    setError(null)
    setName('')
    setPassword('')
  }

  return (
    <div>
      <Button variant="outline" size="sm" onClick={() => { setOpen(true); setLoginCode(null); setError(null) }}>
        <UserPlus className="h-4 w-4" />
        保護者アカウント登録
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">保護者アカウント登録</h2>
              <button onClick={handleClose} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            {loginCode ? (
              /* 作成完了画面 */
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg text-green-700 text-sm">
                  <Check className="h-4 w-4 flex-shrink-0" />
                  アカウントを作成しました
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                  <p className="text-xs font-medium text-gray-500">保護者に伝えるログイン情報</p>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-gray-500">ログインコード</p>
                      <p className="text-lg font-bold text-indigo-600 tracking-widest">{loginCode}</p>
                    </div>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copied ? 'コピー済' : 'コピー'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">※ このコードとパスワードを保護者に口頭・書面で伝えてください</p>
                </div>
                <Button size="sm" className="w-full" onClick={handleClose}>閉じる</Button>
              </div>
            ) : (
              /* 入力フォーム */
              <>
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{childName}</span> の保護者アカウントを作成します。
                  メールアドレス不要で登録できます。
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

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-red-50 text-red-700">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    {error}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={handleClose}>
                    閉じる
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={loading || !name.trim() || !password.trim()}
                    onClick={handleSubmit}
                  >
                    {loading ? '作成中...' : 'アカウントを作成'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
