import Link from 'next/link'
import { AlertTriangle, AlertCircle, CheckCircle2, History, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RULES } from '@/lib/anomaly/rules'
import { FindingActions, RunCheckButton } from '@/components/checks/finding-actions'

export const dynamic = 'force-dynamic'

type FindingRow = {
  id: string
  rule: string
  severity: 'high' | 'medium' | 'low'
  child_id: string | null
  target_date: string | null
  table_name: string | null
  message: string
  detail: Record<string, unknown>
  status: 'open' | 'resolved' | 'dismissed'
  detected_at: string
  children: { name: string } | null
}

type RunRow = {
  started_at: string
  finished_at: string | null
  trigger_source: string
  found_count: number
  new_count: number
  error: string | null
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

const SEVERITY_STYLE: Record<string, { label: string; className: string }> = {
  high: { label: '要確認', className: 'bg-red-100 text-red-700 border-red-200' },
  medium: { label: '確認推奨', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  low: { label: '参考', className: 'bg-gray-100 text-gray-700 border-gray-200' },
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

export default async function ChecksPage() {
  await requireSessionUser()
  const supabase = await createClient()

  const [{ data: findingsRaw }, { data: runsRaw }] = await Promise.all([
    supabase
      .from('anomaly_findings')
      .select('id, rule, severity, child_id, target_date, table_name, message, detail, status, detected_at, children(name)')
      .order('target_date', { ascending: true })
      .limit(500),
    supabase
      .from('anomaly_check_runs')
      .select('started_at, finished_at, trigger_source, found_count, new_count, error')
      .order('started_at', { ascending: false })
      .limit(1),
  ])

  const findings = (findingsRaw ?? []) as unknown as FindingRow[]
  const lastRun = ((runsRaw ?? []) as RunRow[])[0] ?? null

  const open = findings
    .filter((f) => f.status === 'open')
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        (a.target_date ?? '').localeCompare(b.target_date ?? '')
    )
  const closed = findings
    .filter((f) => f.status !== 'open')
    .sort((a, b) => b.detected_at.localeCompare(a.detected_at))
    .slice(0, 50)

  const highCount = open.filter((f) => f.severity === 'high').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">入力チェック</h1>
          <p className="mt-1 text-sm text-gray-600">
            予定・実績の入力ミスと思われる箇所を自動で検出します
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/checks/history"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium shadow-sm hover:bg-gray-100"
          >
            <History className="h-4 w-4" />
            変更履歴
          </Link>
          <RunCheckButton />
        </div>
      </div>

      {/* 監視そのものが止まっていることに気づけるよう、実行状況を必ず出す */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
          {lastRun ? (
            <>
              <span className="text-gray-600">
                最終チェック:{' '}
                <span className="font-medium text-gray-900">{jst(lastRun.started_at)}</span>
                <span className="ml-1 text-gray-500">
                  （{lastRun.trigger_source === 'cron' ? '自動' : '手動'}）
                </span>
              </span>
              {lastRun.error ? (
                <span className="font-medium text-red-600">失敗: {lastRun.error}</span>
              ) : lastRun.finished_at ? (
                <span className="text-gray-600">
                  検出 {lastRun.found_count}件 / 新規 {lastRun.new_count}件
                </span>
              ) : (
                <span className="text-gray-500">実行中…</span>
              )}
            </>
          ) : (
            <span className="text-gray-500">まだ一度も実行されていません</span>
          )}
        </CardContent>
      </Card>

      {open.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-8 text-gray-600">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            未対応の指摘はありません。
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              未対応 {open.length}件
              {highCount > 0 && (
                <span className="text-sm font-normal text-red-600">（要確認 {highCount}件）</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-gray-100 p-0">
            {open.map((f) => {
              const style = SEVERITY_STYLE[f.severity]
              const dates = Array.isArray(f.detail?.dates) ? (f.detail.dates as string[]) : null
              return (
                <div key={f.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${style.className}`}
                      >
                        {style.label}
                      </span>
                      <span className="font-medium text-gray-900">
                        {f.children?.name ?? '（児童不明）'}
                      </span>
                      <Badge variant="secondary" className="font-normal">
                        {RULES.find((r) => r.key === f.rule)?.label ?? f.rule}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-700">{f.message}</p>
                    {dates && (
                      <p className="text-xs text-gray-500">
                        対象日: {dates.map((d) => d.slice(5).replace('-', '/')).join('、')}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs">
                      {f.child_id && f.target_date && (
                        <Link
                          href={`/checks/history?child=${f.child_id}&date=${f.target_date}`}
                          className="text-indigo-600 hover:underline"
                        >
                          この日の変更履歴を見る
                        </Link>
                      )}
                      {f.target_date && (
                        <Link
                          href={`/attendance?date=${f.target_date}`}
                          className="text-indigo-600 hover:underline"
                        >
                          出席管理で開く
                        </Link>
                      )}
                      {/* 利用スケジュールの指摘は、直す場所がその児童の設定画面にある */}
                      {f.table_name === 'usage_plans' && f.child_id && (
                        <Link
                          href={`/children/${f.child_id}/schedule`}
                          className="text-indigo-600 hover:underline"
                        >
                          利用スケジュールを開く
                        </Link>
                      )}
                    </div>
                  </div>
                  <FindingActions id={f.id} status={f.status} />
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {closed.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900">
            対応済み・問題なしとした指摘（{closed.length}件）
          </summary>
          <Card className="mt-3">
            <CardContent className="divide-y divide-gray-100 p-0">
              {closed.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="mr-2 text-gray-500">
                      {f.status === 'resolved' ? '対応済み' : '問題なし'}
                    </span>
                    <span className="font-medium text-gray-900">
                      {f.children?.name ?? '（児童不明）'}
                    </span>
                    <span className="ml-2 text-gray-600">{f.message}</span>
                  </div>
                  <FindingActions id={f.id} status={f.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        </details>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-5 w-5 text-gray-400" />
            チェック項目
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-6 pt-0">
          {RULES.map((rule) => (
            <div key={rule.key} className="flex items-start gap-3">
              {rule.enabled ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {rule.label}
                  {!rule.enabled && (
                    <span className="ml-2 text-xs font-normal text-gray-400">オフ</span>
                  )}
                </p>
                <p className="text-xs text-gray-600">{rule.description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
