import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, User, Mail, Car } from 'lucide-react'
import { StaffInviteForm } from '@/components/settings/staff-invite-form'

type StaffUser = {
  id: string
  name: string
  email: string
  role: string
  job_titles: string[] | null
}

type StaffMember = {
  id: string
  name: string
  role: string
  roles: string[] | null
  line_user_id: string | null
}

const roleLabel: Record<string, string> = {
  admin: '管理者',
  staff: 'スタッフ',
  driver: 'ドライバー',
  therapist: '療育士',
  nurse: '看護師',
  parent: '保護者',
}

const roleBadgeClass: Record<string, string> = {
  admin: 'bg-indigo-100 text-indigo-700',
  staff: 'bg-gray-100 text-gray-700',
  driver: 'bg-amber-100 text-amber-700',
  therapist: 'bg-teal-100 text-teal-700',
  nurse: 'bg-rose-100 text-rose-700',
}

export default async function SettingsStaffPage() {
  const supabase = await createClient()

  const { data: staffRaw } = await supabase
    .from('users')
    .select('id, name, email, role, job_titles')
    .in('role', ['admin', 'staff'])
    .order('name')
  const staffList = (staffRaw ?? []) as unknown as StaffUser[]

  const { data: membersRaw } = await supabase
    .from('staff_members')
    .select('id, name, role, roles, line_user_id')
    .order('name')
  const memberList = (membersRaw ?? []) as unknown as StaffMember[]

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">スタッフ管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">スタッフの招待・役割設定</p>
        </div>
      </div>

      <StaffInviteForm />

      {/* ログインアカウントあり（管理者・スタッフ） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">スタッフ一覧 ({staffList.length}名)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {staffList.map((s) => (
              <Link key={s.id} href={`/settings/staff/${s.id}`}>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {s.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeClass[s.role] ?? 'bg-gray-100 text-gray-700'}`}>
                      {roleLabel[s.role] ?? s.role}
                    </span>
                    {s.job_titles?.map((jt) => (
                      <span key={jt} className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeClass[jt] ?? 'bg-gray-100 text-gray-700'}`}>
                        {roleLabel[jt] ?? jt}
                      </span>
                    ))}
                    <span className="text-xs text-indigo-500">詳細 →</span>
                  </div>
                </div>
              </Link>
            ))}
            {staffList.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                スタッフが登録されていません
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ドライバー等（ログインなし） */}
      {memberList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ドライバー・その他 ({memberList.length}名)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {memberList.map((m) => (
                <Link key={m.id} href={`/settings/staff/member/${m.id}`}>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <Car className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{m.name}</p>
                        <p className="text-xs text-gray-400">
                          {m.line_user_id ? 'LINE通知: 設定済み' : 'LINE通知: 未設定'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {(m.roles?.length ? m.roles : [m.role]).map((r) => (
                        <span key={r} className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeClass[r] ?? 'bg-gray-100 text-gray-700'}`}>
                          {roleLabel[r] ?? r}
                        </span>
                      ))}
                      <span className="text-xs text-indigo-500">詳細 →</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
