'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

  if (!/^\d{10}$/.test(input.managerOfficeNumber)) {
    return { error: '上限額管理事業所の事業所番号は10桁の数字で入力してください' }
  }
  if (input.isSelfManaged && input.offices.length === 0) {
    return { error: '当事業所が管理事業所の場合、事業所ごとの内訳が必要です' }
  }
  for (const o of input.offices) {
    if (!/^\d{10}$/.test(o.officeNumber)) {
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

  revalidatePath(`/billing/${input.yearMonth}`)
  revalidatePath(`/billing/${input.yearMonth}/upper-limit`)
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

  revalidatePath(`/billing/${yearMonth}`)
  revalidatePath(`/billing/${yearMonth}/upper-limit`)
  return {}
}
