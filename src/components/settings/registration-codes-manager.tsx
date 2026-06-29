'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Copy, Check, Loader2, Plus } from 'lucide-react'

type CodeRow = {
  code: string
  child_id: string
  used: boolean
  created_at: string
  children: { id: string; name: string } | null
}

type Child = { id: string; name: string }

type Props = {
  codes: CodeRow[]
  children: Child[]
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function RegistrationCodesManager({ codes, children }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selectedChildId, setSelectedChildId] = useState('')
  const [creating, setCreating] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!selectedChildId) return
    setCreating(true)
    setError(null)

    const code = randomCode()

    const res = await fetch('/api/liff/registration-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ childId: selectedChildId, code }),
    })
    const json = await res.json() as { error?: string }

    if (!res.ok) {
      setError(json.error ?? 'エラーが発生しました')
    } else {
      setSelectedChildId('')
      startTransition(() => router.refresh())
    }
    setCreating(false)
  }

  async function handleCopy(code: string) {
    await navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-gray-900">登録コード発行</h1>
      <p className="text-sm text-gray-500">
        保護者がLINEで初回登録する際に使用するワンタイムコードを発行します。コードをお子さんの保護者にお伝えください。
      </p>

      {/* 発行フォーム */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <p className="text-sm font-semibold text-gray-700 mb-3">新しいコードを発行</p>
        <div className="flex gap-3">
          <select
            value={selectedChildId}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">児童を選択してください</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={!selectedChildId || creating}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            発行
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      {/* コード一覧 */}
      <div className="space-y-2">
        {codes.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-gray-100 text-sm">
            発行済みのコードはありません
          </div>
        ) : (
          codes.map((row) => (
            <div
              key={row.code}
              className={`bg-white rounded-xl px-4 py-3 shadow-sm border flex items-center gap-3 ${
                row.used ? 'border-gray-100 opacity-60' : 'border-gray-200'
              }`}
            >
              <KeyRound className="h-5 w-5 text-indigo-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-gray-900 tracking-widest">
                    {row.code}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      row.used
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {row.used ? '使用済み' : '未使用'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {row.children?.name ?? '不明'} ·{' '}
                  {new Date(row.created_at).toLocaleDateString('ja-JP')}
                </p>
              </div>
              {!row.used && (
                <button
                  onClick={() => handleCopy(row.code)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  title="コードをコピー"
                >
                  {copiedCode === row.code ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
