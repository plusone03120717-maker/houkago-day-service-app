'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { aggregateUnitMonth } from '@/lib/billing/aggregate'

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

export type RecalcResult = {
  error?: string
  childCount: number
  totalDays: number
  totalUnits: number
  billedAmount: number
  /** 児童名つきのエラー（出力前に直す必要があるもの） */
  childErrors: string[]
  warnings: string[]
}

/**
 * 出席実績から請求明細を作り直す。
 * 児童別の月次サービス実績と同じ判定で単位数を積み上げるため、画面の〇と請求額が一致する。
 * 確定チェックは引き継ぐ。手入力した値は上書きされる。
 */
export async function recalcBillingFromRecords(
  unitId: string,
  yearMonth: string,
): Promise<RecalcResult> {
  const emptyResult: Omit<RecalcResult, 'error'> = {
    childCount: 0, totalDays: 0, totalUnits: 0, billedAmount: 0, childErrors: [], warnings: [],
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ...emptyResult, error: 'ログインが必要です' }

  const result = await aggregateUnitMonth(supabase, unitId, yearMonth)
  if (result.fatal) return { ...emptyResult, error: result.fatal }

  const warnings = [...result.warnings]

  // billing_monthly を用意
  const { data: monthly } = await supabase
    .from('billing_monthly')
    .select('id, status')
    .eq('unit_id', unitId)
    .eq('year_month', yearMonth)
    .maybeSingle()

  let billingMonthlyId: string
  if (monthly) {
    billingMonthlyId = monthly.id
    if (['exported', 'submitted', 'finalized'].includes(monthly.status)) {
      warnings.push(`この月は「${monthly.status}」の状態です。再集計後はCSVを出力し直してください`)
    }
  } else {
    const { data: created, error } = await supabase
      .from('billing_monthly')
      .insert({ unit_id: unitId, year_month: yearMonth, status: 'draft' })
      .select('id')
      .single()
    if (error || !created) {
      return { ...emptyResult, error: `請求データを作成できませんでした: ${error?.message ?? ''}` }
    }
    billingMonthlyId = created.id
  }

  // 確定チェックを引き継ぐ
  const { data: prevDetails } = await supabase
    .from('billing_details')
    .select('id, child_id, is_confirmed, total_days')
    .eq('billing_monthly_id', billingMonthlyId)
  const prevByChild = new Map(
    ((prevDetails ?? []) as Array<{ id: string; child_id: string; is_confirmed: boolean; total_days: number }>)
      .map((d) => [d.child_id, d]),
  )

  const rows = result.children.map((c) => ({
    billing_monthly_id: billingMonthlyId,
    child_id: c.childId,
    certificate_id: c.certificateId,
    total_days: c.totalDays,
    total_units: c.totalUnits,
    service_code: c.serviceCode,
    unit_price: c.unitPrice,
    copay_amount: c.copayAmount,
    billed_amount: c.billedAmount,
    service_breakdown: c.breakdown,
    errors: c.errors,
    is_confirmed: prevByChild.get(c.childId)?.is_confirmed ?? false,
    recalculated_at: new Date().toISOString(),
  }))

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('billing_details')
      .upsert(rows, { onConflict: 'billing_monthly_id,child_id' })
    if (upsertError) {
      return { ...emptyResult, error: `請求明細を保存できませんでした: ${upsertError.message}` }
    }
  }

  // 出席実績が1日もない児童の空行は残しておいても混乱するので削除する
  // （確定済みの行は利用者の判断を尊重して残す）
  const aggregatedIds = new Set(result.children.map((c) => c.childId))
  const stale = (prevDetails ?? []).filter(
    (d: { child_id: string; is_confirmed: boolean }) => !aggregatedIds.has(d.child_id) && !d.is_confirmed,
  )
  if (stale.length > 0) {
    await supabase
      .from('billing_details')
      .delete()
      .in('id', stale.map((d: { id: string }) => d.id))
  }
  const staleConfirmed = (prevDetails ?? []).filter(
    (d: { child_id: string; is_confirmed: boolean }) => !aggregatedIds.has(d.child_id) && d.is_confirmed,
  )
  if (staleConfirmed.length > 0) {
    warnings.push(`出席実績がないのに確定済みの明細が${staleConfirmed.length}件あります（手動で確認してください）`)
  }

  const childErrors = result.children.flatMap((c) => c.errors.map((e) => `${c.childName}: ${e}`))

  revalidatePath('/billing')
  revalidatePath(`/billing/${yearMonth}`)

  return {
    childCount: result.children.length,
    totalDays: result.children.reduce((s, c) => s + c.totalDays, 0),
    totalUnits: result.children.reduce((s, c) => s + c.totalUnits, 0),
    billedAmount: result.children.reduce((s, c) => s + c.billedAmount, 0),
    childErrors,
    warnings,
  }
}
