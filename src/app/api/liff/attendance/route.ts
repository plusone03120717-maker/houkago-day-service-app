import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Entry = {
  childId: string
  status: 'attending' | 'absent'
  pickupRequired: boolean
  note: string
}

export async function POST(req: NextRequest) {
  try {
    const { accessToken, date, entries } = await req.json() as {
      accessToken?: string
      date?: string
      entries?: Entry[]
    }

    if (!accessToken || !date || !entries || entries.length === 0) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }

    // 日付フォーマット検証
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: '日付の形式が正しくありません' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)

    // 保護者を取得
    const { data: guardian } = await adminClient
      .from('guardians')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle()

    if (!guardian) {
      return NextResponse.json({ error: '保護者が登録されていません' }, { status: 403 })
    }

    // この保護者に紐づく児童IDセットを取得（権限チェック用）
    const { data: linkedRows } = await adminClient
      .from('guardian_children')
      .select('child_id')
      .eq('guardian_id', guardian.id)

    const allowedChildIds = new Set((linkedRows ?? []).map((r: { child_id: string }) => r.child_id))

    // 送信された全childIdが許可リストに含まれるか確認
    for (const entry of entries) {
      if (!allowedChildIds.has(entry.childId)) {
        return NextResponse.json(
          { error: '許可されていない児童IDが含まれています' },
          { status: 403 }
        )
      }
    }

    // upsert（同じchild_id + dateなら更新）
    const records = entries.map((e) => ({
      child_id: e.childId,
      date,
      status: e.status,
      pickup_required: e.status === 'attending' ? e.pickupRequired : false,
      note: e.note ?? null,
      reported_via: 'line',
      reported_at: new Date().toISOString(),
    }))

    const { error } = await adminClient
      .from('parent_attendance_contacts')
      .upsert(records, { onConflict: 'child_id,date' })

    if (error) {
      console.error('[liff/attendance] upsert error:', error)
      return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[liff/attendance]', err)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
