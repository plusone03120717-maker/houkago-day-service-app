'use client'

import { useState } from 'react'
import { getJapaneseHolidayName } from '@/lib/japanese-holidays'
import { Loader2, ChevronLeft, ChevronRight, X, Car, Clock } from 'lucide-react'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import {
  resolveAssignment,
  describeAssignment,
  SERVICE_ASSIGNMENT_LABELS,
  type ServiceAssignmentType,
} from '@/lib/parent-contact-service'

/**
 * 保護者が利用する日を連絡するカレンダー。
 *
 * 保護者向けの入口は保護者ポータルに一本化しているため、この画面が唯一の実装。
 * データの出し入れは呼び出し側に任せてあるので、ログインの仕組みが変わっても
 * このコンポーネントは触らなくてよい。
 *
 * お休み・キャンセルはこの画面からは送れない（施設が電話で受ける）。
 * 施設が登録した欠席を「表示」することはある。
 *
 * サービス区分（放デイ / 日中一時）も保護者には選ばせない。使えるかどうかは
 * 受給者証と支給量の残りで決まり、保護者は判断材料を持っていないため、
 * 施設が承認するときに割り振る（@/lib/parent-contact-service）。
 * 保護者が送るのは「利用したい時間」と「送迎の希望」だけ。
 */

export type TransportType = 'none' | 'pickup_only' | 'dropoff_only' | 'both'

export type UsageContactChild = { id: string; name: string }

export type UsageContact = {
  child_id: string
  date: string
  status: 'attending' | 'absent'
  /** 施設が承認時に割り振ったサービス区分。保護者は選ばない */
  service_type: ServiceAssignmentType
  /** 保護者が希望した利用時間 */
  service_start_time: string | null
  service_end_time: string | null
  /** 施設が割り振った放デイ・日中一時の時間 */
  assigned_service_start_time: string | null
  assigned_service_end_time: string | null
  assigned_daytime_start_time: string | null
  assigned_daytime_end_time: string | null
  transport_type: TransportType
  pickup_time: string | null
  dropoff_time: string | null
  note: string | null
  approval_status: 'pending' | 'approved' | 'rejected'
  /** 施設が予定へ反映した時刻。null＝まだ反映されていない */
  applied_at: string | null
}

/** 施設がお休みの日。この日は利用連絡を送れない */
export type FacilityClosure = {
  date: string
  title: string
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
  serviceStartTime: string | null
  serviceEndTime: string | null
  transportType: TransportType
  pickupTime: string | null
  dropoffTime: string | null
  note: string
}

type EntryState = {
  /** この日は利用する、と選んだか。false の子は送信対象から外れる */
  attending: boolean
  serviceStart: string
  serviceEnd: string
  /** 送迎はその日に「行き」「帰り」の2本しかない。サービスごとには聞かない */
  goPickup: boolean
  goDropoff: boolean
  pickupTime: string
  dropoffTime: string
  note: string
}

/**
 * 送迎の希望を transport_type に組み立てる。
 *
 * 子どもが家を出るのは1日1回、帰るのも1回。放デイと日中一時を続けて使う日でも
 * 送迎は2本のままなので、サービスごとに聞かず「行き」「帰り」で受け取る。
 * どちらのサービスの送迎として記録するかは、時間から施設側が判定する
 * （@/lib/schedule-defaults の resolveTransportSlot）。
 */
function toTransportType(goPickup: boolean, goDropoff: boolean): TransportType {
  if (goPickup && goDropoff) return 'both'
  if (goPickup) return 'pickup_only'
  if (goDropoff) return 'dropoff_only'
  return 'none'
}

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

/**
 * 保護者が選べるのは「利用する」だけ。
 *
 * お休みは、いつ連絡があったかで欠席時対応加算の算定可否が変わり、
 * 事前のキャンセルなのか当日の欠席なのかを保護者に選ばせると手続きが煩雑になる。
 * お休みの連絡は施設で直接受け、スタッフが利用状況ページで
 * 「欠席」か「削除」かを判断して記録する。
 *
 * サービス区分も選ばせないので、カレンダーの丸は「連絡済み」の1種類だけでよい。
 */
const CONTACT_DOT = 'bg-indigo-500'

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
    // どのサービスとして受けてもらえたかは保護者にも関わる（利用者負担が別枠になる）
    const a = resolveAssignment(c)
    return {
      text: `施設が承認しました（${SERVICE_ASSIGNMENT_LABELS[a.serviceType]}）`,
      tone: 'ok',
    }
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

type Props = {
  childrenList: UsageContactChild[]
  contacts: UsageContact[]
  /** 施設側ですでに決まっている利用日 */
  schedule: FacilityScheduleDay[]
  /** 施設がお休みの日 */
  closures: FacilityClosure[]
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
  closures,
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

  /** その日が施設のお休みなら、その予定名を返す */
  function closureOn(dateStr: string): string | null {
    return closures.find((c) => c.date === dateStr)?.title ?? null
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
      const transport = existing?.transport_type ?? 'none'
      init[child.id] = existing
        ? {
            attending: existing.status === 'attending',
            serviceStart: toTimeInput(existing.service_start_time),
            serviceEnd: toTimeInput(existing.service_end_time),
            goPickup: transport === 'pickup_only' || transport === 'both',
            goDropoff: transport === 'dropoff_only' || transport === 'both',
            pickupTime: toTimeInput(existing.pickup_time),
            dropoffTime: toTimeInput(existing.dropoff_time),
            note: existing.note ?? '',
          }
        : {
            attending: false,
            serviceStart: '',
            serviceEnd: '',
            goPickup: false,
            goDropoff: false,
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

    const targets = childrenList.filter((c) => entries[c.id]?.attending)
    if (targets.length === 0) {
      setToast({ ok: false, message: '利用するお子さまを選択してください' })
      return
    }

    // 利用時間の前後関係を送信前に確認する
    for (const c of targets) {
      const e = entries[c.id]
      if (e.serviceStart && e.serviceEnd && e.serviceStart >= e.serviceEnd) {
        setToast({ ok: false, message: `${c.name}さんの利用時間は終了を開始より後にしてください` })
        return
      }
    }

    const payload: UsageContactEntry[] = targets.map((c) => {
      const e = entries[c.id]
      return {
        childId: c.id,
        status: 'attending',
        serviceStartTime: e.serviceStart,
        serviceEndTime: e.serviceEnd,
        transportType: toTransportType(e.goPickup, e.goDropoff),
        pickupTime: e.goPickup ? e.pickupTime : null,
        dropoffTime: e.goDropoff ? e.dropoffTime : null,
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
              const closure = closureOn(dateStr)
              return (
                <button
                  key={idx}
                  onClick={() => openDate(dateStr)}
                  disabled={isPast}
                  title={closure ?? holidayName ?? undefined}
                  className={`relative flex flex-col items-center justify-start pt-1.5 h-12 rounded-xl mx-0.5 mb-0.5 transition-colors ${
                    isSelected ? 'bg-indigo-100' :
                    closure ? 'bg-gray-100' :
                    isToday ? 'bg-indigo-50' :
                    isPast ? '' :
                    holidayName ? 'bg-red-50/60 hover:bg-gray-50 active:bg-gray-100' : 'hover:bg-gray-50 active:bg-gray-100'
                  }`}
                >
                  <span className={`text-sm font-medium leading-none ${
                    isSelected ? 'text-indigo-700' :
                    closure ? 'text-gray-400 line-through' :
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
                  {/* 施設がお休みの日は連絡を送れないことがひと目で分かるようにする */}
                  {closure && (
                    <span className="mt-0.5 text-[9px] leading-none font-medium text-gray-400">休</span>
                  )}
                  <div className="flex gap-0.5 mt-1">
                    {dayContacts.slice(0, 3).map((c, i) => (
                      <span
                        key={i}
                        aria-label="連絡済み"
                        className={`w-1.5 h-1.5 rounded-full ${CONTACT_DOT} ${isPast ? 'opacity-40' : ''}`}
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
            <div className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${CONTACT_DOT}`} />
              <span className="text-xs text-gray-400">連絡済み</span>
            </div>
          </div>
          <div className="flex gap-3 justify-center flex-wrap">
            <span className="text-xs text-gray-400">施設の予定</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] leading-none text-gray-400">休</span>
              <span className="text-xs text-gray-400">休業日</span>
            </div>
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

              {contactsOn(selectedDate).length > 0 && !toast && !closureOn(selectedDate) && (
                <p className="text-xs text-gray-400 text-center">
                  送信済みの連絡です。変更して再送信できます
                </p>
              )}

              {/* 施設がお休みの日は入力欄そのものを出さない。
                  選ばせてから断るより、開いた時点で伝えるほうが分かりやすい */}
              {closureOn(selectedDate) ? (
                <div className="rounded-2xl bg-gray-100 border border-gray-200 px-4 py-5 text-center">
                  <p className="text-sm font-bold text-gray-700">この日は施設がお休みです</p>
                  <p className="mt-1 text-sm text-gray-600">{closureOn(selectedDate)}</p>
                  <p className="mt-2 text-xs text-gray-500">
                    ご利用いただけないため、利用連絡は送れません
                  </p>
                </div>
              ) : (
                <>
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
                        <div className="mb-3">
                          <p
                            className={`text-xs ${
                              tone === 'ok' ? 'text-emerald-600'
                              : tone === 'ng' ? 'text-red-600'
                              : 'text-gray-500'
                            }`}
                          >
                            {text}
                          </p>
                          {/* どのサービスとして何時から何時までになったか。
                              日中一時は利用者負担が放デイと別枠なので保護者にも関わる */}
                          {sent.status === 'attending' && sent.applied_at && (
                            <p className="mt-0.5 text-[11px] text-gray-500">
                              {describeAssignment(resolveAssignment(sent))}
                            </p>
                          )}
                        </div>
                      )
                    })()}

                    {/* 選ぶのは「利用するかどうか」だけ。
                        放デイか日中一時かは施設が承認するときに割り振る */}
                    <button
                      onClick={() => updateEntry(child.id, { attending: !entry.attending })}
                      className={`w-full rounded-xl py-3 text-sm font-semibold transition-colors mb-3 ${
                        entry.attending
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white text-gray-600 border border-gray-200'
                      }`}
                    >
                      {entry.attending ? 'この日は利用します' : '利用する日として連絡する'}
                    </button>

                    {entry.attending && (
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

                        {/* 送迎。その日の「行き」「帰り」を1回ずつ聞く。
                            通しで使う日でも家を出るのは1回・帰るのも1回なので、
                            サービスごとには分けない */}
                        <div className="bg-white rounded-xl px-4 py-3 mb-3 border border-gray-200">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Car className="h-3.5 w-3.5 text-indigo-500" />
                            <span className="text-xs font-semibold text-gray-600">送迎</span>
                            <span className="text-[10px] text-gray-400">（必要なものを選ぶ）</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => updateEntry(child.id, { goPickup: !entry.goPickup })}
                              className={`rounded-lg py-2.5 text-xs font-medium transition-colors ${
                                entry.goPickup
                                  ? 'bg-indigo-500 text-white shadow-sm'
                                  : 'bg-gray-50 text-gray-600 border border-gray-200'
                              }`}
                            >
                              行き
                            </button>
                            <button
                              onClick={() => updateEntry(child.id, { goDropoff: !entry.goDropoff })}
                              className={`rounded-lg py-2.5 text-xs font-medium transition-colors ${
                                entry.goDropoff
                                  ? 'bg-indigo-500 text-white shadow-sm'
                                  : 'bg-gray-50 text-gray-600 border border-gray-200'
                              }`}
                            >
                              帰り
                            </button>
                          </div>
                          {!entry.goPickup && !entry.goDropoff && (
                            <p className="mt-2 text-[10px] text-gray-400">
                              どちらも選ばない場合は「送迎なし」として連絡します
                            </p>
                          )}

                          {entry.goPickup && (
                            <div className="mt-3">
                              <label className="text-[10px] text-gray-400 mb-1 block">
                                行きの希望時刻（自宅・学校へ迎えに行く時間）
                              </label>
                              <TimeSelect
                                ariaLabel={`${child.name}の行きの希望時刻`}
                                value={entry.pickupTime}
                                onChange={(v) => updateEntry(child.id, { pickupTime: v })}
                              />
                            </div>
                          )}

                          {entry.goDropoff && (
                            <div className="mt-3">
                              <label className="text-[10px] text-gray-400 mb-1 block">
                                帰りの希望時刻（自宅へ送り届ける時間）
                              </label>
                              <TimeSelect
                                ariaLabel={`${child.name}の帰りの希望時刻`}
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

              {/* 保護者に区分を選ばせない代わりに、誰が決めるのかは伝えておく */}
              <div className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3">
                <p className="text-xs text-blue-800">
                  <strong>サービスの種類について</strong>
                </p>
                <p className="mt-1 text-xs text-blue-700">
                  放課後等デイサービスと日中一時支援のどちらでお預かりするかは、
                  受給者証の内容をもとに施設で決めてご連絡します。
                  ご希望の時間と送迎だけお知らせください。
                </p>
              </div>

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
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
