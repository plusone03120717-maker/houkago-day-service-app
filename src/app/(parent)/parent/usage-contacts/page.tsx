'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertCircle } from 'lucide-react'
import {
  UsageContactCalendar,
  type UsageContact,
  type UsageContactChild,
  type UsageContactEntry,
  type FacilityScheduleDay,
} from '@/components/parent/usage-contact-calendar'

/**
 * 保護者ポータルの「利用連絡」。
 *
 * 利用する日・お休みする日をカレンダーから連絡する。
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
          error?: string
        }
        if (!res.ok) {
          setError(json.error ?? '読み込みに失敗しました')
          return
        }
        setChildrenList(json.children ?? [])
        setContacts(json.contacts ?? [])
        setSchedule(json.schedule ?? [])
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
    date: string,
    entries: UsageContactEntry[]
  ): Promise<{ error?: string }> => {
    try {
      const res = await fetch('/api/parent/usage-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, entries }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) return { error: json.error ?? '送信に失敗しました' }
      loadMonth(year, month)
      return {}
    } catch {
      return { error: '通信エラーが発生しました' }
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
          利用する日・お休みする日を、当日以降の日付から連絡できます。
          施設で決まっている予定も一緒に表示されます
        </p>
      </div>

      <UsageContactCalendar
        childrenList={childrenList}
        contacts={contacts}
        schedule={schedule}
        year={year}
        month={month}
        loading={loading}
        onMonthChange={handleMonthChange}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
