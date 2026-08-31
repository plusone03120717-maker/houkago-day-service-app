'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { buildMonthInvoices, type ChildInvoice } from '@/lib/billing/copay-invoice'

export type IssueResult = {
  error?: string
  issuedCount: number
  totalAmount: number
  skipped: string[]
}

function invoiceRow(child: ChildInvoice, unitId: string, billingMonthlyId: string | null, issuedAt: string) {
  return {
    child_id: child.childId,
    unit_id: unitId,
    billing_monthly_id: billingMonthlyId,
    year_month: child.yearMonth,
    invoice_type: 'invoice' as const,
    copay_amount: child.benefitCopay,
    daytime_copay_amount: child.daytimeCopay + child.daytimeTransportAmount,
    extra_charge_total: child.extraTotal,
    actual_cost_total: child.actualTotal,
    total_cost: child.totalCost + child.daytimeCost,
    total_amount: child.total,
    lines: child.lines,
    issued_at: issuedAt,
  }
}

/**
 * 月次の利用者負担額を集計し、請求書として保存（再発行は上書き）する。
 * childIds を渡すとその児童だけ、省略すると負担額が1円以上の全児童を発行する。
 */
export async function issueInvoices(
  unitId: string,
  yearMonth: string,
  childIds?: string[],
): Promise<IssueResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ログインが必要です', issuedCount: 0, totalAmount: 0, skipped: [] }

  const result = await buildMonthInvoices(supabase, unitId, yearMonth)
  if (result.fatal) return { error: result.fatal, issuedCount: 0, totalAmount: 0, skipped: [] }

  const { data: monthly } = await supabase
    .from('billing_monthly')
    .select('id')
    .eq('unit_id', unitId)
    .eq('year_month', yearMonth)
    .maybeSingle()
  const billingMonthlyId = (monthly as { id: string } | null)?.id ?? null

  const target = childIds
    ? result.children.filter((c) => childIds.includes(c.childId))
    : result.children

  const skipped = target.filter((c) => c.total <= 0).map((c) => c.childName)
  const issuable = target.filter((c) => c.total > 0)
  if (issuable.length === 0) {
    return { error: '請求額が0円のため発行できる請求書がありません', issuedCount: 0, totalAmount: 0, skipped }
  }

  const issuedAt = new Date().toISOString()
  const { error } = await supabase
    .from('billing_invoices')
    .upsert(
      issuable.map((c) => invoiceRow(c, unitId, billingMonthlyId, issuedAt)),
      { onConflict: 'child_id,year_month,invoice_type' },
    )
  if (error) return { error: `請求書を保存できませんでした: ${error.message}`, issuedCount: 0, totalAmount: 0, skipped }

  revalidatePath(`/billing/${yearMonth}/invoices`)
  revalidatePath('/parent/invoices')

  return {
    issuedCount: issuable.length,
    totalAmount: issuable.reduce((s, c) => s + c.total, 0),
    skipped,
  }
}

/** 入金を記録する（領収書の発行に必要）。paidAt を null にすると取り消し */
export async function recordPayment(
  invoiceId: string,
  yearMonth: string,
  values: { paidAt: string | null; paymentMethod: string | null; receiptNo: string | null },
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ログインが必要です' }

  const { error } = await supabase
    .from('billing_invoices')
    .update({
      paid_at: values.paidAt,
      payment_method: values.paidAt ? values.paymentMethod : null,
      receipt_no: values.paidAt ? values.receiptNo : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)

  if (error) return { error: error.message }

  revalidatePath(`/billing/${yearMonth}/invoices`)
  revalidatePath('/parent/invoices')
  return {}
}

/** 発行済みの請求書を取り消す */
export async function deleteInvoice(invoiceId: string, yearMonth: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ログインが必要です' }

  const { error } = await supabase.from('billing_invoices').delete().eq('id', invoiceId)
  if (error) return { error: error.message }

  revalidatePath(`/billing/${yearMonth}/invoices`)
  revalidatePath('/parent/invoices')
  return {}
}
