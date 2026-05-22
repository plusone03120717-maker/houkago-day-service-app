import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const LINE_REPLY_API = 'https://api.line.me/v2/bot/message/reply'

function verifySignature(body: string, signature: string, secret: string): boolean {
  const hash = crypto.createHmac('sha256', secret).update(body).digest('base64')
  return hash === signature
}

async function replyMessage(replyToken: string, text: string, token: string) {
  await fetch(LINE_REPLY_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
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

export async function POST(request: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET
  const channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN

  if (!channelSecret || !channelToken) {
    return NextResponse.json({ error: 'LINE not configured' }, { status: 500 })
  }

  const body = await request.text()
  const signature = request.headers.get('x-line-signature') ?? ''

  if (!verifySignature(body, signature, channelSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(body)

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  for (const event of payload.events ?? []) {
    const userId = event.source?.userId
    const replyToken = event.replyToken

    if (!userId || !replyToken) continue

    if (event.type === 'follow') {
      // 友だち追加時はLINE User IDを案内
      await replyMessage(
        replyToken,
        `あなたのLINE User IDは以下です。\n\n${userId}\n\nこのIDを管理アプリの「設定」→「スタッフ管理」→ご自身の名前→「LINE User ID」欄に貼り付けてください。`,
        channelToken
      )
      continue
    }

    if (event.type !== 'message' || event.message?.type !== 'text') continue

    const text = (event.message?.text ?? '').trim()

    // 出勤・退勤の打刻処理
    const action = text === '出勤' ? 'clock_in' : text === '退勤' ? 'clock_out' : null

    if (action) {
      const { data: staff } = await adminClient
        .from('staff_members')
        .select('id, name')
        .eq('line_user_id', userId)
        .maybeSingle()

      if (!staff) {
        // 未登録の場合はLINE User IDを案内
        await replyMessage(
          replyToken,
          `タイムカードの登録がまだ完了していません。\n\nあなたのLINE User IDは以下です。\n\n${userId}\n\nこのIDを管理者に伝えて「LINE User ID」欄に登録してもらってください。`,
          channelToken
        )
        continue
      }

      await adminClient.from('time_records').insert({
        staff_member_id: staff.id,
        type: action,
        recorded_at: new Date().toISOString(),
      })

      const label = action === 'clock_in' ? '出勤' : '退勤'
      await replyMessage(
        replyToken,
        `✅ ${staff.name}さんの${label}を記録しました\n⏰ ${nowJST()}`,
        channelToken
      )
      continue
    }

    // その他のメッセージはLINE User IDを返す
    await replyMessage(
      replyToken,
      `あなたのLINE User IDは以下です。\n\n${userId}\n\nこのIDを管理アプリの「設定」→「スタッフ管理」→ご自身の名前→「LINE User ID」欄に貼り付けてください。`,
      channelToken
    )
  }

  return NextResponse.json({ ok: true })
}
