import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildUpperLimitCsv } from '@/lib/kokuhoren/upper-limit'
import { loadUpperLimitChildren } from '@/lib/kokuhoren/load'
import { resolveBillingScope } from '@/lib/kokuhoren/scope'

// 利用者負担上限額管理結果票CSV（インタフェース仕様準拠: K411）を生成する。
// 当事業所が上限額管理事業所になっている児童だけが対象。
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

  const children = await loadUpperLimitChildren(supabase, scope)
  const result = buildUpperLimitCsv({ facilityNumber: scope.facilityNumber }, scope.yearMonth, children)

  if (!result.bytes) {
    return NextResponse.json({ errors: result.errors, warnings: result.warnings }, { status: 422 })
  }

  return new NextResponse(Buffer.from(result.bytes), {
    headers: {
      'Content-Type': 'text/csv; charset=Shift_JIS',
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
      'X-Kokuhoren-Warnings': encodeURIComponent(JSON.stringify(result.warnings)),
    },
  })
}
