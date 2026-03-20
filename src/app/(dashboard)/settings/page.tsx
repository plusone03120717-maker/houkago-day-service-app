import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Building2, Users, Bell, PlusCircle, ClipboardCheck, CalendarDays, Car } from 'lucide-react'

const sections = [
  {
    href: '/settings/facilities',
    icon: Building2,
    label: '施設・ユニット管理',
    description: '施設情報、ユニット設定、定員管理',
  },
  {
    href: '/settings/staff',
    icon: Users,
    label: 'スタッフ管理',
    description: 'スタッフ招待、役割設定、勤務情報',
  },
  {
    href: '/settings/additions',
    icon: PlusCircle,
    label: '処遇改善加算設定',
    description: 'ユニット別の加算区分・算定率を設定',
  },
  {
    href: '/settings/addition-requirements',
    icon: ClipboardCheck,
    label: '加算要件チェック',
    description: '人員配置基準・加算算定要件の充足状況確認',
  },
  {
    href: '/settings/calendar',
    icon: CalendarDays,
    label: '施設カレンダー管理',
    description: '休業日・行事・研修日の登録・保護者予約の停止',
  },
  {
    href: '/settings/notifications',
    icon: Bell,
    label: '通知設定',
    description: '保護者への通知タイミング設定',
  },
  {
    href: '/settings/vehicles',
    icon: Car,
    label: '車両管理',
    description: '送迎車両の登録・定員・ドライバー設定',
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">設定</h1>
        <p className="text-sm text-gray-500 mt-0.5">施設・スタッフ・システム設定</p>
      </div>
      <div className="space-y-3">
        {sections.map((s) => {
          const Icon = s.icon
          return (
            <Link key={s.href} href={s.href}>
              <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{s.label}</p>
                    <p className="text-sm text-gray-500">{s.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
