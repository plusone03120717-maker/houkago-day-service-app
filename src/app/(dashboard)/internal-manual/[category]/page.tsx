import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileText, StickyNote, Eye, EyeOff, PenLine } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BackButton } from '@/components/ui/back-button'
import { NoteForm } from '@/components/internal-manual/note-form'
import { NoteItem } from '@/components/internal-manual/note-item'
import { GenerateDraftButton, NewArticleButton } from '@/components/internal-manual/admin-actions'
import { CATEGORY_META, isCategory } from '@/lib/internal-manual/categories'

export const dynamic = 'force-dynamic'

type ArticleRow = {
  id: string
  title: string
  body: string
  draft_body: string | null
  status: 'draft' | 'published'
  updated_at: string
}

type NoteRow = {
  id: string
  content: string
  status: 'open' | 'included' | 'archived'
  article_id: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
}

function jst(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export default async function InternalManualCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = await params
  if (!isCategory(category)) notFound()

  const user = await requireSessionUser()
  const isAdmin = user.role === 'admin'
  const meta = CATEGORY_META[category]
  const supabase = await createClient()

  const [{ data: articlesRaw }, { data: notesRaw }] = await Promise.all([
    supabase
      .from('internal_manual_articles')
      .select('id, title, body, draft_body, status, updated_at')
      .eq('category', category)
      .order('sort_order')
      .order('created_at'),
    supabase
      .from('internal_notes')
      .select('id, content, status, article_id, created_by, created_by_name, created_at')
      .eq('category', category)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const articles = (articlesRaw ?? []) as ArticleRow[]
  const notes = (notesRaw ?? []) as NoteRow[]

  const openNotes = notes.filter((n) => n.status === 'open')
  const doneNotes = notes.filter((n) => n.status !== 'open')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start gap-3">
        <BackButton fallbackHref="/internal-manual" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{meta.label}</h1>
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${meta.className}`}
            >
              社内マニュアル
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">{meta.description}</p>
        </div>
      </div>

      {/* メモの投稿。一番よく使うので最上部に置く */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PenLine className="h-5 w-5 text-indigo-500" />
            メモを追加する
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <NoteForm category={category} />
        </CardContent>
      </Card>

      {/* マニュアル記事 */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-gray-400" />
            マニュアル（{articles.length}件）
          </CardTitle>
          {isAdmin && <NewArticleButton category={category} />}
        </CardHeader>
        <CardContent className="p-0">
          {articles.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-gray-500">
              まだ記事はありません。
              {isAdmin
                ? 'メモが溜まったら「AIで下書きを作る」から記事に起こしてください。'
                : 'メモが溜まると管理者が記事にまとめます。'}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {articles.map((a) => (
                <Link
                  key={a.id}
                  href={`/internal-manual/article/${a.id}`}
                  className="flex items-start justify-between gap-3 p-4 hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">{a.title}</span>
                      {a.status === 'published' ? (
                        <span className="inline-flex items-center gap-1 rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                          <Eye className="h-3 w-3" />
                          公開中
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          <EyeOff className="h-3 w-3" />
                          未公開
                        </span>
                      )}
                      {a.draft_body && (
                        <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                          未確認の下書きあり
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                      {(a.body || a.draft_body || '').slice(0, 120) || '（本文なし）'}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">更新 {jst(a.updated_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 未反映のメモ */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <StickyNote className="h-5 w-5 text-amber-500" />
            まだマニュアルに反映していないメモ（{openNotes.length}件）
          </CardTitle>
          {isAdmin && openNotes.length > 0 && (
            <GenerateDraftButton category={category} noteCount={openNotes.length} />
          )}
        </CardHeader>
        <CardContent className="p-0">
          {openNotes.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-gray-500">未反映のメモはありません。</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {openNotes.map((n) => (
                <NoteItem
                  key={n.id}
                  id={n.id}
                  content={n.content}
                  authorName={n.created_by_name}
                  createdAt={jst(n.created_at)}
                  linkedToArticle={Boolean(n.article_id)}
                  canEdit={isAdmin || n.created_by === user.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {doneNotes.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900">
            反映済み・見送りにしたメモ（{doneNotes.length}件）
          </summary>
          <Card className="mt-3">
            <CardContent className="divide-y divide-gray-100 p-0">
              {doneNotes.map((n) => (
                <div key={n.id} className="p-3">
                  <p className="text-xs text-gray-500">
                    {n.status === 'included' ? '反映済み' : '見送り'}
                    {n.created_by_name ?? '職員'}　{jst(n.created_at)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">{n.content}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </details>
      )}
    </div>
  )
}
