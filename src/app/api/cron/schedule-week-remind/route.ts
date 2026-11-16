import { NextRequest, NextResponse } from 'next/server'
import { getTodayJST } from '@/lib/utils'
import { isWeekStart } from '@/lib/schedule-week-confirm'
import { remindWeekStart, sendReminders } from '@/lib/schedule-week-remind'

// 毎回実行する必要があるためキャッシュさせない
export const dynamic = 'force-dynamic'

/**
 * 週ごとの予定の「確認しました」の催促（LINE）。
 *
 * Vercel Cron（vercel.json の crons）から毎週日曜18時（JST）に呼ばれ、翌週（月曜から）の分を送る。
 * 送る相手は、利用状況の一覧でチェックした児童の保護者のうち、まだ確認していない人だけ
 * （src/lib/schedule-week-remind.ts）。
 *
 * 試すとき：?dry=1 で送らずに相手と文面だけを返す。?week=YYYY-MM-DD（月曜）で週を選べる。
 * ?test_child=<児童の id> で、その児童の保護者にだけ試しに送る（名前が「テスト」で始まる児童だけ・記録は残さない）。
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET が未設定です' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const dryRun = params.get('dry') === '1'
  const weekParam = params.get('week')
  if (weekParam && !isWeekStart(weekParam)) {
    return NextResponse.json({ error: 'week は月曜日の日付で指定してください' }, { status: 400 })
  }
  const weekStart = weekParam ?? remindWeekStart(getTodayJST())
  const testChildId = params.get('test_child') ?? undefined
  if (testChildId && !/^[0-9a-f-]{36}$/i.test(testChildId)) {
    return NextResponse.json({ error: 'test_child の指定が正しくありません' }, { status: 400 })
  }

  const token = process.env.LINE_PARENT_CHANNEL_ACCESS_TOKEN ?? null
  if (!dryRun && !token) {
    // 保護者用公式アカウントのキーを入れるまでは送らない（スタッフ用のキーでは届かない）
    return NextResponse.json({ ok: false, skipped: 'LINE_PARENT_CHANNEL_ACCESS_TOKEN が未設定のため送っていません' })
  }

  try {
    const result = await sendReminders(weekStart, { dryRun, token, testChildId })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[schedule-week-remind]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
