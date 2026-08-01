'use client'

import { useState, useEffect } from 'react'
import { useLiff } from '@/hooks/use-liff'
import { Loader2, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDate, getTodayJST } from '@/lib/utils'

type Child = { id: string; name: string }

type ContactEntry = {
  childId: string
  status: 'attending' | 'absent' | null
  pickupRequired: boolean
  note: string
}

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error'

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export default function LiffAttendancePage() {
  const liffState = useLiff()
  const [children, setChildren] = useState<Child[]>([])
  const [entries, setEntries] = useState<ContactEntry[]>([])
  const [date, setDate] = useState(() => getTodayJST())
  const [loadingChildren, setLoadingChildren] = useState(false)
  const [notRegistered, setNotRegistered] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (liffState.status !== 'ready') return
    const accessToken = liffState.liff.getAccessToken()
    setLoadingChildren(true)

    fetch('/api/liff/children', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    })
      .then((r) => r.json())
      .then((json: { children?: Child[]; error?: string }) => {
        if (json.children && json.children.length > 0) {
          setChildren(json.children)
          setEntries(
            json.children.map((c) => ({
              childId: c.id,
              status: null,
              pickupRequired: false,
              note: '',
            }))
          )
        } else {
          setNotRegistered(true)
        }
      })
      .catch(() => setNotRegistered(true))
      .finally(() => setLoadingChildren(false))
  }, [liffState])

  function updateEntry(childId: string, patch: Partial<ContactEntry>) {
    setEntries((prev) =>
      prev.map((e) => (e.childId === childId ? { ...e, ...patch } : e))
    )
  }

  async function handleSubmit() {
    if (liffState.status !== 'ready') return
    const allAnswered = entries.every((e) => e.status !== null)
    if (!allAnswered) {
      setErrorMessage('全員分の連絡を選択してください')
      setSubmitStatus('error')
      return
    }

    setSubmitStatus('submitting')
    setErrorMessage('')

    try {
      const accessToken = liffState.liff.getAccessToken()
      if (!accessToken) {
        setErrorMessage('LINEの認証情報を取得できませんでした。LINEアプリから開き直してください')
        setSubmitStatus('error')
        return
      }
      const res = await fetch('/api/liff/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, date, entries }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) {
        setErrorMessage(json.error ?? '送信に失敗しました')
        setSubmitStatus('error')
      } else {
        setSubmitStatus('success')
      }
    } catch {
      setErrorMessage('通信エラーが発生しました')
      setSubmitStatus('error')
    }
  }

  // ローディング中
  if (liffState.status === 'loading' || loadingChildren) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  // LIFFエラー
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

  // 未登録
  if (notRegistered) {
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

  // 送信完了
  if (submitStatus === 'success') {
    return (
      <div className="max-w-sm mx-auto px-6 pt-12 text-center">
        <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">送信しました</h1>
        <p className="text-sm text-gray-500 mb-2">
          {date} の利用連絡を受け付けました。
        </p>
        <button
          onClick={() => {
            setSubmitStatus('idle')
            setEntries((prev) =>
              prev.map((e) => ({ ...e, status: null, pickupRequired: false, note: '' }))
            )
          }}
          className="mt-6 text-sm text-indigo-600 underline"
        >
          別の日付を連絡する
        </button>
      </div>
    )
  }

  const dateObj = new Date(date + 'T00:00:00')

  return (
    <div className="max-w-sm mx-auto px-4 pt-8 pb-10">
      <h1 className="text-xl font-bold text-gray-900 mb-1 text-center">利用連絡</h1>
      <p className="text-xs text-gray-400 text-center mb-6">
        {liffState.displayName}さん
      </p>

      {/* 日付選択 */}
      <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 mb-6 shadow-sm border border-gray-100">
        <button
          onClick={() => setDate(formatDate(addDays(dateObj, -1), 'yyyy-MM-dd'))}
          className="p-1 text-gray-400 hover:text-gray-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-base font-bold text-gray-900">
            {dateObj.getFullYear()}年{dateObj.getMonth() + 1}月{dateObj.getDate()}日
          </p>
          <p className="text-xs text-gray-400">
            {['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()]}曜日
          </p>
        </div>
        <button
          onClick={() => setDate(formatDate(addDays(dateObj, 1), 'yyyy-MM-dd'))}
          className="p-1 text-gray-400 hover:text-gray-700"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* 児童ごとの入力 */}
      <div className="space-y-4">
        {children.map((child, i) => {
          const entry = entries[i]
          return (
            <div
              key={child.id}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
            >
              <p className="font-semibold text-gray-900 mb-3">{child.name}</p>

              {/* 利用/欠席ボタン */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  onClick={() => updateEntry(child.id, { status: 'attending' })}
                  className={`rounded-xl py-3 text-sm font-semibold transition-colors ${
                    entry.status === 'attending'
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  利用する
                </button>
                <button
                  onClick={() =>
                    updateEntry(child.id, { status: 'absent', pickupRequired: false })
                  }
                  className={`rounded-xl py-3 text-sm font-semibold transition-colors ${
                    entry.status === 'absent'
                      ? 'bg-red-400 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  お休みする
                </button>
              </div>

              {/* 送迎希望（利用する場合のみ） */}
              {entry.status === 'attending' && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1.5">送迎</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateEntry(child.id, { pickupRequired: true })}
                      className={`rounded-lg py-2 text-xs font-medium transition-colors ${
                        entry.pickupRequired
                          ? 'bg-indigo-500 text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      送迎あり
                    </button>
                    <button
                      onClick={() => updateEntry(child.id, { pickupRequired: false })}
                      className={`rounded-lg py-2 text-xs font-medium transition-colors ${
                        !entry.pickupRequired
                          ? 'bg-indigo-500 text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      送迎なし
                    </button>
                  </div>
                </div>
              )}

              {/* 備考 */}
              <textarea
                value={entry.note}
                onChange={(e) => updateEntry(child.id, { note: e.target.value })}
                placeholder="備考（任意）"
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          )
        })}
      </div>

      {/* エラー */}
      {submitStatus === 'error' && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 flex gap-2 items-center">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* 送信ボタン */}
      <button
        onClick={handleSubmit}
        disabled={submitStatus === 'submitting'}
        className="mt-6 w-full rounded-2xl bg-indigo-600 py-4 text-base font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
      >
        {submitStatus === 'submitting' && <Loader2 className="h-5 w-5 animate-spin" />}
        連絡を送信する
      </button>
    </div>
  )
}
