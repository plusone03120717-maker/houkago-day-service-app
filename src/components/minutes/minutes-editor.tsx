'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2,
  Save,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  Trash2,
  ArrowRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteMinutes, saveMinutes, setMinutesStatus } from '@/app/actions/minutes'

/**
 * 議事録の編集。
 *
 * 走り書き（rawBody）と整形後（formattedBody）を並べて持つ。
 * AIの整形結果はその場では保存せず、画面で確かめてから
 * 「この内容で保存」を押してもらう。走り書きの方が正しかったときに
 * 戻れなくなるのを避けるため。
 */
export function MinutesEditor({
  id,
  title: initialTitle,
  meetingDate: initialDate,
  attendees: initialAttendees,
  rawBody: initialRaw,
  formattedBody: initialFormatted,
  status,
  canEdit,
}: {
  id: string
  title: string
  meetingDate: string
  attendees: string
  rawBody: string
  formattedBody: string | null
  status: 'draft' | 'finalized'
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [formatting, setFormatting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [title, setTitle] = useState(initialTitle)
  const [meetingDate, setMeetingDate] = useState(initialDate)
  const [attendees, setAttendees] = useState(initialAttendees)
  const [rawBody, setRawBody] = useState(initialRaw)
  const [formatted, setFormatted] = useState(initialFormatted ?? '')
  // AIが返してきた直後の未保存の整形結果
  const [proposal, setProposal] = useState<string | null>(null)

  const dirty =
    title !== initialTitle ||
    meetingDate !== initialDate ||
    attendees !== initialAttendees ||
    rawBody !== initialRaw ||
    formatted !== (initialFormatted ?? '')

  const save = (extra?: { formattedBody?: string }) =>
    start(async () => {
      setMessage(null)
      const result = await saveMinutes(id, {
        title,
        meetingDate,
        attendees,
        rawBody,
        formattedBody: extra?.formattedBody ?? (formatted.trim() ? formatted : null),
      })
      setMessage(result.error ?? '保存しました')
      if (!result.error) router.refresh()
    })

  const format = async () => {
    if (formatting) return
    if (!rawBody.trim()) {
      setMessage('走り書きが空です')
      return
    }

    setFormatting(true)
    setMessage(null)
    try {
      // 整形は保存済みの走り書きを読むので、先に保存しておく
      const saved = await saveMinutes(id, { title, meetingDate, attendees, rawBody })
      if (saved.error) {
        setMessage(saved.error)
        return
      }
      const res = await fetch('/api/minutes/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutesId: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error ?? '整形できませんでした')
        return
      }
      setProposal(data.formatted)
    } catch {
      setMessage('通信に失敗しました')
    } finally {
      setFormatting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 見出し情報 */}
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label htmlFor="m-title" className="text-xs font-semibold text-gray-500">
              会議名
            </label>
            <Input
              id="m-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="m-date" className="text-xs font-semibold text-gray-500">
              開催日
            </label>
            <Input
              id="m-date"
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              disabled={!canEdit}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="m-attendees" className="text-xs font-semibold text-gray-500">
              出席者
            </label>
            <Input
              id="m-attendees"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              disabled={!canEdit}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* 走り書き */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">会議中のメモ（走り書き）</CardTitle>
          {canEdit && (
            <Button size="sm" variant="outline" disabled={formatting || pending} onClick={format}>
              {formatting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              {formatting ? '整えています…' : 'AIで議事録に整える'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <textarea
            value={rawBody}
            onChange={(e) => setRawBody(e.target.value)}
            disabled={!canEdit}
            rows={10}
            placeholder={
              '話が出た順に、そのまま書いて構いません。\n' +
              '例：\n・送迎の人数確認、乗る前と降りた後の2回にする\n・山田→ヒヤリハットは当日中に入力で\n・次回の行事の話は来週まとめる'
            }
            className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:border-indigo-500 focus:outline-none disabled:bg-gray-50"
          />
        </CardContent>
      </Card>

      {/* AIの整形案 */}
      {proposal !== null && (
        <Card className="border-indigo-200 bg-indigo-50/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-indigo-900">
              <Sparkles className="h-4 w-4" />
              AIが整えた議事録（未保存）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <textarea
              value={proposal}
              onChange={(e) => setProposal(e.target.value)}
              rows={16}
              className="w-full resize-y rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm leading-relaxed focus:border-indigo-500 focus:outline-none"
            />
            <p className="text-xs text-gray-600">
              内容を確かめ、必要なら直してから保存してください。走り書きは残ります。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() => {
                  setFormatted(proposal)
                  setProposal(null)
                  save({ formattedBody: proposal })
                }}
              >
                <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                この内容で保存
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>
                破棄する
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 整形後の議事録 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">議事録</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {formatted || canEdit ? (
            <textarea
              value={formatted}
              onChange={(e) => setFormatted(e.target.value)}
              disabled={!canEdit}
              rows={16}
              placeholder="「AIで議事録に整える」を押すか、ここに直接書いてください"
              className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:border-indigo-500 focus:outline-none disabled:bg-gray-50"
            />
          ) : (
            <p className="text-sm text-gray-500">まだ議事録がまとめられていません。</p>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={pending || !dirty} onClick={() => save()}>
            {pending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            保存
          </Button>
          {status === 'draft' ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  // 編集中の内容を取りこぼさないよう、確定の前に保存する
                  await saveMinutes(id, {
                    title,
                    meetingDate,
                    attendees,
                    rawBody,
                    formattedBody: formatted.trim() ? formatted : null,
                  })
                  const result = await setMinutesStatus(id, 'finalized')
                  setMessage(result.error ?? '確定しました')
                  router.refresh()
                })
              }
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              確定する
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await setMinutesStatus(id, 'draft')
                  router.refresh()
                })
              }
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              作成中に戻す
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!confirm('この議事録を削除します。よろしいですか？')) return
              start(async () => {
                const result = await deleteMinutes(id)
                if (result.error) {
                  setMessage(result.error)
                  return
                }
                router.push('/minutes')
              })
            }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            削除
          </Button>
          {message && <span className="text-sm text-gray-600">{message}</span>}
        </div>
      )}
    </div>
  )
}
