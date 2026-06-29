import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  // Supabaseセッションでスタッフ/管理者のみ許可
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!userData || !['admin', 'staff'].includes(userData.role)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const { childId, code } = await req.json() as { childId?: string; code?: string }
  if (!childId || !code) {
    return NextResponse.json({ error: 'childId と code が必要です' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('registration_codes')
    .insert({ code: code.toUpperCase(), child_id: childId, used: false })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'このコードはすでに存在します' }, { status: 409 })
    }
    return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, code })
}
