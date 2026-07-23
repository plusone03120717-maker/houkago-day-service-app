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

type StaffMember = { id: string; name: string; user_id: string | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findStaffByLineUserId(adminClient: any, lineUserId: string): Promise<StaffMember | null> {
  let { data: staffRaw } = await adminClient
    .from('staff_members')
    .select('id, name, user_id')
    .eq('line_user_id', lineUserId)
    .maybeSingle()

  if (!staffRaw) {
    const { data: linkedUser } = await adminClient
      .from('users')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle()

    if (linkedUser) {
      const { data: linkedMember } = await adminClient
        .from('staff_members')
        .select('id, name, user_id')
        .eq('user_id', (linkedUser as { id: string }).id)
        .maybeSingle()

      if (linkedMember) {
        await adminClient
          .from('staff_members')
          .update({ line_user_id: lineUserId })
          .eq('id', (linkedMember as StaffMember).id)
        staffRaw = linkedMember
      }
    }
  }

  return staffRaw as StaffMember | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkTodayClockIn(adminClient: any, staffId: string): Promise<boolean> {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findMissingClockOut(adminClient: any, staffId: string): Promise<string | null> {
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

const LIFF_STAFF_URL = process.env.LINE_LIFF_STAFF_URL ?? ''

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

    // 出勤・退勤
    if (text === '出勤' || text === '退勤') {
      const action = text === '出勤' ? 'clock_in' : 'clock_out'
      const staff = await findStaffByLineUserId(adminClient, userId)

      if (!staff) {
        await replyMessage(
          replyToken,
          `タイムカードの登録がまだ完了していません。\n\nあなたのLINE User IDは以下です。\n\n${userId}\n\nこのIDを管理者に伝えて「LINE User ID」欄に登録してもらってください。`,
          channelToken
        )
        continue
      }

      if (action === 'clock_in') {
        const missingDate = await findMissingClockOut(adminClient, staff.id)
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

      if (action === 'clock_out') {
        const hasTodayClockIn = await checkTodayClockIn(adminClient, staff.id)
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

    // その他: LINE User ID ＋ 申請ページ案内
    const staffAppMsg = LIFF_STAFF_URL
      ? `有給・残業・中抜けの申請はこちらから：\n${LIFF_STAFF_URL}`
      : '有給・残業・中抜けの申請は管理者から共有されたURLよりご利用ください。'
    await replyMessage(
      replyToken,
      `あなたのLINE User IDは以下です。\n\n${userId}\n\nこのIDを管理アプリの「設定」→「スタッフ管理」→ご自身の名前→「LINE User ID」欄に貼り付けてください。\n\n${staffAppMsg}`,
      channelToken
    )
  }

  return NextResponse.json({ ok: true })
}
