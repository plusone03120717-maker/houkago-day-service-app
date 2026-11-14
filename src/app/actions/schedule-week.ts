'use server'

import { revalidatePath } from 'next/cache'
import { getStaffAccess } from '@/lib/require-admin'
import { notifyWeek } from '@/lib/schedule-week-confirm-db'
import { isWeekStart } from '@/lib/schedule-week-confirm'

/**
 * 「この週の予定を保護者に知らせる」（2回目からは「変更を知らせる」）。
 * 保護者の画面に「予定の確認」が出る。予定を入れられる人（システム管理者）だけが押せる。
 */
export async function notifyScheduleWeek(weekStart: string): Promise<{ error?: string }> {
  const access = await getStaffAccess()
  if (!access?.canEditOperations) return { error: '保護者へのお知らせはシステム管理者だけができます' }
  if (!isWeekStart(weekStart)) return { error: '週の指定が正しくありません' }

  const result = await notifyWeek(weekStart, access.userId)
  if (!result.error) revalidatePath('/usage')
  return result
}
