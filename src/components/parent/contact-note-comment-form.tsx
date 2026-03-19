'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'

export function ContactNoteCommentForm({ noteId }: { noteId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [, startTransition] = useTransition()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return
    setLoading(true)

    await supabase
      .from('contact_notes')
      .update({
        parent_comment: comment.trim(),
        parent_commented_at: new Date().toISOString(),
      })
      .eq('id', noteId)

    setLoading(false)
    startTransition(() => router.refresh())
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="施設へのコメントを入力してください..."
        rows={3}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={loading || !comment.trim()}>
          <Send className="h-4 w-4" />
          {loading ? '送信中...' : '返信する'}
        </Button>
      </div>
    </form>
  )
}
