'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { UserPlus, X, Check, AlertTriangle, Loader2, Users } from 'lucide-react'

interface Props {
  childId: string
  childName: string
}

type Mode = 'create' | 'link'

type ParentAccount = {
  id: string
  name: string
  loginCode: string
  children: { id: string; name: string }[]
}

export function ParentInviteButton({ childId, childName }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('create')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 兄弟の追加登録用：既存の保護者アカウント一覧
  const [accounts, setAccounts] = useState<ParentAccount[] | null>(null)
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState('')

  const loadAccounts = async () => {
    if (accounts !== null) return
    setAccountsLoading(true)
    try {
      const res = await fetch('/api/parents/invite')
      const json = await res.json() as { accounts?: ParentAccount[]; error?: string }
      if (res.ok && json.accounts) {
        // すでにこの児童が紐付いているアカウントは選ばせない
        setAccounts(json.accounts.filter((a) => !a.children.some((c) => c.id === childId)))
      } else {
        setError(json.error ?? 'アカウント一覧の取得に失敗しました')
      }
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setAccountsLoading(false)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setSuccess(null)
    if (next === 'link') loadAccounts()
  }

  const handleCreate = async () => {
    if (!name.trim() || !password.trim()) return
    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください')
      return
    }
    await submit({ name: name.trim(), childId, password })
  }

  const handleLink = async () => {
    if (!selectedAccountId) return
    await submit({ childId, linkToUserId: selectedAccountId })
  }

  const submit = async (body: Record<string, unknown>) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/parents/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json() as { success?: boolean; mode?: string; error?: string }
      if (res.ok && json.success) {
        setSuccess(
          json.mode === 'linked'
            ? '既存の保護者アカウントにお子さんを追加しました'
            : json.mode === 'linked_via_line'
              ? 'LINE登録済みの保護者アカウントにお子さんを追加しました'
              : json.mode === 'password_updated'
                ? 'この児童の保護者アカウントのパスワードを更新しました'
                : 'アカウントを作成しました'
        )
        setName('')
        setPassword('')
        setSelectedAccountId('')
      } else {
        setError(json.error ?? 'アカウント作成に失敗しました')
      }
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setMode('create')
    setSuccess(null)
    setError(null)
    setName('')
    setPassword('')
    setSelectedAccountId('')
    setAccounts(null)
  }

  const handleOpen = () => {
    reset()
    setOpen(true)
  }

  const handleClose = () => {
    reset()
    setOpen(false)
  }

  return (
    <div>
      <Button variant="outline" size="sm" onClick={handleOpen}>
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

            {success ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg text-green-700 text-sm">
                  <Check className="h-4 w-4 flex-shrink-0" />
                  {success}
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                  <p className="text-xs font-medium text-gray-500">保護者へのログイン案内</p>
                  <p className="text-sm text-gray-700">お子さんの名前：<span className="font-bold">{childName}</span></p>
                  <p className="text-xs text-gray-400 mt-1">※ パスワードは登録時に設定したものを保護者に口頭・書面で伝えてください</p>
                </div>
                <Button size="sm" className="w-full" onClick={handleClose}>閉じる</Button>
              </div>
            ) : (
              <>
                {/* 新規作成 / 既存アカウントに追加 */}
                <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                  <button
                    onClick={() => switchMode('create')}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${
                      mode === 'create' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    新規作成
                  </button>
                  <button
                    onClick={() => switchMode('link')}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${
                      mode === 'link' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    既存アカウントに追加
                  </button>
                </div>

                {mode === 'create' ? (
                  <>
                    <p className="text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{childName}</span> の保護者アカウントを作成します。
                      きょうだいがすでに登録済みの場合は「既存アカウントに追加」を使うと、
                      保護者は1つのログインで全員分を見られます。
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
                          パスワード <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="8文字以上（保護者に伝えてください）"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <p className="text-xs text-gray-400 mt-1">保護者が覚えやすいものを設定し、口頭・書面で伝えてください</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{childName}</span> を、
                      すでにあるきょうだいの保護者アカウントに追加します。
                      保護者は今までのログインのまま、両方のお子さんを見られるようになります。
                    </p>

                    {accountsLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                      </div>
                    ) : accounts && accounts.length > 0 ? (
                      <div className="max-h-56 overflow-y-auto space-y-1.5 border border-gray-100 rounded-lg p-1.5">
                        {accounts.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => setSelectedAccountId(a.id)}
                            className={`w-full text-left rounded-lg border px-3 py-2 ${
                              selectedAccountId === a.id
                                ? 'border-indigo-400 bg-indigo-50'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <p className="text-sm font-medium text-gray-900">{a.name}</p>
                            <p className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                              <Users className="h-3 w-3" />
                              {a.children.length > 0
                                ? a.children.map((c) => c.name).join('・')
                                : '紐付いている児童なし'}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="py-4 text-center text-xs text-gray-400">
                        追加できる保護者アカウントがありません
                      </p>
                    )}
                  </>
                )}

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
                  {mode === 'create' ? (
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={loading || !name.trim() || !password.trim()}
                      onClick={handleCreate}
                    >
                      {loading ? '作成中...' : 'アカウントを作成'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={loading || !selectedAccountId}
                      onClick={handleLink}
                    >
                      {loading ? '追加中...' : 'このアカウントに追加'}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
