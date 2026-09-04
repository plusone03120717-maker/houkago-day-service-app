import Link from 'next/link'
import { LifeBuoy, Inbox, CheckCircle2, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
  type InquiryCategory,
  type InquirySeverity,
  type InquiryStatus,
} from '@/lib/support/labels'

export const dynamic = 'force-dynamic'

type InquiryRow = {
  id: string
  title: string | null
  category: InquiryCategory | null
  severity: InquirySeverity | null
  summary: string | null
  status: InquiryStatus
  is_new: boolean
  created_by_name: string | null
  page_path: string | null
  created_at: string
  updated_at: string
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

function jst(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export default async function SupportPage() {
  const user = await requireSessionUser()
  const isAdmin = user.role === 'admin'
  const supabase = await createClient()

  // RLS により、管理者は全件・支援員は自分の分だけが返る
  const { data: raw } = await supabase
    .from('support_inquiries')
    .select(
      'id, title, category, severity, summary, status, is_new, created_by_name, page_path, created_at, updated_at'
    )
    .order('updated_at', { ascending: false })
    .limit(300)

  const inquiries = (raw ?? []) as InquiryRow[]

  const pending = inquiries
    .filter((i) => i.status === 'open' || i.status === 'in_progress')
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity ?? 'low'] - SEVERITY_ORDER[b.severity ?? 'low'] ||
        b.updated_at.localeCompare(a.updated_at)
    )
  const closed = inquiries.filter((i) => i.status === 'resolved' || i.status === 'dismissed')
  const botOnly = inquiries.filter((i) => i.status === 'bot_only').slice(0, 50)

  // ボット対応のみの会話は件名が無いので、最初の質問文を一覧の見出しに使う
  const previews = new Map<string, string>()
  if (botOnly.length > 0) {
    const { data: msgs } = await supabase
      .from('support_inquiry_messages')
      .select('inquiry_id, content, created_at')
      .in(
        'inquiry_id',
        botOnly.map((i) => i.id)
      )
      .eq('role', 'user')
      .order('created_at', { ascending: true })

    for (const m of (msgs ?? []) as { inquiry_id: string; content: string }[]) {
      if (!previews.has(m.inquiry_id)) previews.set(m.inquiry_id, m.content)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">サポート問い合わせ</h1>
        <p className="mt-1 text-sm text-gray-600">
          {isAdmin
            ? '職員がサポートボットに相談し、解決しなかったものがここに届きます'
            : 'あなたがサポートボットに相談した履歴です'}
        </p>
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-4 text-sm text-gray-600">
          <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
          <p className="leading-relaxed">
            画面右下の
            <span className="mx-1 font-medium text-gray-900">浮き輪ボタン</span>
            からいつでも質問できます。ボットが操作マニュアルをもとに回答し、
            解決しなかったときだけ「管理者に報告」でここに登録されます。
          </p>
        </CardContent>
      </Card>

      {/* 対応待ち */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-5 w-5 text-red-500" />
            対応待ち {pending.length}件
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-gray-500">対応待ちの問い合わせはありません。</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {pending.map((i) => (
                <InquiryRowItem key={i.id} inquiry={i} showReporter={isAdmin} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 対応済み */}
      {closed.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900">
            対応済み・対応不要（{closed.length}件）
          </summary>
          <Card className="mt-3">
            <CardContent className="divide-y divide-gray-100 p-0">
              {closed.map((i) => (
                <InquiryRowItem key={i.id} inquiry={i} showReporter={isAdmin} />
              ))}
            </CardContent>
          </Card>
        </details>
      )}

      {/* ボットだけで終わった会話 */}
      {botOnly.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900">
            ボット対応のみで終わった相談（{botOnly.length}件）
          </summary>
          <p className="mt-2 text-xs text-gray-500">
            報告には至らなかった相談です。よく聞かれることが分かるので、
            マニュアルの追記や画面改善の材料になります。
          </p>
          <Card className="mt-3">
            <CardContent className="divide-y divide-gray-100 p-0">
              {botOnly.map((i) => (
                <Link
                  key={i.id}
                  href={`/support/${i.id}`}
                  className="flex items-start justify-between gap-3 p-3 hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-800">
                      {previews.get(i.id) ?? '（質問なし）'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {jst(i.created_at)}
                      {showReporterName(isAdmin, i.created_by_name)}
                      {i.page_path && `　${i.page_path}`}
                    </p>
                  </div>
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </details>
      )}
    </div>
  )
}

function showReporterName(isAdmin: boolean, name: string | null): string {
  return isAdmin && name ? `　${name}` : ''
}

function InquiryRowItem({
  inquiry,
  showReporter,
}: {
  inquiry: InquiryRow
  showReporter: boolean
}) {
  const severity = SEVERITY_LABELS[inquiry.severity ?? 'low']
  const status = STATUS_LABELS[inquiry.status]

  return (
    <Link
      href={`/support/${inquiry.id}`}
      className="flex items-start justify-between gap-3 p-4 hover:bg-gray-50"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {inquiry.is_new && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
              NEW
            </span>
          )}
          <span
            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${severity.className}`}
          >
            {severity.label}
          </span>
          <span
            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${status.className}`}
          >
            {status.label}
          </span>
          {inquiry.category && (
            <span className="text-xs text-gray-500">{CATEGORY_LABELS[inquiry.category]}</span>
          )}
        </div>
        <p className="font-medium text-gray-900">{inquiry.title ?? '（件名なし）'}</p>
        {inquiry.summary && (
          <p className="line-clamp-2 text-sm text-gray-600">{inquiry.summary}</p>
        )}
        <p className="text-xs text-gray-500">
          {jst(inquiry.created_at)}
          {showReporterName(showReporter, inquiry.created_by_name)}
          {inquiry.page_path && `　${inquiry.page_path}`}
        </p>
      </div>
      {(inquiry.status === 'resolved' || inquiry.status === 'dismissed') && (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
      )}
    </Link>
  )
}
