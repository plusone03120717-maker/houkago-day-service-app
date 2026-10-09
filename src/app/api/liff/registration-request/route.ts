import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * 保護者のLINE初回登録の申請を受け付ける。
 *
 * 保護者は「お子さまの名前（ひらがな）＋生年月日」を送るだけ。
 * 児童との紐付けはスタッフが承認画面で行う（設定 → 保護者のLINE登録）。
 * 承認待ちの申請があるうちに送り直したら、その申請を上書きする。
 */
export async function POST(req: NextRequest) {
  try {
    const { accessToken, childNameKana, birthDate, displayName } = await req.json() as {
      accessToken?: string
      childNameKana?: string
      birthDate?: string
      displayName?: string
    }
    if (!accessToken) {
      return NextResponse.json({ error: 'accessToken が必要です' }, { status: 400 })
    }

    const nameKana = (childNameKana ?? '').trim()
    if (!nameKana || nameKana.length > 40) {
      return NextResponse.json({ error: 'お子さまのお名前を入力してください' }, { status: 400 })
    }
    if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate))) {
      return NextResponse.json({ error: '生年月日を選んでください' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)

    const { data: pending } = await adminClient
      .from('guardian_registration_requests')
      .select('id')
      .eq('line_user_id', lineUserId)
      .eq('status', 'pending')
      .maybeSingle()

    const row = {
      line_user_id: lineUserId,
      line_display_name: displayName?.trim() || null,
      child_name_kana: nameKana,
      birth_date: birthDate,
    }

    const { error } = pending
      ? await adminClient
          .from('guardian_registration_requests')
          .update({ ...row, created_at: new Date().toISOString() })
          .eq('id', (pending as { id: string }).id)
      : await adminClient.from('guardian_registration_requests').insert(row)

    if (error) {
      console.error('[liff/registration-request]', error)
      return NextResponse.json({ error: '申請に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[liff/registration-request]', err)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
