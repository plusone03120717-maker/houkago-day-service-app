import Link from 'next/link'
import { ArrowLeft, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

type LogRow = {
  id: number
  table_name: string
  record_id: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  changed_fields: string[]
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  child_id: string | null
  record_date: string | null
  changed_by: string | null
  changed_at: string
}

const TABLE_LABELS: Record<string, string> = {
  daily_attendance: '出席記録',
  usage_plans: '利用スケジュール',
  usage_reservations: '利用予定',
  usage_plan_date_overrides: '利用予定（特定日）',
  usage_plan_day_settings: '利用予定（曜日別）',
  transport_details: '送迎',
}

const OPERATION_LABELS: Record<string, string> = {
  INSERT: '作成',
  UPDATE: '変更',
  DELETE: '削除',
}

/** 履歴に出す列の和名。ここに無い列は英語名のまま表示する */
const FIELD_LABELS: Record<string, string> = {
  status: '状態',
  date: '日付',
  check_in_time: '登園時刻',
  check_out_time: '降園時刻',
  service_start_time: '提供開始',
  service_end_time: '提供終了',
  daytime_support: '日中一時支援',
  daytime_support_start_time: '日中一時 開始',
  daytime_support_end_time: '日中一時 終了',
  pickup_departure_time: '迎え 出発',
  pickup_arrival_time: '迎え 到着',
  dropoff_departure_time: '送り 出発',
  dropoff_arrival_time: '送り 到着',
  pickup_type: '送迎区分',
  basic_service: '基本報酬',
  health_condition: '健康状態',
  actual_pickup_time: '迎え 実績',
  actual_dropoff_time: '送り 実績',
  day_of_week: '曜日',
  start_date: '開始日',
  end_date: '終了日',
  is_active: '有効',
  is_cancelled: 'キャンセル',
  transport_type: '送迎の種類',
  name: '名称',
}

const STATUS_LABELS: Record<string, string> = {
  attended: '出席',
  scheduled: '予定',
  absent: '欠席',
  cancelled: 'キャンセル',
  confirmed: '確定',
  reserved: '予約',
}

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '（空欄）'
  if (typeof value === 'boolean') return value ? 'あり' : 'なし'
  if (Array.isArray(value)) {
    if (key === 'day_of_week') {
      const w = ['日', '月', '火', '水', '木', '金', '土']
      return value.map((n) => w[Number(n)] ?? n).join('・')
    }
    return value.join('、')
  }
  if (typeof value === 'string') {
    if (key === 'status') return STATUS_LABELS[value] ?? value
    // "15:15:00" → "15:15"
    if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value.slice(0, 5)
    return value
  }
  return String(value)
}

function jst(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso))
}

export default async function ChangeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string; date?: string; days?: string }>
}) {
  await requireSessionUser()
  const { child: childFilter, date: dateFilter, days } = await searchParams
  const supabase = await createClient()

  const lookbackDays = Number(days) > 0 ? Number(days) : 14
  const since = new Date(
    new Date().getTime() - lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString()

  let query = supabase
    .from('record_change_logs')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(300)

  // 日付で絞るときは期間の制限を外す。古い記録の履歴も追えるようにするため
  if (dateFilter) query = query.eq('record_date', dateFilter)
  else query = query.gte('changed_at', since)
  if (childFilter) query = query.eq('child_id', childFilter)

  const [{ data: logsRaw }, { data: childrenRaw }, { data: usersRaw }] = await Promise.all([
    query,
    supabase.from('children').select('id, name').order('name'),
    supabase.from('users').select('id, name'),
  ])

  const logs = (logsRaw ?? []) as LogRow[]
  const children = (childrenRaw ?? []) as { id: string; name: string }[]
  const childNames = new Map(children.map((c) => [c.id, c.name]))
  const userNames = new Map(
    ((usersRaw ?? []) as { id: string; name: string | null }[]).map((u) => [u.id, u.name])
  )

  const selectedChild = childFilter ? childNames.get(childFilter) : null

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/checks"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          入力チェックに戻る
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-gray-900">
          <History className="h-6 w-6 text-gray-400" />
          変更履歴
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          予定・実績・送迎の記録が、いつ・誰に・どう書き換えられたかを表示します
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">児童</label>
              <select
                name="child"
                defaultValue={childFilter ?? ''}
                className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="">すべて</option>
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">対象日</label>
              <input
                type="date"
                name="date"
                defaultValue={dateFilter ?? ''}
                className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                さかのぼる日数
              </label>
              <select
                name="days"
                defaultValue={String(lookbackDays)}
                className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="7">7日</option>
                <option value="14">14日</option>
                <option value="30">30日</option>
                <option value="90">90日</option>
              </select>
            </div>
            <button
              type="submit"
              className="h-9 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white shadow hover:bg-indigo-700"
            >
              表示
            </button>
            {(childFilter || dateFilter) && (
              <Link
                href="/checks/history"
                className="h-9 rounded-md px-3 text-sm leading-9 text-gray-600 hover:text-gray-900"
              >
                条件をクリア
              </Link>
            )}
          </form>
          {(selectedChild || dateFilter) && (
            <p className="mt-3 text-sm text-gray-600">
              絞り込み中:{' '}
              {selectedChild && <span className="font-medium">{selectedChild}</span>}
              {selectedChild && dateFilter && ' / '}
              {dateFilter && <span className="font-medium">{dateFilter}</span>}
            </p>
          )}
        </CardContent>
      </Card>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            該当する変更履歴はありません。
            <br />
            <span className="text-sm">
              履歴の記録は 2026年8月27日 の導入以降の変更が対象です。
            </span>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-gray-100 p-0">
            {logs.map((log) => {
              const childName = log.child_id ? childNames.get(log.child_id) : null
              const actor = log.changed_by ? userNames.get(log.changed_by) : null
              const source = log.new_data ?? log.old_data ?? {}
              return (
                <div key={log.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-gray-500">{jst(log.changed_at)}</span>
                    <Badge
                      variant={
                        log.operation === 'DELETE'
                          ? 'destructive'
                          : log.operation === 'INSERT'
                            ? 'success'
                            : 'warning'
                      }
                    >
                      {OPERATION_LABELS[log.operation]}
                    </Badge>
                    <span className="text-gray-600">
                      {TABLE_LABELS[log.table_name] ?? log.table_name}
                    </span>
                    {childName && <span className="font-medium text-gray-900">{childName}</span>}
                    {log.record_date && (
                      <span className="text-gray-600">{log.record_date}</span>
                    )}
                    <span className="ml-auto text-xs text-gray-500">
                      {actor ?? 'システム・バッチ'}
                    </span>
                  </div>

                  {log.operation === 'UPDATE' ? (
                    <ul className="space-y-1 text-sm">
                      {log.changed_fields.map((field) => (
                        <li key={field} className="flex flex-wrap items-baseline gap-2">
                          <span className="min-w-28 text-gray-600">{fieldLabel(field)}</span>
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through">
                            {formatValue(field, log.old_data?.[field])}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">
                            {formatValue(field, log.new_data?.[field])}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-600">
                      {(['status', 'check_in_time', 'check_out_time', 'service_start_time', 'service_end_time'] as const)
                        .filter((k) => source[k] !== undefined && source[k] !== null)
                        .map((k) => `${fieldLabel(k)} ${formatValue(k, source[k])}`)
                        .join(' / ') || '（内容なし）'}
                    </p>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
