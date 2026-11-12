'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionClaims } from '@/lib/auth'
import { hasEditAccess } from '@/lib/require-admin'
import type { InquiryStatus } from '@/lib/support/labels'

/**
 * 問い合わせの対応状況を変える。
 * 更新できるのは管理者だけ（RLS でも同じ条件を掛けている）。
 * さらに施設長は閲覧のみなので、システム管理者だけに絞る（2026-11-12 依頼主）。
 */
export async function updateInquiryStatus(
  id: string,
  status: Exclude<InquiryStatus, 'bot_only'>
): Promise<{ error?: string }> {
  const claims = await getSessionClaims()
  if (!claims) return { error: 'ログインが必要です' }
  if (!(await hasEditAccess())) return { error: '対応状況の変更はシステム管理者だけができます' }

  const supabase = await createClient()
  const closed = status === 'resolved' || status === 'dismissed'

  const { error } = await supabase
    .from('support_inquiries')
    .update({
      status,
      is_new: false,
      updated_at: new Date().toISOString(),
      resolved_at: closed ? new Date().toISOString() : null,
      resolved_by: closed ? claims.id : null,
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/support')
  revalidatePath(`/support/${id}`)
  return {}
}

/** 管理者のメモ。対応の経緯を残しておく用（書けるのはシステム管理者だけ） */
export async function saveAdminNote(id: string, note: string): Promise<{ error?: string }> {
  const claims = await getSessionClaims()
  if (!claims) return { error: 'ログインが必要です' }
  if (!(await hasEditAccess())) return { error: '対応メモの保存はシステム管理者だけができます' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('support_inquiries')
    .update({ admin_note: note.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath(`/support/${id}`)
  return {}
}

/** 管理者が詳細を開いたら未読を落とす（ベルの件数用）。落とせるのはシステム管理者だけ */
export async function markInquiryRead(id: string): Promise<{ error?: string }> {
  // 役職は users テーブルの値で見る（hasEditAccess＝システム管理者だけ true）。
  // 施設長は閲覧のみ。開いても未読は落とさない（システム管理者が気づけるように残す）
  if (!(await hasEditAccess())) return { error: '既読にできるのはシステム管理者だけです' }

  const supabase = await createClient()
  await supabase.from('support_inquiries').update({ is_new: false }).eq('id', id)
  revalidatePath('/support')
  return {}
}
