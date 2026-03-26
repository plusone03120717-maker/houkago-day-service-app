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
  CheckCircle,
  Bell,
  Plus,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { TransportScheduleCreator } from './transport-schedule-creator'

type Unit = { id: string; name: string; service_type: string }
type Vehicle = { id: string; name: string; capacity: number }
export type TransportDetail = {
  id: string
  child_id: string
  pickup_location: string | null
  pickup_time: string | null
  actual_pickup_time: string | null
  status: string
  parent_notified: boolean
  children: { id: string; name: string; name_kana: string | null } | null
}
export type Schedule = {
  id: string
  direction: string
  departure_time: string | null
  route_order: number[]
  transport_vehicles: { id: string; name: string; capacity: number } | null
  users: { name: string } | null
  transport_details: TransportDetail[]
}
export type AttendingChild = {
  child_id: string
  pickup_type: string
  children: { id: string; name: string; name_kana: string | null } | null
}

interface Props {
  date: string
  units: Unit[]
  selectedUnitId: string
  schedules: Schedule[]
  vehicles: Vehicle[]
  attendingChildren: AttendingChild[]
}

export function TransportManageBoard({ date, units, selectedUnitId, schedules, vehicles, attendingChildren }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [updating, setUpdating] = useState<string | null>(null)

  const changeDate = (delta: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + delta)
    router.push(`/transport?date=${formatDate(d, 'yyyy-MM-dd')}&unit=${selectedUnitId}`)
  }

  const pickupSchedule = schedules.find((s) => s.direction === 'pickup')
  const dropoffSchedule = schedules.find((s) => s.direction === 'dropoff')

  const pickupChildren = attendingChildren.filter(
    (c) => c.pickup_type === 'both' || c.pickup_type === 'pickup_only'
  )
  const dropoffChildren = attendingChildren.filter(
    (c) => c.pickup_type === 'both' || c.pickup_type === 'dropoff_only'
  )

  const updateDetailStatus = async (detailId: string, status: string) => {
    setUpdating(detailId)
    const updates: Record<string, string | null> = { status }
    if (status === 'boarded' || status === 'arrived') {
      const now = new Date()
      updates.actual_pickup_time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    }
    await supabase.from('transport_details').update(updates).eq('id', detailId)
    setUpdating(null)
    startTransition(() => router.refresh())
  }

  const notifyParent = async (detailId: string) => {
    setUpdating(detailId)
    await supabase
      .from('transport_details')
      .update({ parent_notified: true, notification_sent_at: new Date().toISOString() })
      .eq('id', detailId)
    setUpdating(null)
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">送迎管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">送迎スケジュールとステータス管理</p>
        </div>
      </div>

      {/* 日付・ユニット選択 */}
      <div className="flex flex-col sm:flex-row gap-3">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ScheduleCard
          title="お迎え"
          direction="pickup"
          schedule={pickupSchedule}
          targetChildren={pickupChildren}
          date={date}
          unitId={selectedUnitId}
          vehicles={vehicles}
          onUpdateStatus={updateDetailStatus}
          onNotify={notifyParent}
          updating={updating}
        />

        <ScheduleCard
          title="お送り"
          direction="dropoff"
          schedule={dropoffSchedule}
          targetChildren={dropoffChildren}
          date={date}
          unitId={selectedUnitId}
          vehicles={vehicles}
          onUpdateStatus={updateDetailStatus}
          onNotify={notifyParent}
          updating={updating}
        />
      </div>
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
  onUpdateStatus,
  onNotify,
  updating,
}: {
  title: string
  direction: 'pickup' | 'dropoff'
  schedule: Schedule | undefined
  targetChildren: AttendingChild[]
  date: string
  unitId: string
  vehicles: Vehicle[]
  onUpdateStatus: (id: string, status: string) => void
  onNotify: (id: string) => void
  updating: string | null
}) {
  const [showCreator, setShowCreator] = useState(false)

  const statusLabel: Record<string, string> = {
    scheduled: '予定',
    boarded: '乗車済',
    arrived: '到着済',
  }
  const statusVariant: Record<string, 'secondary' | 'success' | 'default'> = {
    scheduled: 'secondary',
    boarded: 'default',
    arrived: 'success',
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Car className="h-5 w-5 text-indigo-500" />
          {title}
          {schedule?.transport_vehicles && (
            <Badge variant="secondary" className="text-xs ml-auto">
              {schedule.transport_vehicles.name}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {schedule ? (
          <div className="space-y-2">
            {schedule.departure_time && (
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <Clock className="h-4 w-4" />
                出発予定: {schedule.departure_time.slice(0, 5)}
              </div>
            )}
            {schedule.transport_details.map((detail) => (
              <div key={detail.id} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{detail.children?.name}</p>
                  {detail.pickup_location && (
                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                      <MapPin className="h-3 w-3" />
                      {detail.pickup_location}
                    </div>
                  )}
                  {detail.pickup_time && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="h-3 w-3" />
                      予定: {detail.pickup_time.slice(0, 5)}
                      {detail.actual_pickup_time && ` → 実績: ${detail.actual_pickup_time.slice(0, 5)}`}
                    </div>
                  )}
                </div>
                <Badge variant={statusVariant[detail.status] ?? 'secondary'} className="text-xs flex-shrink-0">
                  {statusLabel[detail.status] ?? detail.status}
                </Badge>
                <div className="flex gap-1">
                  {detail.status === 'scheduled' && (
                    <button
                      onClick={() => onUpdateStatus(detail.id, 'boarded')}
                      disabled={updating === detail.id}
                      className="p-1.5 rounded text-indigo-600 hover:bg-indigo-50"
                      title="乗車済みにする"
                    >
                      <CheckCircle className="h-4 w-4" />
                    </button>
                  )}
                  {detail.status === 'boarded' && (
                    <button
                      onClick={() => onUpdateStatus(detail.id, 'arrived')}
                      disabled={updating === detail.id}
                      className="p-1.5 rounded text-green-600 hover:bg-green-50"
                      title="到着済みにする"
                    >
                      <CheckCircle className="h-4 w-4" />
                    </button>
                  )}
                  {!detail.parent_notified && (
                    <button
                      onClick={() => onNotify(detail.id)}
                      disabled={updating === detail.id}
                      className="p-1.5 rounded text-orange-500 hover:bg-orange-50"
                      title="保護者に通知"
                    >
                      <Bell className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
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
            {targetChildren.length > 0 && unitId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCreator(true)}
                className="mt-1"
              >
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
