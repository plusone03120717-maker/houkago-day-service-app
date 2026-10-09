import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// 保護者が登録済みか（紐付く児童がいるか）だけを返す軽量エンドポイント。
// 初回登録ページで「登録済みなら利用連絡ページへ送る」判定に使う。
// 未登録のときは、承認待ちの登録申請があるか（pending）も返す。
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

    const { count } = guardian
      ? await adminClient
          .from('guardian_children')
          .select('*', { count: 'exact', head: true })
          .eq('guardian_id', guardian.id)
      : { count: 0 }

    const registered = (count ?? 0) > 0
    let pending: { childNameKana: string; birthDate: string } | null = null
    if (!registered) {
      const { data: req } = await adminClient
        .from('guardian_registration_requests')
        .select('child_name_kana, birth_date')
        .eq('line_user_id', lineUserId)
        .eq('status', 'pending')
        .maybeSingle()
      const r = req as { child_name_kana: string; birth_date: string } | null
      if (r) pending = { childNameKana: r.child_name_kana, birthDate: r.birth_date }
    }

    return NextResponse.json({ registered, childCount: count ?? 0, pending })
  } catch (err) {
    console.error('[liff/guardian-status]', err)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
