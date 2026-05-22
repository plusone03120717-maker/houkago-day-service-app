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

function toJSTDate(isoStr: string): string {
  const jst = new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

function todayJST(): string {
  return toJSTDate(new Date().toISOString())
}

type AdminClient = ReturnType<typeof createClient>

/** 今日（JST）の出勤記録があるか確認する */
async function checkTodayClockIn(adminClient: AdminClient, staffId: string): Promise<boolean> {
  const today = todayJST()
  const todayStart = new Date(`${today}T00:00:00+09:00`).toISOString()
  const todayEnd = new Date(`${today}T23:59:59+09:00`).toISOString()

  const { data } = await adminClient
    .from('time_records')
    .select('id')
    .eq('staff_member_id', staffId)
    .eq('type', 'clock_in')
    .gte('recorded_at', todayStart)
    .lte('recorded_at', todayEnd)
    .limit(1)
    .maybeSingle()

  return data !== null
}

/** 前回出勤時に退勤が記録されていないか確認し、未記録の日付を返す */
async function findMissingClockOut(adminClient: AdminClient, staffId: string): Promise<string | null> {
  const { data: lastClockInRaw } = await adminClient
    .from('time_records')
    .select('id, recorded_at')
    .eq('staff_member_id', staffId)
    .eq('type', 'clock_in')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastClockIn = lastClockInRaw as { id: string; recorded_at: string } | null
  if (!lastClockIn) return null

  const lastClockInDate = toJSTDate(lastClockIn.recorded_at)
  if (lastClockInDate === todayJST()) return null

  const { data: lastClockOutRaw } = await adminClient
    .from('time_records')
    .select('id, recorded_at')
    .eq('staff_member_id', staffId)
    .eq('type', 'clock_out')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastClockOut = lastClockOutRaw as { id: string; recorded_at: string } | null

  if (!lastClockOut || lastClockOut.recorded_at < lastClockIn.recorded_at) {
    return lastClockInDate
  }

  return null
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
      await replyMessage(
        replyToken,
        `あなたのLINE User IDは以下です。\n\n${userId}\n\nこのIDを管理アプリの「設定」→「スタッフ管理」→ご自身の名前→「LINE User ID」欄に貼り付けてください。`,
        channelToken
      )
      continue
    }

    if (event.type !== 'message' || event.message?.type !== 'text') continue

    const text = (event.message?.text ?? '').trim()
    const action = text === '出勤' ? 'clock_in' : text === '退勤' ? 'clock_out' : null

    if (action) {
      const { data: staff } = await adminClient
        .from('staff_members')
        .select('id, name')
        .eq('line_user_id', userId)
        .maybeSingle()

      if (!staff) {
        await replyMessage(
          replyToken,
          `タイムカードの登録がまだ完了していません。\n\nあなたのLINE User IDは以下です。\n\n${userId}\n\nこのIDを管理者に伝えて「LINE User ID」欄に登録してもらってください。`,
          channelToken
        )
        continue
      }

      // 出勤時：前回の退勤未記録チェック
      if (action === 'clock_in') {
        const missingDate = await findMissingClockOut(adminClient as AdminClient, staff.id)
        if (missingDate) {
          const [y, m, d] = missingDate.split('-').map(Number)
          await adminClient.from('time_records').insert({
            staff_member_id: staff.id,
            type: 'clock_in',
            recorded_at: new Date().toISOString(),
          })
          await replyMessage(
            replyToken,
            `⚠️ ${y}年${m}月${d}日の退勤が記録されていません。\n\n管理者にご連絡ください。\n\n出勤は引き続き記録されました。\n⏰ ${nowJST()}`,
            channelToken
          )
          continue
        }
      }

      // 退勤時：今日の出勤未記録チェック
      if (action === 'clock_out') {
        const hasTodayClockIn = await checkTodayClockIn(adminClient as AdminClient, staff.id)
        if (!hasTodayClockIn) {
          await adminClient.from('time_records').insert({
            staff_member_id: staff.id,
            type: 'clock_out',
            recorded_at: new Date().toISOString(),
          })
          await replyMessage(
            replyToken,
            `⚠️ 本日の出勤が記録されていません。\n\n出勤時間を管理者にご連絡ください。\n\n退勤は引き続き記録されました。\n⏰ ${nowJST()}`,
            channelToken
          )
          continue
        }
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
