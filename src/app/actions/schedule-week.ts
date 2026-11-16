'use server'

import { revalidatePath } from 'next/cache'
import { getStaffAccess } from '@/lib/require-admin'
import { notifyWeek } from '@/lib/schedule-week-confirm-db'
import { isWeekStart } from '@/lib/schedule-week-confirm'
import { setRemindTarget } from '@/lib/schedule-week-remind'

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 「LINE で催促」のチェック。チェックした児童の保護者には、日曜18時に
 * 翌週の予定の確認がまだなら LINE を送る。チェックは外すまで残る。
 */
export async function setScheduleRemindTarget(childId: string, on: boolean): Promise<{ error?: string }> {
  const access = await getStaffAccess()
  if (!access?.canEditOperations) return { error: '催促のチェックはシステム管理者だけができます' }
  if (!UUID_RE.test(childId)) return { error: '児童の指定が正しくありません' }

  const result = await setRemindTarget(childId, on, access.userId)
  if (!result.error) revalidatePath('/usage')
  return result
}
