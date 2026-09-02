'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  School as SchoolIcon,
  XCircle,
  UserPlus,
  X,
  RefreshCw,
  GripVertical,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import {
  deleteAndRecreateTransportSchedules,
  syncTransportToAttendance,
  clearTransportDirection,
} from '@/app/actions/transport'

type Unit = { id: string; name: string; service_type: string }
type Vehicle = { id: string; name: string; capacity: number }
export type Driver = { id: string; name: string }
export type Direction = 'pickup' | 'dropoff'

/** 送迎一覧の1行（児童1人 × 1方向） */
export type TransportRow = {
  id: string
  childId: string
  direction: Direction
  name: string
  nameKana: string | null
  /** 表示中の送迎時間 'HH:MM'（個別未設定なら便の出発時刻） */
  time: string | null
  /** 児童個別に時間が設定されているか（false は便の出発時刻を暫定表示中） */
  hasOwnTime: boolean
  actualTime: string | null
  location: string | null
  driverMemberId: string | null
  vehicleId: string | null
  sortOrder: number
  schoolName: string | null
  homeAddress: string | null
}

export type UnitChild = {
  id: string
  name: string
  name_kana: string | null
  address: string | null
  school_id: string | null
  schools: { id: string; name: string } | null
}

type ScheduleIds = { pickup: string | null; dropoff: string | null }

interface Props {
  date: string
  units: Unit[]
  selectedUnitId: string
  rows: TransportRow[]
  scheduleIdByDirection: ScheduleIds
  vehicles: Vehicle[]
  drivers: Driver[]
  allChildren: UnitChild[]
}

const DIRECTION_LABEL: Record<Direction, string> = { pickup: 'お迎え', dropoff: 'お送り' }

/** 一覧の列幅（ヘッダーと各行で共有） */
const GRID_COLS = 'md:grid md:grid-cols-[2rem_1.5rem_4.5rem_minmax(6rem,1fr)_minmax(8rem,1.4fr)_6.5rem_minmax(6rem,1fr)_minmax(6rem,1fr)_2rem] md:items-center md:gap-2'

export function TransportManageBoard({
  date,
  units,
  selectedUnitId,
  rows,
  scheduleIdByDirection,
  vehicles,
  drivers,
  allChildren,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [regenerating, setRegenerating] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)

  // ドラッグ並び替え用のローカル順序（時間順ソート済みの rows を初期値にする）
  const [localRows, setLocalRows] = useState<TransportRow[]>(rows)
  const [syncedRows, setSyncedRows] = useState<TransportRow[]>(rows)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [reordering, setReordering] = useState(false)

  // サーバーから新しい行が届いたらレンダー中に同期する（effect 経由の再レンダーを避ける）
  if (syncedRows !== rows) {
    setSyncedRows(rows)
    setLocalRows(rows)
  }

  const changeDate = (delta: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + delta)
    router.push(`/transport?date=${formatDate(d, 'yyyy-MM-dd')}&unit=${selectedUnitId}`)
  }

  const refresh = () => startTransition(() => router.refresh())

  /** 方向ごとの入れ物スケジュールを取得（無ければ作成） */
  const ensureScheduleId = async (direction: Direction): Promise<string | null> => {
    const known = scheduleIdByDirection[direction]
    if (known) return known
    const { data: existing } = await supabase
      .from('transport_schedules')
      .select('id')
      .eq('unit_id', selectedUnitId)
      .eq('date', date)
      .eq('direction', direction)
      .limit(1)
      .maybeSingle()
    if (existing) return existing.id as string
    const { data: created } = await supabase
      .from('transport_schedules')
      .insert({ unit_id: selectedUnitId, date, direction, route_order: [] })
      .select('id')
      .single()
    return (created?.id as string | undefined) ?? null
  }

  /** 送迎一覧から外す（日々の記録側の送迎欄・送迎区分も同じ方向だけ取り下げる） */
  const handleRemove = async (row: TransportRow) => {
    if (!confirm(`「${row.name}」を${DIRECTION_LABEL[row.direction]}の一覧から外しますか？\n（日々の記録の${DIRECTION_LABEL[row.direction]}欄も消えます）`)) return
    await supabase.from('transport_details').delete().eq('id', row.id)
    await clearTransportDirection(row.childId, selectedUnitId, date, row.direction)
    refresh()
  }

  const handleRegenerate = async () => {
    if (!confirm('既存の送迎予定を削除して、利用スケジュールの時間設定をもとに再生成しますか？\n（日々の記録に保存済みの内容はそのまま残ります）')) return
    setRegenerating(true)
    await deleteAndRecreateTransportSchedules(selectedUnitId, date)
    setRegenerating(false)
    refresh()
  }

  const handleDrop = async (dropIdx: number) => {
    if (dragIndex === null || dragIndex === dropIdx) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    const next = [...localRows]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(dropIdx, 0, moved)
    setLocalRows(next)
    setDragIndex(null)
    setDragOverIndex(null)

    setReordering(true)
    await Promise.all(
      next.map((r, i) => supabase.from('transport_details').update({ sort_order: i }).eq('id', r.id))
    )
    setReordering(false)
    refresh()
  }

  const pickupCount = localRows.filter((r) => r.direction === 'pickup').length
  const dropoffCount = localRows.filter((r) => r.direction === 'dropoff').length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">送迎管理</h1>
        <p className="text-sm text-gray-500 mt-0.5">送迎時間の早い順に、児童ごとの送迎予定を表示します</p>
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
                u.id === selectedUnitId
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {u.name}
            </button>
          ))}
        </div>
        {selectedUnitId && (
          <>
            <button
              onClick={() => setShowAddPanel((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                showAddPanel
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'
              }`}
            >
              <UserPlus className="h-4 w-4" />
              児童を追加
            </button>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
              {regenerating ? '再生成中...' : '再生成'}
            </button>
          </>
        )}
      </div>

      {/* 件数サマリ */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-indigo-500" />
          お迎え {pickupCount}名
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          お送り {dropoffCount}名
        </span>
        {reordering && <span className="text-gray-400">並び順を保存中…</span>}
      </div>

      {showAddPanel && (
        <AddChildPanel
          date={date}
          unitId={selectedUnitId}
          allChildren={allChildren}
          existing={localRows}
          ensureScheduleId={ensureScheduleId}
          onDone={refresh}
          onClose={() => setShowAddPanel(false)}
        />
      )}

      {localRows.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-gray-200 rounded-xl bg-white space-y-2">
          <p className="text-sm text-gray-400">この日の送迎予定はまだありません</p>
          <p className="text-xs text-gray-400">「再生成」で利用スケジュールから作成するか、「児童を追加」で個別に登録してください</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* ヘッダー行（PCのみ） */}
          <div className={`hidden ${GRID_COLS} px-3 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500`}>
            <span />
            <span />
            <span>区分</span>
            <span>名前</span>
            <span>送迎場所</span>
            <span>送迎時間</span>
            <span>ドライバー</span>
            <span>車種</span>
            <span />
          </div>

          <div className="divide-y divide-gray-100">
            {localRows.map((row, i) => (
              <TransportRowItem
                // 保存後にサーバーの時刻が変わったら行を作り直して入力欄を同期する
                key={`${row.id}:${row.time ?? ''}`}
                row={row}
                index={i}
                unitId={selectedUnitId}
                date={date}
                drivers={drivers}
                vehicles={vehicles}
                isDragging={dragIndex === i}
                isOver={dragOverIndex === i}
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverIndex(i)
                }}
                onDrop={() => handleDrop(i)}
                onDragEnd={() => {
                  setDragIndex(null)
                  setDragOverIndex(null)
                }}
                ensureScheduleId={ensureScheduleId}
                onRemove={() => handleRemove(row)}
                onSaved={refresh}
              />
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">
        並びは送迎時間の早い順です。同じ時間内の順番は
        <GripVertical className="h-3 w-3 inline mx-0.5 -mt-0.5" />
        をドラッグして入れ替えられます。
      </p>
    </div>
  )
}

/** 一覧の1行。各項目はその場で編集して即保存する */
function TransportRowItem({
  row,
  index,
  unitId,
  date,
  drivers,
  vehicles,
  isDragging,
  isOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  ensureScheduleId,
  onRemove,
  onSaved,
}: {
  row: TransportRow
  index: number
  unitId: string
  date: string
  drivers: Driver[]
  vehicles: Vehicle[]
  isDragging: boolean
  isOver: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onDragEnd: () => void
  ensureScheduleId: (direction: Direction) => Promise<string | null>
  onRemove: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [time, setTime] = useState(row.time ?? '')

  /** transport_details を更新し、必要なら日々の記録（daily_attendance）にも反映する */
  const update = async (
    patch: Record<string, unknown>,
    sync?: { time?: string | null; driverMemberId?: string | null; vehicleId?: string | null }
  ) => {
    setSaving(true)
    await supabase.from('transport_details').update(patch).eq('id', row.id)
    if (sync) {
      await syncTransportToAttendance({
        childId: row.childId,
        unitId,
        date,
        direction: row.direction,
        ...sync,
      })
    }
    setSaving(false)
    onSaved()
  }

  const handleTimeBlur = () => {
    if ((time || null) === (row.hasOwnTime ? row.time : null)) return
    void update({ pickup_time: time || null }, { time: time || null })
  }

  const handleDirectionChange = async (direction: Direction) => {
    if (direction === row.direction) return
    setSaving(true)
    const scheduleId = await ensureScheduleId(direction)
    if (scheduleId) {
      await supabase.from('transport_details').update({ schedule_id: scheduleId }).eq('id', row.id)
      // 日々の記録側も、元の方向の欄を空にして新しい方向へ付け替える
      await clearTransportDirection(row.childId, unitId, date, row.direction)
      await syncTransportToAttendance({
        childId: row.childId,
        unitId,
        date,
        direction,
        time: row.time,
        driverMemberId: row.driverMemberId,
        vehicleId: row.vehicleId,
      })
    }
    setSaving(false)
    onSaved()
  }

  // 送迎場所の選択肢（学校・自宅＋既存の任意入力値）
  const locationOptions: { value: string; label: string }[] = []
  if (row.schoolName) locationOptions.push({ value: row.schoolName, label: `学校：${row.schoolName}` })
  if (row.homeAddress) locationOptions.push({ value: row.homeAddress, label: `自宅：${row.homeAddress}` })
  if (row.location && !locationOptions.some((o) => o.value === row.location)) {
    locationOptions.unshift({ value: row.location, label: row.location })
  }

  const isSchool = !!(row.location && row.schoolName && row.location === row.schoolName)
  const isPickup = row.direction === 'pickup'

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`px-3 py-2.5 space-y-2 md:space-y-0 ${GRID_COLS} transition-colors ${
        isDragging ? 'opacity-40 bg-indigo-50' : isOver ? 'bg-indigo-50' : saving ? 'bg-amber-50/50' : 'hover:bg-gray-50'
      }`}
    >
      {/* 番号 */}
      <span className="hidden md:flex w-6 h-6 rounded-full bg-gray-100 text-gray-600 items-center justify-center text-xs font-bold">
        {index + 1}
      </span>

      {/* ドラッグハンドル */}
      <span className="hidden md:block">
        <GripVertical className="h-4 w-4 text-gray-300 cursor-grab active:cursor-grabbing" />
      </span>

      {/* 区分（お迎え／お送り） */}
      <div className="flex items-center gap-2">
        <span className="md:hidden w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
          {index + 1}
        </span>
        <select
          value={row.direction}
          onChange={(e) => void handleDirectionChange(e.target.value as Direction)}
          disabled={saving}
          aria-label="区分"
          className={`text-xs font-semibold rounded px-1.5 py-1 border cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 ${
            isPickup
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}
        >
          <option value="pickup">お迎え</option>
          <option value="dropoff">お送り</option>
        </select>
      </div>

      {/* 名前 */}
      <div className="flex items-center gap-1.5 min-w-0">
        {isSchool ? (
          <SchoolIcon className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
        ) : (
          <MapPin className="h-3.5 w-3.5 text-green-500 shrink-0" />
        )}
        <span className="font-medium text-gray-800 text-sm truncate">{row.name}</span>
      </div>

      {/* 送迎場所 */}
      <label className="flex items-center gap-1.5 md:gap-0 min-w-0">
        <span className="md:hidden text-[11px] text-gray-400 w-16 shrink-0">送迎場所</span>
        <select
          value={row.location ?? ''}
          onChange={(e) => void update({ pickup_location: e.target.value || null })}
          disabled={saving}
          className="w-full min-w-0 text-xs border border-gray-200 rounded px-1.5 py-1 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
        >
          <option value="">場所未設定</option>
          {locationOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {/* 送迎時間 */}
      <label className="flex items-center gap-1.5 md:gap-0 md:flex-col md:items-start">
        <span className="md:hidden text-[11px] text-gray-400 w-16 shrink-0">送迎時間</span>
        <input
          type="time"
          step={300}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          onBlur={handleTimeBlur}
          disabled={saving}
          className={`w-full md:w-auto text-xs border rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 ${
            row.hasOwnTime ? 'border-gray-200 text-gray-800' : 'border-amber-200 text-amber-700'
          }`}
        />
        {row.actualTime && (
          <span className="text-[10px] text-teal-600 md:mt-0.5 whitespace-nowrap">実績 {row.actualTime}</span>
        )}
      </label>

      {/* ドライバー */}
      <label className="flex items-center gap-1.5 md:gap-0 min-w-0">
        <span className="md:hidden text-[11px] text-gray-400 w-16 shrink-0">ドライバー</span>
        <select
          value={row.driverMemberId ?? ''}
          onChange={(e) =>
            void update({ driver_member_id: e.target.value || null }, { driverMemberId: e.target.value || null })
          }
          disabled={saving}
          className="w-full min-w-0 text-xs border border-gray-200 rounded px-1.5 py-1 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
        >
          <option value="">未設定</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      {/* 車種 */}
      <label className="flex items-center gap-1.5 md:gap-0 min-w-0">
        <span className="md:hidden text-[11px] text-gray-400 w-16 shrink-0">車種</span>
        <select
          value={row.vehicleId ?? ''}
          onChange={(e) => void update({ vehicle_id: e.target.value || null }, { vehicleId: e.target.value || null })}
          disabled={saving}
          className="w-full min-w-0 text-xs border border-gray-200 rounded px-1.5 py-1 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
        >
          <option value="">未設定</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>

      {/* 削除 */}
      <button
        onClick={onRemove}
        disabled={saving}
        className="justify-self-end p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-50"
        title="この送迎を一覧から外す"
      >
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  )
}

/** 児童追加パネル */
function AddChildPanel({
  date,
  unitId,
  allChildren,
  existing,
  ensureScheduleId,
  onDone,
  onClose,
}: {
  date: string
  unitId: string
  allChildren: UnitChild[]
  existing: TransportRow[]
  ensureScheduleId: (direction: Direction) => Promise<string | null>
  onDone: () => void
  onClose: () => void
}) {
  const supabase = createClient()
  const [direction, setDirection] = useState<Direction>('pickup')
  const [adding, setAdding] = useState<string | null>(null)

  // 同じ方向にすでに登録済みの児童は候補から除外
  const registered = new Set(existing.filter((r) => r.direction === direction).map((r) => r.childId))
  const available = allChildren.filter((c) => !registered.has(c.id))

  const handleAdd = async (child: UnitChild, locationType: 'school' | 'home') => {
    setAdding(child.id)
    const scheduleId = await ensureScheduleId(direction)
    if (!scheduleId) {
      setAdding(null)
      return
    }

    const location = locationType === 'school' ? (child.schools?.name ?? null) : (child.address ?? null)

    await supabase.from('transport_details').insert({
      schedule_id: scheduleId,
      child_id: child.id,
      pickup_location: location,
      status: 'scheduled',
    })

    // daily_attendance を upsert（出席として追加し、送迎区分を広げる）
    const { data: attendance } = await supabase
      .from('daily_attendance')
      .select('id, pickup_type')
      .eq('unit_id', unitId)
      .eq('date', date)
      .eq('child_id', child.id)
      .maybeSingle()

    if (attendance) {
      const current = attendance.pickup_type as string
      const own = direction === 'pickup' ? 'pickup_only' : 'dropoff_only'
      const other = direction === 'pickup' ? 'dropoff_only' : 'pickup_only'
      const next = current === 'both' || current === other ? 'both' : own
      await supabase
        .from('daily_attendance')
        .update({ status: 'attended', pickup_type: next })
        .eq('id', attendance.id)
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
    onDone()
  }

  return (
    <div className="border border-indigo-100 rounded-xl bg-indigo-50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
          <UserPlus className="h-3.5 w-3.5" />
          児童を追加
        </p>
        <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-white transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex gap-1.5">
        {(['pickup', 'dropoff'] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDirection(d)}
            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
              direction === d
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {DIRECTION_LABEL[d]}
          </button>
        ))}
      </div>

      {available.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">追加できる児童がいません</p>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {available.map((child) => (
            <div key={child.id} className="flex items-center gap-2 bg-white rounded px-3 py-2">
              <span className="flex-1 text-sm text-gray-800 truncate">{child.name}</span>
              <div className="flex gap-1.5 shrink-0">
                {child.schools?.name && (
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
