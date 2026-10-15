import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  isFirstDayJST,
  monthStartNotice,
  previousYearMonthJST,
  runMonthStartBilling,
} from '@/lib/billing/month-start'

// 毎回実行する必要があるためキャッシュさせない
export const dynamic = 'force-dynamic'

const LINE_PUSH_API = 'https://api.line.me/v2/bot/message/push'
const PRODUCTION_URL = 'https://houkago-day-service-app-kotti.vercel.app'

/**
 * 国保連請求の月初自動化（段階1）。
 *
 * Vercel Cron（vercel.json の crons）から月末の数日の 22時（UTC）＝翌朝7時（JST）に呼ばれ、
 * JST で1日のときだけ動く（Cron の書式では「毎月1日の JST 7時」を直接書けないため）。
 * 前月分を全ユニット集計し、まだ誰も手を付けていない月だけ請求明細を作り、
 * 要確認を「設定 → 国保連請求の月初お知らせ」で選んだ請求担当へ LINE で送る。
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET が未設定です' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isFirstDayJST()) {
    return NextResponse.json({ ok: true, skipped: '1日ではないため実行しません' })
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
  // 型は server クライアント前提だが、使っているのは共通の問い合わせ API だけ
  const client = admin as unknown as Parameters<typeof runMonthStartBilling>[0]

  const yearMonth = previousYearMonthJST()
  let report
  try {
    report = await runMonthStartBilling(client, yearMonth, { apply: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  const { data: staffRaw } = await admin
    .from('staff_members')
    .select('name, line_user_id')
    .eq('receives_billing_notice', true)
  const recipients = ((staffRaw ?? []) as { name: string; line_user_id: string | null }[])
    .filter((s) => s.line_user_id)

  const text = monthStartNotice(report, process.env.NEXT_PUBLIC_APP_URL || PRODUCTION_URL)
  let notified = 0
  const failed: string[] = []
  for (const s of recipients) {
    const res = await fetch(LINE_PUSH_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: s.line_user_id, messages: [{ type: 'text', text }] }),
    })
    if (res.ok) notified++
    else failed.push(`${s.name}（送信失敗 ${res.status}）`)
  }

  return NextResponse.json({
    ok: true,
    yearMonth,
    recalculated: report.units.filter((u) => u.recalculated).map((u) => u.unitName),
    skipped: report.units.filter((u) => !u.recalculated).map((u) => `${u.unitName}: ${u.error ?? u.skippedReason ?? ''}`),
    notified,
    failed,
  })
}
