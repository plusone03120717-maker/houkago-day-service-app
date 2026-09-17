import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildKokuhorenCsv } from '@/lib/kokuhoren/build'
import { loadBillingChildren } from '@/lib/kokuhoren/load'
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

  const childrenInput = await loadBillingChildren(supabase, scope)

  const result = buildKokuhorenCsv(
    {
      facilityNumber: scope.facilityNumber,
      regionCode: scope.regionCode,
      unitPrice: scope.unitPrice,
    },
    scope.yearMonth,
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
