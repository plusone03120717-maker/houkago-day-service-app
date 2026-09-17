import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * LINEの保護者（guardians）と 保護者ポータルのアカウント（users.role='parent'）を結び付ける。
 *
 * もともと保護者は2系統に分かれていた。
 *   LINE側    : guardians(line_user_id) ─ guardian_children ─ children
 *   ポータル側: users(role='parent')    ─ parent_children   ─ children
 * 同じ保護者でも実体が別で、スタッフは登録作業を2回する必要があり、
 * 保護者から見ても「LINEには登録したのにポータルに入れない」状態になっていた。
 *
 * ここでは片方に登録した時点でもう片方にも繋がるようにする。
 *   - LINE で登録コードを使ったとき     → 既存のポータルアカウントを探して結び付ける
 *   - ポータルアカウントを作ったとき     → 既存のLINE保護者を探して結び付ける
 * どちらの入口からでも「同じ保護者・同じ children」になるのが狙い。
 */

// Supabase クライアントは型ジェネリクスなしで使う（プロジェクト全体の方針）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>

/** その保護者がLINEで見ている児童のID一覧 */
async function guardianChildIds(supabase: Client, guardianId: string): Promise<string[]> {
  const { data } = await supabase
    .from('guardian_children')
    .select('child_id')
    .eq('guardian_id', guardianId)
  return ((data ?? []) as { child_id: string }[]).map((r) => r.child_id)
}

/**
 * ポータルアカウントに、指定した児童を漏れなく紐付ける。
 * 兄弟がいる家庭で「下の子だけポータルに出ない」を防ぐ。
 */
export async function linkChildrenToPortalAccount(
  supabase: Client,
  userId: string,
  childIds: string[]
): Promise<void> {
  if (childIds.length === 0) return
  await supabase
    .from('parent_children')
    .upsert(
      childIds.map((child_id) => ({ user_id: userId, child_id })),
      { onConflict: 'user_id,child_id', ignoreDuplicates: true }
    )
}

/**
 * LINE保護者に対応するポータルアカウントを探して結び付ける。
 *
 * 探し方は「その保護者が見ている児童に、すでに保護者アカウントが付いているか」。
 * 見つかれば guardians.user_id を張り、その保護者の児童すべてを
 * そのアカウントにも紐付ける。
 *
 * @returns 結び付いた（またはすでに結び付いていた）ポータルアカウントのID。無ければ null
 */
export async function linkGuardianToPortalAccount(
  supabase: Client,
  guardianId: string
): Promise<string | null> {
  const { data: guardianRaw } = await supabase
    .from('guardians')
    .select('id, user_id')
    .eq('id', guardianId)
    .maybeSingle()
  const guardian = guardianRaw as { id: string; user_id: string | null } | null
  if (!guardian) return null

  const childIds = await guardianChildIds(supabase, guardianId)

  // すでに結び付いている場合も、児童の紐付けだけは最新に揃えておく
  if (guardian.user_id) {
    await linkChildrenToPortalAccount(supabase, guardian.user_id, childIds)
    return guardian.user_id
  }

  if (childIds.length === 0) return null

  // その児童に付いている保護者アカウントのうち、最も古いものを採用する
  const { data: links } = await supabase
    .from('parent_children')
    .select('user_id')
    .in('child_id', childIds)
  const candidateIds = [...new Set(((links ?? []) as { user_id: string }[]).map((l) => l.user_id))]
  if (candidateIds.length === 0) return null

  const { data: users } = await supabase
    .from('users')
    .select('id')
    .in('id', candidateIds)
    .eq('role', 'parent')
    .order('created_at', { ascending: true })
    .limit(1)
  const userId = ((users ?? []) as { id: string }[])[0]?.id
  if (!userId) return null

  await supabase.from('guardians').update({ user_id: userId }).eq('id', guardianId)
  await linkChildrenToPortalAccount(supabase, userId, childIds)
  return userId
}

/**
 * ポータルアカウント側から、対応するLINE保護者を探して結び付ける。
 * 児童詳細ページで保護者アカウントを作ったとき、その児童がすでに
 * LINE登録済みなら自動で同じ保護者として扱う。
 *
 * @returns 結び付けたLINE保護者の人数
 */
export async function linkPortalAccountToGuardians(
  supabase: Client,
  userId: string,
  childId: string
): Promise<number> {
  const { data: links } = await supabase
    .from('guardian_children')
    .select('guardian_id')
    .eq('child_id', childId)
  const guardianIds = [
    ...new Set(((links ?? []) as { guardian_id: string }[]).map((l) => l.guardian_id)),
  ]
  if (guardianIds.length === 0) return 0

  // まだポータルアカウントが決まっていないLINE保護者だけを結び付ける。
  // すでに別アカウントを見ている保護者は、そちらを正として触らない。
  const { data: updated } = await supabase
    .from('guardians')
    .update({ user_id: userId })
    .in('id', guardianIds)
    .is('user_id', null)
    .select('id')
  const linked = (updated ?? []) as { id: string }[]

  // 結び付いたLINE保護者が見ている児童（兄弟）も、このアカウントから見えるようにする
  for (const g of linked) {
    const childIds = await guardianChildIds(supabase, g.id)
    await linkChildrenToPortalAccount(supabase, userId, childIds)
  }

  return linked.length
}
