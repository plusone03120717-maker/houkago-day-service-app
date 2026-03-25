import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Plus, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { IncidentForm } from '@/components/incidents/incident-form'
import { IncidentQuickClose } from '@/components/incidents/incident-quick-close'

type IncidentReport = {
  id: string
  report_date: string
  incident_type: string
  severity: string
  description: string
  status: string
  reported_to_family: boolean
  reported_to_municipality: boolean
  follow_up_required: boolean
  children: { name: string } | null
  users: { name: string } | null
}

type Child = { id: string; name: string }

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  injury: '負傷',
  near_miss: 'ヒヤリハット',
  elopement: '無断外出',
  medication: '服薬事故',
  property: '器物破損',
  other: 'その他',
}

const SEVERITY_LABELS: Record<string, string> = {
  minor: '軽微',
  moderate: '中程度',
  serious: '重大',
  near_miss: 'ヒヤリハット',
}

const SEVERITY_VARIANTS: Record<string, 'secondary' | 'warning' | 'destructive' | 'default'> = {
  minor: 'secondary',
  moderate: 'warning',
  serious: 'destructive',
  near_miss: 'default',
}

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status: statusFilter } = await searchParams
  const supabase = await createClient()

  const [incidentsResult, childrenResult, facilityResult] = await Promise.all([
    supabase
      .from('incident_reports')
      .select('id, report_date, incident_type, severity, description, status, reported_to_family, reported_to_municipality, follow_up_required, children(name), users!incident_reports_created_by_fkey(name)')
      .order('report_date', { ascending: false })
      .limit(50),
    supabase.from('children').select('id, name').order('name_kana'),
    supabase.from('facilities').select('id').limit(1).single(),
  ])

  let incidents = (incidentsResult.data ?? []) as unknown as IncidentReport[]
  if (statusFilter === 'open') incidents = incidents.filter((r) => r.status === 'open')
  if (statusFilter === 'closed') incidents = incidents.filter((r) => r.status === 'closed')

  const children = (childrenResult.data ?? []) as unknown as Child[]
  const facilityId = (facilityResult.data as { id: string } | null)?.id ?? ''

  const openCount = incidents.filter((r) => r.status === 'open').length
  const followUpCount = incidents.filter((r) => r.follow_up_required && r.status === 'open').length

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ヒヤリハット・事故報告</h1>
          <p className="text-sm text-gray-500 mt-0.5">インシデント・ヒヤリハットの記録・管理</p>
        </div>
      </div>

      {/* サマリー */}
      {(openCount > 0 || followUpCount > 0) && (
        <div className="flex gap-3 flex-wrap">
          {openCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium text-red-700">未対応: {openCount}件</span>
            </div>
          )}
          {followUpCount > 0 && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium text-yellow-700">フォローアップ要: {followUpCount}件</span>
            </div>
          )}
        </div>
      )}

      {/* 新規報告フォーム */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4 text-red-500" />
            新規インシデント報告
          </CardTitle>
        </CardHeader>
        <CardContent>
          <IncidentForm children={children} facilityId={facilityId} />
        </CardContent>
      </Card>

      {/* フィルタ */}
      <div className="flex gap-2">
        {[
          { value: '', label: 'すべて' },
          { value: 'open', label: '未対応' },
          { value: 'closed', label: '対応済' },
        ].map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/incidents?status=${f.value}` : '/incidents'}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              (statusFilter ?? '') === f.value
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* 一覧 */}
      <div className="space-y-3">
        {incidents.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            インシデント報告はありません
          </div>
        ) : (
          incidents.map((incident) => (
            <Card key={incident.id} className={incident.severity === 'serious' ? 'border-red-300' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    incident.severity === 'serious' ? 'bg-red-100' :
                    incident.severity === 'moderate' ? 'bg-yellow-100' : 'bg-gray-100'
                  }`}>
                    <AlertTriangle className={`h-4 w-4 ${
                      incident.severity === 'serious' ? 'text-red-500' :
                      incident.severity === 'moderate' ? 'text-yellow-500' : 'text-gray-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs text-gray-500">{formatDate(incident.report_date)}</span>
                      {incident.children && (
                        <span className="text-xs font-medium text-gray-700">{incident.children.name}</span>
                      )}
                      <Badge variant={SEVERITY_VARIANTS[incident.severity] ?? 'secondary'} className="text-xs">
                        {SEVERITY_LABELS[incident.severity] ?? incident.severity}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {INCIDENT_TYPE_LABELS[incident.incident_type] ?? incident.incident_type}
                      </Badge>
                      {incident.status === 'closed' && (
                        <Badge variant="success" className="text-xs">対応済</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{incident.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                      {incident.reported_to_family && <span className="text-green-600">家族報告済</span>}
                      {incident.reported_to_municipality && <span className="text-indigo-600">行政報告済</span>}
                      {incident.follow_up_required && incident.status === 'open' && (
                        <span className="text-yellow-600 font-medium">フォローアップ要</span>
                      )}
                      {incident.users && <span>記録者: {incident.users.name}</span>}
                      {incident.status === 'open' && (
                        <IncidentQuickClose incidentId={incident.id} />
                      )}
                    </div>
                  </div>
                  <Link href={`/incidents/${incident.id}`} className="flex-shrink-0">
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
