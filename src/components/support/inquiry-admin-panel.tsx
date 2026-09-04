'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2, Play, Check, EyeOff, RotateCcw, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { markInquiryRead, saveAdminNote, updateInquiryStatus } from '@/app/actions/support'
import type { InquiryStatus } from '@/lib/support/labels'

/**
 * 管理者が詳細を開いた時点で未読を落とす。
 * 表示する要素は無く、副作用だけを持つ。
 */
export function MarkRead({ id }: { id: string }) {
  useEffect(() => {
    markInquiryRead(id)
  }, [id])
  return null
}

export function InquiryAdminPanel({
  id,
  status,
  adminNote,
}: {
  id: string
  status: InquiryStatus
  adminNote: string | null
}) {
  const [pending, start] = useTransition()
  const [note, setNote] = useState(adminNote ?? '')
  const [savedNote, setSavedNote] = useState(adminNote ?? '')
  const [message, setMessage] = useState<string | null>(null)

  const setStatus = (next: Exclude<InquiryStatus, 'bot_only'>) =>
    start(async () => {
      setMessage(null)
      const result = await updateInquiryStatus(id, next)
      if (result.error) setMessage(result.error)
    })

  const save = () =>
    start(async () => {
      setMessage(null)
      const result = await saveAdminNote(id, note)
      if (result.error) {
        setMessage(result.error)
        return
      }
      setSavedNote(note)
      setMessage('メモを保存しました')
    })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">対応</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex flex-wrap gap-2">
          {status !== 'in_progress' && (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => setStatus('in_progress')}>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              対応中にする
            </Button>
          )}
          {status !== 'resolved' && (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => setStatus('resolved')}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              対応済みにする
            </Button>
          )}
          {status !== 'dismissed' && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setStatus('dismissed')}>
              <EyeOff className="mr-1.5 h-3.5 w-3.5" />
              対応不要
            </Button>
          )}
          {status !== 'open' && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setStatus('open')}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              未対応に戻す
            </Button>
          )}
        </div>

        <div>
          <label htmlFor="admin-note" className="text-xs font-semibold text-gray-500">
            対応メモ（職員にも表示されます）
          </label>
          <textarea
            id="admin-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="例：8/12の送迎時間を修正済み。原因は利用スケジュールの重複登録。"
            className="mt-1 w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-3">
            <Button size="sm" disabled={pending || note === savedNote} onClick={save}>
              {pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              メモを保存
            </Button>
            {message && <span className="text-sm text-gray-600">{message}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
