'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Props = {
  targetDate: string
  prevDate: string
  nextDate: string
  basePath: string
  extraParams?: string
}

export function DateNav({ targetDate, prevDate, nextDate, basePath, extraParams = '' }: Props) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-3">
      <Link
        href={`${basePath}?date=${prevDate}${extraParams}`}
        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm"
      >
        ‹
      </Link>
      <input
        type="date"
        defaultValue={targetDate}
        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        onChange={(e) => {
          if (e.target.value) router.push(`${basePath}?date=${e.target.value}${extraParams}`)
        }}
      />
      <Link
        href={`${basePath}?date=${nextDate}${extraParams}`}
        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm"
      >
        ›
      </Link>
    </div>
  )
}
