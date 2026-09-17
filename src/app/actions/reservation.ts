'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * 承認待ちの利用予定を確定する。
 *
 * 以前はここから保護者ポータルのメッセージへ通知を送っていたが、
 * メッセージ機能は実装しないことになったため確定処理だけを行う。
 */
export async function confirmReservation(reservationId: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('usage_reservations')
    .update({ status: 'confirmed' })
    .eq('id', reservationId)

  if (error) return { error: error.message }
  return {}
}

/** 複数の利用予定を一括で確定する */
export async function confirmAllReservations(reservationIds: string[]): Promise<{ error?: string }> {
  if (reservationIds.length === 0) return {}

  const supabase = await createClient()

  const { error } = await supabase
    .from('usage_reservations')
    .update({ status: 'confirmed' })
    .in('id', reservationIds)

  if (error) return { error: error.message }
  return {}
}
