import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAnomalyCheck } from '@/lib/anomaly/run'

// 毎回実行する必要があるためキャッシュさせない
export const dynamic = 'force-dynamic'

/**
 * 入力チェックの夜間バッチ。
 *
 * Vercel Cron（vercel.json の crons）から毎朝呼ばれる。Vercel は
 * `Authorization: Bearer $CRON_SECRET` を付けてくるので、それで認証する。
 * ログインセッションが無い実行なので service_role で動かす。
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET が未設定です' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  try {
    const result = await runAnomalyCheck(supabase, { triggerSource: 'cron' })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
