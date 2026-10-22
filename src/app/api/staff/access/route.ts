import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getStaffAccess } from '@/lib/require-admin'
import { FACILITY_MANAGER, SERVICE_MANAGER, canManageAccountOf, isFacilityManager } from '@/lib/roles'

/** 画面から付けられる追加の役職（施設長はログイン権限の側で扱う） */
const EXTRA_JOB_TITLES = [SERVICE_MANAGER, 'driver', 'therapist', 'nurse']

type Access = 'staff' | 'facility_manager' | 'admin'

/**
 * スタッフのログイン権限（スタッフ／施設長／システム管理者）と追加の役職、LINE User ID を保存する。
 *
 * users.role・users.job_titles は本人がブラウザから書き換えられないよう DB 側で止めている
 * （migration 174）ため、ここで権限を確かめてから service role で書く。
 * - ログイン権限を変えられるのはシステム管理者だけ。自分自身の権限は変えられない
 * - 施設長は、スタッフの追加の役職（サービス管理者・ドライバーなど）だけ変えられる
 */
export async function POST(request: NextRequest) {
  const actor = await getStaffAccess()
  if (!actor) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: '管理者のみ変更できます' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const userId = typeof body.userId === 'string' ? body.userId : ''
  if (!userId) return NextResponse.json({ error: 'userId は必須です' }, { status: 400 })
  const requestedAccess: Access | undefined =
    body.access === 'staff' || body.access === 'facility_manager' || body.access === 'admin'
      ? body.access
      : undefined
  const extraTitles: string[] = Array.isArray(body.jobTitles)
    ? (body.jobTitles as unknown[]).filter((t): t is string => typeof t === 'string' && EXTRA_JOB_TITLES.includes(t))
    : []

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: target } = await adminClient
    .from('users')
    .select('role, job_titles')
    .eq('id', userId)
    .maybeSingle()
  if (!target || (target.role !== 'admin' && target.role !== 'staff')) {
    return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 })
  }
  if (!canManageAccountOf(actor.role, actor.jobTitles, target.role)) {
    return NextResponse.json(
      { error: 'システム管理者・施設長の役職は、システム管理者だけが変更できます' },
      { status: 403 }
    )
  }

  const currentAccess: Access = isFacilityManager(target.role, target.job_titles)
    ? 'facility_manager'
    : (target.role as 'admin' | 'staff')
  const nextAccess = requestedAccess ?? currentAccess

  if (nextAccess !== currentAccess) {
    if (!actor.canManageMoney) {
      return NextResponse.json(
        { error: 'ログイン権限を変更できるのは、システム管理者だけです' },
        { status: 403 }
      )
    }
    if (userId === actor.userId) {
      return NextResponse.json({ error: '自分自身のログイン権限は変更できません' }, { status: 400 })
    }
  }

  const role = nextAccess === 'staff' ? 'staff' : 'admin'
  const jobTitles = nextAccess === 'facility_manager' ? [FACILITY_MANAGER, ...extraTitles] : extraTitles
  const update: { role: string; job_titles: string[]; line_user_id?: string | null } = { role, job_titles: jobTitles }
  if (typeof body.lineUserId === 'string' || body.lineUserId === null) {
    update.line_user_id = body.lineUserId ? body.lineUserId.trim() || null : null
  }

  const { error: updateError } = await adminClient
    .from('users')
    .update(update)
    .eq('id', userId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // JWT の role（メニューの出し分け・requireAdmin）も合わせる。次にトークンが更新されたときに効く
  if (role !== target.role) {
    const { data: authUser } = await adminClient.auth.admin.getUserById(userId)
    await adminClient.auth.admin.updateUserById(userId, {
      user_metadata: { ...(authUser?.user?.user_metadata ?? {}), role },
    })
  }

  return NextResponse.json({ success: true, access: nextAccess, jobTitles })
}
