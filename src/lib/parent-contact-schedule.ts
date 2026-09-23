import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveAssignment,
  assignmentToColumns,
  type ServiceAssignment,
  type ServiceAssignmentType,
} from '@/lib/parent-contact-service'
import { getTodayJST } from '@/lib/utils'
import { resolveTransportSlot } from '@/lib/schedule-defaults'
import {
  deriveTransportTimes,
  serviceStartFromPickupArrival,
} from '@/lib/transport-timing'

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
  /** キャンセル連絡をどう処理したか。null＝未処理 */
  absent_handling: AbsentHandling | null
}

/**
 * キャンセル連絡の処理方法。施設が利用連絡ページで選ぶ。
 *
 * - absent … 欠席として記録する。予約・利用計画は残るので出席管理には欠席として出続け、
 *   国保連請求の欠席時対応加算も算定できる。前日・当日の急なお休み向け。
 * - delete … その日の予定をなかったことにする。利用状況ページのゴミ箱と同じ扱いで、
 *   出席管理の一覧からも消える。ずっと前からのキャンセル向け。
 */
export type AbsentHandling = 'absent' | 'delete'

/** 反映に必要な列。API 側の select はこれを使う */
export const PARENT_CONTACT_COLUMNS =
  'id, child_id, date, status, service_type, service_start_time, service_end_time, ' +
  'assigned_service_start_time, assigned_service_end_time, ' +
  'assigned_daytime_start_time, assigned_daytime_end_time, ' +
  'transport_type, pickup_location_type, pickup_address_id, ' +
  'dropoff_location_type, dropoff_address_id, ' +
  'applied_at, applied_unit_id, applied_reservation_id, absent_handling'

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
 * 利用計画から自動生成される分を、その日だけキャンセル扱いにする。
 * clearPlanCancellation の逆。予定を消しても、これをやらないと
 * 出席管理が利用計画から一覧を作り直して同じ児童が復活してしまう。
 *
 * 利用状況ページの削除（@/lib/usage-day.ts の cancelUsagePlanForDate）と同じ動き。
 * 失敗したときだけ理由を返す。
 */
async function cancelPlanForDate(
  supabase: Client,
  childId: string,
  date: string
): Promise<string | undefined> {
  const { data: plans } = await supabase
    .from('usage_plans')
    .select('id, day_of_week, start_date, end_date, transport_type, pickup_location_type, dropoff_location_type')
    .eq('child_id', childId)
    .eq('is_active', true)
  if (!plans || plans.length === 0) return

  const dow = new Date(date + 'T00:00:00').getDay()
  for (const plan of plans as {
    id: string
    day_of_week: number[] | null
    start_date: string
    end_date: string | null
    transport_type: string
    pickup_location_type: string
    dropoff_location_type: string
  }[]) {
    if (!(plan.day_of_week ?? []).includes(dow)) continue
    if (date < plan.start_date) continue
    if (plan.end_date && date > plan.end_date) continue

    const { data: existing } = await supabase
      .from('usage_plan_date_overrides')
      .select('id')
      .eq('plan_id', plan.id)
      .eq('date', date)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('usage_plan_date_overrides')
        .update({ is_cancelled: true })
        .eq('id', (existing as { id: string }).id)
      if (error) return error.message
    } else {
      const { error } = await supabase.from('usage_plan_date_overrides').insert({
        plan_id: plan.id,
        date,
        is_cancelled: true,
        transport_type: plan.transport_type,
        pickup_location_type: plan.pickup_location_type,
        dropoff_location_type: plan.dropoff_location_type,
      })
      if (error) return error.message
    }
  }
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

  // ── 送迎の時刻を、スタッフが手で入れるときと同じ形にして埋める ──
  //
  // 送迎・日中一時の入力欄では、お迎えの到着時刻（＝学校に着いた時刻）を入れると
  // その10分後が利用開始（＝事業所に着いた時刻）になる。承認したときも同じ形にして、
  // 承認後にスタッフが入れ直さなくて済むようにする（@/lib/transport-timing）。
  //
  //   お迎え到着 = 希望の開始時刻（学校到着） / 利用開始 = その10分後（事業所到着）
  //   送り出発   = 利用終了                   / 送り到着 = その10分後
  //
  // お迎えの出発時刻は入れない（施設の運用では使っていないため）。
  //
  // 10分足すのは、保護者が連絡してきた時刻（＝学校到着）をそのまま割り振ったときだけ。
  // すでに記録されている利用時間（＝事業所到着）を引き継いで承認し直したときにも
  // 足してしまうと、承認のたびに10分ずつ後ろへずれていく。
  const requestedStart = contact.service_start_time?.slice(0, 5) ?? null
  const fromParentRequest =
    usesPickup && requestedStart !== null && starts[0] === requestedStart
  const recordedStart = starts[0]
    ? (fromParentRequest ? serviceStartFromPickupArrival(starts[0]) : starts[0])
    : null

  // 事業所に着いた時刻から始まるのは、その日いちばん早いサービスの方。
  // 放デイと日中一時を続けて使う日に、両方を10分ずらさないための判定。
  const shifted = (planned: string | null) =>
    recordedStart && planned && planned === starts[0] ? recordedStart : planned
  const serviceStartTime = shifted(assignment.serviceStartTime)
  const daytimeStartTime = shifted(assignment.daytimeStartTime)

  const derived = deriveTransportTimes({
    serviceStart: recordedStart,
    lastEnd: ends.length > 0 ? ends[ends.length - 1] : null,
    usesPickup,
    usesDropoff,
  })

  // 送迎をどちらの欄（放デイ / 日中一時）に記録するかは、出席管理・請求と同じ判定を使う。
  // ここがずれると送迎加算が二重に立つ
  const slotSource = {
    basic_service: useBasic,
    service_start_time: serviceStartTime,
    service_end_time: assignment.serviceEndTime,
    daytime_support: useDaytime,
    daytime_support_start_time: daytimeStartTime,
    daytime_support_end_time: assignment.daytimeEndTime,
  }
  const pickupSlot = resolveTransportSlot('pickup', slotSource)
  const dropoffSlot = resolveTransportSlot('dropoff', slotSource)

  /**
   * 送迎の時刻を、記録先の欄に合わせた列名で組み立てる。
   * お迎えの出発時刻は施設の運用で使っていないので入れない（空欄のまま）。
   */
  function transportColumns(): Record<string, string | null> {
    const out: Record<string, string | null> = {}
    if (usesPickup) {
      const prefix = pickupSlot === 'daytime' ? 'daytime_pickup' : 'pickup'
      out[`${prefix}_arrival_time`] = derived.pickupArrival
    }
    if (usesDropoff) {
      const prefix = dropoffSlot === 'daytime' ? 'daytime_dropoff' : 'dropoff'
      out[`${prefix}_departure_time`] = derived.dropoffDeparture
      out[`${prefix}_arrival_time`] = derived.dropoffArrival
    }
    return out
  }

  const TRANSPORT_COLUMNS = [
    'pickup_departure_time', 'pickup_arrival_time',
    'dropoff_departure_time', 'dropoff_arrival_time',
    'daytime_pickup_departure_time', 'daytime_pickup_arrival_time',
    'daytime_dropoff_departure_time', 'daytime_dropoff_arrival_time',
  ] as const

  const { data: existingAttendance } = await supabase
    .from('daily_attendance')
    .select(
      'id, status, basic_service, service_start_time, service_end_time, ' +
      'daytime_support, daytime_support_start_time, daytime_support_end_time, ' +
      TRANSPORT_COLUMNS.join(', ')
    )
    .eq('child_id', contact.child_id)
    .eq('unit_id', unitId)
    .eq('date', contact.date)
    .maybeSingle()

  if (existingAttendance) {
    const row = existingAttendance as unknown as {
      id: string
      status: string
      basic_service: boolean
      service_start_time: string | null
      service_end_time: string | null
      daytime_support: boolean
      daytime_support_start_time: string | null
      daytime_support_end_time: string | null
    } & Record<(typeof TRANSPORT_COLUMNS)[number], string | null>
    const patch: Record<string, unknown> = {}
    if (row.basic_service !== useBasic) patch.basic_service = useBasic
    if (row.daytime_support !== useDaytime) patch.daytime_support = useDaytime

    /**
     * その日の記録が「実績」として確定しているか。
     *
     * この施設では、児童が来る前にまとめて出席を付けることがある。
     * 出席として記録されているだけでは実績とは限らないので、
     * 過ぎた日の出席だけを実績として扱う（保護者に「利用済み」と見せる判定と同じ）。
     * 実績の日は、承認しても時刻にはいっさい触らない。
     */
    const isRecorded = row.status === 'attended' && contact.date < getTodayJST()

    /** 上書きしてよい場面か、まだ空欄のときだけ埋める場面か */
    const fill = (current: string | null, next: string | null) =>
      !isRecorded && next !== null && (assigned || !current)

    if (isRecorded) {
      // 実績のある日は時刻を触らない（区分だけは施設が決めたとおりにそろえる）
    } else if (useBasic) {
      if (fill(row.service_start_time, serviceStartTime)) {
        patch.service_start_time = serviceStartTime
      }
      if (fill(row.service_end_time, assignment.serviceEndTime)) {
        patch.service_end_time = assignment.serviceEndTime
      }
    } else if (row.service_start_time || row.service_end_time) {
      patch.service_start_time = null
      patch.service_end_time = null
    }

    if (isRecorded) {
      // 同上
    } else if (useDaytime) {
      if (fill(row.daytime_support_start_time, daytimeStartTime)) {
        patch.daytime_support_start_time = daytimeStartTime
      }
      if (fill(row.daytime_support_end_time, assignment.daytimeEndTime)) {
        patch.daytime_support_end_time = assignment.daytimeEndTime
      }
    } else if (row.daytime_support_start_time || row.daytime_support_end_time) {
      patch.daytime_support_start_time = null
      patch.daytime_support_end_time = null
    }

    // 送迎の時刻。前倒しで出席を付けてあるだけの日（まだ来ていない日）には入れる
    for (const [column, value] of Object.entries(transportColumns())) {
      if (fill(row[column as (typeof TRANSPORT_COLUMNS)[number]], value)) {
        patch[column] = value
      }
    }

    // 利用時間は check_in_time / check_out_time にも同じ値を入れる。
    // スタッフの入力欄（送迎・日中一時）と同じ保存の仕方に合わせる
    if (patch.service_start_time !== undefined) patch.check_in_time = patch.service_start_time
    if (patch.service_end_time !== undefined) patch.check_out_time = patch.service_end_time

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
      service_start_time: useBasic ? serviceStartTime : null,
      service_end_time: useBasic ? assignment.serviceEndTime : null,
      check_in_time: useBasic ? serviceStartTime : null,
      check_out_time: useBasic ? assignment.serviceEndTime : null,
      daytime_support: useDaytime,
      daytime_support_start_time: useDaytime ? daytimeStartTime : null,
      daytime_support_end_time: useDaytime ? assignment.daytimeEndTime : null,
      ...transportColumns(),
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
      absent_handling: 'absent',
    })
    .eq('id', contact.id)

  return { unitId }
}

/**
 * 「キャンセル」の連絡を、その日の予定ごと取り消す。
 *
 * 利用状況ページのゴミ箱（@/lib/usage-day.ts の deleteUsageDay）と同じ扱いで、
 * その日の予定・出欠記録・送迎・請求上書きをまとめて消し、利用計画からの
 * 自動生成も止める。出席管理の一覧からも完全に消える。
 *
 * 欠席として残さないので、欠席時対応加算の対象にはならない。
 * ずっと前からのキャンセルはこちらで処理する（前日・当日の急なお休みは applyAbsent）。
 *
 * 元に戻す操作は用意していない。消した予定の内容（時間・送迎）は復元できないため、
 * 入れ直したい場合は利用状況ページから予定を作り直す。
 */
async function applyCancelDelete(
  supabase: Client,
  contact: ParentContact,
  unitId: string
): Promise<ApplyResult> {
  // 請求側の上書きレコード
  await supabase
    .from('billing_daily_records')
    .delete()
    .eq('child_id', contact.child_id)
    .eq('unit_id', unitId)
    .eq('date', contact.date)

  // 出欠記録（支援記録・活動記録は ON DELETE CASCADE で一緒に消える）
  const { error: attError } = await supabase
    .from('daily_attendance')
    .delete()
    .eq('child_id', contact.child_id)
    .eq('unit_id', unitId)
    .eq('date', contact.date)
  if (attError) return { error: `出欠記録の削除に失敗しました: ${attError.message}` }

  // その日の送迎予定から外す
  await removeFromTransport(supabase, contact.child_id, unitId, contact.date)

  // 利用計画からの自動生成を止める。これをやらないと、予定を消しても
  // 出席管理が利用計画から一覧を作り直して復活してしまう
  const planError = await cancelPlanForDate(supabase, contact.child_id, contact.date)
  if (planError) return { error: `利用計画の取り消しに失敗しました: ${planError}` }

  // 利用予定そのもの
  const { error: resError } = await supabase
    .from('usage_reservations')
    .delete()
    .eq('child_id', contact.child_id)
    .eq('unit_id', unitId)
    .eq('date', contact.date)
  if (resError) return { error: `利用予定の削除に失敗しました: ${resError.message}` }

  await supabase
    .from('parent_attendance_contacts')
    .update({
      applied_at: new Date().toISOString(),
      applied_unit_id: unitId,
      applied_reservation_id: null,
      absent_handling: 'delete',
    })
    .eq('id', contact.id)

  return { unitId }
}

/**
 * 保護者の連絡を予定へ反映する。承認（利用）・確認（キャンセル）の両方から呼ぶ。
 * すでに反映済みの連絡をもう一度渡しても、同じ結果になる（再送信への対応）。
 *
 * assignment は承認画面でスタッフが決めたサービス区分と時間。渡された場合は
 * 連絡にも書き戻すので、取り消して承認し直しても同じ割り振りが復元される。
 * 渡されなかった場合は連絡に保存済みの割り振り（無ければ保護者の希望時間を
 * そのまま放デイとして扱う）を使う。
 *
 * handling はキャンセル連絡の処理方法（欠席として記録するか、予定から削除するか）。
 * 既定は欠席。どちらにするかは施設が利用連絡ページで選ぶ。
 */
export async function applyParentContact(
  supabase: Client,
  contact: ParentContact,
  staffUserId: string,
  assignment?: ServiceAssignment,
  handling: AbsentHandling = 'absent'
): Promise<ApplyResult> {
  const unitId =
    contact.applied_unit_id ?? (await resolveUnitId(supabase, contact.child_id, contact.date))
  if (!unitId) {
    return { error: 'この児童にユニットが設定されていないため、予定に反映できませんでした' }
  }

  if (contact.status !== 'attending') {
    return handling === 'delete'
      ? applyCancelDelete(supabase, contact, unitId)
      : applyAbsent(supabase, contact, unitId, staffUserId)
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
  } else if (unitId && contact.absent_handling !== 'delete') {
    // お休みの記録を取り消して未記録に戻す（利用状況の欠席ボタンの解除と同じ動き）。
    // 予定ごと削除した分は、消した内容（時間・送迎）を復元できないのでここでは戻さない。
    // 入れ直す場合は利用状況ページから予定を作り直す
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
    .update({
      applied_at: null,
      applied_unit_id: null,
      applied_reservation_id: null,
      absent_handling: null,
    })
    .eq('id', contact.id)

  return {}
}
