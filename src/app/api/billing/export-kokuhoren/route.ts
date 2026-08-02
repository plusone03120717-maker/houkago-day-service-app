import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildKokuhorenCsv, type ChildBillingInput } from '@/lib/kokuhoren/build'

// 国保連取込用CSV（インタフェース仕様準拠: K112請求書 + K122明細書）を生成する
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const billingMonthlyId = searchParams.get('billingMonthlyId')
  if (!billingMonthlyId) {
    return NextResponse.json({ error: 'billingMonthlyId is required' }, { status: 400 })
  }

  const { data: billing } = await supabase
    .from('billing_monthly')
    .select(`
      id, unit_id, year_month,
      units (name, facilities (facility_number, region_code, unit_price))
    `)
    .eq('id', billingMonthlyId)
    .single()

  if (!billing) return NextResponse.json({ error: 'Billing not found' }, { status: 404 })

  const unit = billing.units as unknown as {
    name: string
    facilities: { facility_number: string; region_code: string; unit_price: number } | null
  } | null
  const facilityRow = unit?.facilities

  if (!facilityRow) {
    return NextResponse.json({ errors: ['施設情報が取得できません'], warnings: [] }, { status: 422 })
  }

  const { data: detailsRaw } = await supabase
    .from('billing_details')
    .select(`
      id, total_days, total_units, service_code, copay_amount, billed_amount,
      upper_limit_office_number, upper_limit_result, upper_limit_result_amount,
      children (
        id, name,
        benefit_certificates (
          certificate_number, municipality, copay_limit, start_date, end_date,
          decision_service_code, contract_amount, contract_start_date, contract_end_date,
          contract_line_number, max_days_per_month
        )
      )
    `)
    .eq('billing_monthly_id', billingMonthlyId)

  type DetailRow = {
    id: string
    total_days: number
    total_units: number
    service_code: string | null
    copay_amount: number
    billed_amount: number
    upper_limit_office_number: string | null
    upper_limit_result: string | null
    upper_limit_result_amount: number | null
    children: {
      id: string
      name: string
      benefit_certificates: Array<{
        certificate_number: string
        municipality: string | null
        copay_limit: number
        start_date: string
        end_date: string
        decision_service_code: string | null
        contract_amount: number | null
        contract_start_date: string | null
        contract_end_date: string | null
        contract_line_number: number | null
        max_days_per_month: number
      }>
    } | null
  }
  const details = (detailsRaw ?? []) as unknown as DetailRow[]

  const yearMonth = billing.year_month as string
  const monthStart = `${yearMonth.slice(0, 4)}-${yearMonth.slice(4, 6)}-01`
  const monthEndDay = new Date(parseInt(yearMonth.slice(0, 4)), parseInt(yearMonth.slice(4, 6)), 0).getDate()
  const monthEnd = `${yearMonth.slice(0, 4)}-${yearMonth.slice(4, 6)}-${String(monthEndDay).padStart(2, '0')}`

  // 月内最初のサービス提供日（日数情報レコードの開始年月日に使用）
  const childIds = details.map((d) => d.children?.id).filter(Boolean) as string[]
  const firstDateByChild = new Map<string, string>()
  if (childIds.length > 0) {
    const { data: attendances } = await supabase
      .from('daily_attendance')
      .select('child_id, date')
      .eq('unit_id', billing.unit_id)
      .eq('status', 'attended')
      .in('child_id', childIds)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .order('date')
    for (const a of attendances ?? []) {
      if (!firstDateByChild.has(a.child_id)) firstDateByChild.set(a.child_id, a.date)
    }
  }

  const childrenInput: ChildBillingInput[] = details.map((d) => {
    const certs = d.children?.benefit_certificates ?? []
    // サービス提供月に有効な受給者証を優先
    const cert = certs.find((c) => c.start_date <= monthEnd && c.end_date >= monthStart) ?? certs[0]
    return {
      childName: d.children?.name ?? '(不明)',
      certificateNumber: cert?.certificate_number ?? '',
      municipalityCode: cert?.municipality ?? '',
      copayLimit: cert?.copay_limit ?? 0,
      totalDays: d.total_days,
      totalUnits: d.total_units,
      serviceCode: d.service_code ?? '',
      decisionServiceCode: cert?.decision_service_code ?? '',
      contractDays: cert?.contract_amount ?? cert?.max_days_per_month ?? 0,
      contractStartDate: cert?.contract_start_date ?? null,
      contractEndDate: cert?.contract_end_date ?? null,
      contractLineNumber: cert?.contract_line_number ?? 1,
      firstServiceDate: d.children ? firstDateByChild.get(d.children.id) ?? null : null,
      storedCopayAmount: d.copay_amount,
      upperLimit: d.upper_limit_office_number
        ? {
            officeNumber: d.upper_limit_office_number,
            result: d.upper_limit_result ?? '',
            resultAmount: d.upper_limit_result_amount,
          }
        : null,
    }
  })

  const result = buildKokuhorenCsv(
    {
      facilityNumber: facilityRow.facility_number,
      regionCode: facilityRow.region_code ?? '20',
      unitPrice: Number(facilityRow.unit_price ?? 10),
    },
    yearMonth,
    childrenInput,
  )

  if (!result.bytes) {
    return NextResponse.json({ errors: result.errors, warnings: result.warnings }, { status: 422 })
  }

  await supabase
    .from('billing_monthly')
    .update({ status: 'exported' })
    .eq('id', billingMonthlyId)

  return new NextResponse(Buffer.from(result.bytes), {
    headers: {
      'Content-Type': 'text/csv; charset=Shift_JIS',
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
      'X-Kokuhoren-Warnings': encodeURIComponent(JSON.stringify(result.warnings)),
    },
  })
}
