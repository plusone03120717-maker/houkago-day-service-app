import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle,
  Users, UserCheck, ShieldCheck,
} from 'lucide-react'

// 専門職として認められる資格キーワード（部分一致）
const SPECIALIST_KEYWORDS = [
  '理学療法士', 'PT',
  '作業療法士', 'OT',
  '言語聴覚士', 'ST',
  '心理士', '臨床心理士', '公認心理師',
  '精神保健福祉士',
  '社会福祉士',
  '特別支援学校教諭',
]

// 強度行動障害支援者として認められる資格キーワード
const INTENSIVE_SUPPORT_KEYWORDS = [
  '強度行動障害支援者養成研修',
  '行動援護従業者',
]

type StaffProfile = {
  id: string
  user_id: string
  employment_type: string
  qualification: string | null
  users: { name: string } | null
}

type UnitWithStaff = {
  id: string
  name: string
  capacity: number
  staff: StaffProfile[]
}

type AdditionSetting = {
  unit_id: string
  addition_type: string
  enabled: boolean
}

// 加算定義（キー・ラベル・要件説明）
const ADDITION_DEFS = [
  {
    key: 'treatment_improvement_1',
    label: '処遇改善加算（Ⅰ）',
    color: 'text-indigo-700',
    bg: 'bg-indigo-50',
    requirements: [
      { id: 'career_path_123', label: 'キャリアパス要件Ⅰ・Ⅱ・Ⅲを全て満たす', auto: false },
      { id: 'environment', label: '職場環境等要件（複数区分）を満たす', auto: false },
      { id: 'disclosure', label: '賃金改善等の情報を開示している', auto: false },
    ],
  },
  {
    key: 'treatment_improvement_2',
    label: '処遇改善加算（Ⅱ）',
    color: 'text-indigo-700',
    bg: 'bg-indigo-50',
    requirements: [
      { id: 'career_path_12', label: 'キャリアパス要件Ⅰ・Ⅱを満たす', auto: false },
      { id: 'environment', label: '職場環境等要件（1区分以上）を満たす', auto: false },
    ],
  },
  {
    key: 'treatment_improvement_3',
    label: '処遇改善加算（Ⅲ）',
    color: 'text-indigo-700',
    bg: 'bg-indigo-50',
    requirements: [
      { id: 'career_path_1', label: 'キャリアパス要件Ⅰを満たす', auto: false },
    ],
  },
  {
    key: 'specific_treatment_1',
    label: '特定処遇改善加算（Ⅰ）',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    requirements: [
      { id: 'base_treatment_1', label: '処遇改善加算（Ⅰ）を算定していること', auto: true },
      { id: 'specialist', label: '専門職（PT・OT・ST・心理士等）を配置していること', auto: true },
      { id: 'career_path_123', label: 'キャリアパス要件Ⅰ・Ⅱ・Ⅲを全て満たす', auto: false },
    ],
  },
  {
    key: 'specific_treatment_2',
    label: '特定処遇改善加算（Ⅱ）',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    requirements: [
      { id: 'base_treatment_any', label: '処遇改善加算（Ⅰ）〜（Ⅲ）のいずれかを算定していること', auto: true },
      { id: 'career_path_12', label: 'キャリアパス要件Ⅰ・Ⅱを満たす', auto: false },
    ],
  },
  {
    key: 'base_improvement_1',
    label: 'ベースアップ等支援加算',
    color: 'text-teal-700',
    bg: 'bg-teal-50',
    requirements: [
      { id: 'base_treatment_any', label: '処遇改善加算（Ⅰ）〜（Ⅲ）のいずれかを算定していること', auto: true },
      { id: 'wage_plan', label: '賃金改善計画書を整備していること', auto: false },
    ],
  },
  {
    key: 'placement_support',
    label: '配置加算（専門職）',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    requirements: [
      { id: 'specialist', label: '専門職（PT・OT・ST・心理士・社会福祉士等）を配置していること', auto: true },
      { id: 'full_time', label: '常勤換算 1 名以上の配置', auto: true },
    ],
  },
  {
    key: 'individual_support',
    label: '個別サポート加算（Ⅰ）',
    color: 'text-red-700',
    bg: 'bg-red-50',
    requirements: [
      { id: 'intensive_support', label: '強度行動障害支援者養成研修修了者等を配置していること', auto: true },
      { id: 'support_plan', label: '強度行動障害支援に関する個別支援計画を作成していること', auto: false },
    ],
  },
]

function hasKeyword(qualification: string | null, keywords: string[]): boolean {
  if (!qualification) return false
  return keywords.some((kw) => qualification.includes(kw))
}

type CheckResult = 'ok' | 'ng' | 'manual'

function evaluateRequirement(
  reqId: string,
  isAuto: boolean,
  unit: UnitWithStaff,
  enabledAdditions: Set<string>,
): CheckResult {
  if (!isAuto) return 'manual'

  switch (reqId) {
    case 'base_treatment_1':
      return enabledAdditions.has('treatment_improvement_1') ? 'ok' : 'ng'

    case 'base_treatment_any':
      return (
        enabledAdditions.has('treatment_improvement_1') ||
        enabledAdditions.has('treatment_improvement_2') ||
        enabledAdditions.has('treatment_improvement_3')
      ) ? 'ok' : 'ng'

    case 'specialist':
      return unit.staff.some((s) => hasKeyword(s.qualification, SPECIALIST_KEYWORDS)) ? 'ok' : 'ng'

    case 'intensive_support':
      return unit.staff.some((s) => hasKeyword(s.qualification, INTENSIVE_SUPPORT_KEYWORDS)) ? 'ok' : 'ng'

    case 'full_time': {
      const fullTimeCount = unit.staff.filter((s) => s.employment_type === 'full_time').length
      return fullTimeCount >= 1 ? 'ok' : 'ng'
    }

    default:
      return 'manual'
  }
}

const StatusIcon = ({ status }: { status: CheckResult }) => {
  if (status === 'ok') return <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
  if (status === 'ng') return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
  return <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
}

const statusLabel: Record<CheckResult, string> = {
  ok: '充足',
  ng: '未充足',
  manual: '要確認',
}
const statusVariant: Record<CheckResult, 'success' | 'warning' | 'secondary'> = {
  ok: 'success',
  ng: 'secondary',
  manual: 'warning',
}

export default async function AdditionRequirementsPage() {
  const supabase = await createClient()

  // ユニット一覧 + スタッフプロファイル取得
  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name, capacity')
    .order('name')

  const units = (unitsRaw ?? []) as unknown as { id: string; name: string; capacity: number }[]

  // スタッフプロファイル（ユニット割当経由）
  const { data: assignmentsRaw } = await supabase
    .from('staff_unit_assignments')
    .select(`
      unit_id,
      staff_profiles (
        id, user_id, employment_type, qualification,
        users (name)
      )
    `)

  type AssignmentRow = {
    unit_id: string
    staff_profiles: StaffProfile | null
  }
  const assignments = (assignmentsRaw ?? []) as unknown as AssignmentRow[]

  // ユニットごとにスタッフをまとめる
  const unitStaffMap: Record<string, StaffProfile[]> = {}
  for (const a of assignments) {
    if (!a.staff_profiles) continue
    if (!unitStaffMap[a.unit_id]) unitStaffMap[a.unit_id] = []
    unitStaffMap[a.unit_id].push(a.staff_profiles)
  }

  const unitsWithStaff: UnitWithStaff[] = units.map((u) => ({
    ...u,
    staff: unitStaffMap[u.id] ?? [],
  }))

  // 加算設定
  const { data: additionRaw } = await supabase
    .from('addition_settings')
    .select('unit_id, addition_type, enabled')
  const additionSettings = (additionRaw ?? []) as unknown as AdditionSetting[]

  const additionByUnit: Record<string, Set<string>> = {}
  for (const s of additionSettings) {
    if (!s.enabled) continue
    if (!additionByUnit[s.unit_id]) additionByUnit[s.unit_id] = new Set()
    additionByUnit[s.unit_id].add(s.addition_type)
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">加算要件チェック</h1>
          <p className="text-sm text-gray-500 mt-0.5">人員配置基準と加算算定要件の充足状況</p>
        </div>
      </div>

      {/* 凡例 */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 text-sm text-gray-600">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-green-500" />充足（自動確認済み）
          </span>
          <span className="flex items-center gap-1.5">
            <XCircle className="h-4 w-4 text-red-500" />未充足（対応が必要）
          </span>
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-400" />要確認（書類・申告が必要）
          </span>
        </CardContent>
      </Card>

      {unitsWithStaff.map((unit) => {
        const enabledAdditions = additionByUnit[unit.id] ?? new Set<string>()

        // 人員配置基準チェック
        const fullTimeCount = unit.staff.filter((s) => s.employment_type === 'full_time').length
        const partTimeCount = unit.staff.filter((s) => s.employment_type === 'part_time').length
        const ftEquivalent = fullTimeCount + partTimeCount * 0.5
        const minRequired = Math.ceil(unit.capacity / 5)  // 定員5名に1名（概算）
        const specialistCount = unit.staff.filter((s) =>
          hasKeyword(s.qualification, SPECIALIST_KEYWORDS)
        ).length

        const staffOk = ftEquivalent >= 2 && fullTimeCount >= 1

        return (
          <Card key={unit.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{unit.name}</CardTitle>
                <Badge variant={staffOk ? 'success' : 'secondary'}>
                  {staffOk ? '配置基準 OK' : '配置基準 要確認'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 人員配置サマリ */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-3 border-b border-gray-100">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <UserCheck className="h-4 w-4 text-indigo-500" />
                    <span className="text-lg font-bold text-gray-900">{fullTimeCount}</span>
                  </div>
                  <p className="text-xs text-gray-500">常勤スタッフ</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Users className="h-4 w-4 text-gray-400" />
                    <span className="text-lg font-bold text-gray-900">{partTimeCount}</span>
                  </div>
                  <p className="text-xs text-gray-500">非常勤スタッフ</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <ShieldCheck className="h-4 w-4 text-teal-500" />
                    <span className="text-lg font-bold text-gray-900">{specialistCount}</span>
                  </div>
                  <p className="text-xs text-gray-500">専門職</p>
                </div>
                <div className="text-center">
                  <div className="mb-0.5">
                    <span className={`text-lg font-bold ${ftEquivalent >= minRequired ? 'text-green-600' : 'text-red-600'}`}>
                      {ftEquivalent.toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">/ {minRequired}.0 必要</span>
                  </div>
                  <p className="text-xs text-gray-500">常勤換算</p>
                </div>
              </div>

              {/* 有効な加算の要件チェック */}
              {enabledAdditions.size === 0 ? (
                <p className="text-sm text-gray-400 text-center py-2">加算が設定されていません</p>
              ) : (
                <div className="space-y-3">
                  {ADDITION_DEFS.filter((def) => enabledAdditions.has(def.key)).map((def) => {
                    const results = def.requirements.map((req) => ({
                      ...req,
                      status: evaluateRequirement(req.id, req.auto, unit, enabledAdditions),
                    }))
                    const hasNg = results.some((r) => r.status === 'ng')
                    const hasManual = results.some((r) => r.status === 'manual')
                    const overallStatus: CheckResult = hasNg ? 'ng' : hasManual ? 'manual' : 'ok'

                    return (
                      <div key={def.key} className={`rounded-lg border p-3 ${def.bg}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-sm font-semibold ${def.color}`}>{def.label}</span>
                          <Badge variant={statusVariant[overallStatus]}>
                            {statusLabel[overallStatus]}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          {results.map((req) => (
                            <div key={req.id} className="flex items-start gap-2">
                              <StatusIcon status={req.status} />
                              <span className={`text-xs ${req.status === 'ng' ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
                                {req.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* スタッフ一覧（資格情報） */}
              {unit.staff.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 mb-2">スタッフ資格情報</p>
                  <div className="space-y-1">
                    {unit.staff.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-700 font-medium w-24 truncate">
                          {s.users?.name ?? '—'}
                        </span>
                        <Badge variant="secondary" className="text-xs py-0">
                          {s.employment_type === 'full_time' ? '常勤' : '非常勤'}
                        </Badge>
                        {s.qualification ? (
                          <span className="text-gray-500">{s.qualification}</span>
                        ) : (
                          <span className="text-gray-300">資格なし</span>
                        )}
                        {hasKeyword(s.qualification, SPECIALIST_KEYWORDS) && (
                          <ShieldCheck className="h-3.5 w-3.5 text-teal-500" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {unitsWithStaff.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          ユニットが登録されていません
        </div>
      )}

      {/* 注意書き */}
      <Card>
        <CardContent className="p-4 text-xs text-gray-400 space-y-1">
          <p className="font-medium text-gray-500">注意事項</p>
          <p>・「要確認」項目はシステムによる自動判定ができません。書類整備・自治体への届出状況を別途ご確認ください。</p>
          <p>・専門職判定はスタッフ管理画面に登録された資格情報を基に行います。未登録の場合は正しく判定されません。</p>
          <p>・算定要件は法改正により変更される場合があります。最新の通知・Q&Aをご確認ください。</p>
        </CardContent>
      </Card>
    </div>
  )
}
