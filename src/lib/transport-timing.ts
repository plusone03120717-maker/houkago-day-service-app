/**
 * 送迎の時刻の決め方を1か所にまとめたもの。
 *
 * スタッフが送迎欄にお迎えの出発時刻を入れると、10分後を到着時刻として埋め、
 * その到着時刻を利用開始時間にする——という運用が送迎・日中一時の入力欄にある
 * （@/components/transport/transport-daytime-panel.tsx）。
 * 保護者の利用連絡を承認したときも同じ形で埋めたいので、計算だけをここに出した。
 *
 * 画面（クライアント）とサーバー（承認処理）の両方から使うため、
 * 依存の無い純粋な関数だけを置く。
 */

/** 送迎の移動にみておく時間（分）。出発 → 到着の差 */
export const TRANSPORT_TRAVEL_MINUTES = 10

/** 'HH:MM' に分を足す。日をまたぐ場合は24時間で丸める */
export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutes
  const norm = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(norm / 60)).padStart(2, '0')}:${String(norm % 60).padStart(2, '0')}`
}

export type DerivedTransportTimes = {
  /** お迎えの出発時刻。利用開始の10分前に出る */
  pickupDeparture: string | null
  /** お迎えの到着時刻＝利用開始時間 */
  pickupArrival: string | null
  /** お送りの出発時刻＝利用終了時間 */
  dropoffDeparture: string | null
  /** お送りの到着時刻（出発の10分後） */
  dropoffArrival: string | null
}

/**
 * 保護者が希望した利用時間から、その日の送迎の時刻を組み立てる。
 *
 * firstStart … その日いちばん早い開始（放デイと日中一時を続けて使う日は早い方）
 * lastEnd    … その日いちばん遅い終了
 *
 * **利用時間そのものは動かさない。** 送迎の時刻だけを前後に伸ばす。
 *   お迎え … 利用開始の10分前に出発し、利用開始の時刻に到着する
 *   お送り … 利用終了の時刻に出発し、その10分後に到着する
 */
export function deriveTransportTimes({
  firstStart,
  lastEnd,
  usesPickup,
  usesDropoff,
}: {
  firstStart: string | null
  lastEnd: string | null
  usesPickup: boolean
  usesDropoff: boolean
}): DerivedTransportTimes {
  const pickupArrival = usesPickup ? firstStart : null
  const pickupDeparture = pickupArrival
    ? addMinutes(pickupArrival, -TRANSPORT_TRAVEL_MINUTES)
    : null
  const dropoffDeparture = usesDropoff ? lastEnd : null
  const dropoffArrival = dropoffDeparture
    ? addMinutes(dropoffDeparture, TRANSPORT_TRAVEL_MINUTES)
    : null

  return { pickupDeparture, pickupArrival, dropoffDeparture, dropoffArrival }
}
