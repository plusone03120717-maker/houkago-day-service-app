import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** スタッフ/管理者のみ許可。権限があれば null、なければエラーレスポンスを返す */
async function requireStaff(): Promise<NextResponse | null> {
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
  return null
}

export async function POST(req: NextRequest) {
  const denied = await requireStaff()
  if (denied) return denied

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

export async function DELETE(req: NextRequest) {
  const denied = await requireStaff()
  if (denied) return denied

  const { code } = await req.json() as { code?: string }
  if (!code) {
    return NextResponse.json({ error: 'code が必要です' }, { status: 400 })
  }

  // 使用済みコードを消しても既存の保護者紐付け（guardian_children）は残るため、
  // 発行履歴の整理として未使用・使用済みどちらも削除できる。
  const { error } = await adminClient
    .from('registration_codes')
    .delete()
    .eq('code', code.toUpperCase())

  if (error) {
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
