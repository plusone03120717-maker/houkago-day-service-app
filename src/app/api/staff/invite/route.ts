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
  const { email, name, role } = body
  if (!email || !name) {
    return NextResponse.json({ error: 'email と name は必須です' }, { status: 400 })
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      data: { name, role: role ?? 'staff' },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/login`,
    }
  )

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  // users テーブルに登録
  if (inviteData?.user) {
    await supabase.from('users').upsert({
      id: inviteData.user.id,
      name,
      email,
      role: role ?? 'staff',
    })
  }

  return NextResponse.json({ success: true })
}
