'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Send, User } from 'lucide-react'
import { cn } from '@/lib/utils'

type Message = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  read_at: string | null
  created_at: string
}

type ParentUser = {
  id: string
  name: string
  email: string
}

interface Props {
  currentUserId: string
  parents: ParentUser[]
  messages: Message[]
  unreadByParent: Record<string, number>
}

export function StaffMessagesUI({ currentUserId, parents, messages, unreadByParent }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [selectedParentId, setSelectedParentId] = useState<string>(parents[0]?.id ?? '')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const filteredMessages = messages.filter(
    (m) =>
      (m.sender_id === currentUserId && m.receiver_id === selectedParentId) ||
      (m.sender_id === selectedParentId && m.receiver_id === currentUserId)
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filteredMessages.length, selectedParentId])

  // 選択した保護者からの未読を既読に
  useEffect(() => {
    const unreadIds = filteredMessages
      .filter((m) => m.sender_id === selectedParentId && !m.read_at)
      .map((m) => m.id)
    if (unreadIds.length > 0) {
      supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds)
        .then(() => startTransition(() => router.refresh()))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParentId])

  const handleSend = async () => {
    if (!content.trim() || !selectedParentId) return
    setSending(true)
    await supabase.from('messages').insert({
      sender_id: currentUserId,
      receiver_id: selectedParentId,
      content: content.trim(),
      attachments: [],
    })
    setContent('')
    setSending(false)
    startTransition(() => router.refresh())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const selectedParent = parents.find((p) => p.id === selectedParentId)

  return (
    <div className="flex h-[calc(100vh-130px)] gap-4">
      {/* 保護者リスト */}
      <div className="w-56 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto">
        <div className="p-3 border-b border-gray-100">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">保護者</h2>
        </div>
        {parents.map((p) => {
          const unread = unreadByParent[p.id] ?? 0
          return (
            <button
              key={p.id}
              onClick={() => setSelectedParentId(p.id)}
              className={cn(
                'w-full flex items-center gap-2 p-3 text-left transition-colors hover:bg-gray-50',
                selectedParentId === p.id && 'bg-indigo-50 border-r-2 border-indigo-500'
              )}
            >
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <User className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
              </div>
              {unread > 0 && (
                <Badge className="text-xs px-1.5 min-w-[20px] flex-shrink-0">
                  {unread}
                </Badge>
              )}
            </button>
          )
        })}
        {parents.length === 0 && (
          <p className="text-xs text-gray-400 p-3 text-center">保護者がいません</p>
        )}
      </div>

      {/* チャットエリア */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div>
          <h1 className="text-lg font-bold text-gray-900 p-4 pb-0">メッセージ</h1>
        </div>
        {selectedParent ? (
          <>
            {/* ヘッダー */}
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                <User className="h-4 w-4 text-indigo-600" />
              </div>
              <span className="text-sm font-medium text-gray-900">{selectedParent.name}</span>
              <span className="text-xs text-gray-400">{selectedParent.email}</span>
            </div>

            {/* メッセージ一覧 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredMessages.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">
                  メッセージがありません
                </p>
              )}
              {filteredMessages.map((msg) => {
                const isMe = msg.sender_id === currentUserId
                return (
                  <div key={msg.id} className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                    <div className="max-w-[75%] space-y-1">
                      <div
                        className={cn(
                          'px-3 py-2 rounded-2xl text-sm',
                          isMe
                            ? 'bg-indigo-600 text-white rounded-br-sm'
                            : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
                        )}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      <p className={cn('text-xs text-gray-400', isMe ? 'text-right' : 'text-left')}>
                        {formatTime(msg.created_at)}
                        {isMe && msg.read_at && <span className="ml-1 text-indigo-400">既読</span>}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* 入力エリア */}
            <div className="flex gap-2 p-4 border-t border-gray-200">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="メッセージを入力..."
                rows={2}
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
              <Button
                onClick={handleSend}
                disabled={sending || !content.trim()}
                size="icon"
                className="self-end flex-shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            保護者を選択してください
          </div>
        )}
      </div>
    </div>
  )
}
