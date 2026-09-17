// 請求書は「事業所番号 × 市町村」ごとに1枚。同じ事業所番号で児童発達支援と
// 放課後等デイサービスを行っている場合、ユニットが分かれていても請求書は1枚にまとめる。
// billing_monthly はユニット単位なので、出力時に同一施設のユニットを束ね直す。

import type { createClient } from '@/lib/supabase/server'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

export type BillingScope = {
  yearMonth: string
  facilityNumber: string
  regionCode: string
  unitPrice: number
  /** 同じ事業所番号でこの月に請求する請求対象ユニット */
  unitIds: string[]
  /** 上記ユニットの billing_monthly.id */
  billingMonthlyIds: string[]
  error: string | null
}

const EMPTY: Omit<BillingScope, 'error'> = {
  yearMonth: '', facilityNumber: '', regionCode: '20', unitPrice: 10, unitIds: [], billingMonthlyIds: [],
}

/**
 * 起点となる billing_monthly から、同じ施設・同じ月の請求対象ユニットをすべて集める。
 * 起点のユニット自身が請求対象外（プログラミング等）の場合はエラーにする。
 */
export async function resolveBillingScope(
  supabase: SupabaseLike,
  billingMonthlyId: string,
): Promise<BillingScope> {
  const fail = (error: string): BillingScope => ({ ...EMPTY, error })

  const { data: billing } = await supabase
    .from('billing_monthly')
    .select('id, unit_id, year_month, units (id, facility_id, is_billing_target)')
    .eq('id', billingMonthlyId)
    .maybeSingle()

  if (!billing) return fail('請求データが見つかりません')

  const unit = billing.units as unknown as {
    id: string
    facility_id: string
    is_billing_target: boolean
  } | null
  if (!unit) return fail('ユニット情報が取得できません')
  if (!unit.is_billing_target) {
    return fail('このユニットは国保連請求の対象外です（設定 → 施設・ユニット管理で確認してください）')
  }

  const yearMonth = billing.year_month as string

  const { data: facility } = await supabase
    .from('facilities')
    .select('facility_number, region_code, unit_price')
    .eq('id', unit.facility_id)
    .maybeSingle()
  if (!facility) return fail('施設情報が取得できません')

  const { data: siblingUnits } = await supabase
    .from('units')
    .select('id')
    .eq('facility_id', unit.facility_id)
    .eq('is_billing_target', true)

  const unitIds = (siblingUnits ?? []).map((u: { id: string }) => u.id)
  if (unitIds.length === 0) return fail('請求対象のユニットがありません')

  const { data: monthlies } = await supabase
    .from('billing_monthly')
    .select('id, unit_id')
    .eq('year_month', yearMonth)
    .in('unit_id', unitIds)

  const rows = (monthlies ?? []) as Array<{ id: string; unit_id: string }>

  return {
    yearMonth,
    facilityNumber: facility.facility_number,
    regionCode: facility.region_code ?? '20',
    unitPrice: Number(facility.unit_price ?? 10),
    unitIds: rows.map((r) => r.unit_id),
    billingMonthlyIds: rows.map((r) => r.id),
    error: null,
  }
}
