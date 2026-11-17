/**
 * 保護者に見せる「その日の予定」の時刻の言い方。
 *
 * 保護者ポータルの「予定の確認」と「利用連絡のカレンダー」の両方で使う。
 * 2つの画面で時刻が食い違わないよう、言い方はここ1か所で決める。
 *
 * 送迎の区分ごとに、保護者がいちばん知りたい時刻を出す（2026-11-17 依頼主）。
 *   行き帰りの送迎 … お迎え 14:20（学校）／お送り 17:30 出発
 *   行きの送迎だけ … お迎え 14:20（学校）〜17:30 まで
 *   帰りの送迎だけ … 14:30 から／お送り 17:30 出発
 *   送迎なし       … 14:30〜17:30（保護者が送り迎えするので利用時間のまま）
 *
 * 利用開始は「事業所に着いた時刻」なので、行きの送迎がある日にそのまま見せると、
 * 学校でお迎えする時刻より10分遅れて見える（2026-11 スタッフから「分かりにくい」）。
 *
 * サーバー・クライアントの両方から使うので、Supabase などの依存は持たせない。
 */
import { pickupArrivalFromServiceStart } from '@/lib/transport-timing'

export type ScheduleTimeInput = {
  service_start_time?: string | null
  service_end_time?: string | null
  transport_type?: 'none' | 'pickup_only' | 'dropoff_only' | 'both' | null
  pickup_time?: string | null
  pickup_place?: string | null
}

function hhmm(t: string | null | undefined): string | null {
  return t ? t.slice(0, 5) : null
}

export function usesPickup(d: ScheduleTimeInput): boolean {
  return d.transport_type === 'pickup_only' || d.transport_type === 'both'
}

export function usesDropoff(d: ScheduleTimeInput): boolean {
  return d.transport_type === 'dropoff_only' || d.transport_type === 'both'
}

/**
 * お迎えの時刻（学校などで子どもと出る時刻）。行きの送迎が無い日は null。
 * 予定・記録にお迎えの時刻があればそれを、無ければ利用開始の10分前を使う。
 */
export function pickupTimeOf(d: ScheduleTimeInput): string | null {
  if (!usesPickup(d)) return null
  const own = hhmm(d.pickup_time)
  if (own) return own
  const start = hhmm(d.service_start_time)
  return start ? pickupArrivalFromServiceStart(start) : null
}

/** お迎えの場所の言い方。'school' / 'home' / 'addr:<id>'（@/lib/transport-place） */
function defaultPlaceLabel(value: string | null | undefined): string | null {
  if (!value) return null
  if (value === 'school') return '学校'
  if (value === 'home') return 'ご自宅'
  if (value.startsWith('addr:')) return 'ご指定の場所'
  return null
}

/**
 * その日の時刻の1行（日付は含まない）。時刻が1つも無ければ null。
 * placeLabel を渡すと、お迎えの場所をその言い方で出す（祖父母宅など登録住所の名前）。
 * 渡した言い方で見つからない場所は「学校・ご自宅・ご指定の場所」にする。
 */
export function scheduleTimeText(
  d: ScheduleTimeInput,
  placeLabel?: (value: string | null | undefined) => string | null
): string | null {
  const start = hhmm(d.service_start_time)
  const end = hhmm(d.service_end_time)
  const range = start || end ? `${start ?? ''}〜${end ?? ''}` : null

  const pickup = pickupTimeOf(d)
  const place = pickup ? placeLabel?.(d.pickup_place) ?? defaultPlaceLabel(d.pickup_place) : null
  const pickupPart = pickup ? `お迎え ${pickup}${place ? `（${place}）` : ''}` : null
  const dropoffPart = usesDropoff(d) && end ? `お送り ${end} 出発` : null

  switch (d.transport_type) {
    case 'both':
      if (!pickupPart && !dropoffPart) return range
      return [pickupPart ?? (start ? `${start} から` : null), dropoffPart ?? (end ? `${end} まで` : null)]
        .filter((v): v is string => !!v)
        .join('／')
    case 'pickup_only':
      if (!pickupPart) return range
      return end ? `${pickupPart}〜${end} まで` : pickupPart
    case 'dropoff_only':
      if (!dropoffPart) return range
      return start ? `${start} から／${dropoffPart}` : dropoffPart
    default:
      return range
  }
}
