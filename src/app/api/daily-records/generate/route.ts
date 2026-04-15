import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { childId, bulletPoints, activities } = await request.json() as {
    childId: string
    bulletPoints: string
    activities: { name: string; notes: string }[]
  }

  if (!bulletPoints?.trim()) {
    return NextResponse.json({ error: 'bulletPoints is required' }, { status: 400 })
  }

  // 有効な支援計画を取得
  const { data: planRaw } = await supabase
    .from('support_plans')
    .select('long_term_goals, short_term_goals, support_content')
    .eq('child_id', childId)
    .in('status', ['active', 'reviewed'])
    .order('plan_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const plan = planRaw as {
    long_term_goals: string | null
    short_term_goals: string | null
    support_content: string | null
  } | null

  const planSection = plan
    ? `【個別支援計画】
長期目標: ${plan.long_term_goals ?? '未設定'}
短期目標: ${plan.short_term_goals ?? '未設定'}
支援内容: ${plan.support_content ?? '未設定'}`
    : '【個別支援計画】未設定'

  const activitiesSection = activities.length > 0
    ? `【本日の活動】\n${activities.map((a) => `・${a.name}${a.notes ? `（${a.notes}）` : ''}`).join('\n')}`
    : ''

  const prompt = `あなたは放課後等デイサービスの支援員です。以下の箇条書きメモをもとに、日常記録の文章を作成してください。

${planSection}

${activitiesSection}

【箇条書きメモ】
${bulletPoints}

【出力ルール】
・箇条書きメモの内容を自然な日常記録の文章（2〜4文程度）に変換してください
・支援計画の目標と今日の様子を照らし合わせ、関連する場合は文章の最後に1文で「（支援計画との照合：○○）」という形で補足してください
・支援計画が未設定または照合できない場合は補足なしで文章のみ出力してください
・専門的かつ自然な文体で記述してください
・文章のみ出力し、余計な説明は不要です`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    return NextResponse.json({ content })
  } catch (error) {
    console.error('AI generate error:', error)
    return NextResponse.json({ error: 'AI処理に失敗しました' }, { status: 500 })
  }
}
