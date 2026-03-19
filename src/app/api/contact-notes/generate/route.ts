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
  const { childName, date, attendance, activities, dailyRecord, notableRecord } = body

  const activitiesText = activities
    .map((a: { name: string; achievementLevel: number; notes: string }) => {
      const stars = '★'.repeat(a.achievementLevel) + '☆'.repeat(5 - a.achievementLevel)
      return `・${a.name}（達成度: ${stars}）${a.notes ? `　${a.notes}` : ''}`
    })
    .join('\n')

  const prompt = `以下の情報をもとに、放課後等デイサービスの連絡帳（保護者への今日の活動報告文）を書いてください。

【基本情報】
・お子さんの名前: ${childName}さん
・日付: ${date}
・来所時刻: ${attendance.checkInTime ?? '記録なし'}
・帰所時刻: ${attendance.checkOutTime ?? '記録なし'}
・体温: ${attendance.bodyTemperature ? `${attendance.bodyTemperature}℃` : '記録なし'}

【本日の活動】
${activitiesText || '活動記録なし'}

【日常記録・様子】
${dailyRecord || 'なし'}

${notableRecord ? `【特記事項】\n${notableRecord}` : ''}

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
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ content })
  } catch (error) {
    console.error('AI generation error:', error)
    return NextResponse.json({ error: 'AI生成に失敗しました' }, { status: 500 })
  }
}
