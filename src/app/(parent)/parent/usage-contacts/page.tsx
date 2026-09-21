'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertCircle } from 'lucide-react'
import {
  UsageContactCalendar,
  type UsageContact,
  type UsageContactChild,
  type UsageContactEntry,
  type FacilityScheduleDay,
  type FacilityClosure,
  type BenefitLimit,
  type UsageDeadline,
  type UsageDefault,
  type UsageSubmitResult,
} from '@/components/parent/usage-contact-calendar'
import type { ChildTransportPlaces } from '@/lib/transport-place'

/**
 * 保護者ポータルの「利用連絡」。
 *
 * 利用する日をカレンダーから連絡する。予定のキャンセルは前日まで送れる。
 * 当日のお休みは施設が電話で受ける（連絡が届いたことをその場で確かめる必要があり、
 * 欠席時対応加算の扱いにも関わるため）。
 * 以前はLINEの専用ページだけで行えたが、保護者の入口は保護者ポータルに
 * 一本化したため、ここが唯一の連絡先になる（LINEからはポータルが開く）。
 */
export default function ParentUsageContactsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [childrenList, setChildrenList] = useState<UsageContactChild[]>([])
  const [contacts, setContacts] = useState<UsageContact[]>([])
  const [schedule, setSchedule] = useState<FacilityScheduleDay[]>([])
  const [closures, setClosures] = useState<FacilityClosure[]>([])
  const [places, setPlaces] = useState<ChildTransportPlaces[]>([])
  const [benefits, setBenefits] = useState<BenefitLimit[]>([])
  const [deadline, setDeadline] = useState<UsageDeadline | null>(null)
  const [defaults, setDefaults] = useState<UsageDefault[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 読み込み中フラグはここでは立てない。effect の中で同期的に setState すると
  // 連鎖レンダリングになるため（react-hooks の規則）。月を切り替える操作の側で立てる。
  const loadMonth = useCallback((y: number, m: number) => {
    fetch('/api/parent/usage-contacts/month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: y, month: m }),
    })
      .then(async (res) => {
        const json = await res.json() as {
          children?: UsageContactChild[]
          contacts?: UsageContact[]
          schedule?: FacilityScheduleDay[]
          closures?: FacilityClosure[]
          places?: ChildTransportPlaces[]
          benefits?: BenefitLimit[]
          deadline?: UsageDeadline | null
          defaults?: UsageDefault[]
          error?: string
        }
        if (!res.ok) {
          setError(json.error ?? '読み込みに失敗しました')
          return
        }
        setChildrenList(json.children ?? [])
        setContacts(json.contacts ?? [])
        setSchedule(json.schedule ?? [])
        setClosures(json.closures ?? [])
        setPlaces(json.places ?? [])
        setBenefits(json.benefits ?? [])
        setDeadline(json.deadline ?? null)
        setDefaults(json.defaults ?? [])
        setError(null)
      })
      .catch(() => setError('通信エラーが発生しました'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadMonth(year, month) }, [year, month, loadMonth])

  const handleMonthChange = (y: number, m: number) => {
    setLoading(true)
    setYear(y)
    setMonth(m)
  }

  const handleSubmit = async (
    dates: string[],
    entries: UsageContactEntry[]
  ): Promise<UsageSubmitResult> => {
    try {
      const res = await fetch('/api/parent/usage-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates, entries }),
      })
      const json = await res.json() as UsageSubmitResult
      if (!res.ok) return { error: json.error ?? '送信に失敗しました', skipped: json.skipped }
      loadMonth(year, month)
      return { savedDates: json.savedDates ?? dates, skipped: json.skipped ?? [] }
    } catch {
      return { error: '通信エラーが発生しました' }
    }
  }

  /**
   * 「先月と同じ曜日」で選ぶための、前の月に利用した曜日を返す。
   *
   * 施設の予定（利用予定・利用済み）と、自分が送った連絡の両方から拾う。
   * 押されたときだけ読みに行く（毎月ぶんを先読みして通信を増やさない）。
   */
  const handleSuggestDows = async (): Promise<number[]> => {
    const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 }
    try {
      const res = await fetch('/api/parent/usage-contacts/month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: prev.y, month: prev.m }),
      })
      if (!res.ok) return []
      const json = await res.json() as {
        contacts?: UsageContact[]
        schedule?: FacilityScheduleDay[]
      }
      const dates = [
        ...(json.schedule ?? []).filter((s) => s.kind !== 'absent').map((s) => s.date),
        ...(json.contacts ?? []).filter((c) => c.status === 'attending').map((c) => c.date),
      ]
      return [...new Set(dates.map((d) => new Date(d + 'T00:00:00').getDay()))].sort()
    } catch {
      return []
    }
  }

  if (error) {
    return (
      <div className="pb-20 sm:pb-5 text-center py-10">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400" />
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    )
  }

  if (!loading && childrenList.length === 0) {
    return (
      <div className="pb-20 sm:pb-5 text-center py-10 text-sm text-gray-400">
        お子様の情報がありません
      </div>
    )
  }

  return (
    <div className="pb-20 sm:pb-5 space-y-3">
      <div>
        <h1 className="text-lg font-bold text-gray-900">利用連絡</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          利用する日を、当日以降の日付から連絡できます。
          毎日のようにご利用の場合は「まとめて申し込む」から複数の日をいちどに選べます。
          ご予定のキャンセルは前日までこの画面から送れます（当日のお休みは施設へお電話ください）。
          施設で決まっている予定と、ご利用済みの日もこの画面で確認できます。
          送迎の時刻は施設で決めますので、行き先・帰り先だけお選びください
          {deadline?.enabled && (
            <>。新しいご利用日のお申し込みには締切があります（カレンダーの上にご案内します）</>
          )}
        </p>
      </div>

      <UsageContactCalendar
        childrenList={childrenList}
        contacts={contacts}
        schedule={schedule}
        closures={closures}
        places={places}
        benefits={benefits}
        deadline={deadline}
        defaults={defaults}
        year={year}
        month={month}
        loading={loading}
        onMonthChange={handleMonthChange}
        onSubmit={handleSubmit}
        onSuggestDows={handleSuggestDows}
      />
    </div>
  )
}
