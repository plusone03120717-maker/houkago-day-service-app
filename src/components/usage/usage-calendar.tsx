'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { confirmReservation, confirmAllReservations } from '@/app/actions/reservation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Check, CheckCheck, X, Plus, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Unit = { id: string; name: string; capacity: number }
type Reservation = {
  id: string
  child_id: string
  unit_id: string
  date: string
  status: string
  children: { name: string } | null
}
type ChildOption = { id: string; name: string }

interface Props {
  year: number
  month: number
  units: Unit[]
  selectedUnitId: string
  reservations: Reservation[]
  childOptions: ChildOption[]
  summary: { confirmed: number; reserved: number; cancelled: number }
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: '確定',
  reserved: '予約',
  cancelled: 'キャンセル',
  cancel_waiting: 'キャンセル待ち',
}

const STATUS_VARIANTS: Record<string, 'success' | 'default' | 'secondary' | 'warning'> = {
  confirmed: 'success',
  reserved: 'default',
  cancelled: 'secondary',
  cancel_waiting: 'warning',
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export function UsageCalendar({
  year, month, units, selectedUnitId, reservations, childOptions, summary,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addChildId, setAddChildId] = useState('')
  const [addStatus, setAddStatus] = useState<'confirmed' | 'reserved'>('confirmed')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const changeMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1)
    router.push(`/usage?year=${d.getFullYear()}&month=${d.getMonth() + 1}&unit=${selectedUnitId}`)
  }

  const changeUnit = (unitId: string) => {
    router.push(`/usage?year=${year}&month=${month}&unit=${unitId}`)
  }

  // カレンダー生成
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startPad = firstDay.getDay()
  const cells = Array.from({ length: Math.ceil((startPad + lastDay.getDate()) / 7) * 7 }, (_, i) => {
    const dayNum = i - startPad + 1
    if (dayNum < 1 || dayNum > lastDay.getDate()) return null
    return `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
  })

  // 予約マップ
  const resByDate: Record<string, Reservation[]> = {}
  reservations.forEach((r) => {
    if (!resByDate[r.date]) resByDate[r.date] = []
    resByDate[r.date].push(r)
  })

  const selectedUnit = units.find((u) => u.id === selectedUnitId)
  const selectedDateReservations = selectedDate ? (resByDate[selectedDate] ?? []) : []

  const pendingReservations = reservations
    .filter((r) => r.status === 'reserved')
    .sort((a, b) => a.date.localeCompare(b.date))

  const handleConfirm = async (reservationId: string) => {
    setUpdating(true)
    await confirmReservation(reservationId)
    setUpdating(false)
    startTransition(() => router.refresh())
  }

  const handleConfirmAll = async () => {
    if (!confirm(`承認待ちの予約 ${pendingReservations.length}件をすべて確定しますか？`)) return
    setUpdating(true)
    await confirmAllReservations(pendingReservations.map((r) => r.id))
    setUpdating(false)
    startTransition(() => router.refresh())
  }

  const handleCancel = async (reservationId: string) => {
    setUpdating(true)
    const { error } = await supabase
      .from('usage_reservations')
      .delete()
      .eq('id', reservationId)
    setUpdating(false)
    if (error) {
      alert(`削除エラー: ${error.message}`)
      return
    }
    startTransition(() => router.refresh())
  }

  const handleAddReservation = async () => {
    if (!addChildId || !selectedDate) return
    setAdding(true)
    setAddError(null)
    const { error } = await supabase.from('usage_reservations').insert({
      child_id: addChildId,
      unit_id: selectedUnitId,
      date: selectedDate,
      status: addStatus,
    })
    setAdding(false)
    if (error) {
      setAddError(error.code === '23505' ? 'この児童はすでにこの日に予約があります' : error.message)
    } else {
      setShowAddForm(false)
      setAddChildId('')
      startTransition(() => router.refresh())
    }
  }

  return (
    <div className="space-y-4">
      {/* 月・ユニット選択 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="p-2 rounded-lg hover:bg-gray-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">{year}年{month}月</span>
          <button onClick={() => changeMonth(1)} className="p-2 rounded-lg hover:bg-gray-100">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {units.map((u) => (
            <button
              key={u.id}
              onClick={() => changeUnit(u.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                selectedUnitId === u.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {u.name}
            </button>
          ))}
        </div>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-green-50 rounded-xl text-center">
          <p className="text-xl font-bold text-green-700">{summary.confirmed}</p>
          <p className="text-xs text-green-600">確定</p>
        </div>
        <div className={cn(
          'p-3 rounded-xl text-center',
          summary.reserved > 0 ? 'bg-yellow-100 ring-2 ring-yellow-400' : 'bg-indigo-50'
        )}>
          <p className={cn('text-xl font-bold', summary.reserved > 0 ? 'text-yellow-700' : 'text-indigo-700')}>
            {summary.reserved}
          </p>
          <p className={cn('text-xs font-medium', summary.reserved > 0 ? 'text-yellow-600' : 'text-indigo-600')}>
            {summary.reserved > 0 ? '⚠ 承認待ち' : '承認待ち'}
          </p>
        </div>
        <div className="p-3 bg-gray-50 rounded-xl text-center">
          <p className="text-xl font-bold text-gray-700">{summary.cancelled}</p>
          <p className="text-xs text-gray-500">キャンセル</p>
        </div>
      </div>

      {/* 承認待ち一覧 */}
      {pendingReservations.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
              <span className="font-semibold text-yellow-800 text-sm">
                承認待ち予約（{pendingReservations.length}件）
              </span>
            </div>
            <Button
              size="sm"
              onClick={handleConfirmAll}
              disabled={updating}
              className="bg-green-600 hover:bg-green-700 text-white text-xs h-8"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              全件一括確定
            </Button>
          </div>
          <div className="space-y-1.5">
            {pendingReservations.map((r) => {
              const [y, m, d] = r.date.split('-').map(Number)
              const dow = ['日','月','火','水','木','金','土'][new Date(y, m - 1, d).getDay()]
              return (
                <div key={r.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-yellow-100">
                  <span className="text-xs text-gray-500 shrink-0 w-24">
                    {m}月{d}日（{dow}）
                  </span>
                  <span className="text-sm font-medium text-gray-800 flex-1">
                    {r.children?.name ?? '—'}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleConfirm(r.id)}
                      disabled={updating}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
                    >
                      <Check className="h-3 w-3" />確定
                    </button>
                    <button
                      onClick={() => handleCancel(r.id)}
                      disabled={updating}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50 transition-colors"
                    >
                      <X className="h-3 w-3" />削除
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* カレンダー */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
        <div className="grid grid-cols-7">
          {cells.map((date, idx) => {
            if (!date) return <div key={idx} className="h-16 border-b border-r border-gray-50" />
            const dayReservations = resByDate[date] ?? []
            const activeCount = dayReservations.filter((r) => r.status !== 'cancelled').length
            const pendingCount = dayReservations.filter((r) => r.status === 'reserved').length
            const capacity = selectedUnit?.capacity ?? 0
            const isFull = capacity > 0 && activeCount >= capacity
            const isSelected = date === selectedDate
            const dayOfWeek = new Date(date).getDay()
            const hasPending = pendingCount > 0

            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date === selectedDate ? null : date)}
                className={cn(
                  'h-16 border-b border-r border-gray-50 p-1 text-left transition-colors hover:bg-indigo-50',
                  hasPending && !isSelected && 'bg-yellow-50',
                  isSelected && 'bg-indigo-100 ring-1 ring-inset ring-indigo-400'
                )}
              >
                <div className={cn(
                  'text-xs font-medium mb-0.5',
                  dayOfWeek === 0 && 'text-red-500',
                  dayOfWeek === 6 && 'text-blue-500',
                  dayOfWeek > 0 && dayOfWeek < 6 && 'text-gray-700'
                )}>
                  {new Date(date).getDate()}
                </div>
                {activeCount > 0 && (
                  <div className={cn(
                    'text-xs px-1 rounded font-medium',
                    isFull ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'
                  )}>
                    {activeCount}{capacity > 0 ? `/${capacity}` : ''}名
                  </div>
                )}
                {hasPending && (
                  <div className="text-xs px-1 rounded font-medium bg-yellow-200 text-yellow-800 mt-0.5">
                    待{pendingCount}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-indigo-100" />
          <span>確定済み</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-yellow-200" />
          <span>承認待ち（黄色セル＋「待N」バッジ）</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-100" />
          <span>定員満員</span>
        </div>
      </div>

      {/* 日付詳細 */}
      {selectedDate && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h2 className="font-semibold text-gray-900">
            {new Date(selectedDate).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
            の予約（{selectedDateReservations.length}件）
          </h2>

          {selectedDateReservations.length === 0 ? (
            <p className="text-sm text-gray-400">この日の予約はありません</p>
          ) : (
            <div className="space-y-2">
              {selectedDateReservations.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-900">{r.children?.name ?? '—'}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANTS[r.status] ?? 'secondary'} className="text-xs">
                      {STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                    {r.status === 'reserved' && (
                      <button
                        onClick={() => handleConfirm(r.id)}
                        disabled={updating}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                        title="承認"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleCancel(r.id)}
                      disabled={updating}
                      className="p-1 text-red-400 hover:bg-red-50 rounded"
                      title="削除"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 一括承認ボタン */}
          {selectedDateReservations.some((r) => r.status === 'reserved') && (
            <Button
              onClick={async () => {
                setUpdating(true)
                const ids = selectedDateReservations
                  .filter((r) => r.status === 'reserved')
                  .map((r) => r.id)
                await Promise.all(ids.map((id) => confirmReservation(id)))
                setUpdating(false)
                startTransition(() => router.refresh())
              }}
              disabled={updating}
              size="sm"
              variant="outline"
              className="border-green-300 text-green-700 hover:bg-green-50"
            >
              <Check className="h-4 w-4" />
              承認待ちをすべて確定
            </Button>
          )}

          {/* 施設側から予約追加 */}
          {!showAddForm ? (
            <Button
              onClick={() => { setShowAddForm(true); setAddError(null) }}
              size="sm"
              variant="outline"
              className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
            >
              <Plus className="h-4 w-4" />
              予約を追加
            </Button>
          ) : (
            <div className="border border-indigo-200 rounded-lg p-3 space-y-3 bg-indigo-50">
              <p className="text-xs font-semibold text-indigo-700">施設側で予約を追加</p>
              <div>
                <label className="text-xs text-gray-600 block mb-1">児童</label>
                <select
                  value={addChildId}
                  onChange={(e) => setAddChildId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                >
                  <option value="">選択してください</option>
                  {childOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">ステータス</label>
                <select
                  value={addStatus}
                  onChange={(e) => setAddStatus(e.target.value as 'confirmed' | 'reserved')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                >
                  <option value="confirmed">確定</option>
                  <option value="reserved">予約（承認待ち）</option>
                </select>
              </div>
              {addError && (
                <p className="text-xs text-red-600">{addError}</p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowAddForm(false); setAddError(null) }}
                >
                  キャンセル
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={adding || !addChildId}
                  onClick={handleAddReservation}
                >
                  {adding ? '追加中...' : '追加'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
