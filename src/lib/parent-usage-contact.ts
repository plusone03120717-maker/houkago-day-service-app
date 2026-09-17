import type { SupabaseClient } from '@supabase/supabase-js'
import { getTodayJST } from '@/lib/utils'
import { SERVICE_ASSIGNMENT_COLUMNS } from '@/lib/parent-contact-service'
import {
  buildPlaces,
  defaultPlaceValue,
  fromPlaceValue,
  isKnownPlace,
  type ChildTransportPlaces,
  type LocationType,
} from '@/lib/transport-place'
import {
  buildUsageRoster,
  eachDate,
  type RosterReservation,
  type RosterPlan,
  type RosterOverride,
  type RosterAttendance,
} from '@/lib/usage-roster'

/**
 * 保護者からの利用連絡（利用する・お休みする）の検証と保存。
 *
 * 保護者の入口は保護者ポータルに一本化しているが、ログインの仕組み（ポータルの
 * セッション / LINEのアクセストークン）とは切り離してあるので、
 * 入口が増えてもこのファイルを共有すれば保存の仕方は1つに保てる。
 */

// Supabase クライアントは型ジェネリクスなしで使う（プロジェクト全体の方針）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>

export type TransportType = 'none' | 'pickup_only' | 'dropoff_only' | 'both'

export type UsageContactEntry = {
  childId: string
  status: 'attending' | 'absent'
  serviceStartTime?: string | null
  serviceEndTime?: string | null
  transportType?: TransportType
  /**
   * 迎えに行く場所・送り届ける場所（@/lib/transport-place の値）。
   * 送迎の時刻は聞かない。承認したサービス区分の利用時間から施設側で決まるため。
   */
  pickupPlace?: string
  dropoffPlace?: string
  note: string
}

const TRANSPORT_TYPES: TransportType[] = ['none', 'pickup_only', 'dropoff_only', 'both']

/** 'school' / 'home' / 'addr:<uuid>' */
const PLACE_RE = /^(school|home|addr:[0-9a-f-]{36})$/

/** 連絡の一覧・カレンダー表示に必要な列 */
export const USAGE_CONTACT_COLUMNS =
  'child_id, date, status, service_type, service_start_time, service_end_time, ' +
  SERVICE_ASSIGNMENT_COLUMNS + ', ' +
  'transport_type, pickup_location_type, pickup_address_id, ' +
  'dropoff_location_type, dropoff_address_id, ' +
  'note, approval_status, applied_at'

/**
 * 施設側で決まっているその日の状態。
 * 保護者が「もう予定が入っている日」を見分けられるようにするために返す。
 */
export type FacilityScheduleDay = {
  child_id: string
  date: string
  /** planned=利用予定 / absent=欠席として記録済み / attended=利用済み */
  kind: 'planned' | 'absent' | 'attended'
}

/** "HH:MM" 形式を検証し、空文字は null に正規化する */
function normalizeTime(v: string | null | undefined): string | null | undefined {
  if (v === null || v === undefined || v === '') return null
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined
}

/**
 * 送信内容を検証する。問題があればその理由を返す。
 * 児童が保護者のものかどうかは呼び出し側で確認すること。
 */
export function validateUsageContact(
  date: string | undefined,
  entries: UsageContactEntry[] | undefined
): string | null {
  if (!date || !entries || entries.length === 0) return 'パラメータが不足しています'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '日付の形式が正しくありません'
  // 過去日への連絡は不可（当日は可）
  if (date < getTodayJST()) return '過去の日付には連絡できません'

  for (const entry of entries) {
    // お休み・キャンセルは保護者ポータルからは受け付けない。
    // いつ連絡があったかで欠席時対応加算の算定可否が変わるため、施設が電話で受けて
    // スタッフが「欠席」か「予定の削除」かを判断して記録する。
    // 画面にも選択肢を出していないが、直接APIを叩かれても通さないようここで弾く。
    if (entry.status === 'absent') {
      return 'お休み・キャンセルのご連絡は、施設へお電話でお願いします'
    }
    if (entry.status !== 'attending') {
      return '連絡内容が正しくありません'
    }
    if (entry.transportType !== undefined && !TRANSPORT_TYPES.includes(entry.transportType)) {
      return '送迎区分が正しくありません'
    }
    // 場所の値そのものが選択肢にあるかは、児童ごとの選択肢と突き合わせないと
    // 判断できない（他人の住所IDを送られても困る）ので API 側で確かめる。
    // ここでは形だけ見る。
    for (const place of [entry.pickupPlace, entry.dropoffPlace]) {
      if (place !== undefined && !PLACE_RE.test(place)) {
        return '送迎の場所が正しくありません'
      }
    }
    for (const t of [entry.serviceStartTime, entry.serviceEndTime]) {
      if (normalizeTime(t) === undefined) return '時刻の形式が正しくありません'
    }
    // 利用時間は開始 < 終了 であること（両方入力されている場合のみ）
    const s = normalizeTime(entry.serviceStartTime)
    const e = normalizeTime(entry.serviceEndTime)
    if (s && e && s >= e) return '利用時間の終了は開始より後にしてください'
  }

  return null
}

/**
 * 連絡を保存する（同じ児童・同じ日なら上書き）。
 *
 * 再送信された連絡はスタッフ未確認・未承認に戻す。内容が変わったことを
 * 見落とさないようにするため。反映の控え（applied_*）は残したままにして、
 * 承認し直したときに前回作った予定を引き継げるようにする。
 */
export async function saveUsageContacts(
  supabase: Client,
  date: string,
  entries: UsageContactEntry[]
): Promise<{ error?: string }> {
  // お休みの場合は利用時間・送迎の指定を無視してクリアする。
  //
  // service_type（施設が割り振ったサービス区分）は書き換えない。保護者は区分を
  // 選ばないので、ここで送られてくる値は存在しない。upsert の payload に載せなければ
  // ON CONFLICT でも触られないため、施設の決めた区分はそのまま残る。
  // ただし割り振った時間（assigned_*）は消す。希望時間が変わっているかもしれず、
  // 古い割り振りのまま承認されると実際の利用と食い違うため、施設に決め直してもらう。
  const records = entries.map((e) => {
    const attending = e.status === 'attending'
    const transport: TransportType = attending ? (e.transportType ?? 'none') : 'none'
    const usesPickup = transport === 'pickup_only' || transport === 'both'
    const usesDropoff = transport === 'dropoff_only' || transport === 'both'
    const pickup = fromPlaceValue(usesPickup ? e.pickupPlace ?? 'home' : 'home')
    const dropoff = fromPlaceValue(usesDropoff ? e.dropoffPlace ?? 'home' : 'home')
    return {
      child_id: e.childId,
      date,
      status: e.status,
      service_start_time: attending ? normalizeTime(e.serviceStartTime) ?? null : null,
      service_end_time: attending ? normalizeTime(e.serviceEndTime) ?? null : null,
      transport_type: transport,
      // 送迎の時刻は保護者に聞かない。承認時の利用時間から施設側で決まる
      pickup_time: null,
      dropoff_time: null,
      pickup_location_type: pickup.locationType,
      pickup_address_id: pickup.addressId,
      dropoff_location_type: dropoff.locationType,
      dropoff_address_id: dropoff.addressId,
      assigned_service_start_time: null,
      assigned_service_end_time: null,
      assigned_daytime_start_time: null,
      assigned_daytime_end_time: null,
      note: e.note ?? null,
      reported_via: 'portal',
      reported_at: new Date().toISOString(),
      is_new: true,
      approval_status: 'pending',
    }
  })

  const { error } = await supabase
    .from('parent_attendance_contacts')
    .upsert(records, { onConflict: 'child_id,date' })

  if (error) {
    console.error('[parent-usage-contact] upsert error:', error)
    return { error: '保存に失敗しました' }
  }
  return {}
}

/**
 * 児童ごとの送迎の場所の選択肢を組み立てる。
 *
 * 学校・児童の登録住所（child_addresses）から作る。登録住所が1件も無い児童は
 * 児童の基本住所（children.address）を「自宅」として1件だけ出す。
 * 既定値は施設に登録されている送迎設定（child_transport_settings）に合わせる。
 */
export async function loadTransportPlaces(
  supabase: Client,
  childIds: string[]
): Promise<ChildTransportPlaces[]> {
  if (childIds.length === 0) return []

  const [{ data: childRows }, { data: addressRows }, { data: settingRows }] = await Promise.all([
    supabase.from('children').select('id, address, schools (name)').in('id', childIds),
    supabase
      .from('child_addresses')
      .select('id, child_id, label, address, is_default, sort_order')
      .in('child_id', childIds)
      .order('sort_order'),
    supabase
      .from('child_transport_settings')
      .select('child_id, pickup_location_type, dropoff_location_type')
      .in('child_id', childIds),
  ])

  type AddressRow = { id: string; child_id: string; label: string; address: string; is_default: boolean }
  const addressesByChild = new Map<string, AddressRow[]>()
  for (const row of (addressRows ?? []) as unknown as AddressRow[]) {
    const list = addressesByChild.get(row.child_id) ?? []
    list.push(row)
    addressesByChild.set(row.child_id, list)
  }

  type SettingRow = {
    child_id: string
    pickup_location_type: LocationType | null
    dropoff_location_type: LocationType | null
  }
  const settingByChild = new Map<string, SettingRow>()
  for (const row of (settingRows ?? []) as unknown as SettingRow[]) {
    settingByChild.set(row.child_id, row)
  }

  type ChildRow = { id: string; address: string | null; schools: { name: string } | null }
  return ((childRows ?? []) as unknown as ChildRow[]).map((child) => {
    const addresses = addressesByChild.get(child.id) ?? []
    const places = buildPlaces({
      schoolName: child.schools?.name ?? null,
      baseAddress: child.address,
      addresses,
    })
    const setting = settingByChild.get(child.id)
    return {
      childId: child.id,
      places,
      defaultPickup: defaultPlaceValue(places, setting?.pickup_location_type, addresses),
      defaultDropoff: defaultPlaceValue(places, setting?.dropoff_location_type, addresses),
    }
  })
}

/**
 * 送られてきた場所が、その児童の選択肢に含まれているかを確かめる。
 * 他人の住所IDや、削除済みの住所を指定されても通さないため。
 */
export function validateTransportPlaces(
  placesByChild: ChildTransportPlaces[],
  entries: UsageContactEntry[]
): string | null {
  const byChild = new Map(placesByChild.map((p) => [p.childId, p.places]))
  for (const entry of entries) {
    const places = byChild.get(entry.childId) ?? []
    const transport = entry.transportType ?? 'none'
    const usesPickup = transport === 'pickup_only' || transport === 'both'
    const usesDropoff = transport === 'dropoff_only' || transport === 'both'
    if (usesPickup && entry.pickupPlace && !isKnownPlace(places, entry.pickupPlace)) {
      return '迎えに行く場所が正しくありません'
    }
    if (usesDropoff && entry.dropoffPlace && !isKnownPlace(places, entry.dropoffPlace)) {
      return '送り届ける場所が正しくありません'
    }
  }
  return null
}

/** 施設がお休みの日（保護者は利用連絡を送れない） */
export type FacilityClosure = {
  date: string
  /** 「年末年始休業」など。保護者にそのまま見せる */
  title: string
}

/**
 * その月の休業日を取り出す。
 *
 * 施設カレンダー（設定 → 施設カレンダー）の予定のうち、
 * 「保護者予約を停止する」が立っているものを休業日として扱う。
 * 休業日（event_type='closed'）はこのフラグが自動で立つが、
 * 研修日などにスタッフが手で立てることもできる。
 *
 * 児童が所属するユニットの施設だけを見る。所属ユニットが無い児童は
 * どの施設の休業日か決められないため、何も返さない。
 */
export async function loadFacilityClosures(
  supabase: Client,
  childIds: string[],
  year: number,
  month: number
): Promise<FacilityClosure[]> {
  if (childIds.length === 0) return []

  const { data: unitRows } = await supabase
    .from('children_units')
    .select('units (facility_id)')
    .in('child_id', childIds)
  const facilityIds = [
    ...new Set(
      ((unitRows ?? []) as unknown as { units: { facility_id: string } | null }[])
        .map((r) => r.units?.facility_id)
        .filter((id): id is string => !!id)
    ),
  ]
  if (facilityIds.length === 0) return []

  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const { data } = await supabase
    .from('facility_events')
    .select('event_date, title')
    .in('facility_id', facilityIds)
    .eq('affects_reservation', true)
    .gte('event_date', `${year}-${mm}-01`)
    .lte('event_date', `${year}-${mm}-${String(lastDay).padStart(2, '0')}`)
    .order('event_date')

  // 同じ日に複数の施設・予定があっても、保護者には1日1件だけ見せる
  const byDate = new Map<string, string>()
  for (const row of (data ?? []) as { event_date: string; title: string }[]) {
    if (!byDate.has(row.event_date)) byDate.set(row.event_date, row.title)
  }
  return [...byDate.entries()].map(([date, title]) => ({ date, title }))
}

/**
 * 施設側で決まっているその月の利用日を取り出す。
 *
 * 「その日、誰が利用するのか」は予約・毎週の利用計画・出欠記録の3つに散らばっているので、
 * スタッフ画面と同じ共通ロジック（src/lib/usage-roster.ts）を通して数え方を揃える。
 * ここがズレると、保護者とスタッフで見えている予定が食い違ってしまう。
 */
export async function loadFacilitySchedule(
  supabase: Client,
  childIds: string[],
  year: number,
  month: number
): Promise<FacilityScheduleDay[]> {
  if (childIds.length === 0) return []

  const mm = String(month).padStart(2, '0')
  const startDate = `${year}-${mm}-01`
  const endDate = `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const [{ data: reservations }, { data: plans }, { data: attendances }] = await Promise.all([
    supabase
      .from('usage_reservations')
      .select('id, child_id, date, status, requested_by')
      .in('child_id', childIds)
      .gte('date', startDate)
      .lte('date', endDate),
    supabase
      .from('usage_plans')
      .select('id, child_id, start_date, end_date, day_of_week')
      .in('child_id', childIds)
      .eq('is_active', true)
      .lte('start_date', endDate)
      .or(`end_date.is.null,end_date.gte.${startDate}`),
    supabase
      .from('daily_attendance')
      .select('child_id, date, status')
      .in('child_id', childIds)
      .gte('date', startDate)
      .lte('date', endDate),
  ])

  const planIds = ((plans ?? []) as { id: string }[]).map((p) => p.id)
  const { data: overrides } = planIds.length > 0
    ? await supabase
        .from('usage_plan_date_overrides')
        .select('plan_id, date, is_cancelled')
        .in('plan_id', planIds)
        .gte('date', startDate)
        .lte('date', endDate)
    : { data: [] }

  const roster = buildUsageRoster({
    dates: eachDate(startDate, endDate),
    reservations: (reservations ?? []) as RosterReservation[],
    plans: (plans ?? []) as RosterPlan[],
    overrides: (overrides ?? []) as RosterOverride[],
    attendances: (attendances ?? []) as RosterAttendance[],
  })

  const out: FacilityScheduleDay[] = []
  for (const entries of roster.values()) {
    for (const e of entries) {
      if (!e.planned) continue
      out.push({
        child_id: e.childId,
        date: e.date,
        kind:
          e.attendanceStatus === 'attended' ? 'attended'
          : e.absent ? 'absent'
          : 'planned',
      })
    }
  }
  return out
}

/** その月の連絡を取り出す */
export async function loadUsageContacts(
  supabase: Client,
  childIds: string[],
  year: number,
  month: number
) {
  if (childIds.length === 0) return []
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const { data } = await supabase
    .from('parent_attendance_contacts')
    .select(USAGE_CONTACT_COLUMNS)
    .in('child_id', childIds)
    .gte('date', `${year}-${mm}-01`)
    .lte('date', `${year}-${mm}-${String(lastDay).padStart(2, '0')}`)
  return data ?? []
}
