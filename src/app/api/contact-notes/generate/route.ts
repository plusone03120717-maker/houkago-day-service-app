import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    childId,
    date,
    // フォームから直接渡されるデータ（優先）
    childName: bodyChildName,
    dailyRecord: bodyDailyRecord,
    notableRecord: bodyNotableRecord,
    activities: bodyActivities,
    attendance: bodyAttendance,
  } = body as {
    childId: string
    date: string
    childName?: string
    dailyRecord?: string
    notableRecord?: string
    activities?: { name: string; achievementLevel: number; notes: string }[]
    attendance?: { checkInTime: string | null; checkOutTime: string | null; bodyTemperature: number | null } | null
  }

  if (!childId || !date) {
    return NextResponse.json({ error: 'childId and date are required' }, { status: 400 })
  }

  // フォームからデータが渡されていない場合のみDBから取得
  let childName = bodyChildName
  let disabilityType: string | null = null

  if (!childName) {
    const { data: child } = await supabase
      .from('children')
      .select('name, disability_type')
      .eq('id', childId)
      .single()
    if (!child) return NextResponse.json({ error: '児童が見つかりません' }, { status: 404 })
    childName = child.name
    disabilityType = child.disability_type
  }

  // 出席情報
  let checkIn = bodyAttendance?.checkInTime ?? null
  let checkOut = bodyAttendance?.checkOutTime ?? null
  let bodyTemp = bodyAttendance?.bodyTemperature ?? null

  if (bodyAttendance === undefined) {
    const { data: att } = await supabase
      .from('attendance')
      .select('check_in_time, check_out_time, body_temperature')
      .eq('child_id', childId)
      .eq('date', date)
      .maybeSingle()
    checkIn = att?.check_in_time ?? null
    checkOut = att?.check_out_time ?? null
    bodyTemp = att?.body_temperature ?? null
  }

  // 活動記録
  let activitiesText = ''
  if (bodyActivities && bodyActivities.length > 0) {
    activitiesText = bodyActivities
      .map((a) => {
        const stars = '★'.repeat(a.achievementLevel) + '☆'.repeat(5 - a.achievementLevel)
        return `・${a.name}（達成度: ${stars}）${a.notes ? `　${a.notes}` : ''}`
      })
      .join('\n')
  }

  // 日常記録
  const dailyRecord = bodyDailyRecord ?? ''
  const notableRecord = bodyNotableRecord ?? ''

  const prompt = `以下の情報をもとに、放課後等デイサービスの連絡帳（保護者への今日の活動報告文）を書いてください。

【基本情報】
・お子さんの名前: ${childName}さん
・日付: ${date}
・来所時刻: ${checkIn ?? '記録なし'}
・帰所時刻: ${checkOut ?? '記録なし'}
・体温: ${bodyTemp ? `${bodyTemp}℃` : '記録なし'}
${disabilityType ? `・障害特性: ${disabilityType}` : ''}

【本日の活動】
${activitiesText || '活動記録なし'}

【日常記録・様子】
${dailyRecord || 'なし'}

${notableRecord ? `【特記事項】\n${notableRecord}` : ''}

【作成ルール】
・保護者に温かく丁寧に伝える文体
・200〜350字程度
・具体的なエピソードや子どもの様子を交えて
・活動記録や日常記録の内容を積極的に取り込む
・特記事項がある場合は適切に伝える（深刻になりすぎず、次回の対応なども添える）
・「本日も〜」「今日は〜」で書き始める
・署名・挨拶文は不要

連絡帳の文章のみを出力してください（説明文などは不要）。`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const draft = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ draft })
  } catch (error) {
    console.error('AI generation error:', error)
    return NextResponse.json({ error: 'AI生成に失敗しました' }, { status: 500 })
  }
}
