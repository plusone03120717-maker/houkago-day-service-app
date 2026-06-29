'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { formatDate } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Car, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

type Contact = {
  id: string
  child_id: string
  date: string
  status: 'attending' | 'absent'
  pickup_required: boolean
  note: string | null
  reported_at: string
  children: { id: string; name: string } | null
}

type UncontactedChild = { id: string; name: string }

type Props = {
  date: string
  filter: string
  contacts: Contact[]
  uncontactedChildren: UncontactedChild[]
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return formatDate(d, 'yyyy-MM-dd')
}

export function ParentContactsBoard({ date, filter, contacts, uncontactedChildren }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()

  function navigate(newDate: string, newFilter?: string) {
    const f = newFilter ?? filter
    startTransition(() => {
      router.push(`${pathname}?date=${newDate}&filter=${f}`)
    })
  }

  const dateObj = new Date(date + 'T00:00:00')
  const dayLabel = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()]

  const filtered =
    filter === 'pickup'
      ? contacts.filter((c) => c.status === 'attending' && c.pickup_required)
      : contacts

  const attendingCount = contacts.filter((c) => c.status === 'attending').length
  const absentCount = contacts.filter((c) => c.status === 'absent').length
  const pickupCount = contacts.filter((c) => c.status === 'attending' && c.pickup_required).length

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-900">保護者連絡一覧</h1>

      {/* 日付ナビ */}
      <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100">
        <button
          onClick={() => navigate(addDays(date, -1))}
          className="p-1 text-gray-400 hover:text-gray-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 text-center">
          <span className="font-bold text-gray-900">
            {dateObj.getFullYear()}年{dateObj.getMonth() + 1}月{dateObj.getDate()}日（{dayLabel}）
          </span>
        </div>
        <button
          onClick={() => navigate(addDays(date, 1))}
          className="p-1 text-gray-400 hover:text-gray-700"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
          <p className="text-2xl font-bold text-green-700">{attendingCount}</p>
          <p className="text-xs text-green-600">利用する</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
          <p className="text-2xl font-bold text-red-500">{absentCount}</p>
          <p className="text-xs text-red-500">お休み</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
          <p className="text-2xl font-bold text-blue-600">{pickupCount}</p>
          <p className="text-xs text-blue-500">送迎あり</p>
        </div>
      </div>

      {/* フィルタ */}
      <div className="flex gap-2">
        {[
          { value: 'all', label: 'すべて' },
          { value: 'pickup', label: '送迎あり' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => navigate(date, f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 連絡一覧 */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-gray-100">
          <p className="text-sm">この日の連絡はありません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100 flex items-start gap-3"
            >
              <div className="mt-0.5">
                {c.status === 'attending' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm">
                    {c.children?.name ?? '不明'}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      c.status === 'attending'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {c.status === 'attending' ? '利用する' : 'お休み'}
                  </span>
                  {c.status === 'attending' && c.pickup_required && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                      <Car className="h-3 w-3" />
                      送迎あり
                    </span>
                  )}
                </div>
                {c.note && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.note}</p>
                )}
              </div>
              <p className="text-xs text-gray-400 shrink-0 mt-0.5">
                {new Date(c.reported_at).toLocaleTimeString('ja-JP', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 未連絡の児童 */}
      {uncontactedChildren.length > 0 && (
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <p className="text-sm font-semibold text-yellow-800">
              まだ連絡が来ていない児童（{uncontactedChildren.length}名）
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {uncontactedChildren.map((c) => (
              <span
                key={c.id}
                className="text-xs bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-full font-medium"
              >
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
