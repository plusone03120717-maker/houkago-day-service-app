import { NextResponse } from 'next/server'
import { getStaffAccess } from '@/lib/require-admin'
import { loadPendingChangeWeeks } from '@/lib/schedule-week-confirm-db'
import { weekStartOf } from '@/lib/schedule-week-confirm'
import { getTodayJST } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * 保護者に知らせた週で、まだ知らせていない予定の変更があるか。
 * 画面の共通の枠（ScheduleChangePrompt）が、予定を変えたあとに聞くために呼ぶ。
 * 知らせるボタンを押せる人（システム管理者）だけ。
 */
export async function GET() {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canEditOperations) return NextResponse.json({ weeks: [] })
  try {
    const weeks = await loadPendingChangeWeeks(weekStartOf(getTodayJST()))
    return NextResponse.json({ weeks })
  } catch (err) {
    console.error('[schedule-week/pending]', err)
    return NextResponse.json({ weeks: [], error: 'failed' }, { status: 500 })
  }
}
