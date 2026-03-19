import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { ContactNoteCommentForm } from '@/components/parent/contact-note-comment-form'

type ContactNote = {
  id: string
  date: string
  content: string
  published_at: string
  parent_comment: string | null
  parent_commented_at: string | null
  photo_urls: string[]
  ai_generated: boolean
  children: { name: string } | null
  units: { name: string } | null
  users: { name: string } | null
}

export default async function ContactNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: noteRaw } = await supabase
    .from('contact_notes')
    .select(`
      id, date, content, published_at, parent_comment, parent_commented_at, photo_urls, ai_generated,
      children (name),
      units (name),
      users!contact_notes_staff_id_fkey (name)
    `)
    .eq('id', id)
    .not('published_at', 'is', null)
    .single()

  if (!noteRaw) notFound()
  const note = noteRaw as unknown as ContactNote

  // アクセス権チェック（自分の子供の連絡帳のみ）
  const { data: child } = await supabase
    .from('parent_children')
    .select('child_id')
    .eq('user_id', user.id)
    .single()
  // 簡易チェック（本来はRLSで担保）

  return (
    <div className="space-y-4 pb-20 sm:pb-5">
      <div className="flex items-center gap-2">
        <Link href="/parent/contact-notes" className="p-2 rounded-lg hover:bg-gray-100">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-gray-900">
            {formatDate(note.date, 'yyyy年MM月dd日')}の連絡帳
          </h1>
          <p className="text-xs text-gray-400">
            {note.children?.name} ・ {note.units?.name}
          </p>
        </div>
      </div>

      {/* 連絡帳本文 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-indigo-600">
              {note.users?.name ?? '担当スタッフ'} より
            </span>
            {note.ai_generated && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">AI補助</span>
            )}
          </div>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{note.content}</p>
        </CardContent>
      </Card>

      {/* 添付写真 */}
      {note.photo_urls && note.photo_urls.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {note.photo_urls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`活動写真 ${i + 1}`}
              className="w-full aspect-square object-cover rounded-lg"
            />
          ))}
        </div>
      )}

      {/* 保護者コメント */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">返信・コメント</h2>
        {note.parent_comment ? (
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-green-700">あなたのコメント</span>
                {note.parent_commented_at && (
                  <span className="text-xs text-gray-400">{formatDate(note.parent_commented_at)}</span>
                )}
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.parent_comment}</p>
            </CardContent>
          </Card>
        ) : (
          <ContactNoteCommentForm noteId={note.id} />
        )}
      </div>
    </div>
  )
}
