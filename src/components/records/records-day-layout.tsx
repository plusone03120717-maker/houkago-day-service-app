'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle, PencilLine } from 'lucide-react'
import { DateNav } from '@/components/ui/date-nav'

/**
 * 日々の記録を「1画面で全員分」書くための外枠（2026-11-17 施設長の了承・C案）。
 * 左にその日に出席した子の一覧（済・未）、右に今の入力フォーム。
 *
 * まちがいを防ぐしくみ:
 *  - 書いている子の名前と日付は、フォーム側の帯にいつも出す
 *  - 子を変えるとフォームを作り直す（key が変わる）ので、前の子の文は残らない
 *  - 保存していない入力があるときに別の子を選ぶと「保存していません」と聞く
 *  - ブラウザを閉じる・別のページへ移るときも、保存していなければブラウザが聞く
 *  - 日付を変える・前の一覧へ移るときも、保存していなければ聞く
 *
 * 「日々の記録」を開くと、はじめからこの画面が出る（/records がその日の最初の未記録の子へ送る）。
 * 日付は上の切りかえで変える。出欠・送迎の入力がある前の一覧は、右上のリンクから開ける。
 */

export type RosterItem = {
  childId: string
  unitId: string
  name: string
  nameKana: string | null
  /** 日常記録を保存ずみか */
  recorded: boolean
}

export const UNSAVED_MESSAGE = 'この子の記録を保存していません。保存しないで移りますか？'

export function recordHref(item: Pick<RosterItem, 'childId' | 'unitId'>, date: string) {
  return `/records/${item.childId}?date=${date}&unit=${item.unitId}`
}

/** YYYY-MM-DD の n 日あと（時差でずれないよう UTC で数える） */
function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 今の子のあとで、まだ記録していない最初の子（なければ前に戻って探す）。いなければ null */
export function nextUnrecorded(roster: RosterItem[], current: Pick<RosterItem, 'childId' | 'unitId'>): RosterItem | null {
  const i = roster.findIndex((r) => r.childId === current.childId && r.unitId === current.unitId)
  const ordered = i < 0 ? roster : [...roster.slice(i + 1), ...roster.slice(0, i)]
  return ordered.find((r) => !r.recorded) ?? null
}

interface Props {
  roster: RosterItem[]
  date: string
  current: Pick<RosterItem, 'childId' | 'unitId'>
  /** フォームに保存していない入力があるか（フォームから知らせる） */
  dirty: boolean
  children: ReactNode
}

export function RecordsDayLayout({ roster, date, current, dirty, children }: Props) {
  const router = useRouter()
  const dirtyRef = useRef(dirty)
  useEffect(() => { dirtyRef.current = dirty }, [dirty])

  // 保存していないままページを離れる（閉じる・再読みこみ）ときは、ブラウザに聞かせる
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const [moving, setMoving] = useState<string | null>(null)
  const open = (item: RosterItem) => {
    if (item.childId === current.childId && item.unitId === current.unitId) return
    if (dirtyRef.current && !window.confirm(UNSAVED_MESSAGE)) return
    setMoving(item.childId)
    router.push(recordHref(item, date))
  }

  const done = roster.filter((r) => r.recorded).length
  const left = roster.length - done
  const confirmLeave = () => !dirtyRef.current || window.confirm(UNSAVED_MESSAGE)
  const openList = () => {
    if (!confirmLeave()) return
    router.push(`/records?date=${date}&view=list`)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="text-2xl font-bold text-gray-900">日々の記録</h1>
      <DateNav
        targetDate={date}
        prevDate={shiftDate(date, -1)}
        nextDate={shiftDate(date, 1)}
        basePath="/records"
        confirmLeave={confirmLeave}
      />
      <button
        type="button"
        onClick={openList}
        className="ml-auto text-sm text-indigo-600 hover:underline"
        data-testid="open-records-list"
      >
        出欠・送迎の一覧をひらく
      </button>
    </div>
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-4 lg:self-start space-y-2" aria-label="その日の子の一覧">
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          <p className="font-semibold text-gray-800">その日に出席した子</p>
          <p className="text-xs text-indigo-700 mt-0.5" data-testid="roster-count">
            記録済 {done} / {roster.length}名・のこり {left}名
          </p>
        </div>
        <ul className="space-y-1.5 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto pr-1">
          {roster.map((r) => {
            const isCurrent = r.childId === current.childId && r.unitId === current.unitId
            return (
              <li key={`${r.unitId}:${r.childId}`}>
                <button
                  type="button"
                  onClick={() => open(r)}
                  aria-current={isCurrent ? 'true' : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    isCurrent
                      ? 'border-indigo-500 bg-indigo-50 font-bold text-indigo-900 ring-1 ring-indigo-500'
                      : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-800'
                  }`}
                >
                  <span className="flex-1 min-w-0 truncate">{r.name}</span>
                  {isCurrent ? (
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                      <PencilLine className="h-3 w-3" />書いている
                    </span>
                  ) : r.recorded ? (
                    <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-800">
                      <CheckCircle2 className="h-3 w-3" />済
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">
                      <Circle className="h-3 w-3" />{moving === r.childId ? '開いています' : '未'}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
          {roster.length === 0 && (
            <li className="text-xs text-gray-500 px-1">この日に出席した子はいません</li>
          )}
        </ul>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
    </div>
  )
}
