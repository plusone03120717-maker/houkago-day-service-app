'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

type Child = { id: string; name: string }
type Unit = { id: string; name: string; capacity: number }
type Reservation = {
  id: string
  child_id: string
  unit_id: string
  date: string
  status: string
}

interface Props {
  year: number
  month: number
  children: Child[]
  units: Unit[]
  reservations: Reservation[]
  usageCountMap: Record<string, Record<string, number>>
  userId: string
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-green-500',
  reserved: 'bg-indigo-500',
  cancelled: 'bg-gray-300',
  cancel_waiting: 'bg-yellow-400',
}
const STATUS_LABELS: Record<string, string> = {
  confirmed: '確定',
  reserved: '予約済',
  cancelled: 'キャンセル',
  cancel_waiting: 'キャンセル待ち',
}

export function ParentCalendar({
  year,
  month,
  children,
  units,
  reservations,
  usageCountMap,
  userId,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedChild, setSelectedChild] = useState<string>(children[0]?.id ?? '')
  const [selectedUnit, setSelectedUnit] = useState<string>(units[0]?.id ?? '')
  const [loading, setLoading] = useState(false)

  const changeMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1)
    router.push(`/parent/calendar?year=${d.getFullYear()}&month=${d.getMonth() + 1}`)
  }

  // カレンダーグリッド生成
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startPad = firstDay.getDay()
  const totalCells = startPad + lastDay.getDate()
  const cells = Array.from({ length: Math.ceil(totalCells / 7) * 7 }, (_, i) => {
    const dayNum = i - startPad + 1
    if (dayNum < 1 || dayNum > lastDay.getDate()) return null
    return `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
  })

  // 予約マップ
  const reservationMap: Record<string, Reservation[]> = {}
  reservations.forEach((r) => {
    if (!reservationMap[r.date]) reservationMap[r.date] = []
    reservationMap[r.date].push(r)
  })

  const today = formatDate(new Date(), 'yyyy-MM-dd')

  const handleDayClick = (date: string) => {
    if (date < today) return // 過去は選択不可
    setSelectedDate(date === selectedDate ? null : date)
  }

  const makeReservation = async () => {
    if (!selectedDate || !selectedChild || !selectedUnit) return
    setLoading(true)

    const { error } = await supabase.from('usage_reservations').insert({
      child_id: selectedChild,
      unit_id: selectedUnit,
      date: selectedDate,
      status: 'reserved',
      requested_by: userId,
      requested_at: new Date().toISOString(),
    })

    setLoading(false)
    if (!error) {
      setSelectedDate(null)
      startTransition(() => router.refresh())
    }
  }

  const cancelReservation = async (reservationId: string) => {
    setLoading(true)
    await supabase
      .from('usage_reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservationId)
    setLoading(false)
    startTransition(() => router.refresh())
  }

  const selectedDateReservations = selectedDate ? (reservationMap[selectedDate] ?? []) : []
  const selectedUnit_ = units.find((u) => u.id === selectedUnit)
  const usageOnDate = selectedDate ? (usageCountMap[selectedDate]?.[selectedUnit] ?? 0) : 0
  const isFull = selectedUnit_ ? usageOnDate >= selectedUnit_.capacity : false

  return (
    <div className="space-y-4 pb-20 sm:pb-5">
      {/* 月ナビ */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">利用予約</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="p-2 rounded-lg hover:bg-gray-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">{year}年{month}月</span>
          <button onClick={() => changeMonth(1)} className="p-2 rounded-lg hover:bg-gray-100">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* お子様・ユニット選択 */}
      {children.length > 1 && (
        <div className="flex gap-2">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setSelectedChild(child.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                selectedChild === child.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
              )}
            >
              {child.name}
            </button>
          ))}
        </div>
      )}
      {units.length > 1 && (
        <div className="flex gap-2">
          {units.map((unit) => (
            <button
              key={unit.id}
              onClick={() => setSelectedUnit(unit.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                selectedUnit === unit.id ? 'bg-indigo-100 text-indigo-700 border border-indigo-300' : 'bg-gray-100 text-gray-500'
              )}
            >
              {unit.name}
            </button>
          ))}
        </div>
      )}

      {/* カレンダー */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
          {DAY_LABELS.map((d, i) => (
            <div
              key={d}
              className={cn(
                'text-center text-xs font-medium py-2',
                i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
              )}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 日付グリッド */}
        <div className="grid grid-cols-7">
          {cells.map((date, idx) => {
            if (!date) {
              return <div key={idx} className="h-14 border-b border-r border-gray-50" />
            }
            const isPast = date < today
            const isToday = date === today
            const isSelected = date === selectedDate
            const dayReservations = reservationMap[date] ?? []
            const dayOfWeek = new Date(date).getDay()

            return (
              <button
                key={date}
                onClick={() => handleDayClick(date)}
                disabled={isPast}
                className={cn(
                  'h-14 border-b border-r border-gray-50 p-1 text-left transition-colors',
                  isPast ? 'bg-gray-50 cursor-not-allowed' : 'hover:bg-indigo-50',
                  isSelected && 'bg-indigo-100 ring-1 ring-inset ring-indigo-400',
                )}
              >
                <div
                  className={cn(
                    'text-xs font-medium mb-0.5 w-6 h-6 flex items-center justify-center rounded-full',
                    isToday && 'bg-indigo-600 text-white',
                    !isToday && dayOfWeek === 0 && 'text-red-500',
                    !isToday && dayOfWeek === 6 && 'text-blue-500',
                    !isToday && dayOfWeek > 0 && dayOfWeek < 6 && (isPast ? 'text-gray-300' : 'text-gray-700'),
                  )}
                >
                  {new Date(date).getDate()}
                </div>
                <div className="flex flex-wrap gap-0.5">
                  {dayReservations.slice(0, 2).map((r) => (
                    <div
                      key={r.id}
                      className={cn('w-1.5 h-1.5 rounded-full', STATUS_COLORS[r.status] ?? 'bg-gray-300')}
                    />
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex gap-3 flex-wrap text-xs text-gray-500">
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <div key={status} className="flex items-center gap-1">
            <div className={cn('w-2 h-2 rounded-full', STATUS_COLORS[status])} />
            {label}
          </div>
        ))}
      </div>

      {/* 日付詳細パネル */}
      {selectedDate && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h2 className="font-semibold text-gray-900">{formatDate(selectedDate, 'MM月dd日')}</h2>

          {/* 既存の予約 */}
          {selectedDateReservations.length > 0 ? (
            <div className="space-y-2">
              {selectedDateReservations.map((r) => {
                const child = children.find((c) => c.id === r.child_id)
                const unit = units.find((u) => u.id === r.unit_id)
                return (
                  <div key={r.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{child?.name}</p>
                      <p className="text-xs text-gray-400">{unit?.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={r.status === 'confirmed' ? 'success' : 'secondary'} className="text-xs">
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                      {(r.status === 'reserved' || r.status === 'confirmed') && (
                        <button
                          onClick={() => cancelReservation(r.id)}
                          disabled={loading}
                          className="p-1 text-red-400 hover:bg-red-50 rounded"
                          title="キャンセル"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">この日の予約はありません</p>
          )}

          {/* 新規予約ボタン */}
          {!selectedDateReservations.some(
            (r) => r.child_id === selectedChild && r.status !== 'cancelled'
          ) && (
            <div className="pt-2">
              {isFull ? (
                <p className="text-sm text-yellow-600 text-center">定員に達しているためキャンセル待ちになります</p>
              ) : null}
              <Button
                onClick={makeReservation}
                disabled={loading}
                className="w-full"
                variant={isFull ? 'outline' : 'default'}
              >
                <Check className="h-4 w-4" />
                {isFull ? 'キャンセル待ちで申し込む' : '利用を申し込む'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
