'use client'

import { useState } from 'react'
import { useLiff } from '@/hooks/use-liff'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export default function LiffRegisterPage() {
  const liffState = useLiff()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (liffState.status !== 'ready') return
    setSubmitting(true)
    setResult(null)

    try {
      const idToken = liffState.liff.getIDToken()
      const res = await fetch('/api/liff/verify-and-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, code: code.trim().toUpperCase() }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) {
        setErrorMessage(json.error ?? '登録に失敗しました')
        setResult('error')
      } else {
        setResult('success')
        setCode('')
      }
    } catch {
      setErrorMessage('通信エラーが発生しました')
      setResult('error')
    } finally {
      setSubmitting(false)
    }
  }

  if (liffState.status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (liffState.status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="text-center text-red-600">
          <AlertCircle className="h-10 w-10 mx-auto mb-2" />
          <p className="text-sm">{liffState.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto px-6 pt-12 pb-8">
      <div className="text-center mb-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1">初回登録</h1>
        <p className="text-sm text-gray-500">
          スタッフから受け取った登録コードを入力してください
        </p>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        こんにちは、{liffState.displayName}さん
      </p>

      {result === 'success' && (
        <div className="mb-4 rounded-xl bg-green-50 p-4 flex gap-3 items-start">
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-800">登録完了しました</p>
            <p className="text-xs text-green-600 mt-1">
              別のお子さんの登録コードがある場合は続けて入力できます
            </p>
          </div>
        </div>
      )}

      {result === 'error' && (
        <div className="mb-4 rounded-xl bg-red-50 p-4 flex gap-3 items-start">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            登録コード
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="例: ABC123"
            maxLength={20}
            required
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !code.trim()}
          className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          登録する
        </button>
      </form>

      {result === 'success' && (
        <div className="mt-6 text-center">
          <a
            href="/liff/attendance"
            className="text-sm text-indigo-600 font-medium underline"
          >
            利用連絡ページへ進む →
          </a>
        </div>
      )}
    </div>
  )
}
