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
  Pencil,
  Check,
  X,
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
  transport_vehicles: { id: string; name: string; capacity: number } | null
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

/** 同じ場所の児童をまとめてルートのストップリストを作成 */
function buildStops(details: TransportDetail[]) {
  const stops: { location: string | null; isSchool: boolean; children: TransportDetail[] }[] = []
  for (const d of details) {
    const last = stops[stops.length - 1]
    if (last && last.location === d.pickup_location) {
      last.children.push(d)
    } else {
      const isSchool = !!(d.pickup_location && /学校|校$/.test(d.pickup_location))
      stops.push({ location: d.pickup_location, isSchool, children: [d] })
    }
  }
  return stops
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">送迎管理</h1>
        <p className="text-sm text-gray-500 mt-0.5">本日の送迎ルート</p>
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
          onRemove={removeFromTransport}
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
          onRemove={removeFromTransport}
          updating={updating}
        />
      </div>
    </div>
  )
}

/** 児童1行の編集UI */
function DetailRow({
  detail,
  direction,
  updating,
  onRemove,
}: {
  detail: TransportDetail
  direction: 'pickup' | 'dropoff'
  updating: string | null
  onRemove: (detail: TransportDetail) => void
}) {
  const supabase = createClient()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [manualLocation, setManualLocation] = useState(detail.pickup_location ?? '')
  const [saving, setSaving] = useState(false)

  const homeAddress = detail.children?.address ?? null
  const schoolName = detail.children?.schools?.name ?? null

  const handleAutoSelect = (type: 'school' | 'home') => {
    if (type === 'school') setManualLocation(schoolName ?? '')
    else setManualLocation(homeAddress ?? '')
  }

  const handleSave = async () => {
    setSaving(true)
    await supabase
      .from('transport_details')
      .update({ pickup_location: manualLocation || null })
      .eq('id', detail.id)
    setSaving(false)
    setEditing(false)
    startTransition(() => router.refresh())
  }

  const handleCancel = () => {
    setManualLocation(detail.pickup_location ?? '')
    setMode('manual')
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="py-2 px-3 bg-indigo-50 rounded border border-indigo-100 space-y-2">
        <p className="text-xs font-medium text-gray-700">{detail.children?.name ?? '不明'}</p>

        {/* 手動 / 自動 切替 */}
        <div className="flex gap-1.5">
          {(['manual', 'auto'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                mode === m
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {m === 'manual' ? '手動' : '自動'}
            </button>
          ))}
        </div>

        {mode === 'manual' ? (
          <input
            type="text"
            value={manualLocation}
            onChange={(e) => setManualLocation(e.target.value)}
            placeholder="場所を入力"
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        ) : (
          <div className="flex gap-1.5 flex-wrap">
            {direction === 'pickup' && schoolName && (
              <button
                onClick={() => handleAutoSelect('school')}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50 transition-colors"
              >
                <SchoolIcon className="h-3 w-3" />
                学校（{schoolName}）
              </button>
            )}
            {homeAddress && (
              <button
                onClick={() => handleAutoSelect('home')}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border bg-white text-green-700 border-green-200 hover:bg-green-50 transition-colors"
              >
                <MapPin className="h-3 w-3" />
                自宅（{homeAddress}）
              </button>
            )}
            {!schoolName && !homeAddress && (
              <p className="text-xs text-gray-400">住所・学校データが未登録です</p>
            )}
            {manualLocation && (
              <p className="text-xs text-gray-500 mt-0.5">選択中: {manualLocation}</p>
            )}
          </div>
        )}

        <div className="flex gap-1.5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Check className="h-3 w-3" />
            {saving ? '保存中' : '保存'}
          </button>
          <button
            onClick={handleCancel}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <X className="h-3 w-3" />
            キャンセル
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-1 px-3 bg-gray-50 rounded text-sm text-gray-700">
      <span className="flex-1">{detail.children?.name ?? '不明'}</span>
      <button
        onClick={() => setEditing(true)}
        className="p-1 rounded text-gray-300 hover:text-indigo-400 hover:bg-indigo-50 transition-colors flex-shrink-0"
        title="場所を編集"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
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
}

function ScheduleCard({
  title,
  direction,
  schedule,
  targetChildren,
  date,
  unitId,
  vehicles,
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
  onRemove: (detail: TransportDetail) => void
  updating: string | null
}) {
  const [showCreator, setShowCreator] = useState(false)
  const stops = schedule ? buildStops(schedule.transport_details) : []

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
        </CardTitle>
      </CardHeader>
      <CardContent>
        {schedule ? (
          <div className="space-y-3">
            {/* ルートヘッダー */}
            <div className="flex items-center gap-1.5">
              <Navigation className="h-3.5 w-3.5 text-indigo-500" />
              <p className="text-xs font-semibold text-gray-500">
                施設から最短順のルート
                {schedule.departure_time && (
                  <span className="ml-2 font-normal text-gray-400">
                    <Clock className="h-3 w-3 inline mr-0.5" />
                    出発 {schedule.departure_time.slice(0, 5)}
                  </span>
                )}
              </p>
            </div>

            {/* 出発 */}
            <div className="flex items-center gap-2 text-xs text-gray-500 pl-1">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">出</span>
              <span>施設（富士河口湖町小立）</span>
            </div>

            {/* 各ストップ */}
            {stops.map((stop, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  {stop.isSchool
                    ? <SchoolIcon className="h-3.5 w-3.5 text-indigo-500" />
                    : <MapPin className="h-3.5 w-3.5 text-green-500" />
                  }
                  <span className="flex-1 truncate">{stop.location ?? '場所未設定'}</span>
                  <span className="text-gray-400 font-normal">（{stop.children.length}名）</span>
                </div>
                <div className="ml-7 space-y-0.5">
                  {stop.children.map((detail) => (
                    <DetailRow
                      key={detail.id}
                      detail={detail}
                      direction={direction}
                      updating={updating}
                      onRemove={onRemove}
                    />
                  ))}
                </div>
              </div>
            ))}

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
            {targetChildren.length > 0 && unitId && (
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
