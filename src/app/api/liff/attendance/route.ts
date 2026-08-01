import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'
import { getTodayJST } from '@/lib/utils'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type TransportType = 'none' | 'pickup_only' | 'dropoff_only' | 'both'

type Entry = {
  childId: string
  status: 'attending' | 'absent'
  serviceType?: 'regular' | 'daytime_support'
  serviceStartTime?: string | null
  serviceEndTime?: string | null
  transportType?: TransportType
  pickupTime?: string | null
  dropoffTime?: string | null
  note: string
}

const TRANSPORT_TYPES: TransportType[] = ['none', 'pickup_only', 'dropoff_only', 'both']

/** "HH:MM" 形式を検証し、空文字は null に正規化する */
function normalizeTime(v: string | null | undefined): string | null | undefined {
  if (v === null || v === undefined || v === '') return null
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined
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

    // 過去日への連絡は不可（当日は可）
    if (date < getTodayJST()) {
      return NextResponse.json({ error: '過去の日付には連絡できません' }, { status: 400 })
    }

    // 内容の検証
    for (const entry of entries) {
      if (entry.status !== 'attending' && entry.status !== 'absent') {
        return NextResponse.json({ error: '連絡内容が正しくありません' }, { status: 400 })
      }
      if (
        entry.serviceType !== undefined &&
        entry.serviceType !== 'regular' &&
        entry.serviceType !== 'daytime_support'
      ) {
        return NextResponse.json({ error: 'サービス区分が正しくありません' }, { status: 400 })
      }
      if (entry.transportType !== undefined && !TRANSPORT_TYPES.includes(entry.transportType)) {
        return NextResponse.json({ error: '送迎区分が正しくありません' }, { status: 400 })
      }
      for (const t of [entry.serviceStartTime, entry.serviceEndTime, entry.pickupTime, entry.dropoffTime]) {
        if (normalizeTime(t) === undefined) {
          return NextResponse.json({ error: '時刻の形式が正しくありません' }, { status: 400 })
        }
      }
      // 利用時間は開始 < 終了 であること（両方入力されている場合のみ）
      const s = normalizeTime(entry.serviceStartTime)
      const e = normalizeTime(entry.serviceEndTime)
      if (s && e && s >= e) {
        return NextResponse.json({ error: '利用時間の終了は開始より後にしてください' }, { status: 400 })
      }
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
    // お休みの場合は利用時間・送迎の指定を無視してクリアする
    const records = entries.map((e) => {
      const attending = e.status === 'attending'
      const transport: TransportType = attending ? (e.transportType ?? 'none') : 'none'
      const usesPickup = transport === 'pickup_only' || transport === 'both'
      const usesDropoff = transport === 'dropoff_only' || transport === 'both'
      return {
        child_id: e.childId,
        date,
        status: e.status,
        service_type: attending ? (e.serviceType ?? 'regular') : 'regular',
        service_start_time: attending ? normalizeTime(e.serviceStartTime) ?? null : null,
        service_end_time: attending ? normalizeTime(e.serviceEndTime) ?? null : null,
        transport_type: transport,
        pickup_time: usesPickup ? normalizeTime(e.pickupTime) ?? null : null,
        dropoff_time: usesDropoff ? normalizeTime(e.dropoffTime) ?? null : null,
        note: e.note ?? null,
        reported_via: 'line',
        reported_at: new Date().toISOString(),
        // 新規・再送信いずれもスタッフ未確認として通知する
        is_new: true,
      }
    })

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
