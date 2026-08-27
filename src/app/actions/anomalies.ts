'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getSessionClaims } from '@/lib/auth'
import { runAnomalyCheck } from '@/lib/anomaly/run'

/**
 * 「今すぐチェック」ボタン。
 *
 * anomaly_findings には書き込みポリシーを作っていない（バッチ以外が
 * 検知結果を作れてはいけない）ので、夜間バッチと同じく service_role で走らせる。
 * その代わり、ここでログイン確認を必ず行う。
 */
export async function runCheckNow(): Promise<{ error?: string; found?: number }> {
  const claims = await getSessionClaims()
  if (!claims) return { error: 'ログインが必要です' }
  if (claims.role === 'parent') return { error: '権限がありません' }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  try {
    const result = await runAnomalyCheck(admin, {
      triggerSource: 'manual',
      triggeredBy: claims.id,
    })
    revalidatePath('/checks')
    return { found: result.found }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 検知結果の対応状況を変える。
 * 'resolved' = 直した / 'dismissed' = 問題なしとして無視 / 'open' = 未対応に戻す
 */
export async function updateFindingStatus(
  id: string,
  status: 'open' | 'resolved' | 'dismissed',
  note?: string
): Promise<{ error?: string }> {
  const claims = await getSessionClaims()
  if (!claims) return { error: 'ログインが必要です' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('anomaly_findings')
    .update(
      status === 'open'
        ? { status, closed_at: null, closed_by: null, closed_note: null }
        : {
            status,
            closed_at: new Date().toISOString(),
            closed_by: claims.id,
            closed_note: note ?? null,
          }
    )
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/checks')
  return {}
}
