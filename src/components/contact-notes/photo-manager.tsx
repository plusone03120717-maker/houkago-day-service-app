'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Camera, Trash2, Upload, X, ImageIcon } from 'lucide-react'

type Photo = {
  id: string
  file_name: string
  file_size: number
  created_at: string
  signedUrl: string | null
}

interface Props {
  noteId: string
  initialPhotos?: Photo[]
}

export function PhotoManager({ noteId, initialPhotos = [] }: Props) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // サーバー側で取得された initialPhotos が空の場合はクライアントでフェッチ
  useEffect(() => {
    if (initialPhotos.length === 0) {
      fetch(`/api/contact-notes/photos/signed-urls?noteId=${noteId}`)
        .then((r) => r.json())
        .then((data: { photos?: Photo[] }) => {
          if (data.photos) setPhotos(data.photos)
        })
        .catch(() => null)
    }
  }, [noteId, initialPhotos.length])

  const uploadFile = useCallback(async (file: File) => {
    setError(null)
    if (file.size > 5 * 1024 * 1024) {
      setError('ファイルサイズは5MB以下にしてください')
      return
    }
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']
    if (!allowed.includes(file.type)) {
      setError('JPEG・PNG・GIF・WebP・HEIC 形式のみ対応しています')
      return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('noteId', noteId)

    try {
      const res = await fetch('/api/contact-notes/photos', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json() as { photo?: Photo & { storage_path: string }; signedUrl?: string; error?: string }
      if (!res.ok || data.error) {
        setError(data.error ?? 'アップロードに失敗しました')
      } else if (data.photo && data.signedUrl) {
        setPhotos((prev) => [...prev, { ...data.photo!, signedUrl: data.signedUrl! }])
      }
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setUploading(false)
    }
  }, [noteId])

  // クリップボードからの貼り付け（Ctrl+V）対応
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const imageItems = items.filter((item) => item.type.startsWith('image/'))
      imageItems.forEach((item) => {
        const file = item.getAsFile()
        if (file) uploadFile(file)
      })
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [uploadFile])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    files.forEach((f) => uploadFile(f))
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach((f) => uploadFile(f))
  }

  const handleDelete = async (photoId: string) => {
    setDeletingId(photoId)
    try {
      const res = await fetch('/api/contact-notes/photos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId }),
      })
      if (res.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId))
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Camera className="h-4 w-4 text-indigo-500" />
          写真添付
          <span className="text-xs font-normal text-gray-400">({photos.length}枚)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* ドロップゾーン */}
        <div
          className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors cursor-pointer ${
            dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload className="h-5 w-5 text-gray-400 mx-auto mb-1" />
          <p className="text-xs text-gray-500">
            {uploading ? 'アップロード中...' : 'タップ・ドラッグ＆ドロップ・Ctrl+V で写真を追加'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">JPEG・PNG・GIF・WebP・HEIC / 最大5MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            <X className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* 写真グリッド */}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                {photo.signedUrl ? (
                  <Image
                    src={photo.signedUrl}
                    alt={photo.file_name}
                    fill
                    className="object-cover cursor-pointer"
                    onClick={() => setPreviewUrl(photo.signedUrl)}
                    sizes="(max-width: 640px) 50vw, 33vw"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <ImageIcon className="h-8 w-8 text-gray-300" />
                  </div>
                )}
                <button
                  onClick={() => handleDelete(photo.id)}
                  disabled={deletingId === photo.id}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white text-xs truncate">{photo.file_name}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {photos.length === 0 && !uploading && (
          <div className="flex items-center justify-center py-6 text-gray-300">
            <div className="text-center">
              <ImageIcon className="h-10 w-10 mx-auto mb-1" />
              <p className="text-xs">写真がありません</p>
            </div>
          </div>
        )}
      </CardContent>

      {/* フルスクリーンプレビュー */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <Button
            variant="outline"
            size="sm"
            className="absolute top-4 right-4 text-white border-white hover:bg-white/10"
            onClick={() => setPreviewUrl(null)}
          >
            <X className="h-4 w-4" />
            閉じる
          </Button>
          <div className="relative max-w-3xl max-h-[90vh] w-full h-full">
            <Image
              src={previewUrl}
              alt="プレビュー"
              fill
              className="object-contain"
              sizes="100vw"
            />
          </div>
        </div>
      )}
    </Card>
  )
}
