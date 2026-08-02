'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLiff } from '@/hooks/use-liff'
import { getJapaneseHolidayName } from '@/lib/japanese-holidays'
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, X, Car, Clock } from 'lucide-react'

type Child = { id: string; name: string }

type TransportType = 'none' | 'pickup_only' | 'dropoff_only' | 'both'

type Contact = {
  child_id: string
  date: string
  status: 'attending' | 'absent'
  service_type: 'regular' | 'daytime_support'
  service_start_time: string | null
  service_end_time: string | null
  transport_type: TransportType
  pickup_time: string | null
  dropoff_time: string | null
  note: string | null
}

type Choice = 'regular' | 'daytime_support' | 'absent'

type EntryState = {
  choice: Choice | null
  serviceStart: string
  serviceEnd: string
  transport: TransportType
  pickupTime: string
  dropoffTime: string
  note: string
}

const TRANSPORT_OPTIONS: { value: TransportType; label: string }[] = [
  { value: 'none', label: '送迎なし' },
  { value: 'both', label: '送り迎え' },
  { value: 'pickup_only', label: '迎えのみ' },
  { value: 'dropoff_only', label: '送りのみ' },
]

/** DBの time 型（HH:MM:SS）を HH:MM に切り詰める */
function toTimeInput(v: string | null): string {
  return v ? v.slice(0, 5) : ''
}

// 6:00〜21:00 を15分刻みで選択肢にする。
// input[type=time] のネイティブピッカーは端末により現在時刻より前を選びにくいため、
// 端末差の出ないプルダウンで時刻を選ばせる。
const TIME_OPTIONS = Array.from({ length: (21 - 6) * 4 + 1 }, (_, i) => {
  const total = 6 * 60 + i * 15
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
})

function TimeSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  ariaLabel: string
}) {
  // 選択肢の刻みに載らない既存データ（例: 15:20）も失わずに表示する
  const options = value && !TIME_OPTIONS.includes(value)
    ? [...TIME_OPTIONS, value].sort()
    : TIME_OPTIONS

  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
    >
      <option value="">指定なし</option>
      {options.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  )
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
        ? {
            choice: contactToChoice(existing),
            serviceStart: toTimeInput(existing.service_start_time),
            serviceEnd: toTimeInput(existing.service_end_time),
            transport: existing.transport_type ?? 'none',
            pickupTime: toTimeInput(existing.pickup_time),
            dropoffTime: toTimeInput(existing.dropoff_time),
            note: existing.note ?? '',
          }
        : {
            choice: null,
            serviceStart: '',
            serviceEnd: '',
            transport: 'none',
            pickupTime: '',
            dropoffTime: '',
            note: '',
          }
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

    const targets = children.filter((c) => entries[c.id]?.choice != null)

    if (targets.length === 0) {
      setToast({ ok: false, message: '少なくとも1人の連絡内容を選択してください' })
      return
    }

    // 利用時間の前後関係を送信前に確認する
    for (const c of targets) {
      const e = entries[c.id]
      if (e.choice !== 'absent' && e.serviceStart && e.serviceEnd && e.serviceStart >= e.serviceEnd) {
        setToast({ ok: false, message: `${c.name}さんの利用時間は終了を開始より後にしてください` })
        return
      }
    }

    const payload = targets.map((c) => {
      const e = entries[c.id]
      const attending = e.choice !== 'absent'
      return {
        childId: c.id,
        status: attending ? 'attending' : 'absent',
        serviceType: attending ? e.choice : undefined,
        serviceStartTime: attending ? e.serviceStart : null,
        serviceEndTime: attending ? e.serviceEnd : null,
        transportType: attending ? e.transport : 'none',
        pickupTime: attending ? e.pickupTime : null,
        dropoffTime: attending ? e.dropoffTime : null,
        note: e.note.trim(),
      }
    })

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
  const selectedHolidayName = selectedDate ? getJapaneseHolidayName(selectedDate) : null

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
              const holidayName = getJapaneseHolidayName(dateStr)
              return (
                <button
                  key={idx}
                  onClick={() => openDate(dateStr)}
                  disabled={isPast}
                  title={holidayName ?? undefined}
                  className={`relative flex flex-col items-center justify-start pt-1.5 h-12 rounded-xl mx-0.5 mb-0.5 transition-colors ${
                    isSelected ? 'bg-indigo-100' :
                    isToday ? 'bg-indigo-50' :
                    isPast ? '' :
                    holidayName ? 'bg-red-50/60 hover:bg-gray-50 active:bg-gray-100' : 'hover:bg-gray-50 active:bg-gray-100'
                  }`}
                >
                  <span className={`text-sm font-medium leading-none ${
                    isSelected ? 'text-indigo-700' :
                    isToday ? 'text-indigo-600' :
                    isPast ? 'text-gray-300' :
                    dow === 0 || holidayName ? 'text-red-500' :
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

      <p className="text-center text-xs text-gray-400 mt-3">日付をタップして利用連絡</p>

      <div className="text-center mt-4 mb-6">
        <a href="/liff/register?add=1" className="text-xs text-indigo-600 underline">
          お子さまを追加登録する
        </a>
      </div>

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
              <p className={`font-bold ${selectedHolidayName || selectedDateObj.getDay() === 0 ? 'text-red-500' : 'text-gray-900'}`}>
                {selectedDateObj.getMonth() + 1}月{selectedDateObj.getDate()}日
                <span className="ml-1 font-normal text-gray-400 text-sm">（{DOW[selectedDateObj.getDay()]}）</span>
                {selectedHolidayName && (
                  <span className="ml-2 text-xs font-medium text-red-500">{selectedHolidayName}</span>
                )}
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
                          onClick={() => updateEntry(child.id, { choice })}
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

                    {/* 利用時間・送迎（利用する場合のみ） */}
                    {(entry.choice === 'regular' || entry.choice === 'daytime_support') && (
                      <>
                        {/* 利用時間 */}
                        <div className="bg-white rounded-xl px-4 py-3 mb-3 border border-gray-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Clock className="h-3.5 w-3.5 text-indigo-500" />
                            <span className="text-xs font-semibold text-gray-600">利用時間</span>
                            <span className="text-[10px] text-gray-400">（任意）</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-gray-400 mb-1 block">開始</label>
                              <TimeSelect
                                ariaLabel={`${child.name}の利用開始時刻`}
                                value={entry.serviceStart}
                                onChange={(v) => updateEntry(child.id, { serviceStart: v })}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-400 mb-1 block">終了</label>
                              <TimeSelect
                                ariaLabel={`${child.name}の利用終了時刻`}
                                value={entry.serviceEnd}
                                onChange={(v) => updateEntry(child.id, { serviceEnd: v })}
                              />
                            </div>
                          </div>
                        </div>

                        {/* 送迎 */}
                        <div className="bg-white rounded-xl px-4 py-3 mb-3 border border-gray-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Car className="h-3.5 w-3.5 text-indigo-500" />
                            <span className="text-xs font-semibold text-gray-600">送迎</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {TRANSPORT_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => updateEntry(child.id, { transport: opt.value })}
                                className={`rounded-lg py-2.5 text-xs font-medium transition-colors ${
                                  entry.transport === opt.value
                                    ? 'bg-indigo-500 text-white shadow-sm'
                                    : 'bg-gray-50 text-gray-600 border border-gray-200'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>

                          {/* 迎え希望時刻 */}
                          {(entry.transport === 'pickup_only' || entry.transport === 'both') && (
                            <div className="mt-3">
                              <label className="text-[10px] text-gray-400 mb-1 block">
                                お迎え希望時刻（自宅・学校へ迎えに行く時間）
                              </label>
                              <TimeSelect
                                ariaLabel={`${child.name}のお迎え希望時刻`}
                                value={entry.pickupTime}
                                onChange={(v) => updateEntry(child.id, { pickupTime: v })}
                              />
                            </div>
                          )}

                          {/* 送り希望時刻 */}
                          {(entry.transport === 'dropoff_only' || entry.transport === 'both') && (
                            <div className="mt-3">
                              <label className="text-[10px] text-gray-400 mb-1 block">
                                お送り希望時刻（自宅へ送り届ける時間）
                              </label>
                              <TimeSelect
                                ariaLabel={`${child.name}のお送り希望時刻`}
                                value={entry.dropoffTime}
                                onChange={(v) => updateEntry(child.id, { dropoffTime: v })}
                              />
                            </div>
                          )}
                        </div>
                      </>
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
