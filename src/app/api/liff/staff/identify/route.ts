import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await req.json() as { accessToken?: string }
    if (!accessToken) return NextResponse.json({ error: 'accessToken が必要です' }, { status: 400 })

    const lineUserId = await verifyLineAccessToken(accessToken)
    console.log('[identify] lineUserId:', lineUserId)

    // staff_members.line_user_id で検索
    const { data: staffRowData, error: staffRowError } = await adminClient
      .from('staff_members')
      .select('id, name, user_id')
      .eq('line_user_id', lineUserId)
      .maybeSingle()
    console.log('[identify] staff_members query data:', JSON.stringify(staffRowData))
    console.log('[identify] staff_members query error:', JSON.stringify(staffRowError))

    let staffRow = staffRowData as { id: string; name: string; user_id: string | null } | null

    if (!staffRow) {
      // users.line_user_id → staff_members.user_id で検索（ログインありスタッフ）
      const { data: linkedUser, error: userError } = await adminClient
        .from('users')
        .select('id')
        .eq('line_user_id', lineUserId)
        .maybeSingle()
      console.log('[identify] users query data:', JSON.stringify(linkedUser))
      console.log('[identify] users query error:', JSON.stringify(userError))

      if (linkedUser) {
        const { data: member } = await adminClient
          .from('staff_members')
          .select('id, name, user_id')
          .eq('user_id', (linkedUser as { id: string }).id)
          .maybeSingle()

        if (member) {
          await adminClient
            .from('staff_members')
            .update({ line_user_id: lineUserId } as never)
            .eq('id', (member as { id: string }).id)
          staffRow = member as { id: string; name: string; user_id: string | null }
        }
      }
    }

    if (!staffRow) {
      return NextResponse.json({ error: 'スタッフが見つかりません', debug_server_line_id: lineUserId }, { status: 404 })
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
