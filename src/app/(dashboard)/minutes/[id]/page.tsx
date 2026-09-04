import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, StickyNote } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BackButton } from '@/components/ui/back-button'
import { MinutesEditor } from '@/components/minutes/minutes-editor'
import { ReflectPanel } from '@/components/minutes/reflect-panel'
import { categoryLabel } from '@/lib/internal-manual/categories'

export const dynamic = 'force-dynamic'

type Minutes = {
  id: string
  title: string
  meeting_date: string
  attendees: string | null
  raw_body: string
  formatted_body: string | null
  status: 'draft' | 'finalized'
  created_by: string | null
  created_by_name: string | null
  reflected_at: string | null
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

export default async function MinutesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireSessionUser()
  const isAdmin = user.role === 'admin'
  const supabase = await createClient()

  const { data: raw } = await supabase
    .from('meeting_minutes')
    .select(
      'id, title, meeting_date, attendees, raw_body, formatted_body, status, created_by, created_by_name, reflected_at'
    )
    .eq('id', id)
    .single()

  if (!raw) notFound()
  const minutes = raw as Minutes

  // 自分の議事録か管理者なら編集できる（RLS でも同じ条件を掛けている）
  const canEdit = isAdmin || minutes.created_by === user.id

  // この議事録から社内マニュアルへ送った項目
  const { data: notesRaw } = await supabase
    .from('internal_notes')
    .select('id, category, content, status')
    .eq('source_minutes_id', id)
    .order('created_at')

  const notes = (notesRaw ?? []) as {
    id: string
    category: string
    content: string
    status: string
  }[]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start gap-3">
        <BackButton fallbackHref="/minutes" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900">{minutes.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {minutes.status === 'finalized' ? (
              <span className="inline-flex items-center gap-1 rounded border border-green-200 bg-green-50 px-2 py-0.5 font-medium text-green-700">
                <CheckCircle2 className="h-3 w-3" />
                確定
              </span>
            ) : (
              <span className="rounded border border-gray-200 bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
                作成中
              </span>
            )}
            <span className="text-gray-500">{minutes.meeting_date}</span>
            {minutes.created_by_name && (
              <span className="text-gray-500">記録: {minutes.created_by_name}</span>
            )}
            {minutes.reflected_at && (
              <span className="text-amber-700">
                マニュアル反映 {jst(minutes.reflected_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      <MinutesEditor
        id={minutes.id}
        title={minutes.title}
        meetingDate={minutes.meeting_date}
        attendees={minutes.attendees ?? ''}
        rawBody={minutes.raw_body}
        formattedBody={minutes.formatted_body}
        status={minutes.status}
        canEdit={canEdit}
      />

      {/* 社内マニュアルへの反映は管理者のみ。確定してからにする */}
      {isAdmin &&
        (minutes.status === 'finalized' ? (
          <ReflectPanel minutesId={minutes.id} reflectedAt={minutes.reflected_at} />
        ) : (
          <Card>
            <CardContent className="p-4 text-sm text-gray-600">
              社内マニュアルへの反映は、議事録を「確定する」と行えるようになります。
            </CardContent>
          </Card>
        ))}

      {notes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <StickyNote className="h-5 w-5 text-amber-500" />
              この議事録から社内マニュアルへ送った項目（{notes.length}件）
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-gray-100 p-0">
            {notes.map((n) => (
              <div key={n.id} className="p-4">
                <p className="text-xs text-gray-500">
                  <Link
                    href={`/internal-manual/${n.category}`}
                    className="text-indigo-600 underline"
                  >
                    {categoryLabel(n.category)}
                  </Link>
                  <span className="ml-2">
                    {n.status === 'included'
                      ? 'マニュアルに反映済み'
                      : n.status === 'archived'
                        ? '見送り'
                        : 'メモとして登録済み（記事化待ち）'}
                  </span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
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
