import Link from 'next/link'
import { NotebookPen, CheckCircle2, BookMarked } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'
import { NewMinutesButton } from '@/components/minutes/new-minutes-button'

export const dynamic = 'force-dynamic'

type MinutesRow = {
  id: string
  title: string
  meeting_date: string
  attendees: string | null
  raw_body: string
  formatted_body: string | null
  status: 'draft' | 'finalized'
  created_by_name: string | null
  reflected_at: string | null
}

function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ]
  return `${y}年${m}月${d}日（${weekday}）`
}

export default async function MinutesPage() {
  const user = await requireSessionUser()
  const isAdmin = user.role === 'admin'
  const supabase = await createClient()

  const { data: raw } = await supabase
    .from('meeting_minutes')
    .select(
      'id, title, meeting_date, attendees, raw_body, formatted_body, status, created_by_name, reflected_at'
    )
    .order('meeting_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  const minutes = (raw ?? []) as MinutesRow[]
  const drafts = minutes.filter((m) => m.status === 'draft')
  const finalized = minutes.filter((m) => m.status === 'finalized')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">議事録</h1>
          <p className="mt-1 text-sm text-gray-600">
            会議のメモをAIで整え、決まったことを社内マニュアルへ引き継ぎます
          </p>
        </div>
        <NewMinutesButton />
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-4 text-sm text-gray-600">
          <NotebookPen className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
          <p className="leading-relaxed">
            会議中は走り書きのままで構いません。あとから
            <span className="mx-1 font-medium text-gray-900">「AIで議事録に整える」</span>
            を押すと、決定事項・検討事項・次回までにやること、の形にまとまります。
            {isAdmin && '確定した議事録からは、社内マニュアルに載せるべき決めごとを抜き出せます。'}
          </p>
        </CardContent>
      </Card>

      {minutes.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-gray-500">
            まだ議事録はありません。右上の「議事録を作る」から始めてください。
          </CardContent>
        </Card>
      ) : (
        <>
          {drafts.length > 0 && <MinutesList title={`作成中（${drafts.length}件）`} rows={drafts} />}
          {finalized.length > 0 && (
            <MinutesList title={`確定済み（${finalized.length}件）`} rows={finalized} />
          )}
        </>
      )}
    </div>
  )
}

function MinutesList({ title, rows }: { title: string; rows: MinutesRow[] }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-gray-600">{title}</h2>
      <Card>
        <CardContent className="divide-y divide-gray-100 p-0">
          {rows.map((m) => {
            const preview = (m.formatted_body ?? m.raw_body).replace(/\n/g, ' ').slice(0, 100)
            return (
              <Link
                key={m.id}
                href={`/minutes/${m.id}`}
                className="block p-4 hover:bg-gray-50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{m.title}</span>
                  {m.status === 'finalized' && (
                    <span className="inline-flex items-center gap-1 rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                      <CheckCircle2 className="h-3 w-3" />
                      確定
                    </span>
                  )}
                  {m.formatted_body && (
                    <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                      整形済み
                    </span>
                  )}
                  {m.reflected_at && (
                    <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      <BookMarked className="h-3 w-3" />
                      マニュアルに反映済み
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {formatDate(m.meeting_date)}
                  {m.attendees && `　出席: ${m.attendees}`}
                  {m.created_by_name && `　記録: ${m.created_by_name}`}
                </p>
                {preview && (
                  <p className="mt-1 line-clamp-2 text-sm text-gray-600">{preview}</p>
                )}
              </Link>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
