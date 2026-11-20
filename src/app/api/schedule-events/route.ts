import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getSessionUserId } from '@/lib/auth'
import { hasEditAccess } from '@/lib/require-admin'
import { validateEventInput, type EventInput } from '@/lib/schedule-events'

/**
 * 全体スケジュールの予定（会議・モニタリング・行事・外部・その他）を足す・直す・消す。
 * 画面は「全体スケジュール」。書きこめるのはシステム管理者だけ（2026-11-20 依頼主）。
 * 参加スタッフの表（schedule_event_staff）はブラウザから書けない決まり（migration 175）なので、
 * ここでサーバーの鍵を使って書く。
 */

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Body =
  | { action: 'create'; event: EventInput }
  | { action: 'update'; id: string; event: EventInput }
  | { action: 'delete'; id: string }

function clean(v: EventInput): EventInput {
  const s = (x: unknown) => (typeof x === 'string' ? x.trim() : '')
  const allDay = !!v.all_day
  return {
    event_type: s(v.event_type),
    title: s(v.title),
    event_date: s(v.event_date),
    all_day: allDay,
    start_time: allDay ? null : s(v.start_time) || null,
    end_time: allDay ? null : s(v.end_time) || null,
    location: s(v.location) || null,
    note: s(v.note) || null,
    child_id: s(v.child_id) || null,
    staff_user_ids: Array.isArray(v.staff_user_ids)
      ? Array.from(new Set(v.staff_user_ids.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x))))
      : [],
  }
}

/** 子・参加スタッフが本当にいるかを確かめる（いない ID で保存しない） */
async function checkRefs(v: EventInput): Promise<string | null> {
  if (v.child_id) {
    if (!UUID_RE.test(v.child_id)) return '対象の子が正しくありません'
    const { data } = await adminClient.from('children').select('id').eq('id', v.child_id).maybeSingle()
    if (!data) return '対象の子が見つかりません'
  }
  if (v.staff_user_ids.length > 0) {
    const { data } = await adminClient.from('users').select('id').in('id', v.staff_user_ids)
    if ((data ?? []).length !== v.staff_user_ids.length) return '参加スタッフに見つからない人がいます'
  }
  return null
}

async function writeStaff(eventId: string, staffUserIds: string[]): Promise<string | null> {
  const del = await adminClient.from('schedule_event_staff').delete().eq('event_id', eventId)
  if (del.error) return del.error.message
  if (staffUserIds.length === 0) return null
  const ins = await adminClient
    .from('schedule_event_staff')
    .insert(staffUserIds.map((staff_id) => ({ event_id: eventId, staff_id })))
  return ins.error?.message ?? null
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId()
  if (!userId) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 })
  if (!(await hasEditAccess())) {
    return NextResponse.json({ error: '予定を書きこめるのはシステム管理者だけです' }, { status: 403 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: '送られた内容が読めません' }, { status: 400 })
  }

  try {
    if (body.action === 'delete') {
      if (!UUID_RE.test(body.id ?? '')) return NextResponse.json({ error: '予定が正しくありません' }, { status: 400 })
      const { error, count } = await adminClient
        .from('schedule_events')
        .delete({ count: 'exact' })
        .eq('id', body.id)
      if (error) throw error
      if (!count) return NextResponse.json({ error: 'その予定はもうありません' }, { status: 404 })
      return NextResponse.json({ ok: true })
    }

    if (body.action !== 'create' && body.action !== 'update') {
      return NextResponse.json({ error: '操作が正しくありません' }, { status: 400 })
    }

    const v = clean(body.event ?? ({} as EventInput))
    const problem = validateEventInput(v) ?? (await checkRefs(v))
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })

    // 同じ子・同じ日のモニタリングは1つだけ（児童管理 → モニタリングの「モニタリング予定」と同じ表なので、二重に入れない）
    if (v.event_type === 'monitoring' && v.child_id) {
      let dup = adminClient
        .from('schedule_events')
        .select('id')
        .eq('event_type', 'monitoring')
        .eq('child_id', v.child_id)
        .eq('event_date', v.event_date)
      if (body.action === 'update') dup = dup.neq('id', body.id)
      const { data: dupRows, error: dupError } = await dup.limit(1)
      if (dupError) throw dupError
      if ((dupRows ?? []).length > 0) {
        return NextResponse.json(
          { error: 'この子のモニタリングは、その日にもう入っています（児童管理のモニタリング予定と同じものです）。入っている予定を直してください' },
          { status: 409 },
        )
      }
    }

    const row = {
      event_type: v.event_type,
      title: v.title,
      event_date: v.event_date,
      all_day: v.all_day,
      start_time: v.start_time,
      end_time: v.end_time,
      location: v.location,
      note: v.note,
      child_id: v.child_id,
      updated_at: new Date().toISOString(),
    }

    let eventId: string
    if (body.action === 'create') {
      const { data: facility } = await adminClient.from('facilities').select('id').limit(1).maybeSingle()
      const { data, error } = await adminClient
        .from('schedule_events')
        .insert({ ...row, facility_id: facility?.id ?? null, created_by: userId })
        .select('id')
        .single()
      if (error) throw error
      eventId = data.id as string
    } else {
      if (!UUID_RE.test(body.id ?? '')) return NextResponse.json({ error: '予定が正しくありません' }, { status: 400 })
      const { data, error } = await adminClient
        .from('schedule_events')
        .update(row)
        .eq('id', body.id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) return NextResponse.json({ error: 'その予定はもうありません' }, { status: 404 })
      eventId = body.id
    }

    const staffError = await writeStaff(eventId, v.staff_user_ids)
    if (staffError) {
      console.error('[schedule-events] staff', staffError)
      return NextResponse.json(
        { error: '予定は保存しましたが、参加スタッフを保存できませんでした。もう一度「直す」から保存してください', id: eventId },
        { status: 500 },
      )
    }
    return NextResponse.json({ ok: true, id: eventId })
  } catch (err) {
    console.error('[schedule-events]', err)
    return NextResponse.json({ error: '保存できませんでした。時間をおいてもう一度試してください' }, { status: 500 })
  }
}
