'use server'

import { createClient } from '@/lib/supabase/server'
import { hasEditAccess } from '@/lib/require-admin'

/**
 * 承認待ちの利用予定を確定する。
 *
 * 以前はここから保護者ポータルのメッセージへ通知を送っていたが、
 * メッセージ機能は実装しないことになったため確定処理だけを行う。
 */
export async function confirmReservation(reservationId: string): Promise<{ error?: string }> {
  // 施設長・スタッフは利用状況を閲覧のみ（2026-11-12 依頼主）
  if (!(await hasEditAccess())) return { error: '利用予定の確定はシステム管理者だけができます' }
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
  if (!(await hasEditAccess())) return { error: '利用予定の確定はシステム管理者だけができます' }

  const supabase = await createClient()

  const { error } = await supabase
    .from('usage_reservations')
    .update({ status: 'confirmed' })
    .in('id', reservationIds)

  if (error) return { error: error.message }
  return {}
}
