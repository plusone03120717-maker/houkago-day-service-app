import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  // 月の範囲
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = new Date(year, month, 0) // 月末
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

  // その月の出席記録を取得
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
    // その日付に有効な受給者証を選択
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

    // 給付量超過チェック
    if (entry.maxDaysPerMonth > 0 && entry.totalDays > entry.maxDaysPerMonth) {
      if (!entry.errors.includes('月の給付量を超過しています')) {
        entry.errors.push('月の給付量を超過しています')
      }
    }
  }

  // 請求詳細を保存
  const detailsToUpsert = Array.from(childMap.values()).map((entry) => ({
    billing_monthly_id: billingMonthlyId,
    child_id: entry.childId,
    certificate_id: entry.certificateId,
    total_days: entry.totalDays,
    total_units: entry.totalDays, // 簡易的に日数＝単位数
    service_code: null, // TODO: サービスコード自動判定
    unit_price: 0, // TODO: 単価設定
    additions: [],
    copay_amount: Math.min(entry.copayLimit, 0), // 暫定
    billed_amount: 0, // TODO: 計算ロジック
    errors: entry.errors,
  }))

  // 既存の詳細を削除して再作成
  await supabase.from('billing_details').delete().eq('billing_monthly_id', billingMonthlyId)

  if (detailsToUpsert.length > 0) {
    await supabase.from('billing_details').insert(detailsToUpsert)
  }

  // ステータスをdraftに更新
  await supabase
    .from('billing_monthly')
    .update({ status: 'draft' })
    .eq('id', billingMonthlyId)

  // フォーム送信の場合はリダイレクト
  const accept = request.headers.get('accept') ?? ''
  if (accept.includes('text/html')) {
    return NextResponse.redirect(new URL('/billing', request.url))
  }

  return NextResponse.json({
    success: true,
    billingMonthlyId,
    childCount: childMap.size,
  })
}
