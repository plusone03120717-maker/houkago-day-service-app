import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildKokuhorenCsv, type ChildBillingInput } from '@/lib/kokuhoren/build'
import { resolveBillingScope } from '@/lib/kokuhoren/scope'

// 国保連取込用CSV（インタフェース仕様準拠: K112請求書 + K122明細書）を生成する。
// 請求書は事業所番号ごとに1枚なので、同じ施設の請求対象ユニットをまとめて出力する。
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const billingMonthlyId = searchParams.get('billingMonthlyId')
  if (!billingMonthlyId) {
    return NextResponse.json({ error: 'billingMonthlyId is required' }, { status: 400 })
  }

  const scope = await resolveBillingScope(supabase, billingMonthlyId)
  if (scope.error) {
    return NextResponse.json({ errors: [scope.error], warnings: [] }, { status: 422 })
  }
  if (!scope.facilityNumber) {
    return NextResponse.json({ errors: ['施設情報が取得できません'], warnings: [] }, { status: 422 })
  }

  const { data: detailsRaw } = await supabase
    .from('billing_details')
    .select(`
      id, total_days, total_units, service_code, copay_amount, billed_amount, service_breakdown,
      upper_limit_office_number, upper_limit_result, upper_limit_result_amount,
      children (
        id, name, name_kana,
        benefit_certificates (
          certificate_number, municipality, copay_limit, start_date, end_date,
          decision_service_code, contract_amount, contract_start_date, contract_end_date,
          contract_line_number, max_days_per_month, service_start_date, copay_exempt
        )
      )
    `)
    .in('billing_monthly_id', scope.billingMonthlyIds)

  type DetailRow = {
    id: string
    total_days: number
    total_units: number
    service_code: string | null
    service_breakdown: Array<{ code: string | null; unitCount: number; count: number; units: number }> | null
    copay_amount: number
    billed_amount: number
    upper_limit_office_number: string | null
    upper_limit_result: string | null
    upper_limit_result_amount: number | null
    children: {
      id: string
      name: string
      name_kana: string | null
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
        service_start_date: string | null
        copay_exempt: boolean | null
      }>
    } | null
  }
  const details = (detailsRaw ?? []) as unknown as DetailRow[]

  const yearMonth = scope.yearMonth
  const monthStart = `${yearMonth.slice(0, 4)}-${yearMonth.slice(4, 6)}-01`
  const monthEndDay = new Date(parseInt(yearMonth.slice(0, 4)), parseInt(yearMonth.slice(4, 6)), 0).getDate()
  const monthEnd = `${yearMonth.slice(0, 4)}-${yearMonth.slice(4, 6)}-${String(monthEndDay).padStart(2, '0')}`

  // 明細書の開始年月日は「当事業所を初めて利用した日」。受給者証に未入力のときの
  // フォールバックとして、出席実績のうち最も古い日を拾っておく。
  const childIds = details.map((d) => d.children?.id).filter(Boolean) as string[]
  const firstEverByChild = new Map<string, string>()
  if (childIds.length > 0) {
    const { data: attendances } = await supabase
      .from('daily_attendance')
      .select('child_id, date')
      .in('unit_id', scope.unitIds)
      .eq('status', 'attended')
      .in('child_id', childIds)
      .lte('date', monthEnd)
      .order('date')
    for (const a of attendances ?? []) {
      if (!firstEverByChild.has(a.child_id)) firstEverByChild.set(a.child_id, a.date)
    }
  }

  const childrenInput: ChildBillingInput[] = details.map((d) => {
    const certs = d.children?.benefit_certificates ?? []
    // サービス提供月に有効な受給者証を優先
    const cert = certs.find((c) => c.start_date <= monthEnd && c.end_date >= monthStart) ?? certs[0]
    return {
      childName: d.children?.name ?? '(不明)',
      childNameKana: d.children?.name_kana ?? null,
      certificateNumber: cert?.certificate_number ?? '',
      municipalityCode: cert?.municipality ?? '',
      copayLimit: cert?.copay_limit ?? 0,
      totalDays: d.total_days,
      totalUnits: d.total_units,
      serviceCode: d.service_code ?? '',
      // 再集計で作られたサービスコード別内訳があれば明細情報レコードにそのまま出力する
      breakdown: (d.service_breakdown ?? [])
        .filter((l) => l.code != null && l.units > 0)
        .map((l) => ({ code: l.code as string, unitCount: l.unitCount, count: l.count, units: l.units })),
      decisionServiceCode: cert?.decision_service_code ?? '',
      contractDays: cert?.contract_amount ?? cert?.max_days_per_month ?? 0,
      contractStartDate: cert?.contract_start_date ?? null,
      contractEndDate: cert?.contract_end_date ?? null,
      contractLineNumber: cert?.contract_line_number ?? 1,
      serviceStartDate: cert?.service_start_date ?? null,
      firstEverServiceDate: d.children ? firstEverByChild.get(d.children.id) ?? null : null,
      copayExempt: cert?.copay_exempt ?? false,
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
      facilityNumber: scope.facilityNumber,
      regionCode: scope.regionCode,
      unitPrice: scope.unitPrice,
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
    .in('id', scope.billingMonthlyIds)

  return new NextResponse(Buffer.from(result.bytes), {
    headers: {
      'Content-Type': 'text/csv; charset=Shift_JIS',
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
      'X-Kokuhoren-Warnings': encodeURIComponent(JSON.stringify(result.warnings)),
    },
  })
}
