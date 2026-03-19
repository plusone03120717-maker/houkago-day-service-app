import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, User, Mail } from 'lucide-react'
import { StaffInviteForm } from '@/components/settings/staff-invite-form'

type StaffUser = {
  id: string
  name: string
  email: string
  role: string
}

const roleLabel: Record<string, string> = {
  admin: '管理者',
  staff: 'スタッフ',
  parent: '保護者',
}

export default async function SettingsStaffPage() {
  const supabase = await createClient()

  const { data: staffRaw } = await supabase
    .from('users')
    .select('id, name, email, role')
    .in('role', ['admin', 'staff'])
    .order('name')
  const staffList = (staffRaw ?? []) as unknown as StaffUser[]

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">スタッフ一覧 ({staffList.length}名)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {staffList.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
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
                <Badge variant="secondary" className="text-xs">
                  {roleLabel[s.role] ?? s.role}
                </Badge>
              </div>
            ))}
            {staffList.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                スタッフが登録されていません
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
