/**
 * 送迎の時刻の決め方を1か所にまとめたもの。
 *
 * 送迎の欄は次の形で記録している（送迎管理・出席管理の「送迎時間」は出発の欄）。
 *   お迎え … 出発＝学校などに着いて子どもと出る時刻 / 到着＝事業所に着く時刻＝利用開始
 *   お送り … 出発＝事業所を出る時刻＝利用終了       / 到着＝自宅などに着く時刻
 * スタッフが送迎欄にお迎えの出発時刻を入れると、10分後を到着時刻として埋め、
 * その到着時刻を利用開始時間にする——という運用が送迎・日中一時の入力欄にある
 * （@/components/transport/transport-daytime-panel.tsx）。
 * 保護者の利用連絡を承認したときも同じ形で埋めたいので、計算だけをここに出した。
 *
 * 画面（クライアント）とサーバー（承認処理）の両方から使うため、
 * 依存の無い純粋な関数だけを置く。
 */

/**
 * 送迎の移動にみておく時間（分）。
 * お迎えは「学校に着いてから事業所に着くまで」、お送りは「事業所を出てから着くまで」。
 */
export const TRANSPORT_TRAVEL_MINUTES = 10

/** 'HH:MM' に分を足す。日をまたぐ場合は24時間で丸める */
export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutes
  const norm = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(norm / 60)).padStart(2, '0')}:${String(norm % 60).padStart(2, '0')}`
}

export type DerivedTransportTimes = {
  /** お迎えの出発時刻（＝学校などに着いて子どもと出る時刻）。利用開始の10分前 */
  pickupDeparture: string | null
  /** お迎えの到着時刻（＝事業所に着いた時刻）＝利用開始 */
  pickupArrival: string | null
  /** お送りの出発時刻＝利用終了時間 */
  dropoffDeparture: string | null
  /** お送りの到着時刻（出発の10分後） */
  dropoffArrival: string | null
}

/**
 * 学校に着いた時刻から、記録する利用開始時間（＝事業所に着いた時刻）を出す。
 * 保護者が連絡してくる「利用開始時間」は学校に着く時刻なので、これを通して変換する。
 */
export function serviceStartFromPickupArrival(schoolArrival: string): string {
  return addMinutes(schoolArrival, TRANSPORT_TRAVEL_MINUTES)
}

/**
 * その日の利用時間から、送迎の時刻を組み立てる。
 *
 * serviceStart … その日いちばん早い**利用開始**（＝事業所に着いた時刻）
 * lastEnd      … その日いちばん遅い利用終了
 *
 *   お迎え … 利用開始の10分前に学校などを出発し（＝送迎時間）、利用開始に事業所へ到着する
 *   お送り … 利用終了の時刻に事業所を出発し（＝送迎時間）、その10分後に到着する
 */
export function deriveTransportTimes({
  serviceStart,
  lastEnd,
  usesPickup,
  usesDropoff,
}: {
  serviceStart: string | null
  lastEnd: string | null
  usesPickup: boolean
  usesDropoff: boolean
}): DerivedTransportTimes {
  const pickupArrival = usesPickup && serviceStart ? serviceStart : null
  const pickupDeparture = pickupArrival
    ? addMinutes(pickupArrival, -TRANSPORT_TRAVEL_MINUTES)
    : null
  const dropoffDeparture = usesDropoff ? lastEnd : null
  const dropoffArrival = dropoffDeparture
    ? addMinutes(dropoffDeparture, TRANSPORT_TRAVEL_MINUTES)
    : null

  return { pickupDeparture, pickupArrival, dropoffDeparture, dropoffArrival }
}
