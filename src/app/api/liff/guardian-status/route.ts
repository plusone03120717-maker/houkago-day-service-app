import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// 保護者が登録済みか（紐付く児童がいるか）だけを返す軽量エンドポイント。
// 初回登録ページで「登録済みなら利用連絡ページへ送る」判定に使う。
export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await req.json() as { accessToken?: string }
    if (!accessToken) {
      return NextResponse.json({ error: 'accessToken が必要です' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)

    const { data: guardian } = await adminClient
      .from('guardians')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle()

    if (!guardian) {
      return NextResponse.json({ registered: false, childCount: 0 })
    }

    const { count } = await adminClient
      .from('guardian_children')
      .select('*', { count: 'exact', head: true })
      .eq('guardian_id', guardian.id)

    return NextResponse.json({ registered: (count ?? 0) > 0, childCount: count ?? 0 })
  } catch (err) {
    console.error('[liff/guardian-status]', err)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
