import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronRight, MessageCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type ContactNote = {
  id: string
  date: string
  content: string
  published_at: string
  parent_comment: string | null
  children: { name: string } | null
  units: { name: string } | null
}

export default async function ParentContactNotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: parentChildrenRaw } = await supabase
    .from('parent_children')
    .select('child_id')
    .eq('user_id', user.id)
  const childIds = (parentChildrenRaw ?? []).map((pc) => pc.child_id as string)

  const { data: notesRaw } = childIds.length > 0
    ? await supabase
        .from('contact_notes')
        .select('id, date, content, published_at, parent_comment, children(name), units(name)')
        .in('child_id', childIds)
        .not('published_at', 'is', null)
        .order('date', { ascending: false })
        .limit(50)
    : { data: [] }
  const notes = (notesRaw ?? []) as unknown as ContactNote[]

  // 月ごとにグループ化
  const grouped = notes.reduce<Record<string, ContactNote[]>>((acc, note) => {
    const key = note.date.slice(0, 7) // YYYY-MM
    if (!acc[key]) acc[key] = []
    acc[key].push(note)
    return acc
  }, {})

  return (
    <div className="space-y-5 pb-20 sm:pb-5">
      <h1 className="text-lg font-bold text-gray-900">連絡帳</h1>

      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          連絡帳がまだありません
        </div>
      ) : (
        Object.entries(grouped).map(([yearMonth, monthNotes]) => {
          const [y, m] = yearMonth.split('-')
          return (
            <section key={yearMonth}>
              <h2 className="text-sm font-semibold text-gray-500 mb-2 px-1">
                {y}年{m}月
              </h2>
              <div className="space-y-2">
                {monthNotes.map((note) => (
                  <Link key={note.id} href={`/parent/contact-notes/${note.id}`}>
                    <Card className="hover:shadow-sm transition-shadow active:bg-gray-50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              {formatDate(note.date, 'MM月dd日')}
                            </span>
                            {note.children && (
                              <span className="text-xs text-gray-400">
                                {note.children.name}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {note.parent_comment && (
                              <MessageCircle className="h-4 w-4 text-green-500" />
                            )}
                            <ChevronRight className="h-4 w-4 text-gray-300" />
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">{note.content}</p>
                        {note.units && (
                          <p className="text-xs text-gray-400 mt-1">{note.units.name}</p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
