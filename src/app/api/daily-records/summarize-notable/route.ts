import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { records } = await request.json() as {
    records: { date: string; content: string }[]
  }

  if (!records || records.length === 0) {
    return NextResponse.json({ error: 'records is required' }, { status: 400 })
  }

  const recordsText = records
    .map((r) => `【${r.date}】${r.content}`)
    .join('\n')

  const prompt = `以下は放課後等デイサービスの特記事項の記録（直近3ヶ月分）です。
これをモニタリング会議の議題として使えるよう、要点を整理してまとめてください。

【特記事項一覧】
${recordsText}

【出力ルール】
・繰り返し出現している問題・傾向を優先的にまとめる
・今後の支援に向けた議題候補を箇条書きで3〜5点挙げる
・支援員・保護者・関係者が共有しやすい専門的な文体
・200〜350字程度
・整えた文章のみ出力（余分な説明不要）`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const summary = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    return NextResponse.json({ summary })
  } catch (error) {
    console.error('AI summarize error:', error)
    return NextResponse.json({ error: 'AI処理に失敗しました' }, { status: 500 })
  }
}
