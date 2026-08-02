'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ClipboardEdit,
  LayoutList,
  CalendarDays,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { WeeklyAttendanceView } from './weekly-attendance-view'
import {
  TransportDaytimePanel,
  TransportDaytimeToggle,
  initFields,
  isBlankFields,
  applyScheduleDefaults,
  buildTransportUpdate,
  type TransportRow,
  type TransportFields,
  type ScheduleDefaults,
  type StaffMember,
  type Vehicle,
} from '@/components/transport/transport-daytime-panel'

export type Unit = {
  id: string
  name: string
  service_type: string
  capacity: number
  facilities: { id: string; name: string } | null
}

export type Reservation = {
  id: string
  child_id: string
  date: string
  status: string
  children: {
    id: string
    name: string
    name_kana: string | null
    photo_url: string | null
    allergy_info: string | null
    medical_info: string | null
  } | null
}

export type Attendance = TransportRow & {
  id: string
  child_id: string
  unit_id: string
  date: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  pickup_type: string
  health_condition: string | null
}

/** 児童ID → 直近の出席日の送迎入力（前回コピー用） */
export type PrevAttendanceRow = TransportRow & { child_id: string; date: string }

interface Props {
  date: string
  units: Unit[]
  selectedUnitId: string
  reservations: Reservation[]
  attendances: Attendance[]
  staffId: string
  staffMembers: StaffMember[]
  vehicles: Vehicle[]
  defaultServiceEndTime: string
  prevByChildId: Record<string, PrevAttendanceRow>
  scheduleDefaultsByChildId: Record<string, ScheduleDefaults>
}

/** "16:30:00" → "16:30"。未設定・00:00 は空文字として扱う */
function fmtTime(t: string | null | undefined): string {
  if (!t) return ''
  const hhmm = t.slice(0, 5)
  return hhmm === '00:00' ? '' : hhmm
}

export function AttendanceBoard({
  date,
  units,
  selectedUnitId,
  reservations,
  attendances,
  staffId,
  staffMembers,
  vehicles,
  defaultServiceEndTime,
  prevByChildId,
  scheduleDefaultsByChildId,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState<string | null>(null)
  const [view, setView] = useState<'day' | 'week'>('day')

  // 送迎・日中一時入力（日々の記録と同じUI）
  const [expanded, setExpanded] = useState<string | null>(null)
  const [fieldStates, setFieldStates] = useState<Record<string, TransportFields>>({})
  const [transportSaving, setTransportSaving] = useState<string | null>(null)
  const [transportSavedIds, setTransportSavedIds] = useState<Set<string>>(new Set())
  const [savedOnce, setSavedOnce] = useState<Set<string>>(new Set())

  const attendanceMap = Object.fromEntries(attendances.map((a) => [a.child_id, a]))

  // DBの値が空の場合は利用スケジュールの初期値を自動セット
  const buildInitialFields = (a: Attendance): TransportFields => {
    const base = initFields(a, defaultServiceEndTime)
    const sched = scheduleDefaultsByChildId[a.child_id]
    if (sched && isBlankFields(base)) {
      return applyScheduleDefaults(base, sched, defaultServiceEndTime)
    }
    return base
  }

  // スケジュール初期値が表示中（未保存）かどうか
  const isSchedulePreset = (a: Attendance): boolean => {
    const sched = scheduleDefaultsByChildId[a.child_id]
    return !!sched && !savedOnce.has(a.id) && isBlankFields(initFields(a, defaultServiceEndTime))
  }

  const getFields = (a: Attendance): TransportFields =>
    fieldStates[a.id] ?? buildInitialFields(a)

  const setField = (a: Attendance, patch: Partial<TransportFields>) => {
    setFieldStates((prev) => ({
      ...prev,
      [a.id]: { ...(prev[a.id] ?? buildInitialFields(a)), ...patch },
    }))
  }

  // 前回（直近の出席日）の入力内容をまるごと複写
  const handleCopyPrevious = (a: Attendance) => {
    const prev = prevByChildId[a.child_id]
    if (!prev) return
    setFieldStates((s) => ({ ...s, [a.id]: initFields(prev, defaultServiceEndTime) }))
  }

  const handleSaveTransport = async (a: Attendance) => {
    setTransportSaving(a.id)
    const { error } = await supabase
      .from('daily_attendance')
      .update(buildTransportUpdate(getFields(a)))
      .eq('id', a.id)
    setTransportSaving(null)
    if (error) { alert(`保存エラー: ${error.message}`); return }

    setSavedOnce((prev) => new Set(prev).add(a.id))
    setTransportSavedIds((prev) => new Set(prev).add(a.id))
    setTimeout(() => setTransportSavedIds((prev) => { const s = new Set(prev); s.delete(a.id); return s }), 2000)
    startTransition(() => router.refresh())
  }

  // 日付を1日前後に移動
  const changeDate = (delta: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + delta)
    const params = new URLSearchParams({ date: formatDate(d, 'yyyy-MM-dd'), unit: selectedUnitId })
    router.push(`/attendance?${params.toString()}`)
  }

  const changeUnit = (unitId: string) => {
    router.push(`/attendance?date=${date}&unit=${unitId}`)
  }

  // 利用スケジュールから当日の利用時間を取得（特定日上書き > 曜日別設定 > プランのデフォルト）
  const fetchScheduledTimes = async (childId: string): Promise<{ check_in_time?: string; check_out_time?: string }> => {
    const dow = new Date(date).getDay()
    const { data: plans } = await supabase
      .from('usage_plans')
      .select('id, pickup_time, dropoff_time')
      .eq('child_id', childId)
      .eq('unit_id', selectedUnitId)
      .eq('is_active', true)
      .lte('start_date', date)
      .or(`end_date.is.null,end_date.gte.${date}`)
      .contains('day_of_week', [dow])
      .limit(1)

    if (!plans || plans.length === 0) return {}
    const plan = plans[0]
    let pickupTime = plan.pickup_time as string | null
    let dropoffTime = plan.dropoff_time as string | null

    // 特定日上書きがあれば最優先
    const { data: dateOverride } = await supabase
      .from('usage_plan_date_overrides')
      .select('pickup_time, dropoff_time')
      .eq('plan_id', plan.id)
      .eq('date', date)
      .maybeSingle()
    if (dateOverride) {
      if (dateOverride.pickup_time) pickupTime = dateOverride.pickup_time as string
      if (dateOverride.dropoff_time) dropoffTime = dateOverride.dropoff_time as string
    } else {
      // 曜日別設定があれば上書き
      const { data: daySetting } = await supabase
        .from('usage_plan_day_settings')
        .select('pickup_time, dropoff_time')
        .eq('plan_id', plan.id)
        .eq('day_of_week', dow)
        .maybeSingle()
      if (daySetting?.pickup_time) pickupTime = daySetting.pickup_time as string
      if (daySetting?.dropoff_time) dropoffTime = daySetting.dropoff_time as string
    }

    const result: { check_in_time?: string; check_out_time?: string } = {}
    if (pickupTime) result.check_in_time = pickupTime.slice(0, 5)
    if (dropoffTime) result.check_out_time = dropoffTime.slice(0, 5)
    return result
  }

  // 出席記録を作成/更新
  const upsertAttendance = async (childId: string, updates: Partial<Attendance>) => {
    setSaving(childId)
    const existing = attendanceMap[childId]

    // 出席マーク時に利用スケジュールの時間を自動同期
    // すでに出席済み（手動で時間編集済みの可能性あり）の場合は上書きしない
    let scheduledTimes: { check_in_time?: string; check_out_time?: string } = {}
    if (updates.status === 'attended' && existing?.status !== 'attended') {
      const times = await fetchScheduledTimes(childId)
      if (times.check_in_time) scheduledTimes.check_in_time = times.check_in_time
      if (times.check_out_time) scheduledTimes.check_out_time = times.check_out_time
    }

    const mergedUpdates = { ...scheduledTimes, ...updates }

    if (existing) {
      const { error } = await supabase
        .from('daily_attendance')
        .update(mergedUpdates)
        .eq('id', existing.id)
      if (error) { alert(`更新エラー: ${error.message}`); setSaving(null); return }

      // 欠席になった場合、送迎時間・提供時間をすべてクリア
      if (updates.status === 'absent') {
        await supabase
          .from('daily_attendance')
          .update({
            pickup_departure_time: null,
            pickup_arrival_time: null,
            dropoff_departure_time: null,
            dropoff_arrival_time: null,
            service_start_time: null,
            service_end_time: null,
            daytime_support: false,
            daytime_support_start_time: null,
            daytime_support_end_time: null,
            daytime_pickup_departure_time: null,
            daytime_pickup_arrival_time: null,
            daytime_dropoff_departure_time: null,
            daytime_dropoff_arrival_time: null,
            daytime_pickup_driver_member_id: null,
            daytime_pickup_vehicle_id: null,
            daytime_dropoff_driver_member_id: null,
            daytime_dropoff_vehicle_id: null,
            pickup_driver_member_id: null,
            pickup_vehicle_id: null,
            dropoff_driver_member_id: null,
            dropoff_vehicle_id: null,
          })
          .eq('id', existing.id)
      }
    } else {
      const { error } = await supabase.from('daily_attendance').insert({
        child_id: childId,
        unit_id: selectedUnitId,
        date,
        status: 'attended',
        pickup_type: 'none',
        created_by: staffId,
        ...mergedUpdates,
      })
      if (error) { alert(`登録エラー: ${error.message}`); setSaving(null); return }
    }

    // 欠席になった場合、送迎スケジュールからも削除
    if (updates.status === 'absent') {
      const { data: schedules } = await supabase
        .from('transport_schedules')
        .select('id')
        .eq('unit_id', selectedUnitId)
        .eq('date', date)
      if (schedules && schedules.length > 0) {
        const scheduleIds = schedules.map((s: { id: string }) => s.id)
        await supabase
          .from('transport_details')
          .delete()
          .eq('child_id', childId)
          .in('schedule_id', scheduleIds)
      }
    }

    setSaving(null)
    startTransition(() => router.refresh())
  }

  // 出席取り消し（レコードを削除して未記録に戻す）
  const cancelAttendance = async (childId: string) => {
    const existing = attendanceMap[childId]
    if (!existing) return
    setSaving(childId)
    const { error } = await supabase.from('daily_attendance').delete().eq('id', existing.id)
    if (error) { alert(`取り消しエラー: ${error.message}`); setSaving(null); return }
    setSaving(null)
    startTransition(() => router.refresh())
  }

  // 一括出席登録
  const markAllPresent = async () => {
    setSaving('all')
    const unrecorded = reservations.filter(
      (r) => r.status !== 'cancel_waiting' && !attendanceMap[r.child_id]
    )

    // 各児童のスケジュール時間を取得してから登録
    await Promise.all(
      unrecorded.map(async (r) => {
        const times = await fetchScheduledTimes(r.child_id)
        return supabase.from('daily_attendance').insert({
          child_id: r.child_id,
          unit_id: selectedUnitId,
          date,
          status: 'attended',
          pickup_type: 'none',
          created_by: staffId,
          ...times,
        })
      })
    )
    setSaving(null)
    startTransition(() => router.refresh())
  }

  const attending = reservations.filter((r) => {
    const att = attendanceMap[r.child_id]
    return att?.status === 'attended'
  })
  const absent = reservations.filter((r) => {
    const att = attendanceMap[r.child_id]
    return att?.status === 'absent' || r.status === 'cancel_waiting'
  })
  const unrecorded = reservations.filter((r) => {
    return !attendanceMap[r.child_id] && r.status !== 'cancel_waiting'
  })

  const selectedUnit = units.find((u) => u.id === selectedUnitId)

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">出席管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">出席・欠席・利用時間の記録</p>
        </div>
        {view === 'day' && unrecorded.length > 0 && (
          <Button onClick={markAllPresent} disabled={saving === 'all'}>
            <CheckCircle className="h-4 w-4" />
            未記録を一括出席登録
          </Button>
        )}
      </div>

      {/* 日付・ユニット選択バー */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <button onClick={() => changeDate(-1)} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              const params = new URLSearchParams({ date: e.target.value, unit: selectedUnitId })
              router.push(`/attendance?${params.toString()}`)
            }}
            className="text-sm font-medium text-gray-900 border-none outline-none cursor-pointer"
          />
          <button onClick={() => changeDate(1)} className="p-1 hover:bg-gray-100 rounded">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 flex-wrap flex-1">
          {units.map((u) => (
            <button
              key={u.id}
              onClick={() => changeUnit(u.id)}
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

        {/* ビュー切替 */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-shrink-0">
          <button
            onClick={() => setView('day')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'day' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <LayoutList className="h-3.5 w-3.5" />
            日別
          </button>
          <button
            onClick={() => setView('week')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'week' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            週別
          </button>
        </div>
      </div>

      {/* 週別ビュー */}
      {view === 'week' && (
        <WeeklyAttendanceView
          baseDate={date}
          selectedUnitId={selectedUnitId}
          units={units}
        />
      )}

      {/* 日別ビュー */}
      {view === 'day' && (
        <>
      {/* 統計 */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-indigo-600">{attending.length}</div>
            <div className="text-xs text-gray-500 mt-1">出席</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-500">{absent.length}</div>
            <div className="text-xs text-gray-500 mt-1">欠席/キャンセル</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-500">{unrecorded.length}</div>
            <div className="text-xs text-gray-500 mt-1">未記録</div>
          </CardContent>
        </Card>
        <Card className="hidden sm:block">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-700">
              {attending.length}/{selectedUnit?.capacity ?? '-'}
            </div>
            <div className="text-xs text-gray-500 mt-1">定員充足率</div>
          </CardContent>
        </Card>
      </div>

      {/* 未記録アラート */}
      {unrecorded.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{unrecorded.length}名の記録が未入力です</span>
        </div>
      )}

      {/* 児童一覧 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">利用予定児童一覧</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-100">
            {reservations.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 text-center">この日の利用予定はありません</p>
            ) : (
              reservations.map((res) => {
                const child = res.children
                if (!child) return null
                const att = attendanceMap[child.id]
                const isPresent = att?.status === 'attended'
                const isAbsent = att?.status === 'absent' || res.status === 'cancel_waiting'
                const isUnrecorded = !att && res.status !== 'cancel_waiting'

                // 送迎・日中一時入力（出席時のみ・日々の記録と同じUI）
                const fields = att ? getFields(att) : null
                const isTransportExpanded = !!att && expanded === att.id

                return (
                  <div
                    key={res.id}
                    className={isUnrecorded ? 'bg-yellow-50' : ''}
                  >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                    {/* 児童情報 */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                          isPresent
                            ? 'bg-green-100 text-green-700'
                            : isAbsent
                            ? 'bg-red-100 text-red-500'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {child.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link href={`/attendance/child/${child.id}`} className="font-medium text-gray-900 hover:text-indigo-600 hover:underline">{child.name}</Link>
                          {child.allergy_info && (
                            <Badge variant="destructive" className="text-xs">アレルギー</Badge>
                          )}
                          {isUnrecorded && (
                            <Badge variant="warning" className="text-xs">未記録</Badge>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">{child.name_kana}</div>
                      </div>
                    </div>

                    {/* 利用時間（出席時のみ編集可） */}
                    {isPresent && (
                      <div className="flex flex-col gap-1 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="text-gray-500 w-16 flex-shrink-0">利用時間</span>
                          <input
                            type="time"
                            defaultValue={fmtTime(att?.check_in_time)}
                            className="text-xs border border-gray-200 rounded px-1.5 py-0.5"
                            onBlur={(e) => upsertAttendance(child.id, { check_in_time: e.target.value || null })}
                          />
                          <span className="text-gray-400">〜</span>
                          <input
                            type="time"
                            defaultValue={fmtTime(att?.check_out_time)}
                            className="text-xs border border-gray-200 rounded px-1.5 py-0.5"
                            onBlur={(e) => upsertAttendance(child.id, { check_out_time: e.target.value || null })}
                          />
                        </div>
                      </div>
                    )}

                    {/* 出席/欠席ボタン */}
                    <div className="flex items-center gap-2">
                      {res.status !== 'cancel_waiting' && (
                        <>
                          <button
                            onClick={() => isPresent ? cancelAttendance(child.id) : upsertAttendance(child.id, { status: 'attended' })}
                            disabled={saving === child.id}
                            title={isPresent ? 'もう一度押すと取り消し' : '出席にする'}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              isPresent
                                ? 'bg-green-500 text-white hover:bg-green-600'
                                : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700'
                            }`}
                          >
                            <CheckCircle className="h-4 w-4" />
                            出席
                          </button>
                          <button
                            onClick={() => upsertAttendance(child.id, { status: 'absent' })}
                            disabled={saving === child.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              isAbsent && res.status !== 'cancel_waiting'
                                ? 'bg-red-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-700'
                            }`}
                          >
                            <XCircle className="h-4 w-4" />
                            欠席
                          </button>
                        </>
                      )}

                      {res.status === 'cancel_waiting' && (
                        <Badge variant="secondary">キャンセル待ち</Badge>
                      )}

                      {/* 記録ページへのリンク */}
                      {isPresent && (
                        <Link
                          href={`/records/${child.id}?date=${date}&unit=${selectedUnitId}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                        >
                          <ClipboardEdit className="h-4 w-4" />
                          記録
                        </Link>
                      )}
                    </div>
                  </div>

                    {/* 送迎・日中一時入力（日々の記録と同じUI） */}
                    {isPresent && att && fields && (
                      <>
                        <TransportDaytimeToggle
                          expanded={isTransportExpanded}
                          onToggle={() => setExpanded(isTransportExpanded ? null : att.id)}
                          fields={fields}
                          isSchedulePreset={isSchedulePreset(att)}
                        />
                        {isTransportExpanded && (
                          <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
                            <TransportDaytimePanel
                              fields={fields}
                              onChange={(patch) => setField(att, patch)}
                              staffMembers={staffMembers}
                              vehicles={vehicles}
                              defaultServiceEndTime={defaultServiceEndTime}
                              isSchedulePreset={isSchedulePreset(att)}
                              previousDate={prevByChildId[child.id]?.date ?? null}
                              onCopyPrevious={() => handleCopyPrevious(att)}
                              onSave={() => handleSaveTransport(att)}
                              saving={transportSaving === att.id}
                              saved={transportSavedIds.has(att.id)}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  )
}
