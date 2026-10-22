import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { canManageAccountOf } from '@/lib/roles'

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 管理者権限チェック
  const { data: currentUser } = await supabase
    .from('users')
    .select('role, job_titles')
    .eq('id', user.id)
    .single()
  if (!currentUser || currentUser.role !== 'admin') {
    return NextResponse.json({ error: '管理者のみ削除できます' }, { status: 403 })
  }

  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'userId は必須です' }, { status: 400 })

  // 自分自身は削除不可
  if (userId === user.id) {
    return NextResponse.json({ error: '自分自身は削除できません' }, { status: 400 })
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: target } = await adminClient
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (!canManageAccountOf(currentUser.role, currentUser.job_titles, target?.role ?? null)) {
    return NextResponse.json({ error: 'システム管理者・施設長のアカウントは、システム管理者だけが削除できます' }, { status: 403 })
  }

  // users テーブルから削除（CASCADE で staff_profiles 等も削除される）
  const { error: deleteError } = await adminClient
    .from('users')
    .delete()
    .eq('id', userId)
  if (deleteError) {
    return NextResponse.json(
      { error: `関連データが残っているため削除できません: ${deleteError.message}` },
      { status: 500 }
    )
  }

  // Supabase Auth からも削除
  const { error: authError } = await adminClient.auth.admin.deleteUser(userId)
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
