import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { ContactNoteEditor } from '@/components/contact-notes/contact-note-editor'
import { PhotoManager } from '@/components/contact-notes/photo-manager'

type ContactNote = {
  id: string
  child_id: string
  date: string
  content: string
  published_at: string | null
  parent_comment: string | null
  parent_commented_at: string | null
  ai_generated: boolean
  ai_draft: string | null
  children: { name: string; name_kana: string | null } | null
  units: { name: string } | null
}

type Photo = {
  id: string
  file_name: string
  file_size: number
  created_at: string
  storage_path: string
}

export default async function ContactNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: noteRaw } = await supabase
    .from('contact_notes')
    .select('id, child_id, date, content, published_at, parent_comment, parent_commented_at, ai_generated, ai_draft, children(name, name_kana), units(name)')
    .eq('id', id)
    .single()
  const note = noteRaw as unknown as ContactNote | null

  if (!note) return <div className="p-4 text-gray-500">連絡帳が見つかりません</div>

  // 写真一覧取得 + 署名付きURL生成
  const { data: photosRaw } = await supabase
    .from('contact_note_photos')
    .select('id, file_name, file_size, storage_path, created_at')
    .eq('note_id', id)
    .order('created_at', { ascending: true })
  const photosMeta = (photosRaw ?? []) as unknown as Photo[]

  const signedUrlResults = photosMeta.length > 0
    ? await supabase.storage.from('contact-photos').createSignedUrls(
        photosMeta.map((p) => p.storage_path), 3600
      )
    : { data: [] }

  const photos = photosMeta.map((p, i) => ({
    id: p.id,
    file_name: p.file_name,
    file_size: p.file_size,
    created_at: p.created_at,
    signedUrl: signedUrlResults.data?.[i]?.signedUrl ?? null,
  }))

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href={`/contact-notes?date=${note.date}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{note.children?.name} の連絡帳</h1>
          <p className="text-sm text-gray-500">{formatDate(note.date, 'yyyy年MM月dd日')} | {note.units?.name}</p>
        </div>
      </div>

      {/* 編集フォーム */}
      <ContactNoteEditor
        noteId={note.id}
        initialContent={note.content}
        initialPublished={!!note.published_at}
        aiDraft={note.ai_draft}
        childId={note.child_id}
        date={note.date}
      />

      {/* 写真管理 */}
      <PhotoManager noteId={note.id} initialPhotos={photos} />

      {/* 保護者コメント */}
      {note.parent_comment && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-indigo-700">
              <MessageCircle className="h-4 w-4" />
              保護者からのコメント
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.parent_comment}</p>
            {note.parent_commented_at && (
              <p className="text-xs text-gray-400 mt-2">
                {formatDate(note.parent_commented_at, 'yyyy/MM/dd')}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
