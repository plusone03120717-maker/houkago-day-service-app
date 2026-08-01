'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLiff } from '@/hooks/use-liff'
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, X, Car } from 'lucide-react'

type Child = { id: string; name: string }

type Contact = {
  child_id: string
  date: string
  status: 'attending' | 'absent'
  service_type: 'regular' | 'daytime_support'
  pickup_required: boolean
  note: string | null
}

type Choice = 'regular' | 'daytime_support' | 'absent'

type EntryState = {
  choice: Choice | null
  pickup: boolean
  note: string
}

const DOW = ['日', '月', '火', '水', '木', '金', '土']

const CHOICE_META: Record<Choice, { label: string; dot: string; active: string }> = {
  regular: { label: '放デイ', dot: 'bg-green-500', active: 'bg-green-500 text-white shadow-sm' },
  daytime_support: { label: '日中一時', dot: 'bg-orange-400', active: 'bg-orange-400 text-white shadow-sm' },
  absent: { label: 'お休み', dot: 'bg-red-400', active: 'bg-red-400 text-white shadow-sm' },
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayStr(): string {
  const n = new Date()
  return toDateStr(n.getFullYear(), n.getMonth() + 1, n.getDate())
}

function contactToChoice(c: Contact): Choice {
  return c.status === 'absent' ? 'absent' : c.service_type === 'daytime_support' ? 'daytime_support' : 'regular'
}

export default function LiffAttendancePage() {
  const liffState = useLiff()

  const [pageStatus, setPageStatus] = useState<'loading' | 'noToken' | 'notRegistered' | 'apiError' | 'ready'>('loading')
  const [children, setChildren] = useState<Child[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [loadingMonth, setLoadingMonth] = useState(false)

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [entries, setEntries] = useState<Record<string, EntryState>>({})
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null)

  // 月次データ取得（児童一覧＋当月の連絡）
  const loadMonth = useCallback((y: number, m: number) => {
    if (liffState.status !== 'ready') return
    const accessToken = liffState.liff.getAccessToken()
    if (!accessToken) { setPageStatus('noToken'); return }

    setLoadingMonth(true)
    fetch('/api/liff/attendance/month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, year: y, month: m }),
    })
      .then(async (r) => {
        const json = await r.json() as { children?: Child[]; contacts?: Contact[]; error?: string }
        if (!r.ok) { setPageStatus('apiError'); return }
        if (!json.children || json.children.length === 0) {
          setPageStatus('notRegistered')
          return
        }
        setChildren(json.children)
        setContacts(json.contacts ?? [])
        setPageStatus('ready')
      })
      .catch(() => setPageStatus('apiError'))
      .finally(() => setLoadingMonth(false))
  }, [liffState])

  useEffect(() => {
    loadMonth(year, month)
  }, [year, month, loadMonth])

  // カレンダー生成
  function buildCells(): (number | null)[] {
    const firstDow = new Date(year, month - 1, 1).getDay()
    const lastDay = new Date(year, month, 0).getDate()
    const cells: (number | null)[] = Array(firstDow).fill(null)
    for (let d = 1; d <= lastDay; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }

  function contactsOn(dateStr: string): Contact[] {
    return contacts.filter((c) => c.date === dateStr)
  }

  function prevMonth() {
    const p = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 }
    setYear(p.y); setMonth(p.m); setSelectedDate(null)
  }
  function nextMonth() {
    const n = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
    setYear(n.y); setMonth(n.m); setSelectedDate(null)
  }

  function openDate(dateStr: string) {
    const dayContacts = contactsOn(dateStr)
    const init: Record<string, EntryState> = {}
    for (const child of children) {
      const existing = dayContacts.find((c) => c.child_id === child.id)
      init[child.id] = existing
        ? { choice: contactToChoice(existing), pickup: existing.pickup_required, note: existing.note ?? '' }
        : { choice: null, pickup: false, note: '' }
    }
    setEntries(init)
    setSelectedDate(dateStr)
    setToast(null)
  }

  function closeSheet() {
    setSelectedDate(null)
    setToast(null)
  }

  function updateEntry(childId: string, patch: Partial<EntryState>) {
    setEntries((prev) => ({ ...prev, [childId]: { ...prev[childId], ...patch } }))
  }

  async function handleSubmit() {
    if (liffState.status !== 'ready' || !selectedDate) return
    const accessToken = liffState.liff.getAccessToken()
    if (!accessToken) {
      setToast({ ok: false, message: 'LINEの認証情報を取得できませんでした。LINEアプリから開き直してください' })
      return
    }

    const payload = children
      .filter((c) => entries[c.id]?.choice != null)
      .map((c) => {
        const e = entries[c.id]
        return {
          childId: c.id,
          status: e.choice === 'absent' ? 'absent' : 'attending',
          serviceType: e.choice === 'absent' ? undefined : e.choice,
          pickupRequired: e.choice === 'absent' ? false : e.pickup,
          note: e.note.trim(),
        }
      })

    if (payload.length === 0) {
      setToast({ ok: false, message: '少なくとも1人の連絡内容を選択してください' })
      return
    }

    setSubmitting(true)
    setToast(null)
    try {
      const res = await fetch('/api/liff/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, date: selectedDate, entries: payload }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) {
        setToast({ ok: false, message: json.error ?? '送信に失敗しました' })
      } else {
        setToast({ ok: true, message: '連絡を送信しました' })
        loadMonth(year, month)
      }
    } catch {
      setToast({ ok: false, message: '通信エラーが発生しました' })
    } finally {
      setSubmitting(false)
    }
  }

  const cells = buildCells()
  const today = todayStr()

  // ローディング
  if (liffState.status === 'loading' || (liffState.status === 'ready' && pageStatus === 'loading')) {
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

  // アクセストークンなし
  if (pageStatus === 'noToken') {
    return (
      <div className="max-w-sm mx-auto px-6 pt-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">認証エラー</h1>
        <p className="text-sm text-gray-500">
          LINEの認証情報を取得できませんでした。LINEアプリから開き直してください。
        </p>
      </div>
    )
  }

  // APIエラー
  if (pageStatus === 'apiError') {
    return (
      <div className="max-w-sm mx-auto px-6 pt-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">通信エラー</h1>
        <p className="text-sm text-gray-500">サーバーとの通信に失敗しました。時間をおいて再度お試しください。</p>
      </div>
    )
  }

  // 未登録
  if (pageStatus === 'notRegistered') {
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

  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : null

  return (
    <div className="max-w-sm mx-auto min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-indigo-600 text-white px-5 pt-10 pb-5">
        <p className="text-xs text-indigo-300 mb-0.5">利用連絡</p>
        <h1 className="text-xl font-bold">
          {liffState.status === 'ready' ? `${liffState.displayName}さん` : ''}
        </h1>
      </div>

      {/* 月ナビゲーション */}
      <div className="bg-white border-b border-gray-100 flex items-center justify-between px-4 py-2.5 sticky top-0 z-10 shadow-sm">
        <button onClick={prevMonth} className="p-2 text-gray-400 hover:text-gray-700">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-semibold text-gray-800 text-sm">{year}年{month}月</span>
        <button onClick={nextMonth} className="p-2 text-gray-400 hover:text-gray-700">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* カレンダー */}
      <div className="bg-white mx-3 mt-3 rounded-2xl shadow-sm overflow-hidden">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DOW.map((d, i) => (
            <div key={d} className={`py-2 text-center text-xs font-medium ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-400'}`}>
              {d}
            </div>
          ))}
        </div>

        {loadingMonth ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          </div>
        ) : (
          <div className="grid grid-cols-7 p-1">
            {cells.map((day, idx) => {
              if (day === null) return <div key={idx} className="h-12" />
              const dateStr = toDateStr(year, month, day)
              const dayContacts = contactsOn(dateStr)
              const isToday = dateStr === today
              const isPast = dateStr < today
              const isSelected = dateStr === selectedDate
              const dow = idx % 7
              return (
                <button
                  key={idx}
                  onClick={() => openDate(dateStr)}
                  disabled={isPast}
                  className={`relative flex flex-col items-center justify-start pt-1.5 h-12 rounded-xl mx-0.5 mb-0.5 transition-colors ${
                    isSelected ? 'bg-indigo-100' :
                    isToday ? 'bg-indigo-50' :
                    isPast ? '' : 'hover:bg-gray-50 active:bg-gray-100'
                  }`}
                >
                  <span className={`text-sm font-medium leading-none ${
                    isSelected ? 'text-indigo-700' :
                    isToday ? 'text-indigo-600' :
                    isPast ? 'text-gray-300' :
                    dow === 0 ? 'text-red-500' :
                    dow === 6 ? 'text-blue-500' :
                    'text-gray-700'
                  }`}>
                    {isToday ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs">{day}</span>
                    ) : day}
                  </span>
                  <div className="flex gap-0.5 mt-1">
                    {dayContacts.slice(0, 3).map((c, i) => (
                      <span key={i} className={`w-1.5 h-1.5 rounded-full ${CHOICE_META[contactToChoice(c)].dot} ${isPast ? 'opacity-40' : ''}`} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* 凡例 */}
        <div className="flex gap-4 justify-center py-3 border-t border-gray-100">
          {(Object.keys(CHOICE_META) as Choice[]).map((k) => (
            <div key={k} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${CHOICE_META[k].dot}`} />
              <span className="text-xs text-gray-400">{CHOICE_META[k].label}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-3 mb-6">日付をタップして利用連絡</p>

      {/* 日付詳細シート */}
      {selectedDate && selectedDateObj && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={closeSheet} />
          <div
            className="relative bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ハンドルバー */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* 日付タイトル */}
            <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100">
              <p className="font-bold text-gray-900">
                {selectedDateObj.getMonth() + 1}月{selectedDateObj.getDate()}日
                <span className="ml-1 font-normal text-gray-400 text-sm">（{DOW[selectedDateObj.getDay()]}）</span>
              </p>
              <button onClick={closeSheet} className="p-1.5 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-4 pt-3 pb-8 space-y-3">
              {/* トースト */}
              {toast && (
                <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                  toast.ok ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                }`}>
                  {toast.message}
                </div>
              )}

              {/* 連絡済みの変更ヒント */}
              {contactsOn(selectedDate).length > 0 && !toast && (
                <p className="text-xs text-gray-400 text-center">
                  送信済みの連絡です。変更して再送信できます
                </p>
              )}

              {/* 児童ごとの入力 */}
              {children.map((child) => {
                const entry = entries[child.id]
                if (!entry) return null
                return (
                  <div key={child.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <p className="font-semibold text-gray-900 mb-3">{child.name}</p>

                    {/* 放デイ / 日中一時 / お休み */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {(['regular', 'daytime_support', 'absent'] as Choice[]).map((choice) => (
                        <button
                          key={choice}
                          onClick={() => updateEntry(child.id, { choice, ...(choice === 'absent' ? { pickup: false } : {}) })}
                          className={`rounded-xl py-3 text-xs font-semibold transition-colors ${
                            entry.choice === choice
                              ? CHOICE_META[choice].active
                              : 'bg-white text-gray-600 border border-gray-200'
                          }`}
                        >
                          {CHOICE_META[choice].label}
                        </button>
                      ))}
                    </div>

                    {/* 送迎希望（利用する場合のみ） */}
                    {(entry.choice === 'regular' || entry.choice === 'daytime_support') && (
                      <label className="flex items-center gap-2.5 bg-white rounded-xl px-4 py-3 mb-3 border border-gray-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={entry.pickup}
                          onChange={(e) => updateEntry(child.id, { pickup: e.target.checked })}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <Car className="h-4 w-4 text-indigo-500" />
                        <span className="text-sm text-gray-700">送迎を希望する</span>
                      </label>
                    )}

                    {/* 備考 */}
                    <textarea
                      value={entry.note}
                      onChange={(e) => updateEntry(child.id, { note: e.target.value })}
                      placeholder="備考（任意）"
                      rows={2}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-300 resize-none bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                )
              })}

              {/* 送信ボタン */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full rounded-2xl bg-indigo-600 py-4 text-base font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
              >
                {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
                連絡を送信する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
