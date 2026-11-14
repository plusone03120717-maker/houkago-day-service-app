export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getTodayJST } from '@/lib/utils'
import { TransportManageBoard } from '@/components/transport/transport-board'
import type { UnitChild } from '@/components/transport/transport-board'
import { autoCreateTransportSchedules } from '@/app/actions/transport'
import { getStaffAccess } from '@/lib/require-admin'
import { canEditTransport } from '@/lib/roles'
import { fetchScheduleDefaults, type ScheduleDefaults } from '@/lib/schedule-defaults'
import {
  buildTransportRows,
  TRANSPORT_ATTENDANCE_SELECT,
  TRANSPORT_SCHEDULE_SELECT,
  type RawTransportSchedule,
  type TransportAttendanceRow,
  type TransportReservationRow,
} from '@/lib/transport-rows'
import { ALL_UNITS, unitChildKey } from '@/lib/attendance-board-data'
import { fetchDriverRanking } from '@/lib/driver-ranking'

type Unit = { id: string; name: string; service_type: string }
type Vehicle = { id: string; name: string; capacity: number }
type Driver = { id: string; name: string }

export default async function TransportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; unit?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const today = params.date ?? getTodayJST()

  // 車両・運転手はユニット選択にもスケジュール生成にも依存しないため、
  // ここで先に走らせて autoCreate の待ち時間に重ねる（.then で即時実行）
  const vehiclesPromise = supabase.from('transport_vehicles').select('id, name, capacity').order('name').then((r) => r)
  const driversPromise = supabase.from('staff_members').select('id, name').order('name').then((r) => r)
  // ドライバーの選択肢を「よく入る順」に並べるための過去の傾向
  const driverRankingPromise = fetchDriverRanking(supabase, today)
  // 送迎を編集できるのはシステム管理者だけ。施設長・スタッフは閲覧のみ（役職は users テーブルの値で判定）
  const accessPromise = getStaffAccess()

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name, service_type')
    .order('name')
  const units = (unitsRaw ?? []) as Unit[]

  // ユニット未指定は「すべて」。まず全ユニットの送迎をまとめて見せ、
  // そこからユニットボタンで絞り込む。
  const showAllUnits = !params.unit || params.unit === ALL_UNITS
  const selectedUnitId = showAllUnits ? ALL_UNITS : params.unit ?? ''
  const targetUnitIds = showAllUnits
    ? units.map((u) => u.id)
    : units.filter((u) => u.id === selectedUnitId).map((u) => u.id)

  const hasTargets = targetUnitIds.length > 0

  // 利用計画から送迎対象の児童を補完（未追加の児童を自動追加）。
  // autoCreate が書き込むのは transport_schedules / transport_details だけなので、
  // 出席・計画・予約・予定値の取得はこの完了を待たずに並行して走らせる。
  // 待つ必要があるのは、補完結果を読む送迎スケジュールの取得だけ。
  const autoCreatePromise = Promise.all(
    targetUnitIds.map((id) => autoCreateTransportSchedules(id, today))
  )
  const attendancePromise = hasTargets
    ? supabase.from('daily_attendance').select(TRANSPORT_ATTENDANCE_SELECT).in('unit_id', targetUnitIds).eq('date', today).then((r) => r)
    : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null })
  const plansPromise = hasTargets
    ? supabase
        .from('usage_plans')
        .select('child_id, unit_id, children(id, name, name_kana, address, school_id, schools(id, name))')
        .in('unit_id', targetUnitIds)
        .eq('is_active', true)
        .then((r) => r)
    : Promise.resolve({ data: [] as unknown[] })
  // その日の利用予定。毎週の利用スケジュールが無い日（保護者の利用連絡を
  // 承認した日など）は、送迎の時刻をここからしか拾えない
  const reservationsPromise = hasTargets
    ? supabase
        .from('usage_reservations')
        .select('child_id, unit_id, pickup_time, dropoff_time, pickup_location_type, dropoff_location_type, pickup_address_id, dropoff_address_id')
        .in('unit_id', targetUnitIds)
        .eq('date', today)
        .in('status', ['confirmed', 'reserved'])
        .then((r) => r)
    : Promise.resolve({ data: [] as unknown[] })
  // 予定値はユニットごとに解決する（計画はユニット単位なので混ぜられない）
  const scheduleDefaultsPromise = Promise.all(
    targetUnitIds.map((id) => fetchScheduleDefaults(supabase, id, today))
  ).then((list) => {
    const byKey: Record<string, ScheduleDefaults> = {}
    list.forEach((defaults, i) => {
      for (const [childId, v] of Object.entries(defaults)) {
        byKey[unitChildKey(targetUnitIds[i], childId)] = v
      }
    })
    return byKey
  })

  await autoCreatePromise
  const schedulesPromise = hasTargets
    ? supabase
        .from('transport_schedules')
        .select(TRANSPORT_SCHEDULE_SELECT)
        .in('unit_id', targetUnitIds)
        .eq('date', today)
        .then((r) => r)
    : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null })

  const [
    { data: schedulesRaw, error: schedulesError },
    { data: vehiclesRaw },
    { data: driversRaw },
    { data: attendanceRaw, error: attendanceError },
    { data: allChildrenRaw },
    { data: reservationsRaw },
    scheduleDefaults,
    driverRanking,
  ] = await Promise.all([
    schedulesPromise,
    vehiclesPromise,
    driversPromise,
    attendancePromise,
    plansPromise,
    reservationsPromise,
    scheduleDefaultsPromise,
    driverRankingPromise,
  ])

  // 取得に失敗したときは「0件」として黙って空表示にせず、原因をそのまま画面に出す。
  // 未適用のマイグレーションで列が無い、といった不具合が「予定なし」に化けるのを防ぐ。
  const loadError = schedulesError?.message ?? attendanceError?.message ?? null
  if (loadError) {
    console.error('[transport] 送迎一覧の取得に失敗しました', schedulesError ?? attendanceError)
  }

  const vehicles = (vehiclesRaw ?? []) as Vehicle[]
  const drivers = (driversRaw ?? []) as Driver[]
  const unitNameById = new Map(units.map((u) => [u.id, u.name]))

  const { rows: orderedRows, scheduleIdsByUnit } = buildTransportRows({
    unitIds: targetUnitIds,
    unitNameById,
    schedules: (schedulesRaw ?? []) as unknown as RawTransportSchedule[],
    attendance: (attendanceRaw ?? []) as unknown as TransportAttendanceRow[],
    reservations: (reservationsRaw ?? []) as unknown as TransportReservationRow[],
    scheduleDefaults,
    driverScoresFor: (childId, slot) => driverRanking.scoresFor(childId, slot),
  })

  // ユニット×児童で重複除去（どのユニットの子かも持たせる）
  const allChildrenMap = new Map<string, UnitChild>()
  for (const p of allChildrenRaw ?? []) {
    const row = p as { child_id: string; unit_id: string; children: unknown }
    const key = unitChildKey(row.unit_id, row.child_id)
    if (row.child_id && row.children && !allChildrenMap.has(key)) {
      allChildrenMap.set(key, {
        ...(row.children as unknown as UnitChild),
        unitId: row.unit_id,
        unitName: unitNameById.get(row.unit_id) ?? '',
      })
    }
  }
  const allChildren = [...allChildrenMap.values()].sort(
    (a, b) =>
      a.unitName.localeCompare(b.unitName, 'ja') ||
      (a.name_kana ?? a.name).localeCompare(b.name_kana ?? b.name, 'ja')
  )

  const access = await accessPromise
  const canEdit = access ? canEditTransport(access.role, access.jobTitles) : false

  return (
    <TransportManageBoard
      date={today}
      units={units}
      selectedUnitId={selectedUnitId}
      rows={orderedRows}
      scheduleIdsByUnit={scheduleIdsByUnit}
      vehicles={vehicles}
      drivers={drivers}
      allChildren={allChildren}
      loadError={loadError}
      canEdit={canEdit}
    />
  )
}
