import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, Camera } from 'lucide-react'
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
  ai_generated: boolean
  children: { name: string } | null
  units: { name: string } | null
  users: { name: string } | null
}

type PhotoMeta = {
  id: string
  storage_path: string
  file_name: string
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
      id, date, content, published_at, parent_comment, parent_commented_at, ai_generated,
      children (name),
      units (name),
      users!contact_notes_staff_id_fkey (name)
    `)
    .eq('id', id)
    .not('published_at', 'is', null)
    .single()

  if (!noteRaw) notFound()
  const note = noteRaw as unknown as ContactNote

  // Storage 写真取得 + 署名付きURL生成（1時間有効）
  const { data: photosRaw } = await supabase
    .from('contact_note_photos')
    .select('id, storage_path, file_name')
    .eq('note_id', id)
    .order('created_at', { ascending: true })
  const photos = (photosRaw ?? []) as unknown as PhotoMeta[]

  const signedUrlResults = photos.length > 0
    ? await supabase.storage
        .from('contact-photos')
        .createSignedUrls(photos.map((p) => p.storage_path), 3600)
    : { data: [] }

  const photoUrls = photos.map((p, i) => ({
    id: p.id,
    url: signedUrlResults.data?.[i]?.signedUrl ?? null,
    alt: p.file_name,
  })).filter((p) => p.url !== null) as { id: string; url: string; alt: string }[]

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

      {/* 添付写真（Supabase Storage） */}
      {photoUrls.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <Camera className="h-4 w-4 text-indigo-500" />
            今日の活動写真 ({photoUrls.length}枚)
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {photoUrls.map((photo) => (
              <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                <Image
                  src={photo.url}
                  alt={photo.alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, 33vw"
                />
              </div>
            ))}
          </div>
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
