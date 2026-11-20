'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getJapaneseHolidayName } from '@/lib/japanese-holidays'
import { getTodayJST } from '@/lib/utils'
import {
  EVENT_TYPES, EVENT_TYPE_INFO, hhmm, eventTimeLabel, validateEventInput,
  type EventType, type EventInput,
} from '@/lib/schedule-events'
import type { CalendarEvent, ChildOption, StaffOption } from './schedule-events-types'
import { AlertTriangle, Loader2, X, Users, Check } from 'lucide-react'

/**
 * 予定を足す・直すフォーム（システム管理者だけが開ける）。
 * 入れ間違いを防ぐために：
 * - 種類を最初に選ぶ（色と見本が決まる）。日付は空から始め、カレンダーの日から開いたときだけその日を入れる
 * - 日付の横にいつも曜日を出す
 * - 過去の日・祝日・休業日・同じ子の予定の重なり・お休みのスタッフは、止めずに黄色で知らせる
 * - 保存の前に1画面で確かめる。保存に失敗したら赤で出し、フォームは閉じない
 */

const DOW = ['日', '月', '火', '水', '木', '金', '土']

function withDow(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${y}年${m}月${d}日（${DOW[new Date(y, m - 1, d).getDay()]}）`
}

function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${m}/${d}`
}

function isMonitoringType(t: EventType | null): boolean {
  return t === 'monitoring'
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00').getTime()
  const b = new Date(to + 'T00:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

type Props = {
  /** 直すときの元の予定。足すときは null */
  editing: CalendarEvent | null
  /** カレンダーの日から開いたときの日付（足すとき） */
  initialDate: string | null
  childOptions: ChildOption[]
  staffOptions: StaffOption[]
  onClose: () => void
  onSaved: (date: string) => void
}

const inputClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50'

export function ScheduleEventForm({ editing, initialDate, childOptions, staffOptions, onClose, onSaved }: Props) {
  const today = getTodayJST()
  const [type, setType] = useState<EventType | null>(
    editing ? ((EVENT_TYPES as readonly string[]).includes(editing.event_type) ? (editing.event_type as EventType) : 'other') : null,
  )
  const [date, setDate] = useState(editing?.event_date ?? initialDate ?? '')
  const [allDay, setAllDay] = useState(editing ? editing.all_day || !editing.start_time : false)
  const [start, setStart] = useState(hhmm(editing?.start_time) ?? '')
  const [end, setEnd] = useState(hhmm(editing?.end_time) ?? '')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [childId, setChildId] = useState(editing?.child_id ?? '')
  const [staffMode, setStaffMode] = useState<'all' | 'some'>(editing && editing.staffUserIds.length > 0 ? 'some' : 'all')
  const [staffIds, setStaffIds] = useState<Set<string>>(new Set(editing?.staffUserIds ?? []))
  const [location, setLocation] = useState(editing?.location ?? '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [step, setStep] = useState<'edit' | 'confirm'>('edit')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 選んだ日の様子（注意を出すため）
  const [dayInfo, setDayInfo] = useState<{
    date: string
    closed: string | null
    offUserIds: Set<string>
    childEvents: { id: string; child_id: string | null }[]
  } | null>(null)

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    let cancelled = false
    const supabase = createClient()
    Promise.all([
      supabase.from('facility_events').select('event_type, title').eq('event_date', date),
      supabase.from('staff_shifts').select('staff_id, shift_type').eq('date', date),
      supabase.from('schedule_events').select('id, child_id').eq('event_date', date),
    ]).then(([fe, sh, ev]) => {
      if (cancelled) return
      const closed = ((fe.data ?? []) as { event_type: string; title: string }[]).find((f) => f.event_type === 'closed')
      setDayInfo({
        date,
        closed: closed ? closed.title || '休業日' : null,
        offUserIds: new Set(
          ((sh.data ?? []) as { staff_id: string; shift_type: string }[])
            .filter((s) => s.shift_type === 'off' || s.shift_type === 'holiday')
            .map((s) => s.staff_id),
        ),
        childEvents: (ev.data ?? []) as { id: string; child_id: string | null }[],
      })
    })
    return () => { cancelled = true }
  }, [date])

  const info = type ? EVENT_TYPE_INFO[type] : null
  const isMonitoring = type === 'monitoring'
  const effectiveTitle = isMonitoring ? 'モニタリング' : title

  // 選んだ子のモニタリング予定（児童管理 → モニタリングの「モニタリング予定」と同じデータ）。二重に入れないために読む
  const [childMonitoring, setChildMonitoring] = useState<{ childId: string; list: { id: string; event_date: string }[] } | null>(null)
  useEffect(() => {
    if (type !== 'monitoring' || !childId) return
    let cancelled = false
    createClient()
      .from('schedule_events')
      .select('id, event_date')
      .eq('child_id', childId)
      .eq('event_type', 'monitoring')
      .gte('event_date', today)
      .order('event_date')
      .then(({ data }) => {
        if (!cancelled) setChildMonitoring({ childId, list: (data ?? []) as { id: string; event_date: string }[] })
      })
    return () => { cancelled = true }
  }, [type, childId, today])
  const otherMonitoring =
    isMonitoringType(type) && childMonitoring?.childId === childId
      ? childMonitoring.list.filter((m) => m.id !== editing?.id)
      : []
  const sameDayMonitoring = otherMonitoring.find((m) => m.event_date === date) ?? null

  // モニタリングは見直し日が近い子から
  const childChoices = useMemo(() => {
    if (!isMonitoring) return childOptions
    return [...childOptions].sort((a, b) => {
      if (!a.reviewDate && !b.reviewDate) return 0
      if (!a.reviewDate) return 1
      if (!b.reviewDate) return -1
      return a.reviewDate.localeCompare(b.reviewDate)
    })
  }, [childOptions, isMonitoring])

  const childName = childOptions.find((c) => c.id === childId)?.name ?? null
  const selectedStaff = staffOptions.filter((s) => staffIds.has(s.userId))

  const warnings: string[] = []
  if (date) {
    if (date < today) warnings.push('今日より前の日です')
    const holiday = getJapaneseHolidayName(date)
    if (holiday) warnings.push(`祝日（${holiday}）です`)
    if (dayInfo?.date === date) {
      if (dayInfo.closed) warnings.push(`施設カレンダーで休業日（${dayInfo.closed}）です`)
      if (childId && !sameDayMonitoring && dayInfo.childEvents.some((e) => e.child_id === childId && e.id !== editing?.id)) {
        warnings.push(`同じ日に ${childName ?? 'この子'} の予定がもうあります`)
      }
      if (staffMode === 'some') {
        const off = selectedStaff.filter((s) => dayInfo.offUserIds.has(s.userId)).map((s) => s.name)
        if (off.length > 0) warnings.push(`${off.join('・')} はこの日お休みです（シフト）`)
      }
    }
  }
  if (isMonitoring && childId) {
    const others = otherMonitoring.filter((m) => m.event_date !== date)
    if (others.length > 0) {
      warnings.push(`${childName ?? 'この子'} には ${others.map((m) => withDow(m.event_date)).join('・')} のモニタリング予定もあります（児童管理のモニタリング予定と同じものです）`)
    }
    const rd = childOptions.find((c) => c.id === childId)?.reviewDate
    if (rd && date && date > rd) warnings.push(`見直し日（${shortDate(rd)}）より後の日です`)
  }

  const input: EventInput = {
    event_type: type ?? '',
    title: effectiveTitle,
    event_date: date,
    all_day: allDay,
    start_time: allDay ? null : start || null,
    end_time: allDay ? null : end || null,
    location: location.trim() || null,
    note: note.trim() || null,
    child_id: childId || null,
    staff_user_ids: staffMode === 'some' ? Array.from(staffIds) : [],
  }
  const problem =
    validateEventInput(input) ??
    (sameDayMonitoring
      ? `${childName ?? 'この子'} のモニタリングは ${withDow(sameDayMonitoring.event_date)} にもう入っています。入っている予定を「直す」で直してください`
      : null) ??
    (staffMode === 'some' && staffIds.size === 0 ? '参加スタッフを選ぶか「全員」にしてください' : null)

  function chooseType(t: EventType) {
    setType(t)
    // 行事はたいてい1日がかりなので、足すときだけ「終日」を初めに入れておく
    if (!editing && t === 'event' && !start) setAllDay(true)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/schedule-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { action: 'update', id: editing.id, event: input } : { action: 'create', event: input }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(json.error ?? `保存できませんでした（${res.status}）`)
        setStep('edit')
        return
      }
      onSaved(date)
    } catch {
      setError('通信できませんでした。もう一度押してください')
      setStep('edit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={() => { if (!saving) onClose() }} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {step === 'confirm' ? 'この内容で保存しますか？' : editing ? '予定を直す' : '予定を追加'}
          </h2>
          <button onClick={onClose} disabled={saving} className="p-1 text-gray-400 hover:text-gray-700" aria-label="閉じる">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <p className="mx-5 mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {step === 'edit' ? (
          <div className="px-5 py-4 space-y-4">
            {/* ① 種類 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">① 種類（まず選んでください）</p>
              <div className="flex flex-wrap gap-1.5">
                {EVENT_TYPES.map((t) => {
                  const ti = EVENT_TYPE_INFO[t]
                  const on = type === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => chooseType(t)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        on ? `${ti.chip} border-transparent font-semibold ring-2 ring-offset-1 ring-indigo-400` : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${ti.dot}`} />
                      {ti.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {type && (
              <>
                {/* ② 日付 */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">② 日付</p>
                  <div className="flex items-center gap-3">
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} max-w-[11rem]`} />
                    <span className="text-sm font-semibold text-gray-800">{date ? withDow(date) : <span className="text-gray-400 font-normal">日付を選んでください</span>}</span>
                  </div>
                </div>

                {/* ③ 時間 */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">③ 時間</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-sm text-gray-700 mr-2">
                      <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4" />
                      終日
                    </label>
                    {!allDay && (
                      <>
                        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={`${inputClass} max-w-[8rem]`} aria-label="開始" />
                        <span className="text-gray-400">〜</span>
                        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={`${inputClass} max-w-[8rem]`} aria-label="終了（なくてもよい）" />
                        <span className="text-xs text-gray-400">終了はなくてもかまいません</span>
                      </>
                    )}
                  </div>
                </div>

                {/* ④ タイトル／その他は内容 */}
                {!isMonitoring && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">
                      ④ {type === 'other' ? '内容（自由に書けます）' : 'タイトル'}
                    </p>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={info?.placeholder}
                      maxLength={100}
                      className={inputClass}
                    />
                  </div>
                )}

                {/* ⑤ 対象の子 */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">
                    {isMonitoring ? '④ 対象の子（必ず1人・見直し日が近い順）' : '⑤ 対象の子（いなければ「なし」）'}
                  </p>
                  <select value={childId} onChange={(e) => setChildId(e.target.value)} className={inputClass}>
                    <option value="">{isMonitoring ? '選んでください' : 'なし'}</option>
                    {childChoices.map((c) => {
                      const near = isMonitoring && c.reviewDate && daysBetween(today, c.reviewDate) <= 45
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {isMonitoring ? (c.reviewDate ? `（見直し ${shortDate(c.reviewDate)}${near ? '・近い' : ''}）` : '（見直し日なし）') : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>

                {/* ⑥ 参加スタッフ */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">{isMonitoring ? '⑤' : '⑥'} 参加スタッフ</p>
                  <div className="flex gap-2 mb-2">
                    {([['all', '全員'], ['some', '選んだ人だけ']] as const).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setStaffMode(k)}
                        className={`px-3 py-1.5 rounded-full text-sm border ${
                          staffMode === k ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {staffMode === 'some' && staffOptions.length === 0 && (
                    <p className="text-xs text-gray-500">
                      選べるスタッフがいません（ログインアカウントと紐づいたスタッフだけ選べます）。「全員」にしてください。
                    </p>
                  )}
                  {staffMode === 'some' && (
                    <div className="flex flex-wrap gap-1.5">
                      {staffOptions.map((s) => {
                        const on = staffIds.has(s.userId)
                        return (
                          <button
                            key={s.userId}
                            type="button"
                            onClick={() => {
                              const next = new Set(staffIds)
                              if (on) next.delete(s.userId)
                              else next.add(s.userId)
                              setStaffIds(next)
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm border ${
                              on ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {on && <Check className="h-3.5 w-3.5" />}
                            {s.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* ⑦ 場所・メモ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">{isMonitoring ? '⑥' : '⑦'} 場所（なくてもよい）</p>
                    <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="例：相談室" maxLength={100} className={inputClass} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">メモ（なくてもよい）</p>
                    <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="持ち物・連絡など" maxLength={1000} className={inputClass} />
                  </div>
                </div>

                {sameDayMonitoring && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    {childName ?? 'この子'} のモニタリングは {withDow(sameDayMonitoring.event_date)} にもう入っています（児童管理のモニタリング予定と同じものです）。二重にならないよう、ここでは保存できません。入っている予定を「直す」で直してください。
                  </p>
                )}

                {warnings.length > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 space-y-1">
                    {warnings.map((w) => (
                      <p key={w} className="flex items-start gap-1.5 text-sm text-amber-800">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        {w}
                      </p>
                    ))}
                    <p className="text-xs text-amber-700 pl-5">まちがいでなければ、このまま進めてかまいません。</p>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
                やめる
              </button>
              <button
                onClick={() => { setError(null); setStep('confirm') }}
                disabled={!type || !!problem}
                title={problem ?? undefined}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                確認へ
              </button>
            </div>
            {type && problem && <p className="text-xs text-gray-500 text-right -mt-2">{problem}</p>}
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <div className="rounded-xl border border-gray-200 p-4 space-y-2">
              <p className="text-lg font-bold text-gray-900">{withDow(date)}</p>
              <p className="text-sm text-gray-700">{eventTimeLabel(input)}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {info && <span className={`text-xs px-2 py-0.5 rounded font-medium ${info.chip}`}>{info.label}</span>}
                <span className="text-sm font-semibold text-gray-900">{effectiveTitle}</span>
                {childName && <span className="text-sm text-gray-600">{childName}</span>}
              </div>
              {input.location && <p className="text-sm text-gray-600">場所：{input.location}</p>}
              <p className="flex items-center gap-1 text-sm text-gray-600">
                <Users className="h-4 w-4 text-gray-400" />
                参加：{staffMode === 'all' ? '全員' : selectedStaff.map((s) => s.name).join('・')}
              </p>
              {input.note && <p className="text-sm text-gray-600 whitespace-pre-wrap">メモ：{input.note}</p>}
            </div>
            {warnings.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 space-y-1">
                {warnings.map((w) => (
                  <p key={w} className="flex items-start gap-1.5 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500">保存すると、スタッフの LINE の「会議・予定」にすぐ出ます。</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setStep('edit')} disabled={saving} className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
                もどる
              </button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                この内容で保存
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
