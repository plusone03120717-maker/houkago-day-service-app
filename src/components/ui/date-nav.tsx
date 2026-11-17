'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getJapaneseHolidayName } from '@/lib/japanese-holidays'

type Props = {
  targetDate: string
  prevDate: string
  nextDate: string
  basePath: string
  extraParams?: string
  /** 日付を変える前に呼ぶ。false を返したら移らない（保存していない入力があるときに聞くのに使う） */
  confirmLeave?: () => boolean
}

export function DateNav({ targetDate, prevDate, nextDate, basePath, extraParams = '', confirmLeave }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const holidayName = getJapaneseHolidayName(targetDate)

  const navigate = (date: string) => {
    if (confirmLeave && !confirmLeave()) return
    startTransition(() => {
      router.push(`${basePath}?date=${date}${extraParams}`)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => navigate(prevDate)}
        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <input
        type="date"
        value={targetDate}
        onChange={(e) => { if (e.target.value) navigate(e.target.value) }}
        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <button
        onClick={() => navigate(nextDate)}
        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      {holidayName && (
        <span className="ml-1 text-xs font-medium px-2 py-1 rounded bg-red-50 text-red-600 border border-red-100 whitespace-nowrap">
          祝日・{holidayName}
        </span>
      )}
    </div>
  )
}
