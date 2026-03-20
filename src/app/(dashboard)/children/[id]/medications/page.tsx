import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pill } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { MedicationForm } from '@/components/medications/medication-form'
import { MedicationLogForm } from '@/components/medications/medication-log-form'

type Medication = {
  id: string
  medication_name: string
  dosage: string
  timing: string
  instructions: string | null
  parent_consent_date: string | null
  is_active: boolean
}

type MedicationLog = {
  id: string
  medication_id: string
  log_date: string
  status: string
  notes: string | null
  administered_at: string | null
  users: { name: string } | null
}

const TIMING_LABELS: Record<string, string> = {
  after_breakfast: '朝食後',
  after_lunch: '昼食後',
  after_dinner: '夕食後',
  as_needed: '必要時',
  other: 'その他',
}

const LOG_STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'secondary' | 'destructive' }> = {
  given: { label: '与薬済', variant: 'success' },
  refused: { label: '拒否', variant: 'warning' },
  skipped: { label: 'スキップ', variant: 'secondary' },
  not_needed: { label: '不要', variant: 'secondary' },
}

export default async function MedicationsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: childId } = await params
  const supabase = await createClient()

  const [childResult, medsResult, logsResult] = await Promise.all([
    supabase.from('children').select('id, name').eq('id', childId).single(),
    supabase
      .from('child_medications')
      .select('id, medication_name, dosage, timing, instructions, parent_consent_date, is_active')
      .eq('child_id', childId)
      .order('is_active', { ascending: false })
      .order('created_at'),
    supabase
      .from('medication_logs')
      .select('id, medication_id, log_date, status, notes, administered_at, users!medication_logs_staff_id_fkey(name)')
      .eq('child_id', childId)
      .order('log_date', { ascending: false })
      .limit(30),
  ])

  if (!childResult.data) notFound()
  const child = childResult.data as { id: string; name: string }
  const medications = (medsResult.data ?? []) as unknown as Medication[]
  const logs = (logsResult.data ?? []) as unknown as MedicationLog[]

  const activeMeds = medications.filter((m) => m.is_active)
  const inactiveMeds = medications.filter((m) => !m.is_active)

  // 今日の与薬状況
  const today = new Date().toISOString().slice(0, 10)
  const todayLogs = logs.filter((l) => l.log_date === today)
  const todayGivenIds = new Set(todayLogs.filter((l) => l.status === 'given').map((l) => l.medication_id))

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/children/${childId}`} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">服薬管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">{child.name}</p>
        </div>
      </div>

      {/* 今日の与薬状況 */}
      {activeMeds.length > 0 && (
        <Card className={todayGivenIds.size < activeMeds.length ? 'border-orange-200 bg-orange-50' : 'border-green-200 bg-green-50'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Pill className={`h-4 w-4 ${todayGivenIds.size < activeMeds.length ? 'text-orange-600' : 'text-green-600'}`} />
              <p className="text-sm font-medium text-gray-800">
                本日の与薬状況 — {todayGivenIds.size}/{activeMeds.length}件 完了
              </p>
            </div>
            <MedicationLogForm
              childId={childId}
              medications={activeMeds}
              todayLogs={todayLogs}
              today={today}
            />
          </CardContent>
        </Card>
      )}

      {/* 薬の登録フォーム */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Pill className="h-4 w-4 text-indigo-600" />
            与薬依頼薬の登録
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MedicationForm childId={childId} />
        </CardContent>
      </Card>

      {/* 処方中の薬一覧 */}
      {activeMeds.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">処方中の薬（{activeMeds.length}件）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeMeds.map((med) => (
                <div key={med.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-gray-900">{med.medication_name}</p>
                    <Badge variant="secondary" className="text-xs">{TIMING_LABELS[med.timing] ?? med.timing}</Badge>
                  </div>
                  <p className="text-sm text-gray-600">{med.dosage}</p>
                  {med.instructions && (
                    <p className="text-xs text-gray-500 mt-1">{med.instructions}</p>
                  )}
                  {med.parent_consent_date && (
                    <p className="text-xs text-indigo-500 mt-1">
                      保護者同意日: {formatDate(med.parent_consent_date)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 与薬ログ */}
      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">与薬記録（直近30件）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 divide-y divide-gray-100">
              {logs.map((log) => {
                const conf = LOG_STATUS_CONFIG[log.status] ?? { label: log.status, variant: 'secondary' as const }
                const med = medications.find((m) => m.id === log.medication_id)
                return (
                  <div key={log.id} className="flex items-center gap-3 py-2">
                    <span className="text-xs text-gray-500 w-16 flex-shrink-0">{formatDate(log.log_date, 'MM/dd')}</span>
                    <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{med?.medication_name ?? '—'}</span>
                    <Badge variant={conf.variant} className="text-xs flex-shrink-0">{conf.label}</Badge>
                    {log.users && (
                      <span className="text-xs text-gray-400 flex-shrink-0">{log.users.name}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 過去の薬 */}
      {inactiveMeds.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-gray-400">終了した薬（{inactiveMeds.length}件）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {inactiveMeds.map((med) => (
                <div key={med.id} className="flex items-center gap-2 text-gray-400">
                  <span className="text-sm line-through">{med.medication_name}</span>
                  <span className="text-xs">{med.dosage}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
