'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
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
  Trash2,
  Loader2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { ALL_UNITS, unitChildKey } from '@/lib/attendance-board-data'
import { deleteUsageDay, ABSENT_CLEARED_FIELDS } from '@/lib/usage-day'
import { MonthlyAttendanceView } from './monthly-attendance-view'
import { AbsenceReasonInput } from './absence-reason-input'
import {
  TransportDaytimePanel,
  TransportDaytimeToggle,
  initFields,
  isBlankFields,
  applyScheduleDefaults,
  applyTransportDefaults,
  hasBlankTransport,
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
  /** どのユニットの行か（「すべて」表示ではユニットをまたいで並ぶ） */
  unit_id: string
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
  pickup_type: string
  health_condition: string | null
  /** 欠席の理由（欠席のときだけ使う） */
  absence_reason: string | null
}

/** 児童ID → 直近の出席日の送迎入力（前回コピー用） */
export type PrevAttendanceRow = TransportRow & { child_id: string; date: string }

interface Props {
  date: string
  units: Unit[]
  /** 選択中のユニットID。ALL_UNITS（'all'）なら全ユニットまとめて表示 */
  selectedUnitId: string
  reservations: Reservation[]
  attendances: Attendance[]
  staffId: string
  staffMembers: StaffMember[]
  vehicles: Vehicle[]
  defaultServiceEndTime: string
  prevByChildId: Record<string, PrevAttendanceRow>
  /** キーは unitChildKey(unitId, childId) */
  scheduleDefaultsByKey: Record<string, ScheduleDefaults>
}

/** "16:30:00" → "16:30"。未設定・00:00 は空文字として扱う */
function fmtTime(t: string | null | undefined): string {
  if (!t) return ''
  const hhmm = t.slice(0, 5)
  return hhmm === '00:00' ? '' : hhmm
}

/** 実際の時刻が入っているか（未設定・00:00 は未入力とみなす） */
function hasTime(t: string | null | undefined): boolean {
  return fmtTime(t) !== ''
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
  scheduleDefaultsByKey,
}: Props) {
  const router = useRouter()
  // ユニット未選択（＝すべて）。既定はこちらで、ユニットボタンで絞り込む
  const isAllUnits = selectedUnitId === ALL_UNITS
  const supabase = createClient()
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Reservation | null>(null)
  const [view, setView] = useState<'day' | 'month'>('day')

  // 送迎・日中一時入力（日々の記録と同じUI）
  const [expanded, setExpanded] = useState<string | null>(null)
  const [fieldStates, setFieldStates] = useState<Record<string, TransportFields>>({})
  const [transportSaving, setTransportSaving] = useState<string | null>(null)
  const [transportSavedIds, setTransportSavedIds] = useState<Set<string>>(new Set())
  const [savedOnce, setSavedOnce] = useState<Set<string>>(new Set())

  // ── 出席・予約はローカル状態として持つ ──
  // 以前は保存のたびに router.refresh() でページ全体（サーバー4往復）を取り直していた。
  // 更新後の行でローカル状態を差し替えれば、保存時のサーバー往復は0になる。
  // props への同期は日付・ユニットが変わったときだけ行う。
  const boardKey = `${selectedUnitId}|${date}`
  const [syncedKey, setSyncedKey] = useState(boardKey)
  const [rows, setRows] = useState<Attendance[]>(attendances)
  const [resList, setResList] = useState<Reservation[]>(reservations)
  if (syncedKey !== boardKey) {
    setSyncedKey(boardKey)
    setRows(attendances)
    setResList(reservations)
  }

  // 「すべて」表示では同じ児童が別ユニットの行として並びうるため、
  // 出席記録はユニット×児童で引く
  const attendanceMap = Object.fromEntries(
    rows.map((a) => [unitChildKey(a.unit_id, a.child_id), a])
  )
  const attOf = (r: { child_id: string; unit_id: string }) =>
    attendanceMap[unitChildKey(r.unit_id, r.child_id)]

  /** 保存結果の行を反映（同じidがあれば置換、なければ追加） */
  const applyRow = (row: Attendance) =>
    setRows((prev) => {
      const i = prev.findIndex((a) => a.id === row.id)
      if (i === -1) return [...prev, row]
      const next = [...prev]
      next[i] = row
      return next
    })

  /** 児童の出席行をローカルから除去 */
  const dropRow = (unitId: string, childId: string) =>
    setRows((prev) => prev.filter((a) => !(a.child_id === childId && a.unit_id === unitId)))

  // 他の職員による変更の取り込み。
  // 保存ごとの router.refresh() が副次的に担っていた同期を、Realtime と
  // タブ復帰時の再取得に置き換える（Realtime 未設定の環境でも後者で追従できる）。
  useEffect(() => {
    if (!selectedUnitId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const reload = async () => {
      let query = supabase.from('daily_attendance').select('*').eq('date', date)
      if (!isAllUnits) query = query.eq('unit_id', selectedUnitId)
      const { data } = await query
      if (!cancelled && data) setRows(data as unknown as Attendance[])
    }
    // 自分の保存でも通知が飛ぶため、連続保存はまとめて1回だけ取り直す
    const scheduleReload = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void reload() }, 500)
    }

    // 「すべて」表示では unit_id で絞らず、全ユニットの変更を受け取る
    const changeFilter = isAllUnits
      ? { event: '*' as const, schema: 'public', table: 'daily_attendance' }
      : {
          event: '*' as const,
          schema: 'public',
          table: 'daily_attendance',
          filter: `unit_id=eq.${selectedUnitId}`,
        }

    const channel = supabase
      .channel(`attendance:${selectedUnitId}:${date}`)
      .on('postgres_changes', changeFilter, scheduleReload)
      .subscribe()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [supabase, selectedUnitId, isAllUnits, date])

  // DBの値が空の場合は利用スケジュールの初期値を自動セット
  const buildInitialFields = (a: Attendance): TransportFields => {
    const base = initFields(a, defaultServiceEndTime)
    const sched = scheduleDefaultsByKey[unitChildKey(a.unit_id, a.child_id)]
    if (!sched) return base
    if (isBlankFields(base)) {
      return applyScheduleDefaults(base, sched, defaultServiceEndTime)
    }
    // 保護者の利用連絡を承認した日は利用時間だけが先に入るため、
    // 上の条件に当てはまらない。空いている送迎の欄だけを埋める
    return applyTransportDefaults(base, sched)
  }

  // スケジュール初期値が表示中（未保存）かどうか
  const isSchedulePreset = (a: Attendance): boolean => {
    const sched = scheduleDefaultsByKey[unitChildKey(a.unit_id, a.child_id)]
    if (!sched || savedOnce.has(a.id)) return false
    const base = initFields(a, defaultServiceEndTime)
    // 送迎の欄だけを埋めた場合も「予定値を表示中」であることに変わりはない
    return isBlankFields(base) || hasBlankTransport(base)
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
    // 更新後の行を受け取ってローカルへ反映する（ページ全体の再取得は不要）
    const { data, error } = await supabase
      .from('daily_attendance')
      .update(buildTransportUpdate(getFields(a)))
      .eq('id', a.id)
      .select('*')
      .single()
    setTransportSaving(null)
    if (error) { alert(`保存エラー: ${error.message}`); return }
    if (data) applyRow(data as unknown as Attendance)

    setSavedOnce((prev) => new Set(prev).add(a.id))
    setTransportSavedIds((prev) => new Set(prev).add(a.id))
    setTimeout(() => setTransportSavedIds((prev) => { const s = new Set(prev); s.delete(a.id); return s }), 2000)
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

  /** 利用時間の更新は service_* と check_*_time の両方に同じ値を書き込む */
  type UsageTimes = {
    service_start_time?: string
    service_end_time?: string
    check_in_time?: string
    check_out_time?: string
  }

  // 利用スケジュールから当日の利用時間を取得（特定日上書き > 曜日別設定 > プランのデフォルト）
  // 以前はブラウザから usage_plans / usage_plan_date_overrides / usage_plan_day_settings を
  // 引き直していたが（児童1人につき2〜3往復）、サーバーが同じ優先順で計算した
  // scheduleDefaultsByKey を props で受け取っているため往復ゼロで求められる。
  const getScheduledTimes = (unitId: string, childId: string): UsageTimes => {
    const sched = scheduleDefaultsByKey[unitChildKey(unitId, childId)]
    if (!sched) return {}
    const result: UsageTimes = {}
    if (sched.pickupTime) {
      result.service_start_time = sched.pickupTime.slice(0, 5)
      result.check_in_time = result.service_start_time
    }
    if (sched.dropoffTime) {
      result.service_end_time = sched.dropoffTime.slice(0, 5)
      result.check_out_time = result.service_end_time
    }
    return result
  }

  // 出席記録を作成/更新
  const upsertAttendance = async (
    unitId: string,
    childId: string,
    updates: Partial<Attendance>
  ) => {
    setSaving(unitChildKey(unitId, childId))
    const existing = attendanceMap[unitChildKey(unitId, childId)]

    // 出席マーク時に利用スケジュールの時間を自動同期する。
    // ただし「すでに時刻が入っている項目」は上書きしない。
    // 出席カレンダーで個別に直した時刻は status='scheduled' の行として残るため、
    // ここで一律にスケジュールの時刻を入れると、直した時刻が消えてしまう。
    let scheduledTimes: UsageTimes = {}
    if (updates.status === 'attended' && existing?.status !== 'attended') {
      scheduledTimes = getScheduledTimes(unitId, childId)
      if (existing) {
        if (hasTime(existing.service_start_time) || hasTime(existing.check_in_time)) {
          delete scheduledTimes.service_start_time
          delete scheduledTimes.check_in_time
        }
        if (hasTime(existing.service_end_time) || hasTime(existing.check_out_time)) {
          delete scheduledTimes.service_end_time
          delete scheduledTimes.check_out_time
        }
      }
    }

    // 欠席にする場合は送迎時間・利用時間のクリアも同じ1回のUPDATEにまとめる
    // 出席に戻したときは、前に入れた欠席理由を残さない
    const mergedUpdates = updates.status === 'absent'
      ? { ...scheduledTimes, ...updates, ...ABSENT_CLEARED_FIELDS }
      : updates.status === 'attended'
      ? { ...scheduledTimes, ...updates, absence_reason: null }
      : { ...scheduledTimes, ...updates }

    if (existing) {
      const { data, error } = await supabase
        .from('daily_attendance')
        .update(mergedUpdates)
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) { alert(`更新エラー: ${error.message}`); setSaving(null); return }
      if (data) applyRow(data as unknown as Attendance)
    } else {
      const { data, error } = await supabase
        .from('daily_attendance')
        .insert({
          child_id: childId,
          unit_id: unitId,
          date,
          status: 'attended',
          pickup_type: 'none',
          created_by: staffId,
          ...mergedUpdates,
        })
        .select('*')
        .single()
      if (error) { alert(`登録エラー: ${error.message}`); setSaving(null); return }
      if (data) applyRow(data as unknown as Attendance)
    }

    // 欠席になった場合、送迎スケジュールからも削除
    if (updates.status === 'absent') {
      const { data: schedules } = await supabase
        .from('transport_schedules')
        .select('id')
        .eq('unit_id', unitId)
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
  }

  // 欠席理由の保存
  const saveAbsenceReason = async (attendanceId: string, reason: string | null) => {
    const { data, error } = await supabase
      .from('daily_attendance')
      .update({ absence_reason: reason })
      .eq('id', attendanceId)
      .select('*')
      .single()
    if (error) { alert(`欠席理由の保存エラー: ${error.message}`); return false }
    if (data) applyRow(data as unknown as Attendance)
    return true
  }

  // 出席取り消し（レコードを削除して未記録に戻す）
  const cancelAttendance = async (unitId: string, childId: string) => {
    const existing = attendanceMap[unitChildKey(unitId, childId)]
    if (!existing) return
    setSaving(unitChildKey(unitId, childId))
    const { error } = await supabase.from('daily_attendance').delete().eq('id', existing.id)
    if (error) { alert(`取り消しエラー: ${error.message}`); setSaving(null); return }
    dropRow(unitId, childId)
    setSaving(null)
  }

  // 利用予定ごと削除（そもそも利用予定がない児童を誤って入れてしまった場合）
  // 「欠席」にすると記録が残り請求にも出てくるため、なかったことにする操作を用意する
  // 一覧の行は予約由来・利用計画由来・出欠記録由来が混在するため、
  // 予約IDではなく児童・ユニット・日付で消す（利用状況ページと共通処理）
  const deleteReservation = async (res: Reservation) => {
    setDeleting(unitChildKey(res.unit_id, res.child_id))
    const { error } = await deleteUsageDay(supabase, {
      childId: res.child_id,
      unitId: res.unit_id,
      date,
    })
    if (error) { alert(`削除エラー: ${error}`); setDeleting(null); return }
    setResList((prev) =>
      prev.filter((r) => !(r.child_id === res.child_id && r.unit_id === res.unit_id))
    )
    dropRow(res.unit_id, res.child_id)
    setDeleting(null)
    setConfirmDelete(null)
  }

  // 一括出席登録
  const markAllPresent = async () => {
    setSaving('all')
    const unrecorded = resList.filter((r) => r.status !== 'cancel_waiting' && !attOf(r))

    // スケジュール時間は props から求まるので、追加の取得往復は発生しない。
    // 他の職員が同じ児童を先に登録していた場合に一括処理ごと失敗しないよう、
    // (child_id, unit_id, date) の重複はスキップする。
    const { data, error } = await supabase
      .from('daily_attendance')
      .upsert(
        unrecorded.map((r) => ({
          child_id: r.child_id,
          unit_id: r.unit_id,
          date,
          status: 'attended',
          pickup_type: 'none',
          created_by: staffId,
          ...getScheduledTimes(r.unit_id, r.child_id),
        })),
        { onConflict: 'child_id,unit_id,date', ignoreDuplicates: true }
      )
      .select('*')
    setSaving(null)
    if (error) { alert(`一括登録エラー: ${error.message}`); return }
    if (data) for (const row of data as unknown as Attendance[]) applyRow(row)
  }

  const attending = resList.filter((r) => attOf(r)?.status === 'attended')
  const absent = resList.filter((r) => {
    const att = attOf(r)
    return att?.status === 'absent' || r.status === 'cancel_waiting'
  })
  const unrecorded = resList.filter((r) => !attOf(r) && r.status !== 'cancel_waiting')

  const selectedUnit = units.find((u) => u.id === selectedUnitId)
  const unitNameById = new Map(units.map((u) => [u.id, u.name]))
  // 「すべて」表示の定員は全ユニットの合計
  const capacity = isAllUnits
    ? units.reduce((sum, u) => sum + (u.capacity ?? 0), 0)
    : selectedUnit?.capacity ?? 0

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
          {/* 既定は「すべて」。そこからユニットごとに絞り込む */}
          <button
            onClick={() => changeUnit(ALL_UNITS)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isAllUnits
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            すべて
          </button>
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
            onClick={() => setView('month')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'month' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            月別
          </button>
        </div>
      </div>

      {/* 月別ビュー */}
      {view === 'month' && (
        <MonthlyAttendanceView
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
              {attending.length}/{capacity || '-'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              定員充足率{isAllUnits ? '（全ユニット）' : ''}
            </div>
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
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-2 px-1">
          利用予定児童一覧{isAllUnits ? '（全ユニット）' : selectedUnit ? `（${selectedUnit.name}）` : ''}
        </h2>
        <div className="space-y-3">
            {resList.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-sm text-gray-500 text-center">
                  この日の利用予定はありません
                </CardContent>
              </Card>
            ) : (
              resList.map((res) => {
                const child = res.children
                if (!child) return null
                const att = attOf(res)
                const rowKey = unitChildKey(res.unit_id, child.id)
                const unitName = unitNameById.get(res.unit_id)
                const isPresent = att?.status === 'attended'
                const isAbsent = att?.status === 'absent' || res.status === 'cancel_waiting'
                const isUnrecorded = !att && res.status !== 'cancel_waiting'

                // 送迎・日中一時入力（出席時のみ・日々の記録と同じUI）
                const fields = att ? getFields(att) : null
                const isTransportExpanded = !!att && expanded === att.id

                // 出発時間の表示（お迎え出発 〜 事務所出発）
                const departureStart = fmtTime(att?.pickup_departure_time)
                const departureEnd = fmtTime(att?.dropoff_departure_time)
                const departureRange =
                  departureStart || departureEnd ? `${departureStart || '—'}〜${departureEnd || '—'}` : ''

                // 日中一時利用の出発時間（お迎え出発 〜 送り事務所出発）
                // 日中一時まで残る児童は放デイ側の送りが空になるため、
                // 実際の最終お送りはこちらに入る
                const daytimeDepartureStart = fmtTime(att?.daytime_pickup_departure_time)
                const daytimeDepartureEnd = fmtTime(att?.daytime_dropoff_departure_time)
                const daytimeDepartureRange =
                  att?.daytime_support && (daytimeDepartureStart || daytimeDepartureEnd)
                    ? `${daytimeDepartureStart || '—'}〜${daytimeDepartureEnd || '—'}`
                    : ''

                return (
                  <div key={`${res.unit_id}|${res.id}`}>
                  <Card
                    className={`overflow-hidden ${isUnrecorded ? 'bg-yellow-50' : ''} ${
                      isAbsent ? 'opacity-70' : ''
                    } ${isTransportExpanded ? 'rounded-b-none border-b-0' : ''}`}
                  >
                  <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
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
                          {/* 「すべて」表示ではどのユニットの子か分かるようにする */}
                          {isAllUnits && unitName && (
                            <Badge variant="secondary" className="text-xs">{unitName}</Badge>
                          )}
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

                    {/* 出発時間（表示のみ・入力は下の「送迎・日中一時入力」から） */}
                    {isPresent && (departureRange || daytimeDepartureRange) && (
                      <div className="flex flex-col gap-0.5">
                        {departureRange && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="text-gray-500 w-16 flex-shrink-0">出発時間</span>
                            <span className="text-gray-700">{departureRange}</span>
                          </div>
                        )}
                        {daytimeDepartureRange && (
                          <div
                            className="flex items-center gap-1.5 text-xs"
                            title="日中一時利用のお迎え出発〜送り事務所出発"
                          >
                            <Clock className="h-4 w-4 text-purple-400 flex-shrink-0" />
                            <span className="text-purple-600 w-16 flex-shrink-0">日中一時</span>
                            <span className="text-gray-700">{daytimeDepartureRange}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 出席/欠席ボタン */}
                    <div className="flex items-center gap-2">
                      {res.status !== 'cancel_waiting' && (
                        <>
                          <button
                            onClick={() => isPresent
                              ? cancelAttendance(res.unit_id, child.id)
                              : upsertAttendance(res.unit_id, child.id, { status: 'attended' })}
                            disabled={saving === rowKey}
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
                            onClick={() => upsertAttendance(res.unit_id, child.id, { status: 'absent' })}
                            disabled={saving === rowKey}
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
                          href={`/records/${child.id}?date=${date}&unit=${res.unit_id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                        >
                          <ClipboardEdit className="h-4 w-4" />
                          記録
                        </Link>
                      )}

                      {/* 利用予定ごと削除（誤って予定に入れた児童を一覧から消す） */}
                      <button
                        onClick={() => setConfirmDelete(res)}
                        disabled={deleting === rowKey}
                        title="この日の利用予定を削除（欠席にするのではなく、一覧から消して未登録に戻す）"
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {deleting === rowKey
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </CardContent>

                    {/* 欠席理由（欠席にした児童のみ） */}
                    {att?.status === 'absent' && res.status !== 'cancel_waiting' && (
                      <div className="border-t border-red-100 bg-red-50/50 px-4 py-2.5">
                        <AbsenceReasonInput
                          value={att.absence_reason}
                          onSave={(reason) => saveAbsenceReason(att.id, reason)}
                        />
                      </div>
                    )}

                    {/* 送迎・日中一時入力トグル（日々の記録と同じUI） */}
                    {isPresent && att && fields && (
                      <TransportDaytimeToggle
                        expanded={isTransportExpanded}
                        onToggle={() => setExpanded(isTransportExpanded ? null : att.id)}
                        fields={fields}
                        isSchedulePreset={isSchedulePreset(att)}
                      />
                    )}
                  </Card>

                  {/* 展開された入力エリア */}
                  {isTransportExpanded && att && fields && (
                    <Card className="rounded-t-none border-t-0">
                      <CardContent className="p-4">
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
                      </CardContent>
                    </Card>
                  )}
                  </div>
                )
              })
            )}
        </div>
      </div>
        </>
      )}

      {/* ── 利用予定の削除確認ダイアログ ─────────────────────── */}
      {confirmDelete && (() => {
        const childName = confirmDelete.children?.name ?? 'この児童'
        const isDeleting = deleting === unitChildKey(confirmDelete.unit_id, confirmDelete.child_id)
        const hasAttendance = !!attOf(confirmDelete)
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => { if (!isDeleting) setConfirmDelete(null) }}
          >
            <div
              className="bg-white rounded-xl shadow-xl max-w-md w-full p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-red-50 flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900">
                    {formatDate(date)}の{childName}さんの利用予定を削除します
                  </h3>
                  <p className="text-sm text-red-700 font-medium mt-2 leading-relaxed">
                    これは「欠席」にする操作ではありません。<br />
                    <span className="underline">利用予定そのものが削除され</span>、一覧から消えて記録がなかった状態に戻ります。
                  </p>
                </div>
              </div>

              <ul className="mt-3 space-y-1 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                <li>・この日の利用予定（予約）を削除します</li>
                {hasAttendance && <li>・出席／欠席の記録と、支援記録・活動記録も削除します</li>}
                <li>・毎週の利用計画がある場合も、この日だけ利用なしにします</li>
                <li>・この日の送迎予定からも外します</li>
                <li>・国保連請求の対象からも外れます</li>
              </ul>

              <p className="mt-3 text-xs text-gray-500 leading-relaxed">
                削除すると元に戻せません。実際に利用予定があってお休みした場合（欠席時対応加算を算定する場合など）は「いいえ」を選び、「欠席」ボタンを使ってください。
              </p>

              <p className="mt-4 text-sm font-semibold text-gray-900 text-center">
                削除してもよろしいですか？
              </p>

              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={isDeleting}
                  onClick={() => setConfirmDelete(null)}
                >
                  いいえ
                </Button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => deleteReservation(confirmDelete)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                  はい、削除する
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
