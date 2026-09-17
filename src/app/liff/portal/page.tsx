'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLiff } from '@/hooks/use-liff'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle } from 'lucide-react'

type Status = 'working' | 'notRegistered' | 'noPortalAccount' | 'error'

type Outcome = { status: Status | 'done'; message?: string }

/**
 * LINEのアクセストークンをポータルのセッションに換える。
 * 画面の状態は一切触らず、結果だけを返す。
 */
async function resolveOutcome(accessToken: string | null): Promise<Outcome> {
  if (!accessToken) {
    return {
      status: 'error',
      message: 'LINEの認証情報を取得できませんでした。LINEアプリから開き直してください',
    }
  }

  try {
    const res = await fetch('/api/liff/portal-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    })
    const json = await res.json() as {
      available?: boolean
      reason?: string
      tokenHash?: string
      error?: string
    }

    if (!res.ok) {
      return { status: 'error', message: json.error ?? 'ポータルに接続できませんでした' }
    }
    if (!json.available || !json.tokenHash) {
      return { status: json.reason === 'notRegistered' ? 'notRegistered' : 'noPortalAccount' }
    }

    // 受け取ったトークンをセッションに換える（ここでログイン状態になる）
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      token_hash: json.tokenHash,
      type: 'magiclink',
    })
    if (error) {
      return { status: 'error', message: `ログインに失敗しました: ${error.message}` }
    }

    return { status: 'done' }
  } catch {
    return { status: 'error', message: '通信エラーが発生しました' }
  }
}

/**
 * LINEから保護者ポータルへ入るための中継ページ。
 *
 * LINEのアクセストークンでポータルのログイン用トークンを受け取り、
 * セッションに換えてから /parent へ送る。保護者はパスワードを入力しなくてよい。
 */
export default function LiffPortalPage() {
  const liffState = useLiff()
  const [status, setStatus] = useState<Status>('working')
  const [message, setMessage] = useState('')

  // 画面の状態更新は必ず非同期の結果を受け取ってから行う
  // （同期的な setState は連鎖レンダリングになるため react-hooks の規則で禁じられている）
  const enterPortal = useCallback(() => {
    if (liffState.status !== 'ready') return
    const accessToken = liffState.liff.getAccessToken()

    resolveOutcome(accessToken).then((outcome) => {
      if (outcome.status === 'done') {
        window.location.replace('/parent')
        return
      }
      setStatus(outcome.status)
      setMessage(outcome.message ?? '')
    })
  }, [liffState])

  useEffect(() => { enterPortal() }, [enterPortal])

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

  if (status === 'notRegistered') {
    return (
      <div className="max-w-sm mx-auto px-6 pt-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">登録が必要です</h1>
        <p className="text-sm text-gray-500 mb-6">
          まずスタッフから登録コードを受け取り、初回登録を行ってください。
        </p>
        <a
          href="/liff/register"
          className="inline-block rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white"
        >
          初回登録ページへ
        </a>
      </div>
    )
  }

  if (status === 'noPortalAccount') {
    return (
      <div className="max-w-sm mx-auto px-6 pt-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">まだご利用いただけません</h1>
        <p className="text-sm text-gray-500 mb-6">
          保護者ポータルの準備ができていません。お手数ですが施設のスタッフにお問い合わせください。
        </p>
        <a
          href="/liff/register?add=1"
          className="inline-block rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700"
        >
          登録コードを入力する
        </a>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="max-w-sm mx-auto px-6 pt-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">接続エラー</h1>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="inline-block rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700"
        >
          もう一度試す
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      <p className="text-sm text-gray-500">保護者ポータルを開いています…</p>
    </div>
  )
}
