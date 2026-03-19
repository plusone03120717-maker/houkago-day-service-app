import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'contact-photos'

// GET: noteId の写真一覧 + 署名付きURL
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const noteId = request.nextUrl.searchParams.get('noteId')
  if (!noteId) {
    return NextResponse.json({ error: 'noteId は必須です' }, { status: 400 })
  }

  const { data: photos } = await supabase
    .from('contact_note_photos')
    .select('id, storage_path, file_name, file_size, created_at')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true })

  if (!photos || photos.length === 0) {
    return NextResponse.json({ photos: [] })
  }

  // 一括で署名付きURL生成（60分有効）
  const { data: signedUrls } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(photos.map((p) => p.storage_path), 3600)

  const result = photos.map((photo, i) => ({
    ...photo,
    signedUrl: signedUrls?.[i]?.signedUrl ?? null,
  }))

  return NextResponse.json({ photos: result })
}
