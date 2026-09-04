import { notFound } from 'next/navigation'
import { MessageSquare, User, Bot } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BackButton } from '@/components/ui/back-button'
import { InquiryAdminPanel, MarkRead } from '@/components/support/inquiry-admin-panel'
import {
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  type InquiryCategory,
  type InquirySeverity,
  type InquiryStatus,
} from '@/lib/support/labels'

export const dynamic = 'force-dynamic'

type Inquiry = {
  id: string
  title: string | null
  category: InquiryCategory | null
  severity: InquirySeverity | null
  summary: string | null
  steps: string | null
  expected: string | null
  actual: string | null
  status: InquiryStatus
  is_new: boolean
  admin_note: string | null
  created_by_name: string | null
  page_path: string | null
  created_at: string
  escalated_at: string | null
}

function jst(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export default async function SupportInquiryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireSessionUser()
  const isAdmin = user.role === 'admin'
  const supabase = await createClient()

  // 自分の問い合わせか管理者でなければ RLS で弾かれ、null が返る
  const { data: inquiryRaw } = await supabase
    .from('support_inquiries')
    .select(
      'id, title, category, severity, summary, steps, expected, actual, status, is_new, admin_note, created_by_name, page_path, created_at, escalated_at'
    )
    .eq('id', id)
    .single()

  if (!inquiryRaw) notFound()
  const inquiry = inquiryRaw as Inquiry

  const { data: messagesRaw } = await supabase
    .from('support_inquiry_messages')
    .select('id, role, content, created_at')
    .eq('inquiry_id', id)
    .order('created_at', { ascending: true })

  const messages = (messagesRaw ?? []) as {
    id: string
    role: 'user' | 'assistant'
    content: string
    created_at: string
  }[]

  const severity = SEVERITY_LABELS[inquiry.severity ?? 'low']
  const status = STATUS_LABELS[inquiry.status]
  const escalated = inquiry.status !== 'bot_only'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* 管理者が開いた時点で未読を落とす */}
      {isAdmin && inquiry.is_new && <MarkRead id={inquiry.id} />}

      <div className="flex items-start gap-3">
        <BackButton fallbackHref="/support" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900">
            {inquiry.title ?? 'ボットへの相談'}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 font-medium ${status.className}`}
            >
              {status.label}
            </span>
            {escalated && (
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 font-semibold ${severity.className}`}
              >
                {severity.label}
              </span>
            )}
            {inquiry.category && (
              <span className="text-gray-600">{CATEGORY_LABELS[inquiry.category]}</span>
            )}
            <span className="text-gray-500">
              {jst(inquiry.created_at)}
              {inquiry.created_by_name && `　${inquiry.created_by_name}`}
            </span>
            {inquiry.page_path && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-600">
                {inquiry.page_path}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 報告内容（エスカレーション時にAIが整理したもの） */}
      {escalated && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">報告内容</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0 text-sm">
            <Field label="要約" value={inquiry.summary} />
            <Field label="再現手順" value={inquiry.steps} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="本来どうなるはずか" value={inquiry.expected} />
              <Field label="実際に起きたこと" value={inquiry.actual} />
            </div>
            <p className="text-xs text-gray-400">
              ※ この欄は会話をもとにAIが整理したものです。正確なやり取りは下の会話ログをご確認ください。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 会話ログ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-5 w-5 text-gray-400" />
            会話ログ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {messages.length === 0 ? (
            <p className="text-sm text-gray-500">会話がありません。</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="flex gap-3">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    m.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {m.role === 'user' ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500">
                    {m.role === 'user' ? (inquiry.created_by_name ?? '職員') : 'サポートボット'}
                    　{jst(m.created_at)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                    {m.content}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* 管理者の対応メモ。報告した職員にも見せる（何がどうなったか分からないままにしない） */}
      {inquiry.admin_note && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">管理者からの対応メモ</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
              {inquiry.admin_note}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 管理者の対応 */}
      {isAdmin && escalated && (
        <InquiryAdminPanel
          id={inquiry.id}
          status={inquiry.status}
          adminNote={inquiry.admin_note}
        />
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-gray-800">
        {value?.trim() ? value : '—'}
      </p>
    </div>
  )
}
