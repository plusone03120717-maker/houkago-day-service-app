'use client'

import { useState } from 'react'
import { getJapaneseHolidayName } from '@/lib/japanese-holidays'
import { Loader2, ChevronLeft, ChevronRight, X, Car, Clock } from 'lucide-react'
import { AutoTextarea } from '@/components/ui/auto-textarea'

/**
 * 保護者が利用する日を連絡するカレンダー。
 *
 * 保護者向けの入口は保護者ポータルに一本化しているため、この画面が唯一の実装。
 * データの出し入れは呼び出し側に任せてあるので、ログインの仕組みが変わっても
 * このコンポーネントは触らなくてよい。
 *
 * お休み・キャンセルはこの画面からは送れない（SELECTABLE_CHOICES 参照）。
 * 施設が登録した欠席を「表示」することはある。
 */

export type TransportType = 'none' | 'pickup_only' | 'dropoff_only' | 'both'

export type UsageContactChild = { id: string; name: string }

export type UsageContact = {
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
  approval_status: 'pending' | 'approved' | 'rejected'
  /** 施設が予定へ反映した時刻。null＝まだ反映されていない */
  applied_at: string | null
}

/** 施設側で決まっているその日の状態 */
export type FacilityScheduleDay = {
  child_id: string
  date: string
  kind: 'planned' | 'absent' | 'attended'
}

export type UsageContactEntry = {
  childId: string
  status: 'attending' | 'absent'
  serviceType?: 'regular' | 'daytime_support'
  serviceStartTime: string | null
  serviceEndTime: string | null
  transportType: TransportType
  pickupTime: string | null
  dropoffTime: string | null
  note: string
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

/**
 * 保護者が選べるのは「利用する」だけ。
 *
 * お休みは、いつ連絡があったかで欠席時対応加算の算定可否が変わり、
 * 事前のキャンセルなのか当日の欠席なのかを保護者に選ばせると手続きが煩雑になる。
 * お休みの連絡は施設で直接受け、スタッフが利用状況ページで
 * 「欠席」か「削除」かを判断して記録する。
 *
 * absent は施設が登録した欠席を表示するために型としては残してある。
 */
const SELECTABLE_CHOICES: Choice[] = ['regular', 'daytime_support']

/** 施設側の予定。自分の連絡（下の丸）と区別できるよう、マス目の右上に四角で出す */
const SCHEDULE_META: Record<FacilityScheduleDay['kind'], { label: string; box: string }> = {
  planned: { label: '利用予定', box: 'bg-blue-500' },
  attended: { label: '利用済み', box: 'bg-gray-400' },
  absent: { label: '欠席', box: 'bg-red-300' },
}

/**
 * 送った連絡が施設でどう扱われているかを伝える文言。
 *
 * お休みの連絡は承認の対象外で approval_status が pending のまま変わらないため、
 * 承認状態ではなく「予定へ反映されたか（applied_at）」で判断する。
 * ここを承認状態だけで見ていると、反映済みでも「確認中」と出続けてしまう。
 */
function statusMessage(c: UsageContact): { text: string; tone: 'ok' | 'ng' | 'wait' } {
  if (c.status === 'absent') {
    return c.applied_at
      ? { text: '施設がお休みとして登録しました', tone: 'ok' }
      : { text: 'お休みの連絡を送信しました。施設で確認中です', tone: 'wait' }
  }
  if (c.approval_status === 'approved') {
    return { text: '施設が承認しました', tone: 'ok' }
  }
  if (c.approval_status === 'rejected') {
    return { text: 'この日は受け入れができませんでした。施設にお問い合わせください', tone: 'ng' }
  }
  return { text: '施設で確認中です', tone: 'wait' }
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayStr(): string {
  const n = new Date()
  return toDateStr(n.getFullYear(), n.getMonth() + 1, n.getDate())
}

function contactToChoice(c: UsageContact): Choice {
  return c.status === 'absent'
    ? 'absent'
    : c.service_type === 'daytime_support'
      ? 'daytime_support'
      : 'regular'
}

type Props = {
  childrenList: UsageContactChild[]
  contacts: UsageContact[]
  /** 施設側ですでに決まっている利用日 */
  schedule: FacilityScheduleDay[]
  year: number
  month: number
  loading: boolean
  onMonthChange: (year: number, month: number) => void
  onSubmit: (date: string, entries: UsageContactEntry[]) => Promise<{ error?: string }>
  /** 「お子さまを追加登録する」のリンク先。null なら出さない */
  addChildHref?: string | null
}

export function UsageContactCalendar({
  childrenList,
  contacts,
  schedule,
  year,
  month,
  loading,
  onMonthChange,
  onSubmit,
  addChildHref = null,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [entries, setEntries] = useState<Record<string, EntryState>>({})
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null)

  function buildCells(): (number | null)[] {
    const firstDow = new Date(year, month - 1, 1).getDay()
    const lastDay = new Date(year, month, 0).getDate()
    const cells: (number | null)[] = Array(firstDow).fill(null)
    for (let d = 1; d <= lastDay; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }

  function contactsOn(dateStr: string): UsageContact[] {
    return contacts.filter((c) => c.date === dateStr)
  }

  function scheduleOn(dateStr: string): FacilityScheduleDay[] {
    return schedule.filter((s) => s.date === dateStr)
  }

  /** マス目の右上に出す印。同じ日に複数いる場合は「利用予定」を優先して1つだけ出す */
  function scheduleMarkOn(dateStr: string): FacilityScheduleDay['kind'] | null {
    const kinds = scheduleOn(dateStr).map((s) => s.kind)
    if (kinds.includes('planned')) return 'planned'
    if (kinds.includes('attended')) return 'attended'
    if (kinds.includes('absent')) return 'absent'
    return null
  }

  function prevMonth() {
    const p = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 }
    setSelectedDate(null)
    onMonthChange(p.y, p.m)
  }

  function nextMonth() {
    const n = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
    setSelectedDate(null)
    onMonthChange(n.y, n.m)
  }

  function openDate(dateStr: string) {
    const dayContacts = contactsOn(dateStr)
    const init: Record<string, EntryState> = {}
    for (const child of childrenList) {
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

  function handleSubmit() {
    if (!selectedDate) return

    const targets = childrenList.filter((c) => entries[c.id]?.choice != null)
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

    const payload: UsageContactEntry[] = targets.map((c) => {
      const e = entries[c.id]
      const attending = e.choice !== 'absent'
      return {
        childId: c.id,
        status: attending ? 'attending' : 'absent',
        serviceType: attending ? (e.choice as 'regular' | 'daytime_support') : undefined,
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
    onSubmit(selectedDate, payload)
      .then((result) => {
        setToast(
          result.error
            ? { ok: false, message: result.error }
            : { ok: true, message: '連絡を送信しました' }
        )
      })
      .finally(() => setSubmitting(false))
  }

  const cells = buildCells()
  const today = todayStr()
  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : null
  const selectedHolidayName = selectedDate ? getJapaneseHolidayName(selectedDate) : null

  return (
    <div>
      {/* 月ナビゲーション */}
      <div className="bg-white border border-gray-100 rounded-2xl flex items-center justify-between px-4 py-2.5 shadow-sm">
        <button
          onClick={prevMonth}
          aria-label="前の月"
          className="p-2 text-gray-400 hover:text-gray-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-semibold text-gray-800 text-sm">{year}年{month}月</span>
        <button
          onClick={nextMonth}
          aria-label="次の月"
          className="p-2 text-gray-400 hover:text-gray-700"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* カレンダー */}
      <div className="bg-white mt-3 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DOW.map((d, i) => (
            <div
              key={d}
              className={`py-2 text-center text-xs font-medium ${
                i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-400'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {loading ? (
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
              const scheduleMark = scheduleMarkOn(dateStr)
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
                      <span
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${CHOICE_META[contactToChoice(c)].dot} ${isPast ? 'opacity-40' : ''}`}
                      />
                    ))}
                  </div>
                  {/* 施設側の予定。自分の連絡（下の丸）と見分けられるよう右上に四角で出す */}
                  {scheduleMark && (
                    <span
                      aria-label={SCHEDULE_META[scheduleMark].label}
                      className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-[2px] ${SCHEDULE_META[scheduleMark].box} ${isPast ? 'opacity-40' : ''}`}
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* 凡例。自分が送った連絡（下の丸）と、施設の予定（右上の四角）を分けて示す */}
        <div className="border-t border-gray-100 px-3 py-3 space-y-1.5">
          <div className="flex gap-3 justify-center flex-wrap">
            <span className="text-xs text-gray-400">自分の連絡</span>
            {SELECTABLE_CHOICES.map((k) => (
              <div key={k} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${CHOICE_META[k].dot}`} />
                <span className="text-xs text-gray-400">{CHOICE_META[k].label}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 justify-center flex-wrap">
            <span className="text-xs text-gray-400">施設の予定</span>
            {(Object.keys(SCHEDULE_META) as FacilityScheduleDay['kind'][]).map((k) => (
              <div key={k} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-[2px] ${SCHEDULE_META[k].box}`} />
                <span className="text-xs text-gray-400">{SCHEDULE_META[k].label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-3">日付をタップして利用連絡</p>
      <p className="text-center text-xs text-gray-400 mt-1">
        お休み・キャンセルのご連絡は施設へお電話ください
      </p>

      {addChildHref && (
        <div className="text-center mt-4">
          <a href={addChildHref} className="text-xs text-indigo-600 underline">
            お子さまを追加登録する
          </a>
        </div>
      )}

      {/* 日付詳細シート */}
      {selectedDate && selectedDateObj && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={closeSheet} />
          <div
            className="relative bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto mx-auto w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100">
              <p className={`font-bold ${selectedHolidayName || selectedDateObj.getDay() === 0 ? 'text-red-500' : 'text-gray-900'}`}>
                {selectedDateObj.getMonth() + 1}月{selectedDateObj.getDate()}日
                <span className="ml-1 font-normal text-gray-400 text-sm">（{DOW[selectedDateObj.getDay()]}）</span>
                {selectedHolidayName && (
                  <span className="ml-2 text-xs font-medium text-red-500">{selectedHolidayName}</span>
                )}
              </p>
              <button onClick={closeSheet} aria-label="閉じる" className="p-1.5 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-4 pt-3 pb-8 space-y-3">
              {toast && (
                <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                  toast.ok ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                }`}>
                  {toast.message}
                </div>
              )}

              {contactsOn(selectedDate).length > 0 && !toast && (
                <p className="text-xs text-gray-400 text-center">
                  送信済みの連絡です。変更して再送信できます
                </p>
              )}

              {childrenList.map((child) => {
                const entry = entries[child.id]
                if (!entry) return null
                const sched = scheduleOn(selectedDate).find((s) => s.child_id === child.id)
                const sent = contactsOn(selectedDate).find((c) => c.child_id === child.id)
                return (
                  <div key={child.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <p className="font-semibold text-gray-900 mb-3">{child.name}</p>

                    {/* 施設側の状況。すでに予定がある日に重ねて連絡しなくて済むようにする。
                        まだ反映されていない連絡を送っている日は「連絡は不要」と言わない
                        （お休みを伝えた直後にそう出ると、伝わっていないように見えるため） */}
                    {sched && (
                      <div className="mb-3 flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2">
                        <span className={`mt-1 w-2 h-2 shrink-0 rounded-[2px] ${SCHEDULE_META[sched.kind].box}`} />
                        <p className="text-xs text-blue-800">
                          {sched.kind === 'planned' && (
                            sent && !sent.applied_at
                              ? '施設の予定では、この日は利用することになっています'
                              : 'この日はすでに利用予定が入っています。変更がなければ連絡は不要です'
                          )}
                          {sched.kind === 'attended' && 'この日はご利用済みです'}
                          {sched.kind === 'absent' && 'この日はお休みとして登録されています'}
                        </p>
                      </div>
                    )}

                    {/* 送信済みの連絡が、施設でどう扱われているか */}
                    {sent && (() => {
                      const { text, tone } = statusMessage(sent)
                      return (
                        <p
                          className={`mb-3 text-xs ${
                            tone === 'ok' ? 'text-emerald-600'
                            : tone === 'ng' ? 'text-red-600'
                            : 'text-gray-500'
                          }`}
                        >
                          {text}
                        </p>
                      )
                    })()}

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {SELECTABLE_CHOICES.map((choice) => (
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

                    <AutoTextarea
                      value={entry.note}
                      onChange={(e) => updateEntry(child.id, { note: e.target.value })}
                      placeholder="備考（任意）"
                      minRows={2}
                      maxRows={10}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm leading-relaxed text-gray-700 placeholder-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                )
              })}

              {/* お休みはこの画面から送れない。どうすればよいかを必ず示す */}
              <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3">
                <p className="text-xs text-amber-800">
                  <strong>お休みのご連絡について</strong>
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  お休み・キャンセルはこの画面からは送れません。
                  お手数ですが、施設へ直接お電話でご連絡ください。
                </p>
              </div>

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
