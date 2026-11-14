import type { FacilityScheduleDay } from '@/components/parent/usage-contact-calendar'

/**
 * 週ごとの予定のお知らせと、保護者の「確認しました」の決め方（データベースにさわらない部分）。
 *
 * - 週は月曜〜日曜。スタッフは週ごとに「保護者に知らせる」を押す。
 * - 保護者は、知らせが届いた週の予定を見て「確認しました」を押す。
 * - 押した時点の予定を日ごとの要約（snapshot）で残し、今の予定と比べる。
 *   確認のあとで施設が予定を変えた日があれば「変更後まだ」にする。
 * - 比べるのは明日から先の日だけ。当日はスタッフが児童の来る前に出席を付けることがあり、
 *   その記録で中身が変わって見えるため（当日の変更は電話で伝える決まり）。
 *   過ぎた日も、確認をやり直してもらう意味がないので比べない。
 *
 * 保護者が自分で利用連絡を送って変えた分は、承認したときに snapshot を追いつかせる
 * （src/lib/schedule-week-confirm-db.ts の withParentChangeAck）。
 */

/** 日付 → その日の予定の要約 */
export type DaySnapshot = Record<string, string>

export type ChildWeekStatus =
  /** その週に予定がない */
  | 'no_plan'
  /** その週はまだ保護者に知らせていない */
  | 'not_notified'
  /** 知らせたが、まだ確認していない */
  | 'waiting'
  /** 確認ずみ（そのあと施設の変更なし） */
  | 'confirmed'
  /** 確認のあとで施設が予定を変えた */
  | 'changed'

export const STATUS_LABEL: Record<ChildWeekStatus, string> = {
  no_plan: '予定なし',
  not_notified: 'まだ知らせていない',
  waiting: 'まだ',
  confirmed: '確認ずみ',
  changed: '変更後まだ',
}

function toUtc(date: string): Date {
  return new Date(date + 'T00:00:00Z')
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fmt(d)
}

/** その日を含む週の月曜日 */
export function weekStartOf(date: string): string {
  const dow = toUtc(date).getUTCDay() // 0=日
  return addDays(date, dow === 0 ? -6 : 1 - dow)
}

/** 月曜日なら true（URL などから受け取った週の確かめに使う） */
export function isWeekStart(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(toUtc(date).getTime()) && toUtc(date).getUTCDay() === 1
}

/** 月曜〜日曜の7日 */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

export function weekEnd(weekStart: string): string {
  return addDays(weekStart, 6)
}

/** その週が含まれる年月（月をまたぐ週は2つ） */
export function monthsOfWeek(weekStart: string): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = []
  for (const d of [weekStart, weekEnd(weekStart)]) {
    const year = Number(d.slice(0, 4))
    const month = Number(d.slice(5, 7))
    if (!out.some((m) => m.year === year && m.month === month)) out.push({ year, month })
  }
  return out
}

/**
 * その日の予定の要約。保護者に見せている中身（来るか・利用時間・送迎・場所）だけを使う。
 * 「利用済み」は「利用予定」と同じに扱う（日が過ぎただけで変わったことにしない）。
 */
export function daySignature(d: FacilityScheduleDay): string {
  if (d.kind === 'absent') return 'absent'
  return [
    'plan',
    d.service_start_time ?? '',
    d.service_end_time ?? '',
    d.transport_type ?? '',
    d.pickup_place ?? '',
    d.dropoff_place ?? '',
  ].join('|')
}

/** 施設の予定（何人分でも）から、その週の児童ごとの要約を作る */
export function buildWeekSnapshots(
  schedule: FacilityScheduleDay[],
  weekStart: string
): Map<string, DaySnapshot> {
  const end = weekEnd(weekStart)
  const out = new Map<string, DaySnapshot>()
  for (const d of schedule) {
    if (d.date < weekStart || d.date > end) continue
    const snap = out.get(d.child_id) ?? {}
    snap[d.date] = daySignature(d)
    out.set(d.child_id, snap)
  }
  return out
}

/**
 * 2つの要約で中身が違う日（明日から先だけ。理由はファイルの先頭）。
 * 予定が増えた日・なくなった日も「違う」に入る。
 */
export function changedDates(
  before: DaySnapshot | null | undefined,
  current: DaySnapshot,
  today: string
): string[] {
  const prev = before ?? {}
  const dates = new Set([...Object.keys(prev), ...Object.keys(current)])
  return [...dates]
    .filter((d) => d > today && prev[d] !== current[d])
    .sort()
}

/** 予定がある日（お休みの日も含む）が1日でもあるか */
export function hasPlan(current: DaySnapshot | undefined): boolean {
  return !!current && Object.keys(current).length > 0
}

export type ChildWeekState = {
  status: ChildWeekStatus
  /** 確認のあとで施設が変えた日（status が changed のとき） */
  changedSinceConfirm: string[]
  /** 知らせたあとで変わったのに、まだ知らせ直していない日 */
  changedSinceNotice: string[]
}

/** 児童1人・1週の状態 */
export function childWeekState(args: {
  current: DaySnapshot | undefined
  notified: boolean
  /** 知らせたときの、この児童の要約（知らせたあとで予定ができた児童は無い） */
  noticeSnapshot: DaySnapshot | undefined
  /** 保護者が確認したときの要約（未確認なら無い） */
  confirmSnapshot: DaySnapshot | undefined
  today: string
}): ChildWeekState {
  const current = args.current ?? {}
  const changedSinceNotice = args.notified
    ? changedDates(args.noticeSnapshot, current, args.today)
    : []
  // 予定がない週は出さない。ただし確認したあとで予定がすべてなくなった週は、
  // なくなった日を知らせる必要があるので残す（もう一度確認すれば消える）
  if (
    !hasPlan(current) &&
    (!args.confirmSnapshot || changedDates(args.confirmSnapshot, current, args.today).length === 0)
  ) {
    return { status: 'no_plan', changedSinceConfirm: [], changedSinceNotice: [] }
  }
  if (!args.notified) {
    return { status: 'not_notified', changedSinceConfirm: [], changedSinceNotice: [] }
  }
  if (!args.confirmSnapshot) {
    return { status: 'waiting', changedSinceConfirm: [], changedSinceNotice }
  }
  const changedSinceConfirm = changedDates(args.confirmSnapshot, current, args.today)
  if (changedSinceConfirm.length === 0) {
    // 確認のあと変わっていなければ、知らせ直しも要らない
    return { status: 'confirmed', changedSinceConfirm: [], changedSinceNotice: [] }
  }
  return { status: 'changed', changedSinceConfirm, changedSinceNotice }
}

/**
 * 保護者の画面に出す状態。
 *
 * 施設が予定を直している途中で「変わりました」が出ないよう、確認のあとの変更は
 * スタッフが「変更を知らせる」を押してはじめて保護者に出す。
 * 出す変わった日は、確認したときと、最後に知らせたときの予定の違い。
 */
export function parentWeekState(
  state: ChildWeekState,
  args: {
    noticeSnapshot: DaySnapshot | undefined
    confirmSnapshot: DaySnapshot | undefined
    lastNotifiedAt: string
    confirmedAt: string | null
    today: string
  }
): ChildWeekState {
  if (state.status !== 'changed') return state
  const notifiedAfterConfirm = !!args.confirmedAt && args.lastNotifiedAt > args.confirmedAt
  const announced = notifiedAfterConfirm
    ? changedDates(args.confirmSnapshot, args.noticeSnapshot ?? {}, args.today)
    : []
  if (announced.length === 0) {
    return { status: 'confirmed', changedSinceConfirm: [], changedSinceNotice: [] }
  }
  return { ...state, changedSinceConfirm: announced }
}

/** 保護者に見せる、その日の予定の1行（例：「11/18（火）14:30〜17:30」「11/19（水）お休み」） */
export function dayLine(d: FacilityScheduleDay): string {
  const date = toUtc(d.date)
  const dow = ['日', '月', '火', '水', '木', '金', '土'][date.getUTCDay()]
  const head = `${date.getUTCMonth() + 1}/${date.getUTCDate()}（${dow}）`
  if (d.kind === 'absent') return `${head} お休み`
  const start = d.service_start_time?.slice(0, 5)
  const end = d.service_end_time?.slice(0, 5)
  return start || end ? `${head} ${start ?? ''}〜${end ?? ''}` : head
}

/** 「11/17（月）〜11/23（日）」 */
export function weekLabel(weekStart: string): string {
  const s = toUtc(weekStart)
  const e = toUtc(weekEnd(weekStart))
  return `${s.getUTCMonth() + 1}/${s.getUTCDate()}（月）〜${e.getUTCMonth() + 1}/${e.getUTCDate()}（日）`
}

/** 「11/18（火）」 */
export function shortDate(date: string): string {
  const d = toUtc(date)
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getUTCDay()]
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${dow}）`
}
