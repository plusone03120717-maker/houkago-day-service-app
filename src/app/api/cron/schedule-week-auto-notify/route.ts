import { NextRequest, NextResponse } from 'next/server'
import { getTodayJST } from '@/lib/utils'
import { loadPendingChangeWeeks, notifyWeek } from '@/lib/schedule-week-confirm-db'
import { remindWeekStart } from '@/lib/schedule-week-remind'

export const dynamic = 'force-dynamic'

/**
 * 「変更を知らせる」の押し忘れの安全網。
 *
 * Vercel Cron（vercel.json の crons）から毎週日曜17時（JST）に呼ばれる。
 * 翌週（月曜から）より先の、保護者に知らせた週で、まだ知らせていない予定の変更が
 * 残っていれば、スタッフの代わりに「変更を知らせる」を押す。
 * 1時間後（18時台）の LINE の催促（/api/cron/schedule-week-remind）が、その変更も対象にする。
 *
 * 試すとき：?dry=1 で、知らせずに対象の週と児童だけを返す。
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET が未設定です' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dryRun = request.nextUrl.searchParams.get('dry') === '1'

  try {
    const weeks = await loadPendingChangeWeeks(remindWeekStart(getTodayJST()))
    if (dryRun) return NextResponse.json({ ok: true, dryRun, weeks })

    const notified: string[] = []
    const failed: { weekStart: string; error: string }[] = []
    for (const w of weeks) {
      // 押した人は記録しない（notified_by は空＝自動）
      const result = await notifyWeek(w.weekStart, null)
      if (result.error) failed.push({ weekStart: w.weekStart, error: result.error })
      else notified.push(w.weekStart)
    }
    return NextResponse.json({ ok: true, dryRun, weeks, notified, failed })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[schedule-week-auto-notify]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
