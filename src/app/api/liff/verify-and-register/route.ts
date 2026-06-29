import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineIdToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const { idToken, code } = await req.json() as { idToken?: string; code?: string }
    if (!idToken || !code) {
      return NextResponse.json({ error: 'idToken と code が必要です' }, { status: 400 })
    }

    const lineUserId = await verifyLineIdToken(idToken)

    // 登録コードを確認
    const { data: regCode } = await adminClient
      .from('registration_codes')
      .select('child_id, used')
      .eq('code', code.trim().toUpperCase())
      .maybeSingle()

    if (!regCode) {
      return NextResponse.json({ error: '登録コードが見つかりません' }, { status: 400 })
    }
    if (regCode.used) {
      return NextResponse.json({ error: 'この登録コードはすでに使用されています' }, { status: 400 })
    }

    // 保護者レコードをupsert（同じline_user_idが既にあれば取得）
    const { data: guardian, error: guardianError } = await adminClient
      .from('guardians')
      .upsert({ line_user_id: lineUserId }, { onConflict: 'line_user_id' })
      .select('id')
      .single()

    if (guardianError || !guardian) {
      return NextResponse.json({ error: '保護者登録に失敗しました' }, { status: 500 })
    }

    // 児童との紐付けを追加（重複は無視）
    const { error: linkError } = await adminClient
      .from('guardian_children')
      .upsert(
        { guardian_id: guardian.id, child_id: regCode.child_id },
        { onConflict: 'guardian_id,child_id', ignoreDuplicates: true }
      )

    if (linkError) {
      return NextResponse.json({ error: '児童との紐付けに失敗しました' }, { status: 500 })
    }

    // 登録コードを使用済みにする
    await adminClient
      .from('registration_codes')
      .update({ used: true })
      .eq('code', code.trim().toUpperCase())

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[liff/verify-and-register]', err)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
