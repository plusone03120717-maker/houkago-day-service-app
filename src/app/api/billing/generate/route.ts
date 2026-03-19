import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 放課後等デイサービスの加算率（基本報酬に対する割合）
const ADDITION_RATES: Record<string, number> = {
  // 処遇改善加算
  welfare_improvement_1: 0.208,  // 処遇改善加算Ⅰ
  welfare_improvement_2: 0.172,  // 処遇改善加算Ⅱ
  welfare_improvement_3: 0.114,  // 処遇改善加算Ⅲ
  // 特定処遇改善加算
  specific_welfare_1: 0.050,     // 特定処遇改善加算Ⅰ
  specific_welfare_2: 0.036,     // 特定処遇改善加算Ⅱ
  // ベースアップ等支援加算
  base_up_support: 0.017,        // ベースアップ等支援加算
  // 専門的支援加算
  specialist_support: 0.250,     // 専門的支援加算（1日につき）
  // 強度行動障害支援加算
  intensive_support: 0.150,      // 強度行動障害支援加算
}

// 基本報酬単価（放課後等デイサービス・区分なし・標準）
const BASE_UNIT_PRICE = 10  // 1単位 = 10円（地域区分で異なるが簡易的に10円）
const BASE_UNITS_PER_DAY = 587  // 放課後等デイサービス基本報酬（単位）

type AdditionSetting = {
  addition_type: string
  enabled: boolean
  custom_rate: number | null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(async () => {
    const form = await request.formData()
    return { unitId: form.get('unitId'), yearMonth: form.get('yearMonth') }
  })

  const { unitId, yearMonth } = body as { unitId: string; yearMonth: string }

  if (!unitId || !yearMonth) {
    return NextResponse.json({ error: 'unitId and yearMonth are required' }, { status: 400 })
  }

  const year = parseInt(yearMonth.slice(0, 4))
  const month = parseInt(yearMonth.slice(4, 6))

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = new Date(year, month, 0)
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`

  // 既存の請求データを確認
  const { data: existing } = await supabase
    .from('billing_monthly')
    .select('id')
    .eq('unit_id', unitId)
    .eq('year_month', yearMonth)
    .single()

  let billingMonthlyId: string

  if (existing) {
    billingMonthlyId = existing.id
  } else {
    const { data: created, error } = await supabase
      .from('billing_monthly')
      .insert({ unit_id: unitId, year_month: yearMonth, status: 'draft' })
      .select('id')
      .single()

    if (error || !created) {
      return NextResponse.json({ error: '請求データの作成に失敗しました' }, { status: 500 })
    }
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
  const { data: attendances } = await supabase
    .from('daily_attendance')
    .select(`
      id, child_id, date, pickup_type, status,
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

  if (!attendances) {
    return NextResponse.json({ error: '出席データの取得に失敗しました' }, { status: 500 })
  }

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

  for (const att of attendances) {
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
      const start = new Date(cert.start_date)
      const end = new Date(cert.end_date)
      const attDate = new Date(att.date)
      return attDate >= start && attDate <= end
    })

    const errors: string[] = []
    if (!validCert) {
      errors.push(`${att.date}: 有効な受給者証がありません`)
    }

    if (!childMap.has(child.id)) {
      childMap.set(child.id, {
        childId: child.id,
        childName: child.name,
        totalDays: 0,
        certificateId: validCert?.id ?? null,
        maxDaysPerMonth: validCert?.max_days_per_month ?? 0,
        copayLimit: validCert?.copay_limit ?? 0,
        errors,
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

  // 加算率の合計を計算
  let totalAdditionRate = 0
  const appliedAdditions: string[] = []

  for (const addition of enabledAdditions) {
    const rate = addition.custom_rate ?? ADDITION_RATES[addition.addition_type] ?? 0
    totalAdditionRate += rate
    appliedAdditions.push(addition.addition_type)
  }

  // 請求詳細を保存
  const detailsToUpsert = Array.from(childMap.values()).map((entry) => {
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
      service_code: 'H43',  // 放課後等デイサービス
      unit_price: BASE_UNIT_PRICE,
      additions: appliedAdditions,
      copay_amount: copayAmount,
      billed_amount: billedAmount - copayAmount,
      errors: entry.errors,
    }
  })

  await supabase.from('billing_details').delete().eq('billing_monthly_id', billingMonthlyId)

  if (detailsToUpsert.length > 0) {
    await supabase.from('billing_details').insert(detailsToUpsert)
  }

  await supabase
    .from('billing_monthly')
    .update({ status: 'draft' })
    .eq('id', billingMonthlyId)

  const accept = request.headers.get('accept') ?? ''
  if (accept.includes('text/html')) {
    return NextResponse.redirect(new URL('/billing', request.url))
  }

  return NextResponse.json({
    success: true,
    billingMonthlyId,
    childCount: childMap.size,
    appliedAdditions,
    totalAdditionRate,
  })
}
