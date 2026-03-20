import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 管理者権限チェック
  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!currentUser || currentUser.role !== 'admin') {
    return NextResponse.json({ error: '管理者のみ招待できます' }, { status: 403 })
  }

  const body = await request.json()
  const { email, name, childId } = body as { email: string; name: string; childId: string }
  if (!email || !name || !childId) {
    return NextResponse.json({ error: 'email, name, childId は必須です' }, { status: 400 })
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      data: { name, role: 'parent' },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/login`,
    }
  )

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  if (inviteData?.user) {
    // users テーブルに登録
    await adminClient.from('users').upsert({
      id: inviteData.user.id,
      name,
      email,
      role: 'parent',
    })

    // parent_children に紐付け
    await adminClient.from('parent_children').upsert({
      user_id: inviteData.user.id,
      child_id: childId,
    })
  }

  return NextResponse.json({ success: true })
}
