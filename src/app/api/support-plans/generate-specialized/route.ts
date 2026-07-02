import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { childName, diagnosis, supportPolicy, longTermGoals } = await request.json() as {
    childName: string
    diagnosis: string | null
    supportPolicy: string
    longTermGoals: string
  }

  const prompt = `あなたは放課後等デイサービスの児童発達支援管理責任者です。
以下の児童情報をもとに、個別支援計画の「専門的支援」欄の内容を作成してください。

【対象児童】${childName}
【診断・障害特性】${diagnosis ?? '記載なし'}
${longTermGoals ? `【長期目標】${longTermGoals}` : ''}
${supportPolicy ? `【支援の方針】${supportPolicy}` : ''}

「専門的支援」とは、PT（理学療法士）・OT（作業療法士）・ST（言語聴覚士）・心理士などの専門職による個別支援、または事業所内の専門的スキルを活かした支援内容を指します。
上記の児童の特性・目標・方針を踏まえて、具体的な専門的支援内容を100〜200字程度で記述してください。

【ルール】
・どの専門職が・どのような支援を・どのような目的で行うかを含める
・具体的かつ実践的な内容
・専門的で簡潔な文体
・支援内容の文章のみ出力（説明・見出し不要）`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = (message.content[0] as { type: string; text: string }).text?.trim() ?? ''
  return NextResponse.json({ content })
}
