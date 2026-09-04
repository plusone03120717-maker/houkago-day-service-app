import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, StickyNote } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BackButton } from '@/components/ui/back-button'
import { ArticleEditor } from '@/components/internal-manual/article-editor'
import { CATEGORY_META, isCategory } from '@/lib/internal-manual/categories'

export const dynamic = 'force-dynamic'

type Article = {
  id: string
  category: string
  title: string
  body: string
  draft_body: string | null
  status: 'draft' | 'published'
  updated_at: string
  published_at: string | null
}

function jst(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export default async function InternalManualArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireSessionUser()
  const isAdmin = user.role === 'admin'
  const supabase = await createClient()

  const { data: raw } = await supabase
    .from('internal_manual_articles')
    .select('id, category, title, body, draft_body, status, updated_at, published_at')
    .eq('id', id)
    .single()

  if (!raw) notFound()
  const article = raw as Article

  // この記事のもとになったメモ。「なぜこう書いてあるのか」を辿れるようにする
  const { data: notesRaw } = await supabase
    .from('internal_notes')
    .select('id, content, created_by_name, created_at, status')
    .eq('article_id', id)
    .order('created_at')

  const notes = (notesRaw ?? []) as {
    id: string
    content: string
    created_by_name: string | null
    created_at: string
    status: string
  }[]

  const meta = isCategory(article.category) ? CATEGORY_META[article.category] : null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start gap-3">
        <BackButton fallbackHref={`/internal-manual/${article.category}`} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900">{article.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {meta && (
              <Link
                href={`/internal-manual/${article.category}`}
                className={`inline-flex items-center rounded border px-2 py-0.5 font-semibold ${meta.className}`}
              >
                {meta.label}
              </Link>
            )}
            {article.status === 'published' ? (
              <span className="inline-flex items-center gap-1 rounded border border-green-200 bg-green-50 px-2 py-0.5 font-medium text-green-700">
                <Eye className="h-3 w-3" />
                公開中（ボットが参照します）
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
                <EyeOff className="h-3 w-3" />
                未公開（ボットは読みません）
              </span>
            )}
            <span className="text-gray-500">更新 {jst(article.updated_at)}</span>
            {article.published_at && (
              <span className="text-gray-500">公開 {jst(article.published_at)}</span>
            )}
          </div>
        </div>
      </div>

      {isAdmin ? (
        <ArticleEditor
          id={article.id}
          title={article.title}
          body={article.body}
          draftBody={article.draft_body}
          status={article.status}
        />
      ) : (
        <Card>
          <CardContent className="p-6">
            {article.body.trim() ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                {article.body}
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                この記事はまだ本文が用意されていません。
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {notes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <StickyNote className="h-5 w-5 text-amber-500" />
              もとになったメモ（{notes.length}件）
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-gray-100 p-0">
            {notes.map((n) => (
              <div key={n.id} className="p-4">
                <p className="text-xs text-gray-500">
                  {n.created_by_name ?? '職員'}　{jst(n.created_at)}
                  {n.status === 'open' && (
                    <span className="ml-2 text-amber-700">（公開待ち）</span>
                  )}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                  {n.content}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
