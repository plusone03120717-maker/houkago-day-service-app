import type { SupabaseClient } from '@supabase/supabase-js'
import { buildUsageRoster } from '@/lib/usage-roster'
import { unitCourseOf, type UnitCourse } from '@/lib/unit-course'

/**
 * ある1日の利用者（来る子）の一覧。全体スケジュール（PC）と、スタッフ LINE の「会議・予定」のカレンダーで日を押したときに出す。
 * 顔ぶれはダッシュボードの「本日の利用予定」・出席管理と同じ判定（予約・利用計画・出欠記録の3つを buildUsageRoster でまとめる）。
 * 欠席の記録がある子は absent として別に返す（人数には数えない）。
 */

export type DayUserStatus = 'attended' | 'confirmed' | 'reserved' | 'plan' | 'absent'

export type DayUser = {
  childId: string
  name: string
  unitName: string | null
  course: UnitCourse
  status: DayUserStatus
}

export const DAY_USER_STATUS_LABEL: Record<DayUserStatus, string> = {
  attended: '出席済',
  confirmed: '確定',
  reserved: '承認待ち',
  plan: '定期',
  absent: 'お休み',
}

type Named = { children: { name: string; name_kana?: string | null } | null; units: { name: string } | null }

export async function loadDayUsers(
  client: SupabaseClient,
  date: string,
): Promise<{ users: DayUser[]; absent: DayUser[] }> {
  const dow = new Date(date + 'T00:00:00').getDay()

  const [resRes, planRes, ovRes, attRes] = await Promise.all([
    client
      .from('usage_reservations')
      .select('id, child_id, status, date, requested_by, children(name, name_kana), units(name)')
      .eq('date', date)
      .in('status', ['confirmed', 'reserved', 'cancel_waiting']),
    client
      .from('usage_plans')
      .select('id, child_id, start_date, end_date, day_of_week, children(name, name_kana), units(name)')
      .eq('is_active', true)
      .lte('start_date', date)
      .or(`end_date.is.null,end_date.gte.${date}`)
      .contains('day_of_week', [dow]),
    client.from('usage_plan_date_overrides').select('plan_id, date, is_cancelled').eq('date', date),
    client.from('daily_attendance').select('child_id, date, status, children(name, name_kana), units(name)').eq('date', date),
  ])
  for (const r of [resRes, planRes, ovRes, attRes]) if (r.error) throw r.error

  type Res = Named & { id: string; child_id: string; status: string; date: string; requested_by: string | null }
  type Plan = Named & { id: string; child_id: string; start_date: string; end_date: string | null; day_of_week: number[] | null }
  type Att = Named & { child_id: string; date: string; status: string }
  const reservations = (resRes.data ?? []) as unknown as Res[]
  const plans = (planRes.data ?? []) as unknown as Plan[]
  const attendances = (attRes.data ?? []) as unknown as Att[]

  // 名前・ユニットは出欠記録 → 計画 → 予約の順に拾い、あとのもので上書きする（ダッシュボードと同じ）
  const display = new Map<string, { name: string; kana: string; unitName: string | null }>()
  for (const row of [...attendances, ...plans, ...reservations]) {
    if (row.children) {
      display.set(row.child_id, {
        name: row.children.name,
        kana: row.children.name_kana ?? row.children.name,
        unitName: row.units?.name ?? null,
      })
    }
  }
  const attendanceStatus = new Map(attendances.map((a) => [a.child_id, a.status]))

  const roster = buildUsageRoster({
    dates: [date],
    reservations,
    plans,
    overrides: (ovRes.data ?? []) as { plan_id: string; date: string; is_cancelled: boolean }[],
    attendances,
  }).get(date) ?? []

  const users: (DayUser & { kana: string })[] = []
  const absent: (DayUser & { kana: string })[] = []
  for (const e of roster) {
    if (!e.planned) continue
    const d = display.get(e.childId)
    const base = {
      childId: e.childId,
      name: d?.name ?? '—',
      kana: d?.kana ?? '',
      unitName: d?.unitName ?? null,
      course: unitCourseOf(d?.unitName),
    }
    if (e.counts) {
      const status: DayUserStatus =
        attendanceStatus.get(e.childId) === 'attended'
          ? 'attended'
          : e.reservation?.status === 'confirmed'
            ? 'confirmed'
            : e.reservation?.status === 'reserved' || e.reservation?.status === 'cancel_waiting'
              ? 'reserved'
              : 'plan'
      users.push({ ...base, status })
    } else if (e.absent) {
      absent.push({ ...base, status: 'absent' })
    }
  }

  const order: Record<UnitCourse, number> = { day: 0, english: 1, pc: 2 }
  const sort = (a: { course: UnitCourse; kana: string }, b: { course: UnitCourse; kana: string }) =>
    order[a.course] - order[b.course] || a.kana.localeCompare(b.kana, 'ja')
  const strip = (u: DayUser & { kana: string }): DayUser => ({
    childId: u.childId, name: u.name, unitName: u.unitName, course: u.course, status: u.status,
  })
  return { users: users.sort(sort).map(strip), absent: absent.sort(sort).map(strip) }
}
