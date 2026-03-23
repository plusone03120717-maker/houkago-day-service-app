'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  targetDate: string
  prevDate: string
  nextDate: string
  basePath: string
  extraParams?: string
}

export function DateNav({ targetDate, prevDate, nextDate, basePath, extraParams = '' }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const navigate = (date: string) => {
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
    </div>
  )
}
