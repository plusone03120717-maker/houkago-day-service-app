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
  const { childId, date } = body as { childId: string; date: string }

  if (!childId || !date) {
    return NextResponse.json({ error: 'childId and date are required' }, { status: 400 })
  }

  // 児童情報を取得
  const { data: child } = await supabase
    .from('children')
    .select('name, disability_type')
    .eq('id', childId)
    .single()

  if (!child) return NextResponse.json({ error: '児童が見つかりません' }, { status: 404 })

  // 当日の出席記録を取得
  const { data: attendance } = await supabase
    .from('attendance')
    .select('check_in_time, check_out_time, body_temperature')
    .eq('child_id', childId)
    .eq('date', date)
    .maybeSingle()

  // 当日の活動記録を取得
  const { data: activityRecords } = await supabase
    .from('activity_records')
    .select('activities(name), achievement_level, notes')
    .eq('child_id', childId)
    .eq('date', date)

  // 当日の日常記録を取得
  const { data: dailyRecord } = await supabase
    .from('daily_records')
    .select('content, notable_events')
    .eq('child_id', childId)
    .eq('date', date)
    .maybeSingle()

  const activitiesText = (activityRecords ?? [])
    .map((r) => {
      const actName = Array.isArray(r.activities) ? r.activities[0]?.name : (r.activities as { name: string } | null)?.name
      const level = Number(r.achievement_level) || 0
      const stars = '★'.repeat(level) + '☆'.repeat(5 - level)
      return `・${actName ?? '活動'}（達成度: ${stars}）${r.notes ? `　${r.notes}` : ''}`
    })
    .join('\n')

  const prompt = `以下の情報をもとに、放課後等デイサービスの連絡帳（保護者への今日の活動報告文）を書いてください。

【基本情報】
・お子さんの名前: ${child.name}さん
・日付: ${date}
・来所時刻: ${attendance?.check_in_time ?? '記録なし'}
・帰所時刻: ${attendance?.check_out_time ?? '記録なし'}
・体温: ${attendance?.body_temperature ? `${attendance.body_temperature}℃` : '記録なし'}
${child.disability_type ? `・障害特性: ${child.disability_type}` : ''}

【本日の活動】
${activitiesText || '活動記録なし'}

【日常記録・様子】
${dailyRecord?.content || 'なし'}

${dailyRecord?.notable_events ? `【特記事項】\n${dailyRecord.notable_events}` : ''}

【作成ルール】
・保護者に温かく丁寧に伝える文体
・200〜350字程度
・具体的なエピソードや子どもの様子を交えて
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
