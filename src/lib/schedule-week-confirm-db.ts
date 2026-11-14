import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadFacilitySchedule } from '@/lib/parent-usage-contact'
import type { FacilityScheduleDay } from '@/components/parent/usage-contact-calendar'
import { getTodayJST } from '@/lib/utils'
import {
  buildWeekSnapshots,
  childWeekState,
  daySignature,
  monthsOfWeek,
  parentWeekState,
  weekEnd,
  weekStartOf,
  type ChildWeekState,
  type DaySnapshot,
} from '@/lib/schedule-week-confirm'

/**
 * 週ごとの予定のお知らせと、保護者の「確認しました」の読み書き。
 *
 * 予定の中身は保護者の利用連絡カレンダーと同じ loadFacilitySchedule で作る。
 * 保護者に見せている予定と、確認の判定に使う予定を食い違わせないため。
 * 保護者の API でもスタッフの画面でも同じ結果になるよう、読み書きは service role で行う
 * （呼ぶ側で「職員か」「自分の子か」を確かめてから呼ぶ）。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

let adminSingleton: Admin | null = null
export function getAdminClient(): Admin {
  if (!adminSingleton) {
    adminSingleton = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return adminSingleton
}

/** 表がまだ無い（migration 187 を当てる前）ときのエラーか */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /schedule_week_/.test(error.message ?? '') && /does not exist|Could not find/.test(error.message ?? '')
}

export type NoticeRow = {
  week_start: string
  first_notified_at: string
  last_notified_at: string
  notify_count: number
  snapshot: Record<string, DaySnapshot>
}

export type ConfirmationRow = {
  child_id: string
  week_start: string
  confirmed_at: string
  snapshot: DaySnapshot
}

/** その週の施設の予定（児童ごとの要約と、日ごとの中身） */
export async function loadWeekSchedule(
  admin: Admin,
  childIds: string[],
  weekStart: string
): Promise<{ schedule: FacilityScheduleDay[]; snapshots: Map<string, DaySnapshot> }> {
  if (childIds.length === 0) return { schedule: [], snapshots: new Map() }
  const end = weekEnd(weekStart)
  const parts = await Promise.all(
    monthsOfWeek(weekStart).map((m) => loadFacilitySchedule(admin, childIds, m.year, m.month))
  )
  const schedule = parts.flat().filter((d) => d.date >= weekStart && d.date <= end)
  return { schedule, snapshots: buildWeekSnapshots(schedule, weekStart) }
}

/** 在籍中の児童（テスト用の児童も含む。施設の画面と同じ） */
async function loadActiveChildren(admin: Admin): Promise<{ id: string; name: string }[]> {
  const { data } = await admin
    .from('children')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
  return (data ?? []) as { id: string; name: string }[]
}

async function loadNotice(admin: Admin, weekStart: string) {
  const { data, error } = await admin
    .from('schedule_week_notices')
    .select('week_start, first_notified_at, last_notified_at, notify_count, snapshot')
    .eq('week_start', weekStart)
    .maybeSingle()
  return { notice: (data ?? null) as NoticeRow | null, error }
}

async function loadConfirmations(admin: Admin, weekStart: string, childIds?: string[]) {
  let query = admin
    .from('schedule_week_confirmations')
    .select('child_id, week_start, confirmed_at, snapshot')
    .eq('week_start', weekStart)
  if (childIds) query = query.in('child_id', childIds)
  const { data, error } = await query
  return { rows: (data ?? []) as ConfirmationRow[], error }
}

// ─────────────────────────────── スタッフ ───────────────────────────────

export type StaffWeekRow = ChildWeekState & {
  childId: string
  childName: string
  confirmedAt: string | null
}

export type StaffWeekOverview =
  | { ready: false; reason: 'not_installed' | 'error' }
  | {
      ready: true
      weekStart: string
      notice: Pick<NoticeRow, 'first_notified_at' | 'last_notified_at' | 'notify_count'> | null
      rows: StaffWeekRow[]
    }

/** 利用状況の画面に出す、その週の児童ごとの確認の状態 */
export async function loadStaffWeekOverview(weekStart: string): Promise<StaffWeekOverview> {
  const admin = getAdminClient()
  const [{ notice, error: noticeError }, { rows: confirmations, error: confirmError }] = await Promise.all([
    loadNotice(admin, weekStart),
    loadConfirmations(admin, weekStart),
  ])
  if (isMissingTable(noticeError) || isMissingTable(confirmError)) return { ready: false, reason: 'not_installed' }
  if (noticeError) throw new Error(noticeError.message)
  if (confirmError) throw new Error(confirmError.message)

  const children = await loadActiveChildren(admin)
  const { snapshots } = await loadWeekSchedule(admin, children.map((c) => c.id), weekStart)
  const confirmByChild = new Map(confirmations.map((c) => [c.child_id, c]))
  const today = getTodayJST()

  const rows: StaffWeekRow[] = []
  for (const child of children) {
    const confirmation = confirmByChild.get(child.id)
    const state = childWeekState({
      current: snapshots.get(child.id),
      notified: !!notice,
      noticeSnapshot: notice?.snapshot?.[child.id],
      confirmSnapshot: confirmation?.snapshot,
      today,
    })
    if (state.status === 'no_plan') continue
    rows.push({
      ...state,
      childId: child.id,
      childName: child.name,
      confirmedAt: confirmation?.confirmed_at ?? null,
    })
  }

  return {
    ready: true,
    weekStart,
    notice: notice
      ? {
          first_notified_at: notice.first_notified_at,
          last_notified_at: notice.last_notified_at,
          notify_count: notice.notify_count,
        }
      : null,
    rows,
  }
}

/**
 * 「この週の予定を保護者に知らせる」。押した時点の全児童の予定を残す。
 * 2回目からは「変更を知らせる」の意味になり、残す予定を今のものに置きかえる。
 */
export async function notifyWeek(weekStart: string, userId: string): Promise<{ error?: string }> {
  const admin = getAdminClient()
  const children = await loadActiveChildren(admin)
  const { snapshots } = await loadWeekSchedule(admin, children.map((c) => c.id), weekStart)
  const snapshot = Object.fromEntries(snapshots)

  const { notice, error: loadError } = await loadNotice(admin, weekStart)
  if (isMissingTable(loadError)) return { error: 'この機能は準備中です' }
  if (loadError) return { error: loadError.message }

  const now = new Date().toISOString()
  const { error } = notice
    ? await admin
        .from('schedule_week_notices')
        .update({
          last_notified_at: now,
          notified_by: userId,
          notify_count: notice.notify_count + 1,
          snapshot,
        })
        .eq('week_start', weekStart)
    : await admin.from('schedule_week_notices').insert({
        week_start: weekStart,
        first_notified_at: now,
        last_notified_at: now,
        notified_by: userId,
        notify_count: 1,
        snapshot,
      })
  return error ? { error: error.message } : {}
}

// ─────────────────────────────── 保護者 ───────────────────────────────

export type ParentWeekChild = ChildWeekState & {
  childId: string
  childName: string
  days: FacilityScheduleDay[]
  confirmedAt: string | null
}

export type ParentWeek = {
  weekStart: string
  children: ParentWeekChild[]
}

/**
 * 保護者に見せる「予定の確認」。知らせが届いていて、まだ終わっていない週
 * （今週と来週以降）を、その保護者の子の分だけ返す。
 */
export async function loadParentWeeks(
  children: { id: string; name: string }[]
): Promise<{ ready: boolean; weeks: ParentWeek[] }> {
  if (children.length === 0) return { ready: true, weeks: [] }
  const admin = getAdminClient()
  const today = getTodayJST()
  const thisWeek = weekStartOf(today)

  const { data: noticeRows, error } = await admin
    .from('schedule_week_notices')
    .select('week_start, first_notified_at, last_notified_at, notify_count, snapshot')
    .gte('week_start', thisWeek)
    .order('week_start')
    .limit(4)
  if (isMissingTable(error)) return { ready: false, weeks: [] }
  if (error) throw new Error(error.message)

  const childIds = children.map((c) => c.id)
  const weeks: ParentWeek[] = []
  for (const notice of (noticeRows ?? []) as NoticeRow[]) {
    const [{ schedule, snapshots }, { rows: confirmations }] = await Promise.all([
      loadWeekSchedule(admin, childIds, notice.week_start),
      loadConfirmations(admin, notice.week_start, childIds),
    ])
    const confirmByChild = new Map(confirmations.map((c) => [c.child_id, c]))
    const weekChildren: ParentWeekChild[] = []
    for (const child of children) {
      const confirmation = confirmByChild.get(child.id)
      const staffState = childWeekState({
        current: snapshots.get(child.id),
        notified: true,
        noticeSnapshot: notice.snapshot?.[child.id],
        confirmSnapshot: confirmation?.snapshot,
        today,
      })
      if (staffState.status === 'no_plan') continue
      // 確認のあとの変更は、スタッフが「変更を知らせる」を押すまで保護者には出さない
      const state = parentWeekState(staffState, {
        noticeSnapshot: notice.snapshot?.[child.id],
        confirmSnapshot: confirmation?.snapshot,
        lastNotifiedAt: notice.last_notified_at,
        confirmedAt: confirmation?.confirmed_at ?? null,
        today,
      })
      weekChildren.push({
        ...state,
        childId: child.id,
        childName: child.name,
        days: schedule
          .filter((d) => d.child_id === child.id)
          .sort((a, b) => a.date.localeCompare(b.date)),
        confirmedAt: confirmation?.confirmed_at ?? null,
      })
    }
    if (weekChildren.length > 0) weeks.push({ weekStart: notice.week_start, children: weekChildren })
  }
  return { ready: true, weeks }
}

/**
 * 保護者の「確認しました」。その週に予定があるわが子の分を、今の予定でまとめて確認ずみにする。
 * 知らせが届いていない週は確認できない（何を確認したのかが残らないため）。
 */
export async function confirmWeek(
  childIds: string[],
  weekStart: string,
  userId: string
): Promise<{ error?: string; confirmed: number }> {
  const admin = getAdminClient()
  const { notice, error: noticeError } = await loadNotice(admin, weekStart)
  if (isMissingTable(noticeError)) return { error: 'この機能は準備中です', confirmed: 0 }
  if (noticeError) return { error: noticeError.message, confirmed: 0 }
  if (!notice) return { error: 'この週の予定は、まだ施設から届いていません', confirmed: 0 }

  const [{ snapshots }, { rows: earlier }] = await Promise.all([
    loadWeekSchedule(admin, childIds, weekStart),
    loadConfirmations(admin, weekStart, childIds),
  ])
  // 予定がある子に加えて、前に確認した子も記録し直す。確認のあとで週の予定が
  // すべてなくなった子は、ここで空の予定を確認すれば一覧から消える
  const confirmedBefore = new Set(earlier.map((r) => r.child_id))
  const now = new Date().toISOString()
  const rows = childIds
    .filter((id) => snapshots.has(id) || confirmedBefore.has(id))
    .map((id) => ({
      child_id: id,
      week_start: weekStart,
      confirmed_at: now,
      confirmed_by: userId,
      snapshot: snapshots.get(id) ?? {},
    }))
  if (rows.length === 0) return { confirmed: 0 }

  const { error } = await admin
    .from('schedule_week_confirmations')
    .upsert(rows, { onConflict: 'child_id,week_start' })
  return error ? { error: error.message, confirmed: 0 } : { confirmed: rows.length }
}

// ─────────────────────── 保護者が自分で変えたとき ───────────────────────

/** 要約のうち1日分だけを、今の中身に置きかえる（その日の予定がなくなったら消す） */
function withDay(snapshot: DaySnapshot | undefined, date: string, sig: string | undefined): DaySnapshot {
  const next = { ...(snapshot ?? {}) }
  if (sig === undefined) delete next[date]
  else next[date] = sig
  return next
}

/**
 * 保護者の利用連絡を予定に反映する（承認する）ときに包む。
 *
 * 保護者が自分で変えた日は「保護者はもう知っている」ので、その日だけ
 * 確認したとき・知らせたときの記録を反映後の中身に追いつかせる。
 * ほかの日（施設が変えた日）はそのままにするので、施設の変更は「変更後まだ」に残る。
 *
 * 表が無い・失敗したときも、承認そのものは止めない（記録だけ残す）。
 */
export async function withParentChangeAck<T>(
  childId: string,
  date: string,
  apply: () => Promise<T>
): Promise<T> {
  const result = await apply()
  try {
    const admin = getAdminClient()
    const weekStart = weekStartOf(date)
    const [{ rows }, { notice }] = await Promise.all([
      loadConfirmations(admin, weekStart, [childId]),
      loadNotice(admin, weekStart),
    ])
    const confirmation = rows[0]
    if (!confirmation && !notice) return result

    // 反映後のその日の中身（同じ月の予定だけ読めばよい）
    const daySchedule = await loadFacilitySchedule(
      admin,
      [childId],
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7))
    )
    const day = daySchedule.find((d) => d.child_id === childId && d.date === date)
    const sig = day ? daySignature(day) : undefined

    if (confirmation) {
      await admin
        .from('schedule_week_confirmations')
        .update({ snapshot: withDay(confirmation.snapshot, date, sig) })
        .eq('child_id', childId)
        .eq('week_start', weekStart)
    }
    if (notice) {
      // ほかの児童の分は触らない。書く直前に読み直して、重なった書きこみで消さないようにする
      const { notice: latest } = await loadNotice(admin, weekStart)
      if (latest) {
        await admin
          .from('schedule_week_notices')
          .update({
            snapshot: { ...latest.snapshot, [childId]: withDay(latest.snapshot?.[childId], date, sig) },
          })
          .eq('week_start', weekStart)
      }
    }
  } catch (err) {
    console.error('[schedule-week-confirm] 確認の記録を追いつかせられませんでした', err)
  }
  return result
}
