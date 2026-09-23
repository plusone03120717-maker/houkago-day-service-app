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
  /** お迎えの到着時刻（＝学校に着いた時刻）。保護者が希望した時刻をそのまま使う */
  pickupArrival: string | null
  /** お送りの出発時刻＝利用終了時間 */
  dropoffDeparture: string | null
  /** お送りの到着時刻（出発の10分後） */
  dropoffArrival: string | null
  /**
   * 記録する利用開始時間（＝事業所に着いた時刻）。
   * お迎えがある日は学校到着の10分後。お迎えが無い日は希望した時刻のまま。
   */
  serviceStartsAt: string | null
}

/**
 * 保護者が希望した利用時間から、その日の送迎の時刻を組み立てる。
 *
 * firstStart … その日いちばん早い開始（放デイと日中一時を続けて使う日は早い方）
 * lastEnd    … その日いちばん遅い終了
 *
 *   お迎え … 希望した時刻に**学校へ到着**し、その10分後に事業所へ着く＝利用開始
 *   お送り … 利用終了の時刻に事業所を出発し、その10分後に到着する
 *
 * お迎えの出発時刻は決めない（施設の運用では使っていないため、空欄のままにする）。
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
  const dropoffDeparture = usesDropoff ? lastEnd : null
  const dropoffArrival = dropoffDeparture
    ? addMinutes(dropoffDeparture, TRANSPORT_TRAVEL_MINUTES)
    : null

  return {
    pickupArrival,
    dropoffDeparture,
    dropoffArrival,
    serviceStartsAt: pickupArrival
      ? addMinutes(pickupArrival, TRANSPORT_TRAVEL_MINUTES)
      : firstStart,
  }
}
