import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, BookOpen, ChevronRight, MessageCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type ContactNote = {
  id: string
  date: string
  content: string
  published_at: string | null
  parent_comment: string | null
  ai_generated: boolean
}

export default async function ChildContactNotesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: child } = await supabase
    .from('children')
    .select('id, name, name_kana')
    .eq('id', id)
    .single()

  if (!child) notFound()

  const { data: notesRaw } = await supabase
    .from('contact_notes')
    .select('id, date, content, published_at, parent_comment, ai_generated')
    .eq('child_id', id)
    .order('date', { ascending: false })
    .limit(100)

  const notes = (notesRaw ?? []) as unknown as ContactNote[]

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href={`/children/${id}`} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{child.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">連絡帳一覧</p>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-30" />
          連絡帳がありません
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <Link key={note.id} href={`/contact-notes/${note.id}`}>
              <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <BookOpen className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">{formatDate(note.date)}</span>
                        <Badge variant={note.published_at ? 'success' : 'secondary'} className="text-xs">
                          {note.published_at ? '公開済' : '下書き'}
                        </Badge>
                        {note.ai_generated && (
                          <Badge variant="secondary" className="text-xs">AI</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{note.content}</p>
                      {note.parent_comment && (
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-indigo-600">
                          <MessageCircle className="h-3 w-3" />
                          保護者コメントあり
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
