'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { makeParentReservation } from '@/app/actions/parent-reservation'
import { Badge } from '@/components/ui/badge'
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
type FacilityEvent = {
  event_date: string
  event_type: string
  title: string
  affects_reservation: boolean
}

interface Props {
  year: number
  month: number
  children: Child[]
  units: Unit[]
  reservations: Reservation[]
  usageCountMap: Record<string, Record<string, number>>
  facilityEvents?: FacilityEvent[]
  userId: string
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

const TIME_OPTIONS = Array.from({ length: 19 }, (_, i) => {
  const totalMinutes = 9 * 60 + i * 30
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const m = String(totalMinutes % 60).padStart(2, '0')
  return `${h}:${m}`
})

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
  facilityEvents = [],
  userId,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedChild, setSelectedChild] = useState<string>(children[0]?.id ?? '')
  const [selectedUnit, setSelectedUnit] = useState<string>(units[0]?.id ?? '')
  const [transportType, setTransportType] = useState<'none' | 'pickup_only' | 'dropoff_only' | 'both'>('both')
  const [pickupLocationType, setPickupLocationType] = useState<'home' | 'school'>('home')
  const [pickupTime, setPickupTime] = useState<string>('')
  const [dropoffTime, setDropoffTime] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [reserveError, setReserveError] = useState<string | null>(null)

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

  // 施設イベントマップ
  const eventMap = new Map<string, FacilityEvent[]>()
  facilityEvents.forEach((e) => {
    const arr = eventMap.get(e.event_date) ?? []
    arr.push(e)
    eventMap.set(e.event_date, arr)
  })

  const today = formatDate(new Date(), 'yyyy-MM-dd')

  const handleDayClick = (date: string) => {
    if (date < today) return
    const dayEvents = eventMap.get(date) ?? []
    if (dayEvents.some((e) => e.affects_reservation)) return // 予約停止日は選択不可
    setSelectedDate(date === selectedDate ? null : date)
  }

  const makeReservation = async () => {
    if (!selectedDate) { setReserveError('日付が選択されていません'); return }
    if (!selectedChild) { setReserveError('お子様が選択されていません（ページを再読み込みしてください）'); return }
    if (!selectedUnit) { setReserveError('ユニットが選択されていません（ページを再読み込みしてください）'); return }
    setLoading(true)
    setReserveError(null)

    const { error, autoConfirmed } = await makeParentReservation({
      childId: selectedChild,
      unitId: selectedUnit,
      date: selectedDate,
      transportType,
      pickupLocationType,
      pickupTime: pickupTime || null,
      dropoffTime: dropoffTime || null,
    })

    setLoading(false)
    if (error) {
      setReserveError(error)
    } else {
      setSelectedDate(null)
      if (autoConfirmed) {
        alert('利用計画に基づき、予約が自動的に確定されました。')
      }
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
  const selectedDateEvents = selectedDate ? (eventMap.get(selectedDate) ?? []) : []
  const selectedUnit_ = units.find((u) => u.id === selectedUnit)
  const usageOnDate = selectedDate ? (usageCountMap[selectedDate]?.[selectedUnit] ?? 0) : 0
  const isFull = selectedUnit_ ? usageOnDate >= selectedUnit_.capacity : false

  return (
    <div className="space-y-4 pb-32 sm:pb-5">
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
            const dayEvents = eventMap.get(date) ?? []
            const isClosed = dayEvents.some((e) => e.affects_reservation)
            const isDisabled = isPast || isClosed

            return (
              <button
                key={date}
                onClick={() => handleDayClick(date)}
                disabled={isDisabled}
                className={cn(
                  'h-14 border-b border-r border-gray-50 p-1 text-left transition-colors',
                  isClosed ? 'bg-red-50 cursor-not-allowed' :
                  isPast ? 'bg-gray-50 cursor-not-allowed' : 'hover:bg-indigo-50',
                  isSelected && 'bg-indigo-100 ring-1 ring-inset ring-indigo-400',
                )}
              >
                <div
                  className={cn(
                    'text-xs font-medium mb-0.5 w-6 h-6 flex items-center justify-center rounded-full',
                    isToday && 'bg-indigo-600 text-white',
                    !isToday && isClosed && 'text-red-400',
                    !isToday && !isClosed && dayOfWeek === 0 && 'text-red-500',
                    !isToday && !isClosed && dayOfWeek === 6 && 'text-blue-500',
                    !isToday && !isClosed && dayOfWeek > 0 && dayOfWeek < 6 && (isPast ? 'text-gray-300' : 'text-gray-700'),
                  )}
                >
                  {new Date(date).getDate()}
                </div>
                {isClosed ? (
                  <p className="text-xs text-red-400 leading-none truncate">
                    {dayEvents[0]?.title ?? '休業'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-0.5">
                    {dayReservations.slice(0, 2).map((r) => (
                      <div
                        key={r.id}
                        className={cn('w-1.5 h-1.5 rounded-full', STATUS_COLORS[r.status] ?? 'bg-gray-300')}
                      />
                    ))}
                  </div>
                )}
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

          {/* 施設イベント */}
          {selectedDateEvents.length > 0 && (
            <div className="space-y-1">
              {selectedDateEvents.map((e, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg">
                  <span className="text-xs font-medium text-red-600">{e.title}</span>
                  {e.affects_reservation && (
                    <span className="text-xs text-red-400">（予約停止中）</span>
                  )}
                </div>
              ))}
            </div>
          )}

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

          {/* 新規予約フォーム */}
          {!selectedDateReservations.some(
            (r) => r.child_id === selectedChild && r.status !== 'cancelled'
          ) && (
            <div className="pt-2 space-y-3">
              {/* 送迎設定 */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">送迎</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'both', label: '送り・迎えあり' },
                    { value: 'pickup_only', label: '送りのみ' },
                    { value: 'dropoff_only', label: '迎えのみ' },
                    { value: 'none', label: '送迎なし' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTransportType(opt.value as typeof transportType)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors text-left',
                        transportType === opt.value
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 迎え（施設 → お子様のいる場所） */}
              {(transportType === 'pickup_only' || transportType === 'both') && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-700 block">迎え（お迎え場所・時刻）</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'home', label: '自宅' },
                      { value: 'school', label: '学校' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPickupLocationType(opt.value as 'home' | 'school')}
                        className={cn(
                          'flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                          pickupLocationType === opt.value
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <select
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">お迎え希望時刻を選択</option>
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 送り（施設 → お子様の自宅） */}
              {(transportType === 'dropoff_only' || transportType === 'both') && (
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">送り（送り届け希望時刻）</label>
                  <select
                    value={dropoffTime}
                    onChange={(e) => setDropoffTime(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">送り届け希望時刻を選択</option>
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}

              {reserveError && (
                <p className="text-sm text-red-600">{reserveError}</p>
              )}
              {isFull && (
                <p className="text-sm text-yellow-600 text-center">定員に達しているためキャンセル待ちになります</p>
              )}
              <button
                type="button"
                onClick={makeReservation}
                disabled={loading}
                className={`w-full h-9 px-4 py-2 inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${isFull ? 'border border-gray-300 bg-white shadow-sm hover:bg-gray-100' : 'bg-indigo-600 text-white shadow hover:bg-indigo-700'}`}
              >
                <Check className="h-4 w-4" />
                {isFull ? 'キャンセル待ちで申し込む' : '利用を申し込む'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
