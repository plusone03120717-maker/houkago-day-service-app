'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const ADDITION_RATES: Record<string, number> = {
  welfare_improvement_1: 0.208,
  welfare_improvement_2: 0.172,
  welfare_improvement_3: 0.114,
  specific_welfare_1: 0.050,
  specific_welfare_2: 0.036,
  base_up_support: 0.017,
  specialist_support: 0.250,
  intensive_support: 0.150,
}

const BASE_UNIT_PRICE = 10
const BASE_UNITS_PER_DAY = 587

type AdditionSetting = {
  addition_type: string
  enabled: boolean
  custom_rate: number | null
}

export async function generateBilling(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const unitId = formData.get('unitId') as string
  const yearMonth = formData.get('yearMonth') as string

  if (!unitId || !yearMonth) redirect('/billing')

  const year = parseInt(yearMonth.slice(0, 4))
  const month = parseInt(yearMonth.slice(4, 6))
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // 既存の請求データを確認
  const { data: existing } = await supabase
    .from('billing_monthly')
    .select('id')
    .eq('unit_id', unitId)
    .eq('year_month', yearMonth)
    .maybeSingle()

  let billingMonthlyId: string

  if (existing) {
    billingMonthlyId = existing.id
  } else {
    const { data: created, error } = await supabase
      .from('billing_monthly')
      .insert({ unit_id: unitId, year_month: yearMonth, status: 'draft' })
      .select('id')
      .single()
    if (error || !created) redirect('/billing')
    billingMonthlyId = created.id
  }

  // 加算設定を取得
  const { data: additionSettingsRaw } = await supabase
    .from('addition_settings')
    .select('addition_type, enabled, custom_rate')
    .eq('unit_id', unitId)
  const additionSettings = (additionSettingsRaw ?? []) as AdditionSetting[]
  const enabledAdditions = additionSettings.filter((a) => a.enabled)

  // 出席記録を取得
  const { data: attendances, error: attError } = await supabase
    .from('daily_attendance')
    .select(`
      id, child_id, date, status,
      children (
        id, name,
        benefit_certificates (
          id, service_type, start_date, end_date, max_days_per_month, copay_limit
        )
      )
    `)
    .eq('unit_id', unitId)
    .eq('status', 'attended')
    .gte('date', startDate)
    .lte('date', endDateStr)

  if (attError) redirect('/billing')

  // 児童ごとに集計
  const childMap = new Map<string, {
    childId: string
    childName: string
    totalDays: number
    certificateId: string | null
    maxDaysPerMonth: number
    copayLimit: number
    errors: string[]
  }>()

  for (const att of attendances ?? []) {
    const child = att.children as unknown as {
      id: string
      name: string
      benefit_certificates: Array<{
        id: string
        service_type: string
        start_date: string
        end_date: string
        max_days_per_month: number
        copay_limit: number
      }>
    } | null

    if (!child) continue

    const certs = child.benefit_certificates ?? []
    const validCert = certs.find((cert) => {
      return att.date >= cert.start_date && att.date <= cert.end_date
    })

    if (!childMap.has(child.id)) {
      childMap.set(child.id, {
        childId: child.id,
        childName: child.name,
        totalDays: 0,
        certificateId: validCert?.id ?? null,
        maxDaysPerMonth: validCert?.max_days_per_month ?? 0,
        copayLimit: validCert?.copay_limit ?? 0,
        errors: validCert ? [] : [`${att.date}: 有効な受給者証がありません`],
      })
    }

    const entry = childMap.get(child.id)!
    entry.totalDays++

    if (entry.maxDaysPerMonth > 0 && entry.totalDays > entry.maxDaysPerMonth) {
      if (!entry.errors.includes('月の給付量を超過しています')) {
        entry.errors.push('月の給付量を超過しています')
      }
    }
  }

  // 加算率を合計
  let totalAdditionRate = 0
  const appliedAdditions: string[] = []
  for (const addition of enabledAdditions) {
    const rate = addition.custom_rate ?? ADDITION_RATES[addition.addition_type] ?? 0
    totalAdditionRate += rate
    appliedAdditions.push(addition.addition_type)
  }

  // 請求詳細を保存
  const detailsToInsert = Array.from(childMap.values()).map((entry) => {
    const baseUnits = entry.totalDays * BASE_UNITS_PER_DAY
    const additionUnits = Math.round(baseUnits * totalAdditionRate)
    const totalUnits = baseUnits + additionUnits
    const billedAmount = Math.round(totalUnits * BASE_UNIT_PRICE)
    const copayAmount = Math.min(entry.copayLimit, billedAmount)
    return {
      billing_monthly_id: billingMonthlyId,
      child_id: entry.childId,
      certificate_id: entry.certificateId,
      total_days: entry.totalDays,
      total_units: totalUnits,
      service_code: 'H43',
      unit_price: BASE_UNIT_PRICE,
      additions: appliedAdditions,
      copay_amount: copayAmount,
      billed_amount: billedAmount - copayAmount,
      errors: entry.errors,
    }
  })

  await supabase.from('billing_details').delete().eq('billing_monthly_id', billingMonthlyId)

  if (detailsToInsert.length > 0) {
    const { error: insertError } = await supabase.from('billing_details').insert(detailsToInsert)
    if (insertError) redirect('/billing')
  }

  await supabase.from('billing_monthly').update({ status: 'draft' }).eq('id', billingMonthlyId)

  redirect('/billing')
}
