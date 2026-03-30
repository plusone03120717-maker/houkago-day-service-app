import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const LINE_API = 'https://api.line.me/v2/bot/message/push'

type TransportDetail = {
  child_id: string
  pickup_location: string | null
  children: { name: string } | null
}

type Schedule = {
  id: string
  direction: string
  departure_time: string | null
  transport_vehicles: { name: string } | null
  transport_details: TransportDetail[]
}


/** JST の今日の日付を yyyy-MM-dd 形式で返す */
function getTodayJST(): string {
  const now = new Date()
  // UTC+9
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

/** yyyy-MM-dd を "2026年3月26日（木）" 形式に変換 */
function formatJapaneseDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const dow = new Date(y, m - 1, d).getDay()
  return `${y}年${m}月${d}日（${days[dow]}）`
}

/** 場所名から絵文字アイコンを判定 */
function locationIcon(location: string): string {
  if (/学校|学園|支援学校|小学|中学|高校|幼稚園|保育/.test(location)) return '🏫'
  return '📍'
}

/** ルートテキストを組み立てる */
function buildRouteText(details: TransportDetail[]): string {
  const stops: { location: string; names: string[] }[] = []
  for (const d of details) {
    const loc = d.pickup_location ?? '場所未設定'
    const name = d.children?.name ?? '不明'
    const last = stops[stops.length - 1]
    if (last && last.location === loc) {
      last.names.push(name)
    } else {
      stops.push({ location: loc, names: [name] })
    }
  }
  return stops.map((s, i) => {
    const icon = locationIcon(s.location)
    const header = `${i + 1} ${icon} ${s.location}（${s.names.length}名）`
    const names = s.names.map((n) => `   ${n}`).join('\n')
    return `${header}\n${names}`
  }).join('\n\n')
}

/** LINE Push Message を送信 */
async function sendLinePush(lineUserId: string, text: string, token: string): Promise<void> {
  const res = await fetch(LINE_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error(`LINE push failed for ${lineUserId}: ${res.status} ${body}`)
  }
}

export async function GET(request: NextRequest) {
  // Vercel Cron からの呼び出しを検証
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!lineToken) {
    return NextResponse.json({ error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = getTodayJST()

  // 全ユニットを取得
  const { data: units } = await supabase
    .from('units')
    .select('id, name')
    .order('name')

  if (!units || units.length === 0) {
    return NextResponse.json({ message: 'no units' })
  }

  // 各ユニットのスケジュールを取得
  const { data: schedulesRaw } = await supabase
    .from('transport_schedules')
    .select(`
      id, direction, departure_time,
      unit_id,
      transport_vehicles (name),
      transport_details (
        child_id, pickup_location,
        children (name)
      )
    `)
    .in('unit_id', units.map((u) => u.id))
    .eq('date', today)
    .order('direction')

  const schedules = (schedulesRaw ?? []) as unknown as (Schedule & { unit_id: string })[]

  // ユニットごとにグループ化
  const unitMap = new Map(units.map((u) => [u.id, u.name]))
  const grouped = new Map<string, { unitName: string; schedules: Schedule[] }>()
  for (const s of schedules) {
    const unitName = unitMap.get(s.unit_id) ?? s.unit_id
    if (!grouped.has(s.unit_id)) {
      grouped.set(s.unit_id, { unitName, schedules: [] })
    }
    grouped.get(s.unit_id)!.schedules.push(s)
  }

  // メッセージ本文を組み立て
  const dateLabel = formatJapaneseDate(today)
  let messageText = `【本日の送迎スケジュール】\n${dateLabel}\n`

  if (grouped.size === 0) {
    return NextResponse.json({ message: 'no schedules today, notification skipped' })
  } else {
    for (const { unitName, schedules: unitSchedules } of grouped.values()) {
      messageText += `\n▼ ${unitName}\n`
      const sortedSchedules = [...unitSchedules].sort((a, b) => {
        // pickup (お迎え) を先に、outbound (お送り) を後に
        if (a.direction === b.direction) return 0
        return a.direction === 'pickup' ? -1 : 1
      })
      for (const sched of sortedSchedules) {
        const dirLabel = sched.direction === 'pickup' ? 'お迎え' : 'お送り'
        const vehicleName = sched.transport_vehicles?.name ?? '車両未設定'
        const depTime = sched.departure_time ? ` 出発 ${sched.departure_time.slice(0, 5)}` : ''
        messageText += `\n■ ${dirLabel}（${vehicleName}）${depTime}\n`
        if (sched.transport_details.length === 0) {
          messageText += '  対象者なし\n'
        } else {
          messageText += buildRouteText(sched.transport_details) + '\n'
        }
      }
    }
  }

  messageText = messageText.trim()

  // line_user_id が登録されているスタッフ全員に送信（usersテーブル + staff_membersテーブル）
  const [{ data: staffWithLine }, { data: membersWithLine }] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, line_user_id')
      .in('role', ['admin', 'staff'])
      .not('line_user_id', 'is', null),
    supabase
      .from('staff_members')
      .select('id, name, line_user_id')
      .not('line_user_id', 'is', null),
  ])

  // line_user_id の重複を排除（usersとstaff_membersの両方に登録されている場合を考慮）
  const seen = new Set<string>()
  const recipients = [
    ...(staffWithLine ?? []),
    ...(membersWithLine ?? []),
  ].filter((r) => {
    if (seen.has(r.line_user_id)) return false
    seen.add(r.line_user_id)
    return true
  }) as { id: string; name: string; line_user_id: string }[]

  if (recipients.length === 0) {
    return NextResponse.json({ message: 'no recipients with line_user_id', text: messageText })
  }

  const results = await Promise.allSettled(
    recipients.map((r) => sendLinePush(r.line_user_id, messageText, lineToken))
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length

  return NextResponse.json({
    ok: true,
    date: today,
    sent,
    failed,
    recipients: recipients.map((r) => r.name),
  })
}
