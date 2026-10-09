'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLiff } from '@/hooks/use-liff'
import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react'

type Mode = 'request' | 'code'
type Pending = { childNameKana: string; birthDate: string }

/** 年の選択肢に添える和暦（平成31年＝令和元年は令和で表す） */
function wareki(year: number): string {
  if (year >= 2019) return year === 2019 ? '令和元年' : `令和${year - 2018}年`
  return `平成${year - 1988}年`
}

function formatBirthDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}年${m}月${d}日`
}

export default function LiffRegisterPage() {
  const liffState = useLiff()
  const [mode, setMode] = useState<Mode>('request')
  // 登録済み判定が終わるまでフォームを出さない（登録済みなら利用連絡ページへ転送する）
  const [checking, setChecking] = useState(true)
  const [pending, setPending] = useState<Pending | null>(null)
  const [editing, setEditing] = useState(false)

  // 申請フォーム
  const [nameKana, setNameKana] = useState('')
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')

  // 登録コードフォーム（コードを受け取った保護者向けに残している）
  const [code, setCode] = useState('')
  const [codeSuccess, setCodeSuccess] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // 登録済みかを確認し、済んでいれば保護者ポータルへ転送する。
  // ?add=1 が付いている場合はコードでの追加登録なので転送せず、コード入力を開く。
  const checkRegistered = useCallback(async () => {
    if (liffState.status !== 'ready') return
    const accessToken = liffState.liff.getAccessToken()
    if (!accessToken) { setChecking(false); return }

    const isAdding = new URLSearchParams(window.location.search).get('add') === '1'
    if (isAdding) { setMode('code'); setChecking(false); return }

    try {
      const res = await fetch('/api/liff/guardian-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      })
      const json = await res.json() as { registered?: boolean; pending?: Pending | null }
      if (res.ok && json.registered) {
        window.location.replace('/liff/portal')
        return
      }
      if (res.ok && json.pending) setPending(json.pending)
    } catch {
      // 判定に失敗した場合は申請フォームを表示する
    }
    setChecking(false)
  }, [liffState])

  useEffect(() => { checkRegistered() }, [checkRegistered])

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault()
    if (liffState.status !== 'ready') return
    const accessToken = liffState.liff.getAccessToken()
    if (!accessToken) {
      setErrorMessage('LINEの認証情報を取得できませんでした。LINEアプリから開き直してください')
      return
    }
    const birthDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    setSubmitting(true)
    setErrorMessage('')
    try {
      const res = await fetch('/api/liff/registration-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          childNameKana: nameKana.trim(),
          birthDate,
          displayName: liffState.displayName,
        }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) {
        setErrorMessage(json.error ?? '申請に失敗しました')
      } else {
        setPending({ childNameKana: nameKana.trim(), birthDate })
        setEditing(false)
      }
    } catch {
      setErrorMessage('通信エラーが発生しました')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault()
    if (liffState.status !== 'ready') return
    setSubmitting(true)
    setErrorMessage('')
    setCodeSuccess(false)

    try {
      const accessToken = liffState.liff.getAccessToken()
      if (!accessToken) {
        setErrorMessage('LINEの認証情報を取得できませんでした。LINEアプリから開き直してください')
        return
      }
      const res = await fetch('/api/liff/verify-and-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // LINEの表示名は、ポータルアカウントを自動で用意するときの名前に使う
        body: JSON.stringify({
          accessToken,
          code: code.trim().toUpperCase(),
          displayName: liffState.displayName,
        }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) {
        setErrorMessage(json.error ?? '登録に失敗しました')
      } else {
        setCodeSuccess(true)
        setCode('')
      }
    } catch {
      setErrorMessage('通信エラーが発生しました')
    } finally {
      setSubmitting(false)
    }
  }

  if (liffState.status === 'loading' || (liffState.status === 'ready' && checking)) {
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

  const errorBox = errorMessage && (
    <div className="mb-4 rounded-xl bg-red-50 p-4 flex gap-3 items-start">
      <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
      <p className="text-sm text-red-700">{errorMessage}</p>
    </div>
  )

  // ── 登録コードで登録する ──
  if (mode === 'code') {
    return (
      <div className="max-w-sm mx-auto px-6 pt-12 pb-8">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-gray-900 mb-1">登録コードで登録</h1>
          <p className="text-sm text-gray-500">
            スタッフから受け取った登録コードを入力してください
          </p>
        </div>

        {codeSuccess && (
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
        {errorBox}

        <form onSubmit={handleCode} className="space-y-4">
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

        {codeSuccess ? (
          <div className="mt-6 text-center">
            <a href="/liff/portal" className="text-sm text-indigo-600 font-medium underline">
              保護者ポータルへ進む →
            </a>
          </div>
        ) : (
          <div className="mt-6 text-center">
            <button
              onClick={() => { setMode('request'); setErrorMessage('') }}
              className="text-sm text-gray-500 underline"
            >
              登録コードをお持ちでない方はこちら
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── 申請済み（施設の確認待ち） ──
  if (pending && !editing) {
    return (
      <div className="max-w-sm mx-auto px-6 pt-12 pb-8 text-center">
        <Clock className="h-12 w-12 mx-auto mb-4 text-indigo-500" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">登録の申請を受け付けました</h1>
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
          施設で確認ができしだい、ご利用いただけるようになります。<br />
          しばらくしてから、もう一度このページを開いてください。
        </p>

        <div className="rounded-xl bg-gray-50 p-4 text-left text-sm mb-6">
          <p className="text-gray-500 text-xs mb-1">申請した内容</p>
          <p className="text-gray-800">お名前：{pending.childNameKana}</p>
          <p className="text-gray-800">生年月日：{formatBirthDate(pending.birthDate)}</p>
        </div>

        <p className="text-xs text-gray-500 mb-6">
          ごきょうだいでご利用の場合も、申請は1人分で大丈夫です。施設でまとめて登録します。
        </p>

        <button
          onClick={() => {
            const [y, m, d] = pending.birthDate.split('-')
            setNameKana(pending.childNameKana)
            setYear(y)
            setMonth(String(Number(m)))
            setDay(String(Number(d)))
            setEditing(true)
          }}
          className="text-sm text-indigo-600 underline"
        >
          内容を直して送り直す
        </button>
      </div>
    )
  }

  // ── 申請フォーム ──
  const thisYear = new Date().getFullYear()
  const years = Array.from({ length: 20 }, (_, i) => thisYear - 1 - i)
  const daysInMonth = year && month ? new Date(Number(year), Number(month), 0).getDate() : 31
  const selectClass =
    'rounded-xl border border-gray-300 bg-white px-2 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div className="max-w-sm mx-auto px-6 pt-12 pb-8">
      <div className="text-center mb-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1">はじめての登録</h1>
        <p className="text-sm text-gray-500">
          お子さまのお名前と生年月日を送ってください。施設で確認して登録します。
        </p>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        こんにちは、{liffState.displayName}さん
      </p>

      {errorBox}

      <form onSubmit={handleRequest} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            お子さまのお名前（ひらがな）
          </label>
          <input
            type="text"
            value={nameKana}
            onChange={(e) => setNameKana(e.target.value)}
            placeholder="例: やまだ たろう"
            maxLength={40}
            required
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            お子さまの生年月日
          </label>
          <div className="flex gap-2">
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              required
              className={`${selectClass} flex-1 min-w-0`}
              aria-label="年"
            >
              <option value="">年</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}年（{wareki(y)}）
                </option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              required
              className={`${selectClass} w-20`}
              aria-label="月"
            >
              <option value="">月</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
            <select
              value={day}
              onChange={(e) => setDay(e.target.value)}
              required
              className={`${selectClass} w-20`}
              aria-label="日"
            >
              <option value="">日</option>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}日</option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          ごきょうだいでご利用の場合も、申請は1人分で大丈夫です。施設でまとめて登録します。
        </p>

        <button
          type="submit"
          disabled={submitting || !nameKana.trim() || !year || !month || !day || Number(day) > daysInMonth}
          className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          申請する
        </button>
      </form>

      <div className="mt-6 text-center space-y-3">
        {editing && (
          <button onClick={() => setEditing(false)} className="block w-full text-sm text-gray-500 underline">
            やめる
          </button>
        )}
        <button
          onClick={() => { setMode('code'); setErrorMessage('') }}
          className="text-sm text-gray-500 underline"
        >
          登録コードをお持ちの方はこちら
        </button>
      </div>
    </div>
  )
}
