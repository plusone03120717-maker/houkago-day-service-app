import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'contact-photos'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']

// POST: アップロード
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const noteId = formData.get('noteId') as string | null

  if (!file || !noteId) {
    return NextResponse.json({ error: 'file と noteId は必須です' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'ファイルサイズは5MB以下にしてください' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: '対応していないファイル形式です' }, { status: 400 })
  }

  // ストレージパス: {noteId}/{timestamp}_{originalName}
  const ext = file.name.split('.').pop() ?? 'jpg'
  const storagePath = `${noteId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }

  // メタデータ保存
  const { data: photo, error: dbError } = await supabase
    .from('contact_note_photos')
    .insert({
      note_id: noteId,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
    })
    .select('id, storage_path, file_name, file_size, created_at')
    .single()

  if (dbError || !photo) {
    // ストレージにアップロード済みのファイルを削除
    await supabase.storage.from(BUCKET).remove([storagePath])
    return NextResponse.json({ error: 'メタデータの保存に失敗しました' }, { status: 500 })
  }

  // 署名付き URL を生成（60分有効）
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600)

  return NextResponse.json({ photo, signedUrl: signed?.signedUrl })
}

// DELETE: 写真削除
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { photoId } = await request.json() as { photoId: string }
  if (!photoId) {
    return NextResponse.json({ error: 'photoId は必須です' }, { status: 400 })
  }

  // メタデータ取得
  const { data: photo } = await supabase
    .from('contact_note_photos')
    .select('id, storage_path')
    .eq('id', photoId)
    .single()

  if (!photo) {
    return NextResponse.json({ error: '写真が見つかりません' }, { status: 404 })
  }

  // ストレージから削除
  await supabase.storage.from(BUCKET).remove([photo.storage_path])

  // DBから削除
  await supabase.from('contact_note_photos').delete().eq('id', photoId)

  return NextResponse.json({ success: true })
}
