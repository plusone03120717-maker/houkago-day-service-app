import Link from 'next/link'
import { BookMarked, FileText, StickyNote, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'
import { CATEGORIES, CATEGORY_META } from '@/lib/internal-manual/categories'

export const dynamic = 'force-dynamic'

export default async function InternalManualPage() {
  const user = await requireSessionUser()
  const isAdmin = user.role === 'admin'
  const supabase = await createClient()

  // 分類ごとの件数を出すだけなので、必要な列だけをまとめて取って数える
  const [{ data: articlesRaw }, { data: notesRaw }] = await Promise.all([
    supabase.from('internal_manual_articles').select('category, status'),
    supabase.from('internal_notes').select('category, status'),
  ])

  const articles = (articlesRaw ?? []) as { category: string; status: string }[]
  const notes = (notesRaw ?? []) as { category: string; status: string }[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">社内マニュアル</h1>
        <p className="mt-1 text-sm text-gray-600">
          法人の運用ルールや支援の方針をまとめる場所です
        </p>
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-4 text-sm text-gray-600">
          <BookMarked className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
          <div className="space-y-1 leading-relaxed">
            <p>
              気づいたことは、整った文章にする必要はありません。分類を選んで
              <span className="mx-1 font-medium text-gray-900">メモ</span>
              に放り込んでおいてください。溜まったメモは
              {isAdmin ? '「AIで下書きを作る」で記事に整え、内容を確認して公開します。' : '管理者が記事に整えて公開します。'}
            </p>
            <p>
              公開された記事は、右下のサポートボットが回答の根拠として読みます。
              「うちの法人ではどうしてる？」にボットが答えられるようになります。
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {CATEGORIES.map((category) => {
          const meta = CATEGORY_META[category]
          const published = articles.filter(
            (a) => a.category === category && a.status === 'published'
          ).length
          const draft = articles.filter(
            (a) => a.category === category && a.status === 'draft'
          ).length
          const openNotes = notes.filter(
            (n) => n.category === category && n.status === 'open'
          ).length

          return (
            <Link key={category} href={`/internal-manual/${category}`}>
              <Card className="h-full transition-colors hover:border-indigo-300 hover:bg-gray-50">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${meta.className}`}
                      >
                        {meta.label}
                      </span>
                      <p className="mt-2 text-xs leading-relaxed text-gray-600">
                        {meta.description}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-300" />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5 text-gray-400" />
                      公開中の記事 {published}件
                      {draft > 0 && <span className="text-amber-700">（未公開 {draft}）</span>}
                    </span>
                    <span className="flex items-center gap-1">
                      <StickyNote className="h-3.5 w-3.5 text-gray-400" />
                      未反映のメモ {openNotes}件
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
