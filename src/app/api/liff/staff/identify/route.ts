import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type StaffRow = { id: string; name: string; user_id: string | null }

async function findStaffByLineUserId(lineUserId: string): Promise<StaffRow | null> {
  // 重複行があっても最初の1件を取得する
  const { data: rows } = await adminClient
    .from('staff_members')
    .select('id, name, user_id')
    .eq('line_user_id', lineUserId)
    .limit(1)
  if (rows && (rows as StaffRow[]).length > 0) return (rows as StaffRow[])[0]

  // users.line_user_id → staff_members.user_id で検索（ログインありスタッフ）
  const { data: userRows } = await adminClient
    .from('users')
    .select('id')
    .eq('line_user_id', lineUserId)
    .limit(1)
  const linkedUser = userRows && (userRows as { id: string }[]).length > 0 ? (userRows as { id: string }[])[0] : null
  if (!linkedUser) return null

  const { data: memberRows } = await adminClient
    .from('staff_members')
    .select('id, name, user_id')
    .eq('user_id', linkedUser.id)
    .limit(1)
  const member = memberRows && (memberRows as StaffRow[]).length > 0 ? (memberRows as StaffRow[])[0] : null
  if (!member) return null

  await adminClient
    .from('staff_members')
    .update({ line_user_id: lineUserId } as never)
    .eq('id', member.id)

  return member
}

export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await req.json() as { accessToken?: string }
    if (!accessToken) return NextResponse.json({ error: 'accessToken が必要です' }, { status: 400 })

    const lineUserId = await verifyLineAccessToken(accessToken)

    const staffRow = await findStaffByLineUserId(lineUserId)

    if (!staffRow) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 })
    }

    return NextResponse.json({
      staff: {
        staffMemberId: staffRow.id,
        userId: staffRow.user_id ?? null,
        name: staffRow.name,
      },
    })
  } catch (err) {
    console.error('[liff/staff/identify]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
