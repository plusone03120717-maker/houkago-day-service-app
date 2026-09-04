'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createMinutes } from '@/app/actions/minutes'

/** 今日の日付を YYYY-MM-DD（日本時間）で返す */
function todayJST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
}

export function NewMinutesButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [meetingDate, setMeetingDate] = useState(todayJST())
  const [attendees, setAttendees] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      setMessage(null)
      const result = await createMinutes({ title, meetingDate, attendees })
      if (result.error) {
        setMessage(result.error)
        return
      }
      // すぐ本文を書き始められるよう、作成後は編集画面へ送る
      router.push(`/minutes/${result.id}`)
    })

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" />
        議事録を作る
      </Button>
    )
  }

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:w-96">
      <p className="text-sm font-semibold text-gray-900">新しい議事録</p>
      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="minutes-title" className="text-xs font-semibold text-gray-500">
            会議名
          </label>
          <Input
            id="minutes-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：職員会議、ケース会議"
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor="minutes-date" className="text-xs font-semibold text-gray-500">
            開催日
          </label>
          <Input
            id="minutes-date"
            type="date"
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor="minutes-attendees" className="text-xs font-semibold text-gray-500">
            出席者（任意）
          </label>
          <Input
            id="minutes-attendees"
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            placeholder="例：山田、佐藤、鈴木"
            className="mt-1"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" disabled={pending || !title.trim()} onClick={submit}>
          {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          作成して書き始める
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          やめる
        </Button>
        {message && <span className="text-sm text-red-600">{message}</span>}
      </div>
    </div>
  )
}
