'use client'

import { Bell, LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface HeaderProps {
  userName?: string
  facilityName?: string
  pendingCount?: number
}

export function Header({ userName, facilityName, pendingCount }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div>
        {facilityName && (
          <span className="text-sm text-gray-500">{facilityName}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Link href="/staff-requests">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {pendingCount != null && pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </Button>
        </Link>
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <User className="h-4 w-4" />
          <span>{userName || 'ユーザー'}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleSignOut} title="ログアウト">
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}
