'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/auth'
import { isCategory, type Category } from '@/lib/internal-manual/categories'

type Result = { error?: string }

/** メモ1件の上限。長文はマニュアル記事側で書いてもらう */
const MAX_NOTE_LENGTH = 2000

async function requireStaff() {
  const user = await getSessionUser()
  if (!user) return { error: 'ログインが必要です' as const, user: null }
  if (user.role === 'parent') return { error: '権限がありません' as const, user: null }
  return { error: null, user }
}

// =====================================================
// メモ（職員なら誰でも）
// =====================================================

export async function addNote(category: string, content: string): Promise<Result> {
  const { error: authError, user } = await requireStaff()
  if (authError || !user) return { error: authError ?? '権限がありません' }
  if (!isCategory(category)) return { error: '分類が不正です' }

  const text = content.trim()
  if (!text) return { error: 'メモが空です' }
  if (text.length > MAX_NOTE_LENGTH) {
    return { error: `メモは${MAX_NOTE_LENGTH}文字までです` }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('internal_notes').insert({
    category,
    content: text,
    created_by: user.id,
    created_by_name: user.name,
  })

  if (error) return { error: error.message }
  revalidatePath(`/internal-manual/${category}`)
  revalidatePath('/internal-manual')
  return {}
}

export async function updateNote(id: string, content: string): Promise<Result> {
  const { error: authError } = await requireStaff()
  if (authError) return { error: authError }

  const text = content.trim()
  if (!text) return { error: 'メモが空です' }
  if (text.length > MAX_NOTE_LENGTH) {
    return { error: `メモは${MAX_NOTE_LENGTH}文字までです` }
  }

  // 自分のメモか管理者でなければ RLS で弾かれる
  const supabase = await createClient()
  const { error } = await supabase
    .from('internal_notes')
    .update({ content: text, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/internal-manual', 'layout')
  return {}
}

/** 反映しないと判断したメモを片付ける。消さずに残すのは、判断の経緯を追えるようにするため */
export async function setNoteStatus(
  id: string,
  status: 'open' | 'archived'
): Promise<Result> {
  const { error: authError } = await requireStaff()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { error } = await supabase
    .from('internal_notes')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/internal-manual', 'layout')
  return {}
}

export async function deleteNote(id: string): Promise<Result> {
  const { error: authError } = await requireStaff()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { error } = await supabase.from('internal_notes').delete().eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/internal-manual', 'layout')
  return {}
}

// =====================================================
// マニュアル記事（管理者のみ。RLS でも同じ条件を掛けている）
// =====================================================

export async function createArticle(
  category: string,
  title: string
): Promise<{ error?: string; id?: string }> {
  const { error: authError, user } = await requireStaff()
  if (authError || !user) return { error: authError ?? '権限がありません' }
  if (!isCategory(category)) return { error: '分類が不正です' }
  if (!title.trim()) return { error: '見出しを入力してください' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('internal_manual_articles')
    .insert({
      category,
      title: title.trim(),
      body: '',
      status: 'draft',
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/internal-manual/${category}`)
  return { id: (data as { id: string }).id }
}

/**
 * 記事を保存する。
 *
 * 公開済みの記事を編集した場合は body を直接書き換える（＝すぐ反映される）。
 * 未確定の下書き（draft_body）がある状態で保存したときは下書き側だけを更新し、
 * 「公開」を押すまで職員に見える内容とボットの根拠は変えない。
 */
export async function saveArticle(
  id: string,
  fields: { title?: string; body?: string; draftBody?: string | null }
): Promise<Result> {
  const { error: authError, user } = await requireStaff()
  if (authError || !user) return { error: authError ?? '権限がありません' }

  const patch: Record<string, unknown> = {
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }
  if (fields.title !== undefined) {
    if (!fields.title.trim()) return { error: '見出しを入力してください' }
    patch.title = fields.title.trim()
  }
  if (fields.body !== undefined) patch.body = fields.body
  if (fields.draftBody !== undefined) patch.draft_body = fields.draftBody

  const supabase = await createClient()
  const { error } = await supabase.from('internal_manual_articles').update(patch).eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/internal-manual', 'layout')
  revalidatePath(`/internal-manual/article/${id}`)
  return {}
}

/**
 * 下書きを本文として確定し、公開する。
 * ここで初めてサポートボットの回答根拠になる。
 */
export async function publishArticle(id: string): Promise<Result> {
  const { error: authError, user } = await requireStaff()
  if (authError || !user) return { error: authError ?? '権限がありません' }

  const supabase = await createClient()
  const { data: article } = await supabase
    .from('internal_manual_articles')
    .select('id, category, body, draft_body')
    .eq('id', id)
    .single()

  if (!article) return { error: '記事が見つかりません' }

  const row = article as { category: string; body: string; draft_body: string | null }
  const nextBody = row.draft_body ?? row.body
  if (!nextBody.trim()) return { error: '本文が空のままでは公開できません' }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('internal_manual_articles')
    .update({
      body: nextBody,
      draft_body: null,
      status: 'published',
      published_at: now,
      updated_by: user.id,
      updated_at: now,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  // この記事のもとになったメモを「反映済み」にする
  await supabase
    .from('internal_notes')
    .update({ status: 'included', updated_at: now })
    .eq('article_id', id)
    .eq('status', 'open')

  revalidatePath('/internal-manual', 'layout')
  revalidatePath(`/internal-manual/article/${id}`)
  return {}
}

/** 公開を取り下げる。内容は残るが、ボットは読まなくなる */
export async function unpublishArticle(id: string): Promise<Result> {
  const { error: authError, user } = await requireStaff()
  if (authError || !user) return { error: authError ?? '権限がありません' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('internal_manual_articles')
    .update({ status: 'draft', updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/internal-manual', 'layout')
  revalidatePath(`/internal-manual/article/${id}`)
  return {}
}

/** AIの下書き案を破棄して、公開中の本文だけに戻す */
export async function discardDraft(id: string): Promise<Result> {
  const { error: authError } = await requireStaff()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { error } = await supabase
    .from('internal_manual_articles')
    .update({ draft_body: null, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  // 下書きを捨てたら、取り込み予定だったメモも未反映に戻す
  await supabase
    .from('internal_notes')
    .update({ article_id: null })
    .eq('article_id', id)
    .eq('status', 'open')

  revalidatePath(`/internal-manual/article/${id}`)
  return {}
}

export async function deleteArticle(id: string): Promise<Result> {
  const { error: authError } = await requireStaff()
  if (authError) return { error: authError }

  const supabase = await createClient()

  // 記事を消しても、元になった気づき（メモ）までは失わない
  await supabase
    .from('internal_notes')
    .update({ article_id: null, status: 'open' })
    .eq('article_id', id)

  const { error } = await supabase.from('internal_manual_articles').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/internal-manual', 'layout')
  return {}
}

export type { Category }
