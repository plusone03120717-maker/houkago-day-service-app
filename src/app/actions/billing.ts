'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { recalcUnitMonth, type RecalcResult } from '@/lib/billing/recalc'

export async function updateBillingDetail(
  id: string,
  values: {
    total_days: number
    total_units: number
    unit_price: number
    billed_amount: number
    copay_amount: number
    service_code: string
  }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ログインが必要です' }

  // 手入力した時点で、再集計で作られたサービスコード別内訳は実態と合わなくなる。
  // 古い内訳のままCSVに出力されないよう、あわせて破棄する。
  const { error } = await supabase
    .from('billing_details')
    .update({ ...values, service_breakdown: [], recalculated_at: null })
    .eq('id', id)

  if (error) return { error: error.message }
  return {}
}

export type { RecalcResult } from '@/lib/billing/recalc'

/**
 * 出席実績から請求明細を作り直す。
 * 児童別の月次サービス実績と同じ判定で単位数を積み上げるため、画面の〇と請求額が一致する。
 * 確定チェックは引き継ぐ。手入力した値は上書きされる。
 */
export async function recalcBillingFromRecords(
  unitId: string,
  yearMonth: string,
): Promise<RecalcResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      childCount: 0, totalDays: 0, totalUnits: 0, billedAmount: 0, childErrors: [], warnings: [],
      error: 'ログインが必要です',
    }
  }

  const result = await recalcUnitMonth(supabase, unitId, yearMonth)

  revalidatePath('/billing')
  revalidatePath(`/billing/${yearMonth}`)
  return result
}
