'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Send, User } from 'lucide-react'
import { cn } from '@/lib/utils'

type Message = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  read_at: string | null
  created_at: string
  attachments: unknown[]
}

type Staff = {
  id: string
  name: string
  email: string
}

interface Props {
  currentUserId: string
  messages: Message[]
  staffList: Staff[]
}

export function MessagesUI({ currentUserId, messages, staffList }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [selectedStaffId, setSelectedStaffId] = useState<string>(staffList[0]?.id ?? '')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const filteredMessages = messages.filter(
    (m) =>
      (m.sender_id === currentUserId && m.receiver_id === selectedStaffId) ||
      (m.sender_id === selectedStaffId && m.receiver_id === currentUserId)
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filteredMessages.length])

  const handleSend = async () => {
    if (!content.trim() || !selectedStaffId) return
    setSending(true)
    await supabase.from('messages').insert({
      sender_id: currentUserId,
      receiver_id: selectedStaffId,
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

  const selectedStaff = staffList.find((s) => s.id === selectedStaffId)

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] sm:h-[calc(100vh-110px)] pb-16 sm:pb-0">
      <h1 className="text-lg font-bold text-gray-900 mb-3">メッセージ</h1>

      {staffList.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          メッセージできるスタッフがいません
        </div>
      ) : (
        <>
          {/* スタッフ選択 */}
          {staffList.length > 1 && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
              {staffList.map((staff) => (
                <button
                  key={staff.id}
                  onClick={() => setSelectedStaffId(staff.id)}
                  className={cn(
                    'flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                    selectedStaffId === staff.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {staff.name}
                </button>
              ))}
            </div>
          )}

          {/* メッセージヘッダー */}
          {selectedStaff && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg mb-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                <User className="h-4 w-4 text-indigo-600" />
              </div>
              <span className="text-sm font-medium text-gray-900">{selectedStaff.name}</span>
            </div>
          )}

          {/* メッセージ一覧 */}
          <div className="flex-1 overflow-y-auto space-y-3 px-1">
            {filteredMessages.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">
                メッセージがありません。<br />最初のメッセージを送ってみましょう。
              </p>
            )}
            {filteredMessages.map((msg) => {
              const isMe = msg.sender_id === currentUserId
              return (
                <div key={msg.id} className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[75%] space-y-1')}>
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
          <div className="flex gap-2 pt-3 border-t border-gray-200">
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
      )}
    </div>
  )
}
