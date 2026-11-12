'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/auth'
import { hasEditAccess } from '@/lib/require-admin'
import { isCategory } from '@/lib/internal-manual/categories'

type Result = { error?: string }

/**
 * 議事録を書き換える操作（作成・保存・確定・削除・マニュアルへの反映）の入口。
 * できるのはシステム管理者だけ。施設長・スタッフは自分が作った議事録でも閲覧のみ（2026-11-12 依頼主）。
 */
async function requireEditor() {
  const user = await getSessionUser()
  if (!user) return { error: 'ログインが必要です' as const, user: null }
  if (user.role === 'parent') return { error: '権限がありません' as const, user: null }
  if (!(await hasEditAccess())) {
    return { error: '議事録の作成・編集はシステム管理者だけができます' as const, user: null }
  }
  return { error: null, user }
}

export async function createMinutes(fields: {
  title: string
  meetingDate: string
  attendees: string
}): Promise<{ error?: string; id?: string }> {
  const { error: authError, user } = await requireEditor()
  if (authError || !user) return { error: authError ?? '権限がありません' }
  if (!fields.title.trim()) return { error: '会議名を入力してください' }
  if (!fields.meetingDate) return { error: '開催日を入力してください' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('meeting_minutes')
    .insert({
      title: fields.title.trim(),
      meeting_date: fields.meetingDate,
      attendees: fields.attendees.trim() || null,
      created_by: user.id,
      created_by_name: user.name,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/minutes')
  return { id: (data as { id: string }).id }
}

export async function saveMinutes(
  id: string,
  fields: {
    title?: string
    meetingDate?: string
    attendees?: string
    rawBody?: string
    formattedBody?: string | null
  }
): Promise<Result> {
  const { error: authError } = await requireEditor()
  if (authError) return { error: authError }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.title !== undefined) {
    if (!fields.title.trim()) return { error: '会議名を入力してください' }
    patch.title = fields.title.trim()
  }
  if (fields.meetingDate !== undefined) {
    if (!fields.meetingDate) return { error: '開催日を入力してください' }
    patch.meeting_date = fields.meetingDate
  }
  if (fields.attendees !== undefined) patch.attendees = fields.attendees.trim() || null
  if (fields.rawBody !== undefined) patch.raw_body = fields.rawBody
  if (fields.formattedBody !== undefined) patch.formatted_body = fields.formattedBody

  // 自分の議事録か管理者でなければ RLS で弾かれる
  const supabase = await createClient()
  const { error } = await supabase.from('meeting_minutes').update(patch).eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/minutes')
  revalidatePath(`/minutes/${id}`)
  return {}
}

/** 確定・確定解除。確定した議事録だけが社内マニュアルへの反映対象になる */
export async function setMinutesStatus(
  id: string,
  status: 'draft' | 'finalized'
): Promise<Result> {
  const { error: authError } = await requireEditor()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { error } = await supabase
    .from('meeting_minutes')
    .update({
      status,
      finalized_at: status === 'finalized' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/minutes')
  revalidatePath(`/minutes/${id}`)
  return {}
}

export async function deleteMinutes(id: string): Promise<Result> {
  const { error: authError } = await requireEditor()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { error } = await supabase.from('meeting_minutes').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/minutes')
  return {}
}

/**
 * 議事録から抜き出した項目を、社内マニュアルのメモとして登録する。
 *
 * ここでいきなりマニュアル記事を作らないのは意図的。
 * メモとして落としておけば、既存の「メモを溜めて記事に起こす」流れに
 * 合流し、記事にする前にもう一度目を通す段が入る。
 */
export async function reflectToInternalManual(
  minutesId: string,
  items: { category: string; content: string }[]
): Promise<{ error?: string; created?: number }> {
  const { error: authError, user } = await requireEditor()
  if (authError || !user) return { error: authError ?? '権限がありません' }

  const rows = items
    .filter((i) => isCategory(i.category) && i.content.trim())
    .map((i) => ({
      category: i.category,
      content: i.content.trim(),
      created_by: user.id,
      created_by_name: user.name,
      source_minutes_id: minutesId,
    }))

  if (rows.length === 0) return { error: '反映する項目が選ばれていません' }

  const supabase = await createClient()
  const { error } = await supabase.from('internal_notes').insert(rows)
  if (error) return { error: error.message }

  await supabase
    .from('meeting_minutes')
    .update({ reflected_at: new Date().toISOString() })
    .eq('id', minutesId)

  revalidatePath('/internal-manual', 'layout')
  revalidatePath(`/minutes/${minutesId}`)
  return { created: rows.length }
}
