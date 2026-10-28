import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * スタッフ LINE の画面を開いたことを staff_page_views に残す。
 * 利用状況の確認用なので、失敗しても画面は止めない（エラーは握りつぶしてログだけ出す）。
 */
export async function logStaffView(
  adminClient: SupabaseClient,
  staffMemberId: string,
  page: 'staff-schedule' | 'staff-schedule-month',
  targetDate: string | null,
): Promise<void> {
  try {
    const { error } = await adminClient
      .from('staff_page_views')
      .insert({ staff_member_id: staffMemberId, page, target_date: targetDate })
    if (error) console.error('staff_page_views insert failed:', error.message)
  } catch (e) {
    console.error('staff_page_views insert failed:', e)
  }
}
