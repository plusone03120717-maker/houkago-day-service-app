import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Plus, ChevronRight, MessageCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { DateNav } from '@/components/ui/date-nav'

type ContactNote = {
  id: string
  child_id: string
  date: string
  content: string
  published_at: string | null
  parent_comment: string | null
  ai_generated: boolean
  children: { name: string } | null
  units: { name: string } | null
}

export default async function ContactNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; unit?: string }>
}) {
  await requireAdmin()
  const params = await searchParams
  const supabase = await createClient()

  const targetDate = params.date ?? new Date().toISOString().slice(0, 10)

  let query = supabase
    .from('contact_notes')
    .select('id, child_id, date, content, published_at, parent_comment, ai_generated, children(name), units(name)')
    .eq('date', targetDate)
    .order('created_at', { ascending: false })

  if (params.unit) {
    query = query.eq('unit_id', params.unit)
  }

  const { data: notesRaw } = await query
  const notes = (notesRaw ?? []) as unknown as ContactNote[]

  // 当日の出席中で連絡帳未作成の児童を確認
  const { data: attendedRaw } = await supabase
    .from('daily_attendance')
    .select('child_id, children(name), unit_id, units(name)')
    .eq('date', targetDate)
    .eq('status', 'attended')
  const attended = (attendedRaw ?? []) as unknown as Array<{
    child_id: string
    children: { name: string } | null
    unit_id: string
    units: { name: string } | null
  }>

  const notedChildIds = new Set(notes.map((n) => n.child_id))
  const missingNotes = attended.filter((a) => !notedChildIds.has(a.child_id))

  // 前後の日付
  const d = new Date(targetDate)
  const prevDate = new Date(d)
  prevDate.setDate(d.getDate() - 1)
  const nextDate = new Date(d)
  nextDate.setDate(d.getDate() + 1)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">連絡帳</h1>
          <p className="text-sm text-gray-500 mt-0.5">日々の連絡帳作成・管理</p>
        </div>
        <Link href={`/contact-notes/new?date=${targetDate}`}>
          <Button size="sm">
            <Plus className="h-4 w-4" />
            新規作成
          </Button>
        </Link>
      </div>

      {/* 日付ナビ */}
      <div className="flex items-center gap-3">
        <DateNav
          targetDate={targetDate}
          prevDate={prevDate.toISOString().slice(0, 10)}
          nextDate={nextDate.toISOString().slice(0, 10)}
          basePath="/contact-notes"
        />
        <span className="text-sm text-gray-500">{formatDate(targetDate, 'yyyy年MM月dd日')}</span>
      </div>

      {/* 未作成アラート */}
      {missingNotes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm font-medium text-amber-700 mb-2">
            連絡帳が未作成の児童（{missingNotes.length}名）
          </p>
          <div className="flex flex-wrap gap-2">
            {missingNotes.map((a) => (
              <Link
                key={a.child_id}
                href={`/contact-notes/new?date=${targetDate}&childId=${a.child_id}`}
              >
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full hover:bg-amber-200 transition-colors cursor-pointer">
                  {a.children?.name ?? '—'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 連絡帳一覧 */}
      <div className="space-y-2">
        {notes.map((note) => (
          <Link key={note.id} href={`/contact-notes/${note.id}`}>
            <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900">{note.children?.name ?? '—'}</p>
                        {note.units && (
                          <span className="text-xs text-gray-400">{note.units.name}</span>
                        )}
                        {note.ai_generated && (
                          <Badge variant="secondary" className="text-xs">AI生成</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate mt-0.5">{note.content}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {note.parent_comment && (
                      <MessageCircle className="h-4 w-4 text-indigo-400" />
                    )}
                    <Badge variant={note.published_at ? 'success' : 'secondary'}>
                      {note.published_at ? '公開済' : '下書き'}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        {notes.length === 0 && missingNotes.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            この日の連絡帳はありません
          </div>
        )}
      </div>
    </div>
  )
}
