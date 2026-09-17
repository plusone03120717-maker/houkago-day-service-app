import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveAssignment,
  assignmentToColumns,
  type ServiceAssignment,
  type ServiceAssignmentType,
} from '@/lib/parent-contact-service'

/**
 * 保護者ポータルからの利用連絡を、実際の予定へ反映する。
 *
 * 利用連絡は parent_attendance_contacts に溜まるだけで、出席管理・利用状況・送迎・請求が
 * 見ているのは usage_reservations / usage_plans / daily_attendance の3つ（src/lib/usage-roster.ts）。
 * この2つが繋がっていなかったため、承認してもスタッフが利用状況画面で予定を手入力し直す
 * 必要があった。ここでその橋渡しをする。
 *
 * 反映先は「どこへ書いたか」を parent_attendance_contacts.applied_* に控える。
 * 非承認・未承認に戻したときは、その控えを見て**この連絡が作ったものだけ**を取り消す。
 * スタッフが自分で入れた予約を巻き込んで消さないための作りになっている。
 */

// Supabase クライアントは型ジェネリクスなしで使う（プロジェクト全体の方針）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>

export type ParentContact = {
  id: string
  child_id: string
  date: string
  status: 'attending' | 'absent'
  /** 施設が承認時に割り振った区分。保護者は選ばない（@/lib/parent-contact-service） */
  service_type: ServiceAssignmentType
  /** 保護者が希望した利用時間。施設の割り振りは assigned_* 側 */
  service_start_time: string | null
  service_end_time: string | null
  assigned_service_start_time: string | null
  assigned_service_end_time: string | null
  assigned_daytime_start_time: string | null
  assigned_daytime_end_time: string | null
  transport_type: 'none' | 'pickup_only' | 'dropoff_only' | 'both'
  /** 保護者が指定した迎えに行く場所・送り届ける場所（@/lib/transport-place） */
  pickup_location_type: 'home' | 'school'
  pickup_address_id: string | null
  dropoff_location_type: 'home' | 'school'
  dropoff_address_id: string | null
  applied_at: string | null
  applied_unit_id: string | null
  applied_reservation_id: string | null
}

/** 反映に必要な列。API 側の select はこれを使う */
export const PARENT_CONTACT_COLUMNS =
  'id, child_id, date, status, service_type, service_start_time, service_end_time, ' +
  'assigned_service_start_time, assigned_service_end_time, ' +
  'assigned_daytime_start_time, assigned_daytime_end_time, ' +
  'transport_type, pickup_location_type, pickup_address_id, ' +
  'dropoff_location_type, dropoff_address_id, ' +
  'applied_at, applied_unit_id, applied_reservation_id'

export type ApplyResult = {
  /** 反映できなかった理由。反映できたときは undefined */
  error?: string
  /** 反映先ユニット */
  unitId?: string
}

/** 欠席にしたときにクリアする送迎・利用時間フィールド（src/lib/usage-day.ts と同じ内容） */
const ABSENT_CLEARED_FIELDS = {
  pickup_departure_time: null,
  pickup_arrival_time: null,
  dropoff_departure_time: null,
  dropoff_arrival_time: null,
  service_start_time: null,
  service_end_time: null,
  check_in_time: null,
  check_out_time: null,
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
}

/** その日の送迎予定から外す */
async function removeFromTransport(
  supabase: Client,
  childId: string,
  unitId: string,
  date: string
) {
  const { data: schedules } = await supabase
    .from('transport_schedules')
    .select('id')
    .eq('unit_id', unitId)
    .eq('date', date)
  if (schedules && schedules.length > 0) {
    await supabase
      .from('transport_details')
      .delete()
      .eq('child_id', childId)
      .in('schedule_id', (schedules as { id: string }[]).map((s) => s.id))
  }
}

/**
 * その連絡をどのユニットの予定として入れるかを決める。
 *
 * usage_reservations / daily_attendance はどちらも (児童, ユニット, 日付) が一意なので、
 * ユニットを取り違えると同じ日の予定が二重にできてしまう。
 * すでにある予定と同じユニットを最優先で選び、無ければ利用計画、
 * それも無ければ児童の所属ユニット（先頭）を使う。
 */
export async function resolveUnitId(
  supabase: Client,
  childId: string,
  date: string
): Promise<string | null> {
  // 1) その日にすでに予約があればそのユニット
  const { data: reservation } = await supabase
    .from('usage_reservations')
    .select('unit_id')
    .eq('child_id', childId)
    .eq('date', date)
    .limit(1)
    .maybeSingle()
  if (reservation?.unit_id) return reservation.unit_id as string

  // 2) その日に出欠記録があればそのユニット
  const { data: attendance } = await supabase
    .from('daily_attendance')
    .select('unit_id')
    .eq('child_id', childId)
    .eq('date', date)
    .limit(1)
    .maybeSingle()
  if (attendance?.unit_id) return attendance.unit_id as string

  // 3) その日に有効な利用計画があればそのユニット
  const dow = new Date(date + 'T00:00:00').getDay()
  const { data: plans } = await supabase
    .from('usage_plans')
    .select('unit_id, day_of_week, start_date, end_date')
    .eq('child_id', childId)
    .eq('is_active', true)
  for (const plan of (plans ?? []) as {
    unit_id: string
    day_of_week: number[] | null
    start_date: string
    end_date: string | null
  }[]) {
    if (!(plan.day_of_week ?? []).includes(dow)) continue
    if (date < plan.start_date) continue
    if (plan.end_date && date > plan.end_date) continue
    return plan.unit_id
  }

  // 4) 児童の所属ユニット（複数所属なら先頭。月次集計など他画面と同じ選び方）
  const { data: childUnit } = await supabase
    .from('children_units')
    .select('unit_id')
    .eq('child_id', childId)
    .limit(1)
    .maybeSingle()
  return (childUnit?.unit_id as string | undefined) ?? null
}

/**
 * 利用計画から自動生成される分の「その日だけキャンセル」を解除する。
 * お休み連絡 → 利用連絡 と変わったときに、計画側のキャンセルが残っていると
 * 出席管理の一覧から漏れてしまうため。
 */
async function clearPlanCancellation(supabase: Client, childId: string, date: string) {
  const { data: plans } = await supabase
    .from('usage_plans')
    .select('id, day_of_week, start_date, end_date')
    .eq('child_id', childId)
    .eq('is_active', true)
  if (!plans || plans.length === 0) return

  const dow = new Date(date + 'T00:00:00').getDay()
  const targetPlanIds = (plans as {
    id: string
    day_of_week: number[] | null
    start_date: string
    end_date: string | null
  }[])
    .filter((p) => (p.day_of_week ?? []).includes(dow))
    .filter((p) => date >= p.start_date && (!p.end_date || date <= p.end_date))
    .map((p) => p.id)
  if (targetPlanIds.length === 0) return

  await supabase
    .from('usage_plan_date_overrides')
    .update({ is_cancelled: false })
    .in('plan_id', targetPlanIds)
    .eq('date', date)
}

/**
 * 「利用します」の連絡を予定にする。
 *
 * - usage_reservations … その日の利用予定そのもの。無ければ作り、あれば確定に戻して送迎希望を反映する
 * - daily_attendance   … 利用時間・日中一時の希望を先に入れておく（status='scheduled'＝まだ来ていない）
 *
 * サービス区分（放デイ / 日中一時 / 両方）と、それぞれの時間は承認画面で施設が決める。
 * 保護者は区分を選ばないため、ここに渡ってくる assignment が唯一の正解になる。
 */
async function applyAttending(
  supabase: Client,
  contact: ParentContact,
  unitId: string,
  staffUserId: string,
  assignment: ServiceAssignment,
  /** 承認画面でスタッフが今まさに決めた割り振りか。false なら控えからの再現 */
  assigned: boolean
): Promise<ApplyResult> {
  // ── 1. 利用予定（usage_reservations） ──
  const { data: existingReservation } = await supabase
    .from('usage_reservations')
    .select('id')
    .eq('child_id', contact.child_id)
    .eq('unit_id', unitId)
    .eq('date', contact.date)
    .maybeSingle()

  // 保護者が指定した送迎の場所はそのまま予定に載せる。
  // 時刻は聞いていないので、割り振った利用時間から決める
  // （行き＝その日いちばん早い開始、帰り＝いちばん遅い終了）。
  const usesPickup =
    contact.transport_type === 'pickup_only' || contact.transport_type === 'both'
  const usesDropoff =
    contact.transport_type === 'dropoff_only' || contact.transport_type === 'both'
  const starts = [assignment.serviceStartTime, assignment.daytimeStartTime]
    .filter((t): t is string => !!t)
    .sort()
  const ends = [assignment.serviceEndTime, assignment.daytimeEndTime]
    .filter((t): t is string => !!t)
    .sort()

  const transportFields: Record<string, unknown> = {
    transport_type: contact.transport_type,
    pickup_location_type: usesPickup ? contact.pickup_location_type : null,
    pickup_address_id: usesPickup ? contact.pickup_address_id : null,
    dropoff_location_type: usesDropoff ? contact.dropoff_location_type : null,
    dropoff_address_id: usesDropoff ? contact.dropoff_address_id : null,
  }
  // 利用時間が決まっていない日は、すでに入っている送迎時刻を消さない
  if (usesPickup && starts.length > 0) transportFields.pickup_time = starts[0]
  if (usesDropoff && ends.length > 0) transportFields.dropoff_time = ends[ends.length - 1]
  if (!usesPickup) transportFields.pickup_time = null
  if (!usesDropoff) transportFields.dropoff_time = null

  let createdReservationId: string | null = null

  if (existingReservation) {
    const existingId = (existingReservation as { id: string }).id
    // キャンセル済みだった日を承認した場合もここで確定に戻る
    const { error } = await supabase
      .from('usage_reservations')
      .update({ status: 'confirmed', ...transportFields })
      .eq('id', existingId)
    if (error) return { error: `利用予定の更新に失敗しました: ${error.message}` }
    // 保護者が同じ日を再送信すると承認待ちに戻り、もう一度承認されることがある。
    // そのとき「すでにある予約」は前回この連絡で作った予約なので、控えを引き継ぐ。
    // 引き継がないと取り消しても予約が残り、消せない予定になってしまう。
    if (contact.applied_reservation_id === existingId) {
      createdReservationId = existingId
    }
  } else {
    // requested_by を必ず入れる。利用計画のない日の予約は requested_by が null だと
    // 「実態に合わない自動生成予約」として出席管理から除外される（src/lib/usage-roster.ts）
    const { data: inserted, error } = await supabase
      .from('usage_reservations')
      .insert({
        child_id: contact.child_id,
        unit_id: unitId,
        date: contact.date,
        status: 'confirmed',
        requested_by: staffUserId,
        requested_at: new Date().toISOString(),
        ...transportFields,
      })
      .select('id')
      .single()
    if (error) return { error: `利用予定の作成に失敗しました: ${error.message}` }
    createdReservationId = (inserted as { id: string }).id
  }

  // ── 2. 利用計画側のその日のキャンセルを解除 ──
  await clearPlanCancellation(supabase, contact.child_id, contact.date)

  // ── 3. 出欠記録（daily_attendance）に施設の割り振りを下書きする ──
  //
  // 区分そのもの（basic_service / daytime_support）は施設が決めたとおりに必ず書く。
  // 出席管理の表示も、送迎をどちらの欄に記録するかの判定（@/lib/schedule-defaults）も、
  // 国保連請求の送迎加算もこの2つのフラグで動いている。ここがずれると
  // 放デイと日中一時の送迎加算が二重に立つ。
  //
  // 時間は、承認画面でスタッフが決めた割り振り（assigned）なら上書きする。
  // 承認画面には出席管理に入っている予定時刻を初期値として出しているので、
  // スタッフはいま何が入っているかを見たうえで承認している。
  // 一方、控えから再現しただけの割り振りでは空欄を埋めるだけにする。
  // スタッフが出席管理で入れた時刻を、保護者の希望で黙って書き換えないため。
  // 使わない側の時間はどちらの場合も必ず消す。放デイから日中一時へ切り替えた日に
  // 古い時間が残っていると、両方使った日と区別できなくなる。
  const useBasic = assignment.serviceType !== 'daytime_support'
  const useDaytime = assignment.serviceType !== 'regular'

  const { data: existingAttendance } = await supabase
    .from('daily_attendance')
    .select(
      'id, status, basic_service, service_start_time, service_end_time, daytime_support, daytime_support_start_time, daytime_support_end_time'
    )
    .eq('child_id', contact.child_id)
    .eq('unit_id', unitId)
    .eq('date', contact.date)
    .maybeSingle()

  if (existingAttendance) {
    const row = existingAttendance as {
      id: string
      status: string
      basic_service: boolean
      service_start_time: string | null
      service_end_time: string | null
      daytime_support: boolean
      daytime_support_start_time: string | null
      daytime_support_end_time: string | null
    }
    const patch: Record<string, unknown> = {}
    if (row.basic_service !== useBasic) patch.basic_service = useBasic
    if (row.daytime_support !== useDaytime) patch.daytime_support = useDaytime

    /** 上書きしてよい場面か、まだ空欄のときだけ埋める場面か */
    const fill = (current: string | null, next: string | null) =>
      next !== null && (assigned || !current)

    if (useBasic) {
      if (fill(row.service_start_time, assignment.serviceStartTime)) {
        patch.service_start_time = assignment.serviceStartTime
      }
      if (fill(row.service_end_time, assignment.serviceEndTime)) {
        patch.service_end_time = assignment.serviceEndTime
      }
    } else if (row.service_start_time || row.service_end_time) {
      patch.service_start_time = null
      patch.service_end_time = null
    }

    if (useDaytime) {
      if (fill(row.daytime_support_start_time, assignment.daytimeStartTime)) {
        patch.daytime_support_start_time = assignment.daytimeStartTime
      }
      if (fill(row.daytime_support_end_time, assignment.daytimeEndTime)) {
        patch.daytime_support_end_time = assignment.daytimeEndTime
      }
    } else if (row.daytime_support_start_time || row.daytime_support_end_time) {
      patch.daytime_support_start_time = null
      patch.daytime_support_end_time = null
    }

    // お休みとして記録済みの日を「やっぱり利用します」に変えた場合は予定に戻す
    if (row.status === 'absent') patch.status = 'scheduled'
    if (Object.keys(patch).length > 0) {
      await supabase.from('daily_attendance').update(patch).eq('id', row.id)
    }
  } else if (
    useDaytime ||
    assignment.serviceStartTime ||
    assignment.serviceEndTime
  ) {
    // 時間の希望も日中一時の指定も無い連絡で空の記録を作ると、
    // 出席管理が入力済みに見えてしまうので作らない
    await supabase.from('daily_attendance').insert({
      child_id: contact.child_id,
      unit_id: unitId,
      date: contact.date,
      status: 'scheduled',
      pickup_type: contact.transport_type,
      basic_service: useBasic,
      service_start_time: useBasic ? assignment.serviceStartTime : null,
      service_end_time: useBasic ? assignment.serviceEndTime : null,
      daytime_support: useDaytime,
      daytime_support_start_time: useDaytime ? assignment.daytimeStartTime : null,
      daytime_support_end_time: useDaytime ? assignment.daytimeEndTime : null,
      created_by: staffUserId,
    })
  }

  // ── 4. 反映先を控える ──
  await supabase
    .from('parent_attendance_contacts')
    .update({
      applied_at: new Date().toISOString(),
      applied_unit_id: unitId,
      applied_reservation_id: createdReservationId,
    })
    .eq('id', contact.id)

  return { unitId }
}

/**
 * 「お休みします」の連絡を予定に反映する。
 *
 * 利用状況ページの「欠席」ボタンと同じく daily_attendance に status='absent' を記録する。
 * 予約・利用計画は残るので、出席管理には欠席として出続け、国保連請求の
 * 欠席時対応加算も算定できる。
 *
 * 予定が無い日のお休み連絡では何もしない。予定していない日の欠席記録を作ると、
 * 来る予定が無かった日にまで欠席時対応加算が算定できてしまうため。
 */
async function applyAbsent(
  supabase: Client,
  contact: ParentContact,
  unitId: string,
  staffUserId: string
): Promise<ApplyResult> {
  // その日に予定（予約 or 有効な利用計画）があるかを確認する
  const { data: reservationRaw } = await supabase
    .from('usage_reservations')
    .select('id, status')
    .eq('child_id', contact.child_id)
    .eq('unit_id', unitId)
    .eq('date', contact.date)
    .maybeSingle()
  const reservationRow = reservationRaw as { id: string; status: string } | null
  // キャンセル済みの予約は「その日は来ない」と決まっている状態なので、予定として数えない。
  // ここで数えてしまうと、取り消し済みの日にまで欠席記録ができ、
  // 欠席時対応加算の対象になってしまう。
  const reservation = reservationRow && reservationRow.status !== 'cancelled' ? reservationRow : null

  let hasPlan = false
  if (!reservation) {
    const dow = new Date(contact.date + 'T00:00:00').getDay()
    const { data: plans } = await supabase
      .from('usage_plans')
      .select('day_of_week, start_date, end_date')
      .eq('child_id', contact.child_id)
      .eq('unit_id', unitId)
      .eq('is_active', true)
    hasPlan = (
      (plans ?? []) as {
        day_of_week: number[] | null
        start_date: string
        end_date: string | null
      }[]
    ).some(
      (p) =>
        (p.day_of_week ?? []).includes(dow) &&
        contact.date >= p.start_date &&
        (!p.end_date || contact.date <= p.end_date)
    )
  }

  if (!reservation && !hasPlan) {
    return { error: 'もともと利用予定が無い日のため、欠席としては記録していません' }
  }

  const { data: existing } = await supabase
    .from('daily_attendance')
    .select('id')
    .eq('child_id', contact.child_id)
    .eq('unit_id', unitId)
    .eq('date', contact.date)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('daily_attendance')
      .update({ status: 'absent', ...ABSENT_CLEARED_FIELDS })
      .eq('id', (existing as { id: string }).id)
    if (error) return { error: `欠席の記録に失敗しました: ${error.message}` }
  } else {
    const { error } = await supabase.from('daily_attendance').insert({
      child_id: contact.child_id,
      unit_id: unitId,
      date: contact.date,
      status: 'absent',
      pickup_type: 'none',
      created_by: staffUserId,
    })
    if (error) return { error: `欠席の記録に失敗しました: ${error.message}` }
  }

  // その日の送迎予定から外す
  await removeFromTransport(supabase, contact.child_id, unitId, contact.date)

  await supabase
    .from('parent_attendance_contacts')
    .update({
      applied_at: new Date().toISOString(),
      applied_unit_id: unitId,
      applied_reservation_id: null,
    })
    .eq('id', contact.id)

  return { unitId }
}

/**
 * 保護者の連絡を予定へ反映する。承認（利用）・確認（お休み）の両方から呼ぶ。
 * すでに反映済みの連絡をもう一度渡しても、同じ結果になる（再送信への対応）。
 *
 * assignment は承認画面でスタッフが決めたサービス区分と時間。渡された場合は
 * 連絡にも書き戻すので、取り消して承認し直しても同じ割り振りが復元される。
 * 渡されなかった場合は連絡に保存済みの割り振り（無ければ保護者の希望時間を
 * そのまま放デイとして扱う）を使う。
 */
export async function applyParentContact(
  supabase: Client,
  contact: ParentContact,
  staffUserId: string,
  assignment?: ServiceAssignment
): Promise<ApplyResult> {
  const unitId =
    contact.applied_unit_id ?? (await resolveUnitId(supabase, contact.child_id, contact.date))
  if (!unitId) {
    return { error: 'この児童にユニットが設定されていないため、予定に反映できませんでした' }
  }

  if (contact.status !== 'attending') {
    return applyAbsent(supabase, contact, unitId, staffUserId)
  }

  let resolved = resolveAssignment(contact)
  if (assignment) {
    const { error } = await supabase
      .from('parent_attendance_contacts')
      .update(assignmentToColumns(assignment))
      .eq('id', contact.id)
    if (error) return { error: `サービス区分の保存に失敗しました: ${error.message}` }
    resolved = assignment
  }

  return applyAttending(supabase, contact, unitId, staffUserId, resolved, assignment !== undefined)
}

/**
 * 反映を取り消す（非承認にした・未承認に戻した場合）。
 *
 * 取り消すのは**この連絡が作ったもの**だけ。
 * すでにあった予約を更新しただけの場合（applied_reservation_id が null）は、
 * スタッフ自身が入れた予定を巻き込まないよう何もしない。
 */
export async function revertParentContact(
  supabase: Client,
  contact: ParentContact
): Promise<{ error?: string }> {
  if (!contact.applied_at) return {}

  const unitId = contact.applied_unit_id
  if (contact.status === 'attending') {
    if (contact.applied_reservation_id) {
      // この連絡で作った予約と、同時に下書きした出欠記録を消す
      await supabase.from('usage_reservations').delete().eq('id', contact.applied_reservation_id)
      if (unitId) {
        await supabase
          .from('daily_attendance')
          .delete()
          .eq('child_id', contact.child_id)
          .eq('unit_id', unitId)
          .eq('date', contact.date)
          .eq('status', 'scheduled')
      }
    }
  } else if (unitId) {
    // お休みの記録を取り消して未記録に戻す（利用状況の欠席ボタンの解除と同じ動き）
    await supabase
      .from('daily_attendance')
      .delete()
      .eq('child_id', contact.child_id)
      .eq('unit_id', unitId)
      .eq('date', contact.date)
      .eq('status', 'absent')
  }

  await supabase
    .from('parent_attendance_contacts')
    .update({ applied_at: null, applied_unit_id: null, applied_reservation_id: null })
    .eq('id', contact.id)

  return {}
}
