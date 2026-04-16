import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import { ArrowLeft, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StaffProfileForm } from '@/components/settings/staff-profile-form'
import { TrainingRecordForm } from '@/components/settings/training-record-form'
import { DeleteStaffButton } from '@/components/settings/delete-staff-button'
import { ResetStaffPasswordButton } from '@/components/settings/reset-staff-password-button'

type StaffProfile = {
  id: string
  employment_type: string
  qualification: string | null
  hire_date: string | null
  facility_id: string
}

type TrainingRecord = {
  id: string
  training_name: string
  training_type: string
  organizer: string | null
  completed_date: string
  certificate_number: string | null
  hours: number | null
  notes: string | null
}

type UnitAssignment = {
  unit_id: string
}

type Unit = { id: string; name: string }

const roleLabel: Record<string, string> = {
  admin: '管理者',
  staff: 'スタッフ',
}

export default async function StaffProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  await requireAdmin()
  const { userId } = await params
  const supabase = await createClient()

  // ユーザー情報
  const { data: userRaw } = await supabase
    .from('users')
    .select('id, name, email, role, line_user_id, job_titles')
    .eq('id', userId)
    .single()
  const user = userRaw as { id: string; name: string; email: string; role: string; line_user_id: string | null; job_titles: string[] | null } | null

  if (!user) return <div className="p-4 text-gray-500">スタッフが見つかりません</div>

  // プロファイル情報
  const { data: profileRaw } = await supabase
    .from('staff_profiles')
    .select('id, employment_type, qualification, hire_date, facility_id')
    .eq('user_id', userId)
    .single()
  const profile = profileRaw as unknown as StaffProfile | null

  // ユニット割当
  const { data: assignmentsRaw } = profile
    ? await supabase
        .from('staff_unit_assignments')
        .select('unit_id')
        .eq('staff_id', profile.id)
    : { data: [] }
  const assignments = (assignmentsRaw ?? []) as unknown as UnitAssignment[]
  const assignedUnitIds = assignments.map((a) => a.unit_id)

  // 全ユニット一覧
  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as Unit[]

  // 施設ID（プロファイルがあればそこから、なければ最初の施設）
  let facilityId = profile?.facility_id ?? ''
  if (!facilityId) {
    const { data: facilityRaw } = await supabase
      .from('facilities')
      .select('id')
      .limit(1)
      .single()
    facilityId = (facilityRaw as { id: string } | null)?.id ?? ''
  }

  // 研修記録
  const { data: trainingRaw } = profile
    ? await supabase
        .from('staff_training_records')
        .select('id, training_name, training_type, organizer, completed_date, certificate_number, hours, notes')
        .eq('staff_profile_id', profile.id)
        .order('completed_date', { ascending: false })
    : { data: [] }
  const trainingRecords = (trainingRaw ?? []) as unknown as TrainingRecord[]

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/settings/staff" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">スタッフ詳細</h1>
          <p className="text-sm text-gray-500 mt-0.5">資格・雇用情報・ユニット割当</p>
        </div>
      </div>

      {/* 基本情報 */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <User className="h-6 w-6 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">{user.name}</p>
            <p className="text-sm text-gray-400">{user.email}</p>
          </div>
          <Badge variant="secondary">{roleLabel[user.role] ?? user.role}</Badge>
        </CardContent>
      </Card>

      {/* プロファイル編集 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">勤務情報・資格</CardTitle>
        </CardHeader>
        <CardContent>
          <StaffProfileForm
            userId={userId}
            profileId={profile?.id ?? null}
            initialEmploymentType={profile?.employment_type ?? 'full_time'}
            initialQualification={profile?.qualification ?? ''}
            initialUnitIds={assignedUnitIds}
            units={units}
            facilityId={facilityId}
            initialLineUserId={user?.line_user_id ?? ''}
            initialJobTitles={user?.job_titles ?? []}
          />
        </CardContent>
      </Card>

      {/* 研修記録 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">研修記録</CardTitle>
        </CardHeader>
        <CardContent>
          {profile ? (
            <TrainingRecordForm
              staffProfileId={profile.id}
              records={trainingRecords}
            />
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">
              勤務情報を登録してから研修記録を追加できます
            </p>
          )}
        </CardContent>
      </Card>

      {/* パスワード再発行・削除 */}
      <div className="pt-2 border-t border-gray-200 space-y-3">
        <ResetStaffPasswordButton userId={userId} staffName={user.name} email={user.email} />
        <DeleteStaffButton userId={userId} staffName={user.name} />
      </div>
    </div>
  )
}
