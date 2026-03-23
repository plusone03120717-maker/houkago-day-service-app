import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { planId, month } = await req.json() // month: "2026-03"
  if (!planId || !month) {
    return NextResponse.json({ error: 'planId and month required' }, { status: 400 })
  }

  const supabase = await createClient()

  // プランを取得
  const { data: plan, error: planError } = await supabase
    .from('usage_plans')
    .select('id, child_id, unit_id, day_of_week, start_date, end_date, is_active')
    .eq('id', planId)
    .single()

  if (planError || !plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  }

  // 対象月の日付を列挙
  const [year, mon] = month.split('-').map(Number)
  const daysInMonth = new Date(year, mon, 0).getDate()

  const planStart = new Date(plan.start_date)
  const planEnd = plan.end_date ? new Date(plan.end_date) : null

  const datesToCreate: string[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, mon - 1, d)
    const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayOfWeek = date.getDay()

    // 曜日チェック
    if (!(plan.day_of_week as number[]).includes(dayOfWeek)) continue

    // 期間チェック
    if (date < planStart) continue
    if (planEnd && date > planEnd) continue

    datesToCreate.push(dateStr)
  }

  if (datesToCreate.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0 })
  }

  // 既存の予約を確認（重複スキップ）
  const { data: existing } = await supabase
    .from('usage_reservations')
    .select('date')
    .eq('child_id', plan.child_id)
    .eq('unit_id', plan.unit_id)
    .in('date', datesToCreate)

  const existingDates = new Set((existing ?? []).map((r: { date: string }) => r.date))
  const toInsert = datesToCreate.filter((d) => !existingDates.has(d))

  if (toInsert.length > 0) {
    await supabase.from('usage_reservations').insert(
      toInsert.map((date) => ({
        child_id: plan.child_id,
        unit_id: plan.unit_id,
        date,
        status: 'confirmed',
      }))
    )
  }

  return NextResponse.json({
    created: toInsert.length,
    skipped: datesToCreate.length - toInsert.length,
  })
}
