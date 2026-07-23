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

const HELP_TEXT = `利用できるコマンド：
・出勤
・退勤
・残業申請 HH:MM
・残業申請 YYYY-MM-DD HH:MM
・有給申請 YYYY-MM-DD
・有給申請 YYYY-MM-DD 半日
・中抜け申請 HH:MM HH:MM`

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

    // 残業申請: 「残業申請 HH:MM」or「残業申請 YYYY-MM-DD HH:MM」
    const overtimeMatch = text.match(/^残業申請\s+(?:(\d{4}-\d{2}-\d{2})\s+)?(\d{2}:\d{2})$/)
    if (overtimeMatch) {
      const staff = await findStaffByLineUserId(adminClient, userId)
      if (!staff) {
        await replyMessage(replyToken, `スタッフとして登録されていません。\n管理者にLINE User ID（${userId}）を伝えて登録してもらってください。`, channelToken)
        continue
      }
      if (!staff.user_id) {
        await replyMessage(replyToken, `${staff.name}さんのアカウントは残業申請に対応していません。管理者にお問い合わせください。`, channelToken)
        continue
      }
      const targetDate = overtimeMatch[1] ?? todayJST()
      const endTimeHHMM = overtimeMatch[2]
      const { error } = await adminClient.from('overtime_requests').insert({
        staff_id: staff.user_id,
        date: targetDate,
        actual_end_time: `${endTimeHHMM}:00`,
        request_type: 'pre',
        status: 'pending',
        note: 'LINEから申請',
      })
      if (error) {
        const msg = error.code === '23505'
          ? `⚠️ ${targetDate}の残業申請はすでに登録されています。`
          : `❌ 残業申請の登録に失敗しました。管理者にご連絡ください。`
        await replyMessage(replyToken, msg, channelToken)
      } else {
        const [y, m, d] = targetDate.split('-').map(Number)
        await replyMessage(replyToken, `✅ ${staff.name}さんの残業申請を受け付けました\n📅 ${y}年${m}月${d}日\n⏰ 終了予定：${endTimeHHMM}\n\n管理者の承認をお待ちください。`, channelToken)
      }
      continue
    }

    // 有給申請: 「有給申請 YYYY-MM-DD」or「有給申請 YYYY-MM-DD 半日」
    const leaveMatch = text.match(/^有給申請\s+(\d{4}-\d{2}-\d{2})(\s+半日)?$/)
    if (leaveMatch) {
      const staff = await findStaffByLineUserId(adminClient, userId)
      if (!staff) {
        await replyMessage(replyToken, `スタッフとして登録されていません。\n管理者にLINE User ID（${userId}）を伝えて登録してもらってください。`, channelToken)
        continue
      }
      if (!staff.user_id) {
        await replyMessage(replyToken, `${staff.name}さんのアカウントは有給申請に対応していません。管理者にお問い合わせください。`, channelToken)
        continue
      }
      const targetDate = leaveMatch[1]
      const isHalfDay = !!leaveMatch[2]
      const { error } = await adminClient.from('paid_leave_usages').insert({
        staff_id: staff.user_id,
        date: targetDate,
        days_used: isHalfDay ? 0.5 : 1.0,
        note: 'LINEから申請',
      })
      if (error) {
        const msg = error.code === '23505'
          ? `⚠️ ${targetDate}の有給申請はすでに登録されています。`
          : `❌ 有給申請の登録に失敗しました。管理者にご連絡ください。`
        await replyMessage(replyToken, msg, channelToken)
      } else {
        const [y, m, d] = targetDate.split('-').map(Number)
        const label = isHalfDay ? '半日' : '1日'
        await replyMessage(replyToken, `✅ ${staff.name}さんの有給申請を受け付けました\n📅 ${y}年${m}月${d}日（${label}）\n\n管理者に通知されます。`, channelToken)
      }
      continue
    }

    // 中抜け申請: 「中抜け申請 HH:MM HH:MM」
    const breakMatch = text.match(/^中抜け申請\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})$/)
    if (breakMatch) {
      const staff = await findStaffByLineUserId(adminClient, userId)
      if (!staff) {
        await replyMessage(replyToken, `スタッフとして登録されていません。\n管理者にLINE User ID（${userId}）を伝えて登録してもらってください。`, channelToken)
        continue
      }
      const breakStart = breakMatch[1]
      const breakEnd = breakMatch[2]
      if (breakStart >= breakEnd) {
        await replyMessage(replyToken, `⚠️ 開始時刻は終了時刻より前に指定してください。\n例：中抜け申請 12:00 13:00`, channelToken)
        continue
      }
      const today = todayJST()
      const { error } = await adminClient.from('time_records').insert([
        { staff_member_id: staff.id, type: 'break_start', recorded_at: new Date(`${today}T${breakStart}:00+09:00`).toISOString() },
        { staff_member_id: staff.id, type: 'break_end', recorded_at: new Date(`${today}T${breakEnd}:00+09:00`).toISOString() },
      ])
      if (error) {
        await replyMessage(replyToken, `❌ 中抜け申請の登録に失敗しました。管理者にご連絡ください。`, channelToken)
      } else {
        await replyMessage(replyToken, `✅ ${staff.name}さんの中抜けを記録しました\n📅 ${today}\n⏰ ${breakStart}〜${breakEnd}`, channelToken)
      }
      continue
    }

    // その他: コマンド一覧＋LINE User ID
    await replyMessage(
      replyToken,
      `あなたのLINE User IDは以下です。\n\n${userId}\n\n${HELP_TEXT}`,
      channelToken
    )
  }

  return NextResponse.json({ ok: true })
}
