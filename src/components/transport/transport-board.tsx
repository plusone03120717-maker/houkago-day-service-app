'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Car,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  Navigation,
  School as SchoolIcon,
  Plus,
  XCircle,
  UserPlus,
  X,
  RefreshCw,
  User,
  GripVertical,
  Trash2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { TransportScheduleCreator } from './transport-schedule-creator'
import { deleteAndRecreateTransportSchedules } from '@/app/actions/transport'

type Unit = { id: string; name: string; service_type: string }
type Vehicle = { id: string; name: string; capacity: number }
export type Driver = { id: string; name: string }

export type TransportDetail = {
  id: string
  child_id: string
  pickup_location: string | null
  pickup_time: string | null
  actual_pickup_time: string | null
  status: string
  parent_notified: boolean
  sort_order: number
  children: {
    id: string
    name: string
    name_kana: string | null
    address: string | null
    school_id: string | null
    schools: { id: string; name: string } | null
  } | null
}

export type Schedule = {
  id: string
  direction: string
  departure_time: string | null
  route_order: number[]
  driver_member_id: string | null
  transport_vehicles: { id: string; name: string; capacity: number } | null
  staff_members: { id: string; name: string } | null
  transport_details: TransportDetail[]
}

export type AttendingChild = {
  child_id: string
  pickup_type: string
  children: { id: string; name: string; name_kana: string | null } | null
}

export type UnitChild = {
  id: string
  name: string
  name_kana: string | null
  address: string | null
  school_id: string | null
  schools: { id: string; name: string } | null
}

interface Props {
  date: string
  units: Unit[]
  selectedUnitId: string
  schedules: Schedule[]
  vehicles: Vehicle[]
  drivers: Driver[]
  attendingChildren: AttendingChild[]
  allChildren: UnitChild[]
}


export function TransportManageBoard({ date, units, selectedUnitId, schedules, vehicles, drivers, attendingChildren, allChildren }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [updating, setUpdating] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  const changeDate = (delta: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + delta)
    router.push(`/transport?date=${formatDate(d, 'yyyy-MM-dd')}&unit=${selectedUnitId}`)
  }

  // 方向ごとに複数便を出発時間順でまとめる
  const pickupSchedules = schedules
    .filter((s) => s.direction === 'pickup')
    .sort((a, b) => (a.departure_time ?? '').localeCompare(b.departure_time ?? ''))
  const dropoffSchedules = schedules
    .filter((s) => s.direction === 'dropoff')
    .sort((a, b) => (a.departure_time ?? '').localeCompare(b.departure_time ?? ''))

  const pickupChildren = attendingChildren.filter(
    (c) => c.pickup_type === 'both' || c.pickup_type === 'pickup_only'
  )
  const dropoffChildren = attendingChildren.filter(
    (c) => c.pickup_type === 'both' || c.pickup_type === 'dropoff_only'
  )

  const removeFromTransport = async (detail: TransportDetail) => {
    if (!confirm(`「${detail.children?.name}」を送迎スケジュールから外して欠席にしますか？`)) return
    setUpdating(detail.id)
    await supabase.from('transport_details').delete().eq('id', detail.id)
    await supabase
      .from('daily_attendance')
      .update({ status: 'absent' })
      .eq('child_id', detail.child_id)
      .eq('unit_id', selectedUnitId)
      .eq('date', date)
    setUpdating(null)
    startTransition(() => router.refresh())
  }

  const handleRegenerate = async () => {
    if (!confirm('既存のスケジュールを削除して、利用スケジュールの時間設定をもとに再生成しますか？')) return
    setRegenerating(true)
    await deleteAndRecreateTransportSchedules(selectedUnitId, date)
    setRegenerating(false)
    startTransition(() => router.refresh())
  }

  /** 便タイトル（常に出発時間を付記） */
  const scheduleTitle = (base: string, sched: Schedule) => {
    return sched.departure_time
      ? `${base}（${sched.departure_time.slice(0, 5)} 便）`
      : `${base}（時間未設定便）`
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">送迎管理</h1>
        <p className="text-sm text-gray-500 mt-0.5">本日の送迎ルート</p>
      </div>

      {/* 日付・ユニット選択 */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <button onClick={() => changeDate(-1)} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => router.push(`/transport?date=${e.target.value}&unit=${selectedUnitId}`)}
            className="text-sm font-medium border-none outline-none cursor-pointer"
          />
          <button onClick={() => changeDate(1)} className="p-1 hover:bg-gray-100 rounded">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {units.map((u) => (
            <button
              key={u.id}
              onClick={() => router.push(`/transport?date=${date}&unit=${u.id}`)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                u.id === selectedUnitId ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {u.name}
            </button>
          ))}
        </div>
        {/* 再生成ボタン */}
        {selectedUnitId && (
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
            {regenerating ? '再生成中...' : 'スケジュール再生成'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* お迎え列（複数便対応） */}
        <div className="space-y-4">
          {pickupSchedules.length > 0 ? (
            pickupSchedules.map((sched) => (
              <ScheduleCard
                key={sched.id}
                title={scheduleTitle('お迎え', sched)}
                direction="pickup"
                schedule={sched}
                targetChildren={pickupChildren}
                date={date}
                unitId={selectedUnitId}
                vehicles={vehicles}
                drivers={drivers}
                allChildren={allChildren}
                onRemove={removeFromTransport}
                updating={updating}
              />
            ))
          ) : (
            <ScheduleCard
              title="お迎え"
              direction="pickup"
              schedule={undefined}
              targetChildren={pickupChildren}
              date={date}
              unitId={selectedUnitId}
              vehicles={vehicles}
              drivers={drivers}
              allChildren={allChildren}
              onRemove={removeFromTransport}
              updating={updating}
            />
          )}
        </div>

        {/* お送り列（複数便対応） */}
        <div className="space-y-4">
          {dropoffSchedules.length > 0 ? (
            dropoffSchedules.map((sched) => (
              <ScheduleCard
                key={sched.id}
                title={scheduleTitle('お送り', sched)}
                direction="dropoff"
                schedule={sched}
                targetChildren={dropoffChildren}
                date={date}
                unitId={selectedUnitId}
                vehicles={vehicles}
                drivers={drivers}
                allChildren={allChildren}
                onRemove={removeFromTransport}
                updating={updating}
              />
            ))
          ) : (
            <ScheduleCard
              title="お送り"
              direction="dropoff"
              schedule={undefined}
              targetChildren={dropoffChildren}
              date={date}
              unitId={selectedUnitId}
              vehicles={vehicles}
              drivers={drivers}
              allChildren={allChildren}
              onRemove={removeFromTransport}
              updating={updating}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** 児童追加パネル */
function AddChildPanel({
  schedule,
  direction,
  date,
  unitId,
  allChildren,
  onClose,
}: {
  schedule: Schedule
  direction: 'pickup' | 'dropoff'
  date: string
  unitId: string
  allChildren: UnitChild[]
  onClose: () => void
}) {
  const supabase = createClient()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [adding, setAdding] = useState<string | null>(null)

  // すでにスケジュールに入っている child_id を除外
  const scheduledIds = new Set(schedule.transport_details.map((d) => d.child_id))
  const available = allChildren.filter((c) => !scheduledIds.has(c.id))

  const handleAdd = async (child: UnitChild, locationType: 'school' | 'home') => {
    setAdding(child.id)

    const location = locationType === 'school'
      ? (child.schools?.name ?? null)
      : (child.address ?? null)

    // transport_detail を追加
    await supabase.from('transport_details').insert({
      schedule_id: schedule.id,
      child_id: child.id,
      pickup_location: location,
      status: 'scheduled',
    })

    // daily_attendance を upsert（出席として追加）
    const { data: existing } = await supabase
      .from('daily_attendance')
      .select('id, pickup_type')
      .eq('unit_id', unitId)
      .eq('date', date)
      .eq('child_id', child.id)
      .maybeSingle()

    if (existing) {
      // 既存の pickup_type を拡張
      let newPickupType = existing.pickup_type
      if (direction === 'pickup' && newPickupType === 'dropoff_only') newPickupType = 'both'
      else if (direction === 'pickup' && newPickupType !== 'both') newPickupType = 'pickup_only'
      else if (direction === 'dropoff' && newPickupType === 'pickup_only') newPickupType = 'both'
      else if (direction === 'dropoff' && newPickupType !== 'both') newPickupType = 'dropoff_only'

      await supabase
        .from('daily_attendance')
        .update({ status: 'attended', pickup_type: newPickupType })
        .eq('id', existing.id)
    } else {
      await supabase.from('daily_attendance').insert({
        unit_id: unitId,
        date,
        child_id: child.id,
        status: 'attended',
        pickup_type: direction === 'pickup' ? 'pickup_only' : 'dropoff_only',
      })
    }

    setAdding(null)
    startTransition(() => router.refresh())
  }

  return (
    <div className="border border-indigo-100 rounded-lg bg-indigo-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-indigo-700">
          <UserPlus className="h-3.5 w-3.5 inline mr-1" />
          児童を追加
        </p>
        <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-white transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {available.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">追加できる児童がいません</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {available.map((child) => (
            <div key={child.id} className="flex items-center gap-2 bg-white rounded px-3 py-2">
              <span className="flex-1 text-sm text-gray-800">{child.name}</span>
              <div className="flex gap-1.5 flex-shrink-0">
                {direction === 'pickup' && child.schools?.name && (
                  <button
                    onClick={() => handleAdd(child, 'school')}
                    disabled={adding === child.id}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 transition-colors"
                  >
                    <SchoolIcon className="h-3 w-3" />
                    学校
                  </button>
                )}
                {child.address && (
                  <button
                    onClick={() => handleAdd(child, 'home')}
                    disabled={adding === child.id}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
                  >
                    <MapPin className="h-3 w-3" />
                    自宅
                  </button>
                )}
                {!child.schools?.name && !child.address && (
                  <span className="text-xs text-gray-400">住所未登録</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduleCard({
  title,
  direction,
  schedule,
  targetChildren,
  date,
  unitId,
  vehicles,
  drivers,
  allChildren,
  onRemove,
  updating,
}: {
  title: string
  direction: 'pickup' | 'dropoff'
  schedule: Schedule | undefined
  targetChildren: AttendingChild[]
  date: string
  unitId: string
  vehicles: Vehicle[]
  drivers: Driver[]
  allChildren: UnitChild[]
  onRemove: (detail: TransportDetail) => void
  updating: string | null
}) {
  const supabase = createClient()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [driverSaving, setDriverSaving] = useState(false)
  const [showCreator, setShowCreator] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)

  // ドラッグ&ドロップ用: sort_order 順にソートしたローカル状態
  const sortedDetails = schedule
    ? [...schedule.transport_details].sort((a, b) => a.sort_order - b.sort_order)
    : []
  const [localDetails, setLocalDetails] = useState<TransportDetail[]>(sortedDetails)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [reordering, setReordering] = useState(false)

  // schedule が変わったらローカル状態をリセット
  const scheduleId = schedule?.id
  const [lastScheduleId, setLastScheduleId] = useState(scheduleId)
  if (scheduleId !== lastScheduleId) {
    setLocalDetails(sortedDetails)
    setLastScheduleId(scheduleId)
  }

  const handleDeleteSchedule = async () => {
    if (!schedule) return
    const label = schedule.departure_time
      ? `${title}（出発 ${schedule.departure_time.slice(0, 5)}）`
      : title
    if (!confirm(`「${label}」の便をまるごと削除しますか？\n（この便の送迎詳細もすべて削除されます）`)) return
    await supabase.from('transport_schedules').delete().eq('id', schedule.id)
    startTransition(() => router.refresh())
  }

  const handleDriverChange = async (driverId: string) => {
    if (!schedule) return
    setDriverSaving(true)
    await supabase
      .from('transport_schedules')
      .update({ driver_member_id: driverId || null })
      .eq('id', schedule.id)
    setDriverSaving(false)
    startTransition(() => router.refresh())
  }

  const handleDragStart = (idx: number) => setDragIndex(idx)
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIndex(idx)
  }
  const handleDrop = async (dropIdx: number) => {
    if (dragIndex === null || dragIndex === dropIdx || !schedule) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    const next = [...localDetails]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(dropIdx, 0, moved)
    setLocalDetails(next)
    setDragIndex(null)
    setDragOverIndex(null)

    // DB に sort_order を一括更新
    setReordering(true)
    await Promise.all(
      next.map((d, i) =>
        supabase.from('transport_details').update({ sort_order: i }).eq('id', d.id)
      )
    )
    setReordering(false)
    startTransition(() => router.refresh())
  }
  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }


  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Car className="h-5 w-5 text-indigo-500" />
          {title}
          {schedule && (
            <span className="ml-auto text-xs text-gray-500 font-normal">
              {schedule.transport_details.length}名
            </span>
          )}
          {schedule?.transport_vehicles && (
            <Badge variant="secondary" className="text-xs">
              {schedule.transport_vehicles.name}
            </Badge>
          )}
          {/* 児童追加・便削除ボタン（スケジュールがある場合のみ表示） */}
          {schedule && (
            <>
              <button
                onClick={() => setShowAddPanel((v) => !v)}
                className={`ml-1 flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors ${
                  showAddPanel
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                }`}
              >
                <UserPlus className="h-3.5 w-3.5" />
                追加
              </button>
              <button
                onClick={handleDeleteSchedule}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-red-200 bg-white text-red-500 hover:bg-red-50 transition-colors"
                title="この便を削除"
              >
                <Trash2 className="h-3.5 w-3.5" />
                削除
              </button>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {schedule ? (
          <div className="space-y-3">
            {/* 追加パネル */}
            {showAddPanel && (
              <AddChildPanel
                schedule={schedule}
                direction={direction}
                date={date}
                unitId={unitId}
                allChildren={allChildren}
                onClose={() => setShowAddPanel(false)}
              />
            )}

            {/* ドライバー選択 */}
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <select
                value={schedule.driver_member_id ?? ''}
                onChange={(e) => handleDriverChange(e.target.value)}
                disabled={driverSaving}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="">ドライバー未設定</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* ルートヘッダー */}
            <div className="flex items-center gap-1.5">
              <Navigation className="h-3.5 w-3.5 text-indigo-500" />
              <p className="text-xs font-semibold text-gray-500 flex-1">
                ルート順
                {schedule.departure_time && (
                  <span className="ml-2 font-normal text-gray-400">
                    <Clock className="h-3 w-3 inline mr-0.5" />
                    出発 {schedule.departure_time.slice(0, 5)}
                  </span>
                )}
              </p>
              {reordering && <span className="text-xs text-gray-400">保存中…</span>}
            </div>

            {/* 出発 */}
            <div className="flex items-center gap-2 text-xs text-gray-500 pl-1">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">出</span>
              <span>施設（富士河口湖町小立）</span>
            </div>

            {/* ドラッグ可能な児童リスト */}
            <div className="space-y-1">
              {localDetails.map((detail, i) => {
                const isSchool = !!(detail.pickup_location && /学校|校$/.test(detail.pickup_location))
                const isDragging = dragIndex === i
                const isOver = dragOverIndex === i
                return (
                  <div
                    key={detail.id}
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm transition-colors ${
                      isDragging
                        ? 'opacity-40 bg-indigo-50 border border-dashed border-indigo-300'
                        : isOver
                        ? 'bg-indigo-50 border border-indigo-300'
                        : 'bg-gray-50 border border-transparent'
                    }`}
                  >
                    <GripVertical className="h-4 w-4 text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0" />
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    {isSchool
                      ? <SchoolIcon className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
                      : <MapPin className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{detail.children?.name ?? '不明'}</p>
                      <p className="text-xs text-gray-400 truncate">{detail.pickup_location ?? '場所未設定'}</p>
                    </div>
                    <button
                      onClick={() => onRemove(detail)}
                      disabled={updating === detail.id}
                      className="p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-50 flex-shrink-0"
                      title="欠席にして外す"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>

            {/* 帰着 */}
            <div className="flex items-center gap-2 text-xs text-gray-500 pl-1">
              <span className="w-5 h-5 rounded-full bg-gray-400 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">着</span>
              <span>施設に帰着</span>
            </div>
          </div>
        ) : showCreator ? (
          <TransportScheduleCreator
            date={date}
            unitId={unitId}
            direction={direction}
            vehicles={vehicles}
            onCreated={() => setShowCreator(false)}
            onCancel={() => setShowCreator(false)}
          />
        ) : (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-gray-400">スケジュールが未設定です</p>
            <p className="text-xs text-gray-400">
              {direction === 'pickup' ? 'お迎え' : 'お送り'}対象: {targetChildren.length}名
            </p>
            {unitId && (
              <Button size="sm" variant="outline" onClick={() => setShowCreator(true)} className="mt-1">
                <Plus className="h-3.5 w-3.5" />
                スケジュールを作成
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
