import type { SupabaseClient } from '@supabase/supabase-js'

export type LiffStaff = {
  /** staff_members.id（送迎担当・申請系のキー） */
  staffMemberId: string
  /** users.id（シフト・イベント担当のキー。ログインアカウント未作成なら null） */
  userId: string | null
  name: string
}

type StaffRow = { id: string; name: string; user_id: string | null }

/**
 * LINE ユーザーIDからスタッフを特定する。
 * 1) staff_members.line_user_id で直接検索
 * 2) 見つからなければ users.line_user_id → staff_members.user_id で検索し、
 *    ヒットしたら staff_members.line_user_id にも書き戻す
 */
export async function findStaffByLineUserId(
  adminClient: SupabaseClient,
  lineUserId: string,
): Promise<LiffStaff | null> {
  // 重複行があっても最初の1件を取得する
  const { data: rows } = await adminClient
    .from('staff_members')
    .select('id, name, user_id')
    .eq('line_user_id', lineUserId)
    .limit(1)
  const direct = rows && (rows as StaffRow[]).length > 0 ? (rows as StaffRow[])[0] : null
  if (direct) {
    return { staffMemberId: direct.id, userId: direct.user_id ?? null, name: direct.name }
  }

  const { data: userRows } = await adminClient
    .from('users')
    .select('id')
    .eq('line_user_id', lineUserId)
    .limit(1)
  const linkedUser = userRows && (userRows as { id: string }[]).length > 0 ? (userRows as { id: string }[])[0] : null
  if (!linkedUser) return null

  const { data: memberRows } = await adminClient
    .from('staff_members')
    .select('id, name, user_id')
    .eq('user_id', linkedUser.id)
    .limit(1)
  const member = memberRows && (memberRows as StaffRow[]).length > 0 ? (memberRows as StaffRow[])[0] : null
  if (!member) return null

  await adminClient
    .from('staff_members')
    .update({ line_user_id: lineUserId } as never)
    .eq('id', member.id)

  return { staffMemberId: member.id, userId: member.user_id ?? null, name: member.name }
}
