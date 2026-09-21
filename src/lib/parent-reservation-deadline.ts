/**
 * 利用連絡の申込締切。
 *
 * 「翌月分は前月◯日まで」という締切を設ける。締め切るのは**新しい日を増やすこと**だけで、
 * すでに予定が入っている日の利用時間・送迎の変更はいつでも送れる。
 * 締切後にどうしても追加が必要なときは、これまでどおり施設が電話で受ける。
 *
 * 日付の計算はここだけに置き、画面（カレンダー）とAPI（保存の検証）で同じものを使う。
 * 判定がズレると、送信ボタンは出ているのに保存で弾かれる、という状態になってしまう。
 */

export type ReservationDeadline = {
  enabled: boolean
  /** 前月の何日までに出してもらうか（1〜28） */
  day: number
}

/** 設定が無い施設の既定値。締切なし（従来どおり当日以降いつでも連絡できる） */
export const DEFAULT_RESERVATION_DEADLINE: ReservationDeadline = { enabled: false, day: 15 }

/** 締切日として選べる日。月末が短い月でもズレないよう28日までにしている */
export const DEADLINE_DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1)

/** その月の申込締切日（前月の day 日）を YYYY-MM-DD で返す */
export function deadlineDateFor(year: number, month: number, day: number): string {
  const y = month === 1 ? year - 1 : year
  const m = month === 1 ? 12 : month - 1
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * その月の「新しい日の受付」が締め切られているか。
 * today は YYYY-MM-DD（JST）。締切日当日はまだ受け付ける。
 */
export function isMonthClosed(
  year: number,
  month: number,
  deadline: ReservationDeadline,
  today: string
): boolean {
  if (!deadline.enabled) return false
  return today > deadlineDateFor(year, month, deadline.day)
}

/**
 * いま新しい日を連絡できる一番手前の月。
 * 「次に出せるのは何月分か」を保護者・スタッフに伝えるために使う。
 */
export function firstOpenMonth(
  today: string,
  deadline: ReservationDeadline
): { year: number; month: number } {
  const [y, m, d] = today.split('-').map(Number)
  if (!deadline.enabled) return { year: y, month: m }
  // 締切日を過ぎていなければ翌月分がまだ出せる。過ぎていれば翌々月分から
  const ahead = d <= deadline.day ? 1 : 2
  const total = (m - 1) + ahead
  return { year: y + Math.floor(total / 12), month: (total % 12) + 1 }
}

/** '2026-09-15' → '9月15日' */
export function formatMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${m}月${d}日`
}
