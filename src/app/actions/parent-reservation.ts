'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

type MakeReservationParams = {
  childId: string
  unitId: string
  date: string
  transportType: string
  pickupLocationType: string
  pickupTime: string | null
  dropoffTime: string | null
}

/**
 * 保護者ポータルからの予約作成。
 * 利用計画と照合し、一致する場合は自動で confirmed に確定する（プランA）。
 * 計画外の日付は reserved（承認待ち）で作成する。
 */
export async function makeParentReservation(
  params: MakeReservationParams
): Promise<{ error?: string; autoConfirmed?: boolean }> {
  const { childId, unitId, date, transportType, pickupLocationType, pickupTime, dropoffTime } = params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  // usage_plans は staff 専用の RLS があるためサービスロールで参照
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // 予約日の曜日（0=日〜6=土）
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()

  // 利用計画と照合：同ユニット・有効・期間内・曜日が一致するプランがあれば自動確定
  const { data: matchingPlan } = await adminClient
    .from('usage_plans')
    .select('id')
    .eq('child_id', childId)
    .eq('unit_id', unitId)
    .eq('is_active', true)
    .lte('start_date', date)
    .or(`end_date.is.null,end_date.gte.${date}`)
    .contains('day_of_week', [dow])
    .limit(1)
    .maybeSingle()

  const autoConfirmed = !!matchingPlan

  const { error } = await supabase.from('usage_reservations').insert({
    child_id: childId,
    unit_id: unitId,
    date,
    status: autoConfirmed ? 'confirmed' : 'reserved',
    requested_by: user.id,
    requested_at: new Date().toISOString(),
    transport_type: transportType,
    pickup_location_type: pickupLocationType,
    pickup_time: pickupTime || null,
    dropoff_time: dropoffTime || null,
  })

  if (error) return { error: error.message }
  return { autoConfirmed }
}
