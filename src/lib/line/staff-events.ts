import type { SupabaseClient } from '@supabase/supabase-js'
import { hhmm } from '@/lib/schedule-events'

/**
 * スタッフ LINE の「会議・予定」タブで見せる予定を読む（from〜to・全員分）。
 * 自分（userId）が参加に入っている予定には mine を付ける。参加スタッフが0人の予定は forAll（全員）。
 */

type EventRow = {
  id: string
  title: string
  event_type: string
  event_date: string
  start_time: string | null
  end_time: string | null
  all_day: boolean
  location: string | null
  note: string | null
  child_id: string | null
}

export type StaffEventItem = {
  id: string
  date: string
  title: string
  eventType: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
  location: string | null
  note: string | null
  childNames: string[]
  /** 参加スタッフの名前。空なら全員 */
  staffNames: string[]
  forAll: boolean
  mine: boolean
}

export async function loadStaffEvents(
  adminClient: SupabaseClient,
  userId: string | null,
  from: string,
  to: string,
): Promise<StaffEventItem[]> {
  const { data: eventData, error } = await adminClient
    .from('schedule_events')
    .select('id, title, event_type, event_date, start_time, end_time, all_day, location, note, child_id')
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date')
    .order('start_time', { nullsFirst: true })
  if (error) throw error
  const rows = (eventData ?? []) as unknown as EventRow[]
  const ids = rows.map((e) => e.id)

  const staffByEvent = new Map<string, string[]>()
  const childIdsByEvent = new Map<string, string[]>()
  const nameByUserId = new Map<string, string>()
  const childNameById = new Map<string, string>()

  if (ids.length > 0) {
    const [esRes, ecRes] = await Promise.all([
    adminClient.from('schedule_event_staff').select('event_id, staff_id').in('event_id', ids),
    adminClient.from('schedule_event_children').select('event_id, child_id').in('event_id', ids),
    ])
    const es = (esRes.data ?? []) as { event_id: string; staff_id: string }[]
    const ec = (ecRes.data ?? []) as { event_id: string; child_id: string }[]
    for (const r of es) staffByEvent.set(r.event_id, [...(staffByEvent.get(r.event_id) ?? []), r.staff_id])
    for (const r of ec) childIdsByEvent.set(r.event_id, [...(childIdsByEvent.get(r.event_id) ?? []), r.child_id])

    const userIds = Array.from(new Set(es.map((r) => r.staff_id)))
    const childIds = Array.from(new Set([
    ...ec.map((r) => r.child_id),
    ...rows.map((e) => e.child_id).filter((v): v is string => !!v),
    ]))
    const [smRes, chRes] = await Promise.all([
    userIds.length > 0
      ? adminClient.from('staff_members').select('user_id, name').in('user_id', userIds)
      : Promise.resolve({ data: [] }),
    childIds.length > 0
      ? adminClient.from('children').select('id, name').in('id', childIds)
      : Promise.resolve({ data: [] }),
    ])
    for (const s of (smRes.data ?? []) as { user_id: string; name: string }[]) nameByUserId.set(s.user_id, s.name)
    for (const c of (chRes.data ?? []) as { id: string; name: string }[]) childNameById.set(c.id, c.name)
  }

  const events: StaffEventItem[] = rows.map((e) => {
    const staffIds = staffByEvent.get(e.id) ?? []
    const childIds = Array.from(new Set([...(e.child_id ? [e.child_id] : []), ...(childIdsByEvent.get(e.id) ?? [])]))
    return {
    id: e.id,
    date: e.event_date,
    title: e.title,
    eventType: e.event_type,
    startTime: hhmm(e.start_time),
    endTime: hhmm(e.end_time),
    allDay: e.all_day || !e.start_time,
    location: e.location,
    note: e.note,
    childNames: childIds.map((id) => childNameById.get(id)).filter((n): n is string => !!n),
    /** 参加スタッフの名前。空なら全員 */
    staffNames: staffIds.map((id) => nameByUserId.get(id) ?? '—'),
    forAll: staffIds.length === 0,
    mine: !!userId && staffIds.includes(userId),
    }
  })

  return events
}
