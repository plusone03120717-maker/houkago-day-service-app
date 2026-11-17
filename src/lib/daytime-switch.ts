import { isHolidayDate } from '@/lib/billing/day-computation'

// Supabase クライアントは型ジェネリクスなしで使う（プロジェクト全体の方針）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any

/**
 * 放課後デイと日中一時を続けて使う日（両方の日）の、切りかえの時刻の既定。
 *
 * 学校のある日は 16:30、学校が休みの日は 16:00（2026-11-17 依頼主）。
 * 9〜11月の記録でも、学校のある日の切りかえは 16:30 が92%だった。
 * 放課後デイが先・日中一時があと（切りかえ＝放課後デイの終わり＝日中一時の始まり）。
 * 「休みの日」は請求と同じ決め方（土日・祝日・施設の休み・その子の学校休日）。
 */
export const SWITCH_TIME_SCHOOL_DAY = '16:30'
export const SWITCH_TIME_HOLIDAY = '16:00'

export function defaultSwitchTime(isHoliday: boolean): string {
  return isHoliday ? SWITCH_TIME_HOLIDAY : SWITCH_TIME_SCHOOL_DAY
}

/**
 * いつもの予定に切りかえ（日中一時の開始）が入っているときの切りかえ。
 * いつもの予定は平日（学校のある日）の形なので、休みの日は予定より 16:00 を優先する。
 * 学校のある日は予定の時刻、なければ 16:30。
 */
export function switchTimeFor(isHoliday: boolean, plannedSwitch?: string | null): string {
  if (isHoliday) return SWITCH_TIME_HOLIDAY
  const t = plannedSwitch ? plannedSwitch.slice(0, 5) : ''
  return t && t !== '00:00' ? t : SWITCH_TIME_SCHOOL_DAY
}

/**
 * 子ども・日付ごとに「学校が休みの日か」を引けるようにする。
 * child_school_holidays（その子の学校休日）と facility_events の休み、土日・祝日を見る。
 */
export async function loadHolidayChecker(
  supabase: Client,
  childIds: string[],
  dates: string[]
): Promise<(childId: string, date: string) => boolean> {
  if (childIds.length === 0 || dates.length === 0) return () => false
  const sorted = [...dates].sort()
  const from = sorted[0]
  const to = sorted[sorted.length - 1]
  const [{ data: schoolRaw }, { data: facilityRaw }] = await Promise.all([
    supabase
      .from('child_school_holidays')
      .select('child_id, start_date, end_date')
      .in('child_id', childIds)
      .lte('start_date', to)
      .gte('end_date', from),
    supabase
      .from('facility_events')
      .select('event_date')
      .eq('event_type', 'holiday')
      .gte('event_date', from)
      .lte('event_date', to),
  ])
  const byChild = new Map<string, { start_date: string; end_date: string }[]>()
  for (const h of (schoolRaw ?? []) as { child_id: string; start_date: string; end_date: string }[]) {
    const list = byChild.get(h.child_id) ?? []
    list.push(h)
    byChild.set(h.child_id, list)
  }
  const facility = ((facilityRaw ?? []) as { event_date: string }[]).map((e) => e.event_date)
  return (childId, date) => isHolidayDate(date, byChild.get(childId) ?? [], facility)
}
