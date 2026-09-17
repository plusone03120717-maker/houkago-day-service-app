import type { SupabaseClient } from '@supabase/supabase-js'
import { getTodayJST } from '@/lib/utils'
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
  serviceType?: 'regular' | 'daytime_support'
  serviceStartTime?: string | null
  serviceEndTime?: string | null
  transportType?: TransportType
  pickupTime?: string | null
  dropoffTime?: string | null
  note: string
}

const TRANSPORT_TYPES: TransportType[] = ['none', 'pickup_only', 'dropoff_only', 'both']

/** 連絡の一覧・カレンダー表示に必要な列 */
export const USAGE_CONTACT_COLUMNS =
  'child_id, date, status, service_type, service_start_time, service_end_time, ' +
  'transport_type, pickup_time, dropoff_time, note, approval_status, applied_at'

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
    if (
      entry.serviceType !== undefined &&
      entry.serviceType !== 'regular' &&
      entry.serviceType !== 'daytime_support'
    ) {
      return 'サービス区分が正しくありません'
    }
    if (entry.transportType !== undefined && !TRANSPORT_TYPES.includes(entry.transportType)) {
      return '送迎区分が正しくありません'
    }
    for (const t of [entry.serviceStartTime, entry.serviceEndTime, entry.pickupTime, entry.dropoffTime]) {
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
  // お休みの場合は利用時間・送迎の指定を無視してクリアする
  const records = entries.map((e) => {
    const attending = e.status === 'attending'
    const transport: TransportType = attending ? (e.transportType ?? 'none') : 'none'
    const usesPickup = transport === 'pickup_only' || transport === 'both'
    const usesDropoff = transport === 'dropoff_only' || transport === 'both'
    return {
      child_id: e.childId,
      date,
      status: e.status,
      service_type: attending ? (e.serviceType ?? 'regular') : 'regular',
      service_start_time: attending ? normalizeTime(e.serviceStartTime) ?? null : null,
      service_end_time: attending ? normalizeTime(e.serviceEndTime) ?? null : null,
      transport_type: transport,
      pickup_time: usesPickup ? normalizeTime(e.pickupTime) ?? null : null,
      dropoff_time: usesDropoff ? normalizeTime(e.dropoffTime) ?? null : null,
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
