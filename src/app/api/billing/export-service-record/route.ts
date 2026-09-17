import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateUnitMonth } from '@/lib/billing/aggregate'
import {
  buildServiceRecordCsv,
  type FormTypeCode,
  type ServiceRecordChild,
} from '@/lib/kokuhoren/service-record'
import { resolveBillingScope } from '@/lib/kokuhoren/scope'

// サービス提供実績記録票CSV（インタフェース仕様準拠: K611）を生成する。
// 請求明細（billing_details）ではなく、出席実績から直接組み立てるため、
// 再集計を実行していなくても最新の実績が出力される。
// 同じ事業所番号の請求対象ユニットをまとめ、様式種別番号は児発(0301)/放デイ(0501)で
// ユニットごとに切り替える。
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

  const { data: unitRows } = await supabase
    .from('units')
    .select('id, service_type')
    .in('id', scope.unitIds)
  const serviceTypeByUnit = new Map(
    ((unitRows ?? []) as Array<{ id: string; service_type: string }>).map((u) => [u.id, u.service_type]),
  )

  const yearMonth = scope.yearMonth
  const warnings: string[] = []
  const children: ServiceRecordChild[] = []

  for (const unitId of scope.unitIds) {
    const result = await aggregateUnitMonth(supabase, unitId, yearMonth)
    if (result.fatal) {
      return NextResponse.json({ errors: [result.fatal], warnings }, { status: 422 })
    }
    warnings.push(...result.warnings)

    // 様式種別番号（仕様 2.1.3.6（4）様式と様式種別番号の対応）
    const formTypeCode: FormTypeCode =
      serviceTypeByUnit.get(unitId) === 'development_support' ? '0301' : '0501'

    for (const c of result.children) {
      children.push({
        childName: c.childName,
        certificateNumber: c.certificateNumber ?? '',
        municipalityCode: c.municipalityCode ?? '',
        formTypeCode,
        days: c.days,
      })
    }
  }

  const csv = buildServiceRecordCsv({ facilityNumber: scope.facilityNumber }, yearMonth, children)

  if (!csv.bytes) {
    return NextResponse.json(
      { errors: csv.errors, warnings: [...warnings, ...csv.warnings] },
      { status: 422 },
    )
  }

  return new NextResponse(Buffer.from(csv.bytes), {
    headers: {
      'Content-Type': 'text/csv; charset=Shift_JIS',
      'Content-Disposition': `attachment; filename="${csv.fileName}"`,
      'X-Kokuhoren-Warnings': encodeURIComponent(JSON.stringify([...warnings, ...csv.warnings])),
    },
  })
}
