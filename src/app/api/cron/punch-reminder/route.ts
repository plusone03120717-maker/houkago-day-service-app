import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findMissingPunches, missingPunchNotice } from '@/lib/line/timecard-correction'

// 毎回実行する必要があるためキャッシュさせない
export const dynamic = 'force-dynamic'

const LINE_PUSH_API = 'https://api.line.me/v2/bot/message/push'

/**
 * 打刻漏れの夜間通知。
 *
 * Vercel Cron（vercel.json の crons）から毎晩20時30分（JST）に呼ばれる。
 * その日に出勤だけ・退勤だけのスタッフへ、LINEで日付と時刻を送るよう知らせる。
 * 返信はLINE webhook が受け取り、タイムカードへ自動で反映する。
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET が未設定です' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'LINE_CHANNEL_ACCESS_TOKEN が未設定です' }, { status: 500 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const missing = await findMissingPunches(admin, today, today)
  if (missing.length === 0) return NextResponse.json({ ok: true, notified: 0 })

  const { data: staffRaw } = await admin
    .from('staff_members')
    .select('id, name, line_user_id')
    .in('id', [...new Set(missing.map((m) => m.staff_member_id))])
  const staff = (staffRaw ?? []) as { id: string; name: string; line_user_id: string | null }[]

  let notified = 0
  const skipped: string[] = []
  for (const s of staff) {
    const mine = missing.filter((m) => m.staff_member_id === s.id)
    if (!s.line_user_id) {
      skipped.push(s.name)
      continue
    }
    const res = await fetch(LINE_PUSH_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: s.line_user_id, messages: [{ type: 'text', text: missingPunchNotice(s.name, mine) }] }),
    })
    if (res.ok) notified++
    else skipped.push(`${s.name}（送信失敗 ${res.status}）`)
  }

  return NextResponse.json({ ok: true, notified, skipped })
}
