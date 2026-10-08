'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { loadManagedCopays } from '@/lib/kokuhoren/upper-limit-targets'

export type UpperLimitOfficeInput = {
  lineNo: number
  officeNumber: string
  officeName: string
  totalCost: number
  copayAmount: number
  managedCopayAmount: number
}

export type SaveUpperLimitInput = {
  childId: string
  yearMonth: string
  managerOfficeNumber: string
  isSelfManaged: boolean
  result: '1' | '2' | '3'
  copayLimit: number
  offices: UpperLimitOfficeInput[]
}

/**
 * 児童1人・1か月分の上限額管理を保存する。
 * 事業所ごとの内訳は入れ替えになるので、いったん消してから入れ直す。
 */
export async function saveUpperLimit(input: SaveUpperLimitInput): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ログインが必要です' }

  // 事業所番号は国保連CSVには必須だが、FAXの結果を先に入れられるよう空欄は許す
  // （空欄のままCSVを出そうとすると、CSV側でエラーになる）
  if (input.managerOfficeNumber !== '' && !/^\d{10}$/.test(input.managerOfficeNumber)) {
    return { error: '上限額管理事業所の事業所番号は10桁の数字で入力してください' }
  }
  if (input.isSelfManaged && input.offices.length === 0) {
    return { error: '当事業所が管理事業所の場合、事業所ごとの内訳が必要です' }
  }
  for (const o of input.offices) {
    if (o.officeNumber !== '' && !/^\d{10}$/.test(o.officeNumber)) {
      return { error: `項番${o.lineNo}の事業所番号は10桁の数字で入力してください` }
    }
  }

  const { data: saved, error } = await supabase
    .from('upper_limit_managements')
    .upsert(
      {
        child_id: input.childId,
        year_month: input.yearMonth,
        manager_office_number: input.managerOfficeNumber,
        is_self_managed: input.isSelfManaged,
        result: input.result,
        copay_limit: input.copayLimit,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'child_id,year_month' },
    )
    .select('id')
    .single()

  if (error || !saved) return { error: `保存できませんでした: ${error?.message ?? ''}` }

  await supabase.from('upper_limit_management_offices').delete().eq('management_id', saved.id)

  if (input.offices.length > 0) {
    const { error: officeError } = await supabase.from('upper_limit_management_offices').insert(
      input.offices.map((o) => ({
        management_id: saved.id,
        line_no: o.lineNo,
        office_number: o.officeNumber,
        office_name: o.officeName,
        total_cost: o.totalCost,
        copay_amount: o.copayAmount,
        managed_copay_amount: o.managedCopayAmount,
      })),
    )
    if (officeError) return { error: `内訳を保存できませんでした: ${officeError.message}` }
  }

  // 他事業所の番号は毎月同じなので、受給者証に未登録なら覚えておく
  if (!input.isSelfManaged && input.managerOfficeNumber !== '') {
    await supabase
      .from('benefit_certificates')
      .update({ upper_limit_manager_number: input.managerOfficeNumber })
      .eq('child_id', input.childId)
      .is('upper_limit_manager_number', null)
  }

  const syncError = await syncBillingCopay(supabase, input.childId, input.yearMonth)
  if (syncError) return { error: syncError }

  revalidateUpperLimit(input.yearMonth)
  return {}
}

export async function deleteUpperLimit(
  childId: string,
  yearMonth: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ログインが必要です' }

  const { error } = await supabase
    .from('upper_limit_managements')
    .delete()
    .eq('child_id', childId)
    .eq('year_month', yearMonth)

  if (error) return { error: `削除できませんでした: ${error.message}` }

  const syncError = await syncBillingCopay(supabase, childId, yearMonth)
  if (syncError) return { error: syncError }

  revalidateUpperLimit(yearMonth)
  return {}
}

function revalidateUpperLimit(yearMonth: string) {
  revalidatePath(`/billing/${yearMonth}`)
  revalidatePath(`/billing/${yearMonth}/upper-limit`)
  revalidatePath(`/billing/${yearMonth}/invoices`)
}

/**
 * 請求明細（billing_details）の利用者負担額を、上限額管理の結果に合わせて直す。
 * 再集計しなくても、保護者への請求額と国保連請求にすぐ反映されるようにするため。
 * 結果がない（削除した）ときは、再集計と同じ min(負担上限月額, 1割) に戻す。
 */
async function syncBillingCopay(
  supabase: Awaited<ReturnType<typeof createClient>>,
  childId: string,
  yearMonth: string,
): Promise<string | null> {
  const { data: rows } = await supabase
    .from('billing_details')
    .select(`
      id, total_units, unit_price,
      benefit_certificates (copay_limit),
      billing_monthly!inner (year_month, units (facilities (facility_number)))
    `)
    .eq('child_id', childId)
    .eq('billing_monthly.year_month', yearMonth)

  type Row = {
    id: string
    total_units: number
    unit_price: number
    benefit_certificates: { copay_limit: number } | null
    billing_monthly: { units: { facilities: { facility_number: string | null } | null } | null } | null
  }

  for (const r of (rows ?? []) as unknown as Row[]) {
    const facilityNumber = r.billing_monthly?.units?.facilities?.facility_number ?? ''
    const managed = await loadManagedCopays(supabase, yearMonth, [childId], facilityNumber)
    const totalCost = Math.floor(r.total_units * Number(r.unit_price))
    const copay = managed.get(childId) ?? Math.min(r.benefit_certificates?.copay_limit ?? 0, Math.floor(totalCost / 10))
    const { error } = await supabase
      .from('billing_details')
      .update({ copay_amount: copay, billed_amount: totalCost - copay })
      .eq('id', r.id)
    if (error) return `請求明細の負担額を更新できませんでした: ${error.message}`
  }
  return null
}
