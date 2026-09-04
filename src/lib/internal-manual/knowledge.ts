import type { SupabaseClient } from '@supabase/supabase-js'
import { CATEGORY_META, isCategory } from './categories'

/**
 * サポートボットに渡す社内マニュアル本文を組み立てる。
 *
 * 公開済み（status='published'）の記事だけを対象にする。書きかけのメモや
 * 未確定の下書きを根拠にすると、誤った社内ルールをボットが職員に
 * 案内してしまうため。
 *
 * 記事が1件も無いうちは null を返し、呼び出し側でブロックごと省く。
 * 「社内マニュアル」という見出しだけが空で渡ると、ボットが
 * 「社内マニュアルには記載がありません」と的外れな断り方をするようになる。
 */
export async function loadInternalManualText(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data, error } = await supabase
    .from('internal_manual_articles')
    .select('category, title, body, sort_order, created_at')
    .eq('status', 'published')
    .order('category')
    .order('sort_order')
    .order('created_at')

  if (error) {
    console.error('社内マニュアルの読み込みに失敗:', error)
    return null
  }

  const rows = (data ?? []) as {
    category: string
    title: string
    body: string
    }[]

  const articles = rows.filter((r) => r.body.trim().length > 0)
  if (articles.length === 0) return null

  const sections: string[] = []
  let currentCategory = ''
  for (const article of articles) {
    if (article.category !== currentCategory) {
      currentCategory = article.category
      const label = isCategory(currentCategory)
        ? CATEGORY_META[currentCategory].label
        : currentCategory
      sections.push(`\n■ ${label}`)
    }
    sections.push(`\n【${article.title}】\n${article.body.trim()}`)
  }

  return sections.join('\n')
}
