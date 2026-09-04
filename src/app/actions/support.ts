'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionClaims } from '@/lib/auth'
import type { InquiryStatus } from '@/lib/support/labels'

/**
 * 問い合わせの対応状況を変える。
 * 更新できるのは管理者だけ（RLS でも同じ条件を掛けている）。
 */
export async function updateInquiryStatus(
  id: string,
  status: Exclude<InquiryStatus, 'bot_only'>
): Promise<{ error?: string }> {
  const claims = await getSessionClaims()
  if (!claims) return { error: 'ログインが必要です' }

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

/** 管理者のメモ。対応の経緯を残しておく用 */
export async function saveAdminNote(id: string, note: string): Promise<{ error?: string }> {
  const claims = await getSessionClaims()
  if (!claims) return { error: 'ログインが必要です' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('support_inquiries')
    .update({ admin_note: note.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath(`/support/${id}`)
  return {}
}

/** 管理者が詳細を開いたら未読を落とす（ベルの件数用） */
export async function markInquiryRead(id: string): Promise<void> {
  const claims = await getSessionClaims()
  if (claims?.role !== 'admin') return

  const supabase = await createClient()
  await supabase.from('support_inquiries').update({ is_new: false }).eq('id', id)
  revalidatePath('/support')
}
