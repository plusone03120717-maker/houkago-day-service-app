import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateUnitMonth } from '@/lib/billing/aggregate'
import {
  buildServiceRecordCsv,
  type FormTypeCode,
  type ServiceRecordChild,
} from '@/lib/kokuhoren/service-record'

// サービス提供実績記録票CSV（インタフェース仕様準拠: K611）を生成する。
// 請求明細（billing_details）ではなく、出席実績から直接組み立てるため、
// 再集計を実行していなくても最新の実績が出力される。
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
    .select('id, unit_id, year_month, units (service_type, facilities (facility_number))')
    .eq('id', billingMonthlyId)
    .single()

  if (!billing) return NextResponse.json({ error: 'Billing not found' }, { status: 404 })

  const unit = billing.units as unknown as {
    service_type: string
    facilities: { facility_number: string } | null
  } | null
  const facilityNumber = unit?.facilities?.facility_number
  if (!facilityNumber) {
    return NextResponse.json({ errors: ['施設情報が取得できません'], warnings: [] }, { status: 422 })
  }

  // 様式種別番号（仕様 2.1.3.6（4）様式と様式種別番号の対応）
  const formTypeCode: FormTypeCode = unit?.service_type === 'development_support' ? '0301' : '0501'

  const yearMonth = billing.year_month as string
  const result = await aggregateUnitMonth(supabase, billing.unit_id, yearMonth)
  if (result.fatal) {
    return NextResponse.json({ errors: [result.fatal], warnings: result.warnings }, { status: 422 })
  }

  const children: ServiceRecordChild[] = result.children.map((c) => ({
    childName: c.childName,
    certificateNumber: c.certificateNumber ?? '',
    municipalityCode: c.municipalityCode ?? '',
    days: c.days,
  }))

  const csv = buildServiceRecordCsv({ facilityNumber, formTypeCode }, yearMonth, children)

  if (!csv.bytes) {
    return NextResponse.json(
      { errors: csv.errors, warnings: [...result.warnings, ...csv.warnings] },
      { status: 422 },
    )
  }

  const warnings = [...result.warnings, ...csv.warnings]

  return new NextResponse(Buffer.from(csv.bytes), {
    headers: {
      'Content-Type': 'text/csv; charset=Shift_JIS',
      'Content-Disposition': `attachment; filename="${csv.fileName}"`,
      'X-Kokuhoren-Warnings': encodeURIComponent(JSON.stringify(warnings)),
    },
  })
}
