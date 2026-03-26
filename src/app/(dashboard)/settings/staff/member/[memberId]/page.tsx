import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Car } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StaffMemberForm } from '@/components/settings/staff-member-form'

const roleLabel: Record<string, string> = {
  driver: 'ドライバー',
  staff: 'スタッフ',
}

export default async function StaffMemberPage({
  params,
}: {
  params: Promise<{ memberId: string }>
}) {
  const { memberId } = await params
  const supabase = await createClient()

  const { data: memberRaw } = await supabase
    .from('staff_members')
    .select('id, name, role, line_user_id')
    .eq('id', memberId)
    .single()
  const member = memberRaw as { id: string; name: string; role: string; line_user_id: string | null } | null

  if (!member) return <div className="p-4 text-gray-500">スタッフが見つかりません</div>

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/settings/staff" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">スタッフ詳細</h1>
          <p className="text-sm text-gray-500 mt-0.5">名前・役職・LINE通知設定</p>
        </div>
      </div>

      {/* 基本情報 */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Car className="h-6 w-6 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">{member.name}</p>
            <p className="text-sm text-gray-400">ログインアカウントなし</p>
          </div>
          <Badge variant="secondary">{roleLabel[member.role] ?? member.role}</Badge>
        </CardContent>
      </Card>

      {/* 編集フォーム */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">情報編集</CardTitle>
        </CardHeader>
        <CardContent>
          <StaffMemberForm
            memberId={member.id}
            initialName={member.name}
            initialRole={member.role}
            initialLineUserId={member.line_user_id ?? ''}
          />
        </CardContent>
      </Card>
    </div>
  )
}
