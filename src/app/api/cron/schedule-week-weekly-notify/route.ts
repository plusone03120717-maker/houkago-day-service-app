import { NextRequest, NextResponse } from 'next/server'
import { getTodayJST } from '@/lib/utils'
import { addDays, weekStartOf } from '@/lib/schedule-week-confirm'
import { loadNotice, notifyWeek, getAdminClient } from '@/lib/schedule-week-confirm-db'

export const dynamic = 'force-dynamic'

/**
 * 翌週の予定を、保護者へ自動で知らせる（利用状況の「この週の予定を保護者に知らせる」の自動化）。
 *
 * Vercel Cron（vercel.json の crons）から毎週金曜の夜中12時（土曜0時台・JST）に呼ばれる
 * （2026-11-16 依頼主）。翌週（月曜から）をまだ知らせていなければ知らせ、保護者の画面に
 * 「予定の確認のお願い」を出す。スタッフが先に手で知らせた週はそのままにする
 * （知らせたあとの変更は「変更を知らせる」の確認と日曜17時の自動の知らせが受け持つ）。
 *
 * 試すとき：?dry=1 で、知らせずに対象の週だけを返す。
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
  // 金曜の夜中（土曜0時台）に動くので、今日を含む週の次の月曜が翌週
  const weekStart = addDays(weekStartOf(getTodayJST()), 7)

  try {
    const { notice, error } = await loadNotice(getAdminClient(), weekStart)
    if (error) throw new Error(error.message)
    if (notice) {
      return NextResponse.json({ ok: true, dryRun, weekStart, skipped: 'この週はもう知らせています' })
    }
    if (dryRun) return NextResponse.json({ ok: true, dryRun, weekStart, wouldNotify: true })
    // 押した人は記録しない（notified_by は空＝自動）
    const result = await notifyWeek(weekStart, null)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true, dryRun, weekStart, notified: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[schedule-week-weekly-notify]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
