'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLiff } from '@/hooks/use-liff'
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, X } from 'lucide-react'

type StaffInfo = {
  staffMemberId: string
  userId: string | null
  name: string
}

type OvertimeReq = {
  id: string
  date: string
  actual_end_time: string | null
  status: 'pending' | 'approved' | 'rejected'
}

type LeaveUsage = {
  id: string
  date: string
  days_used: number
}

type BreakRecord = {
  date: string
  break_start: string | null
  break_end: string | null
}

const DOW = ['日', '月', '火', '水', '木', '金', '土']

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayStr(): string {
  const n = new Date()
  return toDateStr(n.getFullYear(), n.getMonth() + 1, n.getDate())
}

export default function StaffLiffPage() {
  const liffState = useLiff(process.env.NEXT_PUBLIC_LIFF_STAFF_ID)

  const [staff, setStaff] = useState<StaffInfo | null>(null)
  const [pageStatus, setPageStatus] = useState<'loading' | 'noToken' | 'notRegistered' | 'apiError' | 'ready'>('loading')
  const [debugError, setDebugError] = useState<string | null>(null)
  const [serverLineId, setServerLineId] = useState<string | null>(null)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeReq[]>([])
  const [leaveUsages, setLeaveUsages] = useState<LeaveUsage[]>([])
  const [breakRecords, setBreakRecords] = useState<BreakRecord[]>([])
  const [loadingMonth, setLoadingMonth] = useState(false)

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [activeForm, setActiveForm] = useState<'leave' | 'overtime' | 'break' | null>(null)

  const [leaveDays, setLeaveDays] = useState<0.5 | 1.0>(1.0)
  const [overtimeEnd, setOvertimeEnd] = useState('20:00')
  const [breakStart, setBreakStart] = useState('12:00')
  const [breakEnd, setBreakEnd] = useState('13:00')

  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null)

  // スタッフ特定
  useEffect(() => {
    if (liffState.status !== 'ready') return
    const accessToken = liffState.liff.getAccessToken()
    if (!accessToken) { setPageStatus('noToken'); return }

    fetch('/api/liff/staff/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    })
      .then(async r => {
        const json = await r.json() as { staff?: StaffInfo; error?: string; debug_server_line_id?: string }
        if (json.staff) {
          setStaff(json.staff); setPageStatus('ready')
        } else if (r.status === 404) {
          if (json.debug_server_line_id) setServerLineId(json.debug_server_line_id)
          setPageStatus('notRegistered')
        } else {
          setDebugError(json.error ?? `HTTP ${r.status}`)
          setPageStatus('apiError')
        }
      })
      .catch(e => { setDebugError(String(e)); setPageStatus('apiError') })
  }, [liffState])

  // 月次データ取得
  const loadMonth = useCallback((y: number, m: number) => {
    if (liffState.status !== 'ready') return
    const accessToken = liffState.liff.getAccessToken()
    if (!accessToken) return

    setLoadingMonth(true)
    fetch('/api/liff/staff/month-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, year: y, month: m }),
    })
      .then(r => r.json())
      .then((json: { overtimeRequests?: OvertimeReq[]; leaveUsages?: LeaveUsage[]; breakRecords?: BreakRecord[] }) => {
        setOvertimeRequests(json.overtimeRequests ?? [])
        setLeaveUsages(json.leaveUsages ?? [])
        setBreakRecords(json.breakRecords ?? [])
      })
      .finally(() => setLoadingMonth(false))
  }, [liffState])

  useEffect(() => {
    if (pageStatus === 'ready') loadMonth(year, month)
  }, [pageStatus, year, month, loadMonth])

  // カレンダー生成
  function buildCells(): (number | null)[] {
    const firstDow = new Date(year, month - 1, 1).getDay()
    const lastDay = new Date(year, month, 0).getDate()
    const cells: (number | null)[] = Array(firstDow).fill(null)
    for (let d = 1; d <= lastDay; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }

  function getDateInfo(dateStr: string) {
    return {
      leave: leaveUsages.find(l => l.date === dateStr) ?? null,
      overtime: overtimeRequests.find(o => o.date === dateStr) ?? null,
      breaks: breakRecords.filter(b => b.date === dateStr),
    }
  }

  // 月切り替え
  function prevMonth() {
    const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 }
    setYear(prev.y); setMonth(prev.m); setSelectedDate(null)
  }
  function nextMonth() {
    const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
    setYear(next.y); setMonth(next.m); setSelectedDate(null)
  }

  function openDate(dateStr: string) {
    setSelectedDate(dateStr); setActiveForm(null); setToast(null)
  }
  function closeSheet() {
    setSelectedDate(null); setActiveForm(null); setToast(null)
  }

  // 申請送信
  async function submit(endpoint: string, body: Record<string, unknown>) {
    if (liffState.status !== 'ready') return
    const accessToken = liffState.liff.getAccessToken()
    if (!accessToken) return

    setSubmitting(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, ...body }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) {
        setToast({ ok: false, message: json.error ?? '登録に失敗しました' })
      } else {
        setToast({ ok: true, message: '申請を受け付けました' })
        setActiveForm(null)
        if (year && month) loadMonth(year, month)
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
        <p className="text-sm text-gray-500 mb-4">
          LINEのアクセストークンを取得できませんでした。
        </p>
        {liffState.status === 'ready' && (
          <p className="text-xs text-gray-400 font-mono break-all">
            LINE ID: {liffState.lineUserId}
          </p>
        )}
      </div>
    )
  }

  // APIエラー
  if (pageStatus === 'apiError') {
    return (
      <div className="max-w-sm mx-auto px-6 pt-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">通信エラー</h1>
        <p className="text-sm text-gray-500 mb-4">サーバーとの通信に失敗しました。</p>
        {debugError && (
          <p className="text-xs text-red-400 font-mono break-all bg-red-50 rounded p-2 mb-4">{debugError}</p>
        )}
        {liffState.status === 'ready' && (
          <p className="text-xs text-gray-400 font-mono break-all">
            LINE ID: {liffState.lineUserId}
          </p>
        )}
      </div>
    )
  }

  // 未登録
  if (pageStatus === 'notRegistered') {
    return (
      <div className="max-w-sm mx-auto px-6 pt-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">スタッフ登録が必要です</h1>
        <p className="text-sm text-gray-500 mb-4">
          管理者にLINE連携の設定を依頼してください。
        </p>
        {liffState.status === 'ready' && (
          <p className="text-xs text-gray-400 font-mono break-all mb-1">
            クライアントID: {liffState.lineUserId}
          </p>
        )}
        {serverLineId && (
          <p className="text-xs text-red-400 font-mono break-all">
            サーバーID: {serverLineId}
          </p>
        )}
      </div>
    )
  }

  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : null
  const dateInfo = selectedDate ? getDateInfo(selectedDate) : null

  return (
    <div className="max-w-sm mx-auto min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-indigo-600 text-white px-5 pt-10 pb-5">
        <p className="text-xs text-indigo-300 mb-0.5">スタッフ申請</p>
        <h1 className="text-xl font-bold">{staff?.name}さん</h1>
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
              const info = getDateInfo(dateStr)
              const isToday = dateStr === today
              const isSelected = dateStr === selectedDate
              const dow = idx % 7
              return (
                <button
                  key={idx}
                  onClick={() => openDate(dateStr)}
                  className={`relative flex flex-col items-center justify-start pt-1.5 h-12 rounded-xl mx-0.5 mb-0.5 transition-colors ${
                    isSelected ? 'bg-indigo-100' : isToday ? 'bg-indigo-50' : 'hover:bg-gray-50 active:bg-gray-100'
                  }`}
                >
                  <span className={`text-sm font-medium leading-none ${
                    isSelected ? 'text-indigo-700' :
                    isToday ? 'text-indigo-600' :
                    dow === 0 ? 'text-red-500' :
                    dow === 6 ? 'text-blue-500' :
                    'text-gray-700'
                  }`}>
                    {isToday ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs">{day}</span>
                    ) : day}
                  </span>
                  <div className="flex gap-0.5 mt-1">
                    {info.leave && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                    {info.overtime && (
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        info.overtime.status === 'approved' ? 'bg-orange-500' :
                        info.overtime.status === 'rejected' ? 'bg-red-400' : 'bg-orange-300'
                      }`} />
                    )}
                    {info.breaks.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* 凡例 */}
        <div className="flex gap-4 justify-center py-3 border-t border-gray-100">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-400">有給</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-300" />
            <span className="text-xs text-gray-400">残業</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            <span className="text-xs text-gray-400">中抜け</span>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-3 mb-6">日付をタップして申請</p>

      {/* 日付詳細シート */}
      {selectedDate && selectedDateObj && dateInfo && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={closeSheet} />
          <div
            className="relative bg-white rounded-t-3xl shadow-2xl max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
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

            <div className="px-4 pt-3 pb-6 space-y-3">
              {/* トースト */}
              {toast && (
                <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                  toast.ok ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                }`}>
                  {toast.message}
                </div>
              )}

              {/* 既存レコード */}
              {dateInfo.leave && (
                <div className="flex items-center gap-2.5 bg-green-50 rounded-2xl px-4 py-3 border border-green-100">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-sm text-green-800 font-medium">
                    有給取得済み{dateInfo.leave.days_used === 0.5 ? '（半日）' : '（1日）'}
                  </span>
                </div>
              )}
              {dateInfo.overtime && (
                <div className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 border ${
                  dateInfo.overtime.status === 'approved' ? 'bg-orange-50 border-orange-100' :
                  dateInfo.overtime.status === 'rejected' ? 'bg-red-50 border-red-100' :
                  'bg-orange-50 border-orange-100'
                }`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    dateInfo.overtime.status === 'approved' ? 'bg-orange-500' :
                    dateInfo.overtime.status === 'rejected' ? 'bg-red-400' : 'bg-orange-300'
                  }`} />
                  <div className="text-sm">
                    <span className="font-medium text-gray-800">残業申請</span>
                    {dateInfo.overtime.actual_end_time && (
                      <span className="text-gray-500 ml-1">{dateInfo.overtime.actual_end_time.slice(0, 5)}まで</span>
                    )}
                    <span className={`ml-2 text-xs ${
                      dateInfo.overtime.status === 'approved' ? 'text-orange-600' :
                      dateInfo.overtime.status === 'rejected' ? 'text-red-600' :
                      'text-gray-400'
                    }`}>
                      {dateInfo.overtime.status === 'approved' ? '承認済' :
                       dateInfo.overtime.status === 'rejected' ? '却下' : '承認待ち'}
                    </span>
                  </div>
                </div>
              )}
              {dateInfo.breaks.map((b, i) => (
                <div key={i} className="flex items-center gap-2.5 bg-sky-50 rounded-2xl px-4 py-3 border border-sky-100">
                  <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
                  <span className="text-sm text-sky-800 font-medium">
                    中抜け {b.break_start ?? '?'}〜{b.break_end ?? '?'}
                  </span>
                </div>
              ))}

              {/* 申請フォーム群 */}

              {/* 有給申請 */}
              {!dateInfo.leave && (
                activeForm === 'leave' ? (
                  <div className="bg-green-50 rounded-2xl p-4 border border-green-100">
                    <p className="text-sm font-semibold text-green-800 mb-3">有給申請</p>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {([1.0, 0.5] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setLeaveDays(v)}
                          className={`rounded-xl py-3 text-sm font-medium transition-colors ${
                            leaveDays === v ? 'bg-green-500 text-white shadow-sm' : 'bg-white text-gray-700 border border-gray-200'
                          }`}
                        >
                          {v === 1.0 ? '1日' : '半日'}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setActiveForm(null)} className="flex-1 rounded-xl py-3 text-sm text-gray-500 bg-white border border-gray-200">
                        キャンセル
                      </button>
                      <button
                        onClick={() => submit('/api/liff/staff/leave', { date: selectedDate!, daysUsed: leaveDays })}
                        disabled={submitting}
                        className="flex-1 rounded-xl py-3 text-sm font-semibold text-white bg-green-500 disabled:opacity-50 flex items-center justify-center gap-1 shadow-sm"
                      >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        申請する
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setActiveForm('leave'); setToast(null) }}
                    className="w-full bg-green-500 text-white rounded-2xl py-3.5 text-sm font-semibold shadow-sm active:opacity-80"
                  >
                    有給申請
                  </button>
                )
              )}

              {/* 残業申請 */}
              {!dateInfo.overtime && (
                activeForm === 'overtime' ? (
                  <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100">
                    <p className="text-sm font-semibold text-orange-800 mb-3">残業申請</p>
                    <div className="mb-4">
                      <label className="text-xs text-gray-500 mb-1.5 block">終了予定時刻</label>
                      <input
                        type="time"
                        value={overtimeEnd}
                        onChange={e => setOvertimeEnd(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setActiveForm(null)} className="flex-1 rounded-xl py-3 text-sm text-gray-500 bg-white border border-gray-200">
                        キャンセル
                      </button>
                      <button
                        onClick={() => submit('/api/liff/staff/overtime', { date: selectedDate!, endTime: overtimeEnd })}
                        disabled={submitting}
                        className="flex-1 rounded-xl py-3 text-sm font-semibold text-white bg-orange-400 disabled:opacity-50 flex items-center justify-center gap-1 shadow-sm"
                      >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        申請する
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setActiveForm('overtime'); setToast(null) }}
                    className="w-full bg-orange-400 text-white rounded-2xl py-3.5 text-sm font-semibold shadow-sm active:opacity-80"
                  >
                    残業申請
                  </button>
                )
              )}

              {/* 中抜け申請 */}
              {activeForm === 'break' ? (
                <div className="bg-sky-50 rounded-2xl p-4 border border-sky-100">
                  <p className="text-sm font-semibold text-sky-800 mb-3">中抜け申請</p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">開始時刻</label>
                      <input
                        type="time"
                        value={breakStart}
                        onChange={e => setBreakStart(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">終了時刻</label>
                      <input
                        type="time"
                        value={breakEnd}
                        onChange={e => setBreakEnd(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setActiveForm(null)} className="flex-1 rounded-xl py-3 text-sm text-gray-500 bg-white border border-gray-200">
                      キャンセル
                    </button>
                    <button
                      onClick={() => submit('/api/liff/staff/break', { date: selectedDate!, startTime: breakStart, endTime: breakEnd })}
                      disabled={submitting}
                      className="flex-1 rounded-xl py-3 text-sm font-semibold text-white bg-sky-500 disabled:opacity-50 flex items-center justify-center gap-1 shadow-sm"
                    >
                      {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      記録する
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setActiveForm('break'); setToast(null) }}
                  className="w-full bg-sky-500 text-white rounded-2xl py-3.5 text-sm font-semibold shadow-sm active:opacity-80"
                >
                  中抜け申請
                </button>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
