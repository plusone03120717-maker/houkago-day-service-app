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

/** 一覧に出すボット会話の上限。これを超えた分は件数だけ知らせる */
const BOT_ONLY_LIMIT = 150

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
  const botOnlyAll = inquiries.filter((i) => i.status === 'bot_only')
  const botOnly = botOnlyAll.slice(0, BOT_ONLY_LIMIT)

  // ボット対応のみの会話は件名が無い。一覧で中身が分かるよう、
  // 最初の質問とボットの最初の回答、やり取りの往復数を出す。
  // 一件ずつ開かないと何を聞かれたのか分からない作りだと、結局読まれない。
  const previews = new Map<string, { question: string; answer: string; count: number }>()
  if (botOnly.length > 0) {
    const { data: msgs } = await supabase
      .from('support_inquiry_messages')
      .select('inquiry_id, role, content, created_at')
      .in(
        'inquiry_id',
        botOnly.map((i) => i.id)
      )
      .order('created_at', { ascending: true })

    for (const m of (msgs ?? []) as {
      inquiry_id: string
      role: 'user' | 'assistant'
      content: string
    }[]) {
      const entry = previews.get(m.inquiry_id) ?? { question: '', answer: '', count: 0 }
      if (m.role === 'user' && !entry.question) entry.question = m.content
      if (m.role === 'assistant' && !entry.answer) entry.answer = m.content
      entry.count++
      previews.set(m.inquiry_id, entry)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">サポート問い合わせ</h1>
        <p className="mt-1 text-sm text-gray-600">
          {isAdmin
            ? '職員がサポートボットに聞いた内容と、報告された不具合をここで読めます'
            : 'あなたがサポートボットに相談した履歴です'}
        </p>
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-4 text-sm text-gray-600">
          <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
          <p className="leading-relaxed">
            画面右下の
            <span className="mx-1 font-medium text-gray-900">浮き輪ボタン</span>
            からいつでも質問できます。ボットがマニュアルと実際の記録をもとに回答し、
            解決しなかったときは「管理者に報告」で対応待ちに載ります。
            {isAdmin && '報告されなかった会話も下の一覧にすべて残ります。'}
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

      {/* ボットとのやり取り。折りたたまずに出す。
          報告に至らなかった相談こそ「職員が何につまずいているか」の一次情報で、
          隠れていると読まれないため */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-5 w-5 text-gray-400" />
            ボットとのやり取り {botOnlyAll.length}件
          </CardTitle>
          <p className="text-xs leading-relaxed text-gray-500">
            {isAdmin
              ? '管理者に報告されなかった相談も含め、職員がボットに聞いた内容をすべて読めます。よく聞かれることは、マニュアルの追記や画面改善の材料になります。'
              : 'あなたがボットに聞いた内容の履歴です。'}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {botOnly.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-gray-500">まだやり取りはありません。</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {botOnly.map((i) => {
                const preview = previews.get(i.id)
                return (
                  <Link
                    key={i.id}
                    href={`/support/${i.id}`}
                    className="block p-4 hover:bg-gray-50"
                  >
                    <p className="text-xs text-gray-500">
                      {jst(i.created_at)}
                      {showReporterName(isAdmin, i.created_by_name)}
                      {preview && preview.count > 2 && `　往復${Math.floor(preview.count / 2)}回`}
                      {i.page_path && (
                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-600">
                          {i.page_path}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-900">
                      {preview?.question || '（質問なし）'}
                    </p>
                    {preview?.answer && (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                        ボット: {preview.answer}
                      </p>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
          {botOnlyAll.length > botOnly.length && (
            <p className="px-4 pb-4 pt-1 text-xs text-gray-500">
              ほか{botOnlyAll.length - botOnly.length}件は表示していません（新しい{BOT_ONLY_LIMIT}件のみ表示）
            </p>
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
