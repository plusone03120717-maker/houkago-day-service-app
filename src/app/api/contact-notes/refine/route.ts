import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { WRITING_EFFORT, WRITING_MODEL } from '@/lib/ai/models'
import { NO_ADDED_PLANS, NO_INVENTED_FACTS, POLISH_EVEN_IF_CLEAN } from '@/lib/ai/fact-rules'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content } = await request.json() as { content: string }
  if (!content?.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const prompt = `以下は放課後等デイサービスの連絡帳に書かれた内容です。箇条書きやメモ書きも含まれている場合があります。
これを保護者向けの丁寧で温かみのある文章に整えてください。

【入力された内容】
${content}

【作成ルール】
・保護者に温かく丁寧に伝える文体
・入力内容のすべての情報を漏れなく盛り込む
${POLISH_EVEN_IF_CLEAN}
${NO_INVENTED_FACTS}
${NO_ADDED_PLANS}
・200〜350字程度
・「本日も〜」「今日は〜」などで書き始める
・署名・挨拶文は不要
・説明文は不要。整えた文章のみ出力する`

  try {
    const message = await anthropic.messages.create({
      model: WRITING_MODEL,
      max_tokens: 2048,
      output_config: { effort: WRITING_EFFORT },
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    const refined = textBlock?.type === 'text' ? textBlock.text.trim() : ''
    return NextResponse.json({ refined })
  } catch (error) {
    console.error('AI refine error:', error)
    return NextResponse.json({ error: 'AI処理に失敗しました' }, { status: 500 })
  }
}
