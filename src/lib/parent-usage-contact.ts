import type { SupabaseClient } from '@supabase/supabase-js'
import { getTodayJST } from '@/lib/utils'

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
  'transport_type, pickup_time, dropoff_time, note'

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
    if (entry.status !== 'attending' && entry.status !== 'absent') {
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
