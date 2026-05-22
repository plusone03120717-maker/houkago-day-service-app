import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const LINE_REPLY_API = 'https://api.line.me/v2/bot/message/reply'

function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET
  if (!secret) return false
  const hash = crypto.createHmac('sha256', secret).update(body).digest('base64')
  return hash === signature
}

async function replyMessage(replyToken: string, text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return
  await fetch(LINE_REPLY_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  })
}

function nowJST(): string {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const h = String(jst.getUTCHours()).padStart(2, '0')
  const m = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-line-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const body = JSON.parse(rawBody)
  const events: unknown[] = body.events ?? []

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  for (const event of events) {
    const ev = event as {
      type: string
      replyToken?: string
      source?: { userId?: string }
      message?: { type?: string; text?: string }
    }

    if (ev.type !== 'message' || ev.message?.type !== 'text') continue

    const lineUserId = ev.source?.userId
    const replyToken = ev.replyToken
    const text = ev.message?.text?.trim() ?? ''

    if (!lineUserId || !replyToken) continue

    const action = text === '出勤' ? 'clock_in' : text === '退勤' ? 'clock_out' : null
    if (!action) continue

    // LINE User IDでスタッフを検索
    const { data: staff } = await adminClient
      .from('staff_members')
      .select('id, name')
      .eq('line_user_id', lineUserId)
      .maybeSingle()

    if (!staff) {
      await replyMessage(replyToken, 'アカウントが登録されていません。管理者にお問い合わせください。')
      continue
    }

    const now = new Date().toISOString()
    const timeStr = nowJST()

    await adminClient.from('time_records').insert({
      staff_member_id: staff.id,
      type: action,
      recorded_at: now,
    })

    const label = action === 'clock_in' ? '出勤' : '退勤'
    await replyMessage(
      replyToken,
      `✅ ${staff.name}さんの${label}を記録しました\n⏰ ${timeStr}`,
    )
  }

  return NextResponse.json({ ok: true })
}
