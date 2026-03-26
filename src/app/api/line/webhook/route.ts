import { NextRequest, NextResponse } from 'next/server'
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

  for (const event of payload.events ?? []) {
    const userId = event.source?.userId
    const replyToken = event.replyToken

    if (!userId || !replyToken) continue

    // メッセージ受信またはフォロー時にUser IDを返信
    if (event.type === 'message' || event.type === 'follow') {
      await replyMessage(
        replyToken,
        `あなたのLINE User IDは以下です。\n\n${userId}\n\nこのIDを管理アプリの「設定」→「スタッフ管理」→ご自身の名前→「LINE User ID」欄に貼り付けてください。`,
        channelToken
      )
    }
  }

  return NextResponse.json({ ok: true })
}
