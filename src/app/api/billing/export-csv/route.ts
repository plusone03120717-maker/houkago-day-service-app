import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 国保連提出用CSVを生成（Shift-JIS対応はブラウザ側で処理）
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const billingMonthlyId = searchParams.get('billingMonthlyId')
  const exportType = searchParams.get('type') ?? 'service_record' // service_record | billing

  if (!billingMonthlyId) {
    return NextResponse.json({ error: 'billingMonthlyId is required' }, { status: 400 })
  }

  // 請求データを取得
  const { data: billing } = await supabase
    .from('billing_monthly')
    .select(`
      id, unit_id, year_month,
      units (name, facility_number: facilities(facility_number))
    `)
    .eq('id', billingMonthlyId)
    .single()

  if (!billing) return NextResponse.json({ error: 'Billing not found' }, { status: 404 })

  const { data: detailsRaw } = await supabase
    .from('billing_details')
    .select(`
      id, total_days, total_units, service_code, unit_price, copay_amount, billed_amount, additions,
      children (
        id, name, name_kana,
        benefit_certificates (certificate_number, municipality, copay_category)
      )
    `)
    .eq('billing_monthly_id', billingMonthlyId)

  const details = (detailsRaw ?? []) as unknown as Array<{
    id: string
    total_days: number
    total_units: number
    service_code: string | null
    unit_price: number
    copay_amount: number
    billed_amount: number
    additions: unknown[]
    children: {
      id: string
      name: string
      name_kana: string | null
      benefit_certificates: Array<{
        certificate_number: string
        municipality: string | null
        copay_category: string | null
      }>
    } | null
  }>

  const yearMonth = billing.year_month
  const year = yearMonth.slice(0, 4)
  const month = yearMonth.slice(4, 6)

  // サービス種類コード（放デイ=63, 児発=61）
  const unit = billing.units as unknown as { name: string; facility_number: string } | null

  let csv = ''

  if (exportType === 'service_record') {
    // サービス提供実績記録票CSV
    const headers = [
      '事業所番号',
      '受給者証番号',
      '支給決定保護者氏名',
      'サービス提供年月',
      '利用日数',
      '給付費請求額',
      '利用者負担額',
    ]
    csv = headers.join(',') + '\r\n'

    details.forEach((d) => {
      const cert = d.children?.benefit_certificates?.[0]
      const row = [
        unit?.facility_number ?? '',
        cert?.certificate_number ?? '',
        d.children?.name ?? '',
        `${year}${month}`,
        d.total_days,
        d.billed_amount,
        d.copay_amount,
      ]
      csv += row.join(',') + '\r\n'
    })
  } else {
    // 請求情報CSV（国保連提出用簡易版）
    const headers = [
      'レコード種別',
      '事業所番号',
      '請求年月',
      '受給者証番号',
      '市町村番号',
      'サービスコード',
      '単位数',
      '給付単価',
      '給付費請求額',
      '利用者負担額',
    ]
    csv = headers.join(',') + '\r\n'

    details.forEach((d) => {
      const cert = d.children?.benefit_certificates?.[0]
      const row = [
        '明細',
        unit?.facility_number ?? '',
        yearMonth,
        cert?.certificate_number ?? '',
        cert?.municipality ?? '',
        d.service_code ?? '637000', // デフォルト: 放デイ基本報酬
        d.total_units,
        d.unit_price,
        d.billed_amount,
        d.copay_amount,
      ]
      csv += row.join(',') + '\r\n'
    })
  }

  // ステータスをexportedに更新
  await supabase
    .from('billing_monthly')
    .update({ status: 'exported' })
    .eq('id', billingMonthlyId)

  const filename = `${exportType}_${yearMonth}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
