import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { IncidentStatusForm } from '@/components/incidents/incident-status-form'

type IncidentReport = {
  id: string
  report_date: string
  occurred_at: string
  location: string | null
  incident_type: string
  severity: string
  description: string
  immediate_response: string | null
  root_cause: string | null
  preventive_measures: string | null
  reported_to_family: boolean
  reported_to_municipality: boolean
  municipality_report_date: string | null
  follow_up_required: boolean
  follow_up_notes: string | null
  status: string
  children: { name: string } | null
  users: { name: string } | null
}

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  injury: '負傷',
  near_miss: 'ヒヤリハット',
  elopement: '無断外出',
  medication: '服薬事故',
  property: '器物破損',
  other: 'その他',
}

const SEVERITY_LABELS: Record<string, string> = {
  minor: '軽微（治療不要）',
  moderate: '中程度（要治療）',
  serious: '重大（入院等）',
  near_miss: 'ヒヤリハット',
}

const SEVERITY_VARIANTS: Record<string, 'secondary' | 'warning' | 'destructive' | 'default'> = {
  minor: 'secondary',
  moderate: 'warning',
  serious: 'destructive',
  near_miss: 'default',
}

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: incidentRaw } = await supabase
    .from('incident_reports')
    .select('id, report_date, occurred_at, location, incident_type, severity, description, immediate_response, root_cause, preventive_measures, reported_to_family, reported_to_municipality, municipality_report_date, follow_up_required, follow_up_notes, status, children(name), users!incident_reports_created_by_fkey(name)')
    .eq('id', id)
    .single()

  if (!incidentRaw) notFound()
  const incident = incidentRaw as unknown as IncidentReport

  const Field = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div>
        <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{value}</p>
      </div>
    ) : null

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/incidents" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">インシデント詳細</h1>
          <p className="text-xs text-gray-400">{formatDate(incident.report_date)} 報告</p>
        </div>
        <Badge variant={SEVERITY_VARIANTS[incident.severity] ?? 'secondary'}>
          {SEVERITY_LABELS[incident.severity] ?? incident.severity}
        </Badge>
      </div>

      {/* 基本情報 */}
      <Card className={incident.severity === 'serious' ? 'border-red-300' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${incident.severity === 'serious' ? 'text-red-500' : 'text-yellow-500'}`} />
            {INCIDENT_TYPE_LABELS[incident.incident_type] ?? incident.incident_type}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">発生日時</p>
              <p className="text-gray-800">{new Date(incident.occurred_at).toLocaleString('ja-JP')}</p>
            </div>
            {incident.location && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">発生場所</p>
                <p className="text-gray-800">{incident.location}</p>
              </div>
            )}
            {incident.children && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">関係する児童</p>
                <p className="text-gray-800 font-medium">{incident.children.name}</p>
              </div>
            )}
            {incident.users && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">記録者</p>
                <p className="text-gray-800">{incident.users.name}</p>
              </div>
            )}
          </div>

          <Field label="状況説明" value={incident.description} />
          <Field label="即時対応内容" value={incident.immediate_response} />
          <Field label="原因・背景" value={incident.root_cause} />
          <Field label="再発防止策" value={incident.preventive_measures} />

          {/* 報告状況 */}
          <div className="flex gap-3 flex-wrap pt-2">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${incident.reported_to_family ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {incident.reported_to_family ? '✓ 家族報告済' : '家族未報告'}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${incident.reported_to_municipality ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
              {incident.reported_to_municipality ? '✓ 行政報告済' : '行政未報告'}
              {incident.municipality_report_date && ` (${formatDate(incident.municipality_report_date)})`}
            </span>
            {incident.follow_up_required && (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-yellow-100 text-yellow-700">
                フォローアップ要
              </span>
            )}
          </div>

          <Field label="フォローアップ内容" value={incident.follow_up_notes} />
        </CardContent>
      </Card>

      {/* ステータス変更 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">対応状況の更新</CardTitle>
        </CardHeader>
        <CardContent>
          <IncidentStatusForm
            incidentId={incident.id}
            currentStatus={incident.status}
            currentFollowUpNotes={incident.follow_up_notes}
            currentReportedToMunicipality={incident.reported_to_municipality}
          />
        </CardContent>
      </Card>
    </div>
  )
}
