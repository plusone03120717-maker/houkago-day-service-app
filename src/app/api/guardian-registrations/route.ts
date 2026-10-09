import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { ensurePortalAccountForGuardian } from '@/lib/parent-account-link'
import { getSessionUserId } from '@/lib/auth'

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/** スタッフ/管理者のみ許可。権限があればユーザーID、なければエラーレスポンスを返す */
async function requireStaff(): Promise<{ userId: string } | NextResponse> {
  const userId = await getSessionUserId()
  if (!userId) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  // 権限は書き換えられる user_metadata ではなく users テーブルで確かめる
  const supabase = await createClient()
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (!userData || !['admin', 'staff'].includes(userData.role)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }
  return { userId }
}

type Body =
  | { action: 'approve'; requestId: string; childIds: string[] }
  | { action: 'reject'; requestId: string }
  | { action: 'link'; guardianId: string; childId: string }
  | { action: 'unlink'; guardianId: string; childId: string }

/** 保護者（LINE）に児童を紐付け、ポータルのアカウントにも反映する */
async function linkChildren(guardianId: string, childIds: string[], displayName?: string | null) {
  const { error } = await adminClient
    .from('guardian_children')
    .upsert(
      childIds.map((child_id) => ({ guardian_id: guardianId, child_id })),
      { onConflict: 'guardian_id,child_id', ignoreDuplicates: true }
    )
  if (error) throw error
  // すでにポータルのアカウントがあれば新しい児童もそこへ紐付け、無ければ作る
  await ensurePortalAccountForGuardian(adminClient, guardianId, displayName)
}

/**
 * 保護者のLINE登録の承認・却下と、登録済み保護者への児童（きょうだい）の紐付け・解除。
 * 画面は「保護者ポータル → 保護者のLINE登録」。
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff()
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json() as Body

    if (body.action === 'approve' || body.action === 'reject') {
      const { data: requestRaw } = await adminClient
        .from('guardian_registration_requests')
        .select('id, line_user_id, line_display_name, status')
        .eq('id', body.requestId)
        .maybeSingle()
      const request = requestRaw as {
        id: string
        line_user_id: string
        line_display_name: string | null
        status: string
      } | null
      if (!request) return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 })
      if (request.status !== 'pending') {
        return NextResponse.json({ error: 'この申請はすでに処理されています' }, { status: 409 })
      }

      const reviewed = { reviewed_by: auth.userId, reviewed_at: new Date().toISOString() }

      if (body.action === 'reject') {
        await adminClient
          .from('guardian_registration_requests')
          .update({ status: 'rejected', ...reviewed })
          .eq('id', request.id)
        return NextResponse.json({ ok: true })
      }

      const childIds = [...new Set(body.childIds ?? [])].filter(Boolean)
      if (childIds.length === 0) {
        return NextResponse.json({ error: '紐付ける児童を選んでください' }, { status: 400 })
      }

      // 同じLINEアカウントの保護者がすでにいれば（登録コードで登録済みなど）それを使う
      const { data: guardianRaw, error: guardianError } = await adminClient
        .from('guardians')
        .upsert(
          { line_user_id: request.line_user_id, name: request.line_display_name },
          { onConflict: 'line_user_id' }
        )
        .select('id')
        .single()
      if (guardianError || !guardianRaw) {
        console.error('[guardian-registrations] guardian upsert', guardianError)
        return NextResponse.json({ error: '保護者の登録に失敗しました' }, { status: 500 })
      }
      const guardianId = (guardianRaw as { id: string }).id

      await linkChildren(guardianId, childIds, request.line_display_name)

      await adminClient
        .from('guardian_registration_requests')
        .update({ status: 'approved', approved_child_id: childIds[0], ...reviewed })
        .eq('id', request.id)

      return NextResponse.json({ ok: true })
    }

    if (body.action === 'link') {
      if (!body.guardianId || !body.childId) {
        return NextResponse.json({ error: 'guardianId と childId が必要です' }, { status: 400 })
      }
      const { data: g } = await adminClient
        .from('guardians')
        .select('name')
        .eq('id', body.guardianId)
        .maybeSingle()
      if (!g) return NextResponse.json({ error: '保護者が見つかりません' }, { status: 404 })
      await linkChildren(body.guardianId, [body.childId], (g as { name: string | null }).name)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'unlink') {
      if (!body.guardianId || !body.childId) {
        return NextResponse.json({ error: 'guardianId と childId が必要です' }, { status: 400 })
      }
      const { data: gRaw } = await adminClient
        .from('guardians')
        .select('id, user_id')
        .eq('id', body.guardianId)
        .maybeSingle()
      const guardian = gRaw as { id: string; user_id: string | null } | null
      if (!guardian) return NextResponse.json({ error: '保護者が見つかりません' }, { status: 404 })

      await adminClient
        .from('guardian_children')
        .delete()
        .eq('guardian_id', guardian.id)
        .eq('child_id', body.childId)

      // ポータル側からも外す。ただし同じポータルアカウントを使う別のLINE保護者
      // （父母それぞれが登録している家庭）がまだその児童を見ているなら残す。
      if (guardian.user_id) {
        const { data: others } = await adminClient
          .from('guardians')
          .select('id')
          .eq('user_id', guardian.user_id)
          .neq('id', guardian.id)
        const otherIds = ((others ?? []) as { id: string }[]).map((o) => o.id)
        let stillLinked = false
        if (otherIds.length > 0) {
          const { count } = await adminClient
            .from('guardian_children')
            .select('*', { count: 'exact', head: true })
            .in('guardian_id', otherIds)
            .eq('child_id', body.childId)
          stillLinked = (count ?? 0) > 0
        }
        if (!stillLinked) {
          await adminClient
            .from('parent_children')
            .delete()
            .eq('user_id', guardian.user_id)
            .eq('child_id', body.childId)
        }
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: '不明な操作です' }, { status: 400 })
  } catch (err) {
    console.error('[guardian-registrations]', err)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
