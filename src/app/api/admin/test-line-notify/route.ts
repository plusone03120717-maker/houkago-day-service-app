import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  // 管理者のみ許可
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (userData?.role !== 'admin') {
    return NextResponse.json({ error: '管理者のみ実行できます' }, { status: 403 })
  }

  // サーバーサイドから CRON_SECRET 付きで cron エンドポイントを呼び出す
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cronSecret = process.env.CRON_SECRET

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cronSecret) headers['Authorization'] = `Bearer ${cronSecret}`

  const res = await fetch(`${appUrl}/api/cron/transport-notify`, { headers })
  const json = await res.json()
  return NextResponse.json(json, { status: res.status })
}
