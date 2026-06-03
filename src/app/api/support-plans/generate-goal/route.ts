import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { areaLabel, supportContent } = await request.json() as { areaLabel: string; supportContent: string }
  if (!supportContent?.trim()) {
    return NextResponse.json({ error: 'supportContent is required' }, { status: 400 })
  }

  const prompt = `あなたは放課後等デイサービスの児童発達支援管理責任者です。
以下は個別支援計画の「${areaLabel}」領域の支援内容です。
この支援内容を踏まえて、支援目標（具体的な到達目標）を1〜2文で簡潔に作成してください。

【ルール】
・「〜できるようになる」「〜を身につける」「〜を目指す」などの目標表現を使う
・支援内容と対応した具体的な到達目標
・50字程度（長くても60字以内）で1文にまとめる
・目標文のみを出力（説明・見出し・改行不要）

支援内容:
${supportContent.trim()}`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }],
  })

  const goal = (message.content[0] as { type: string; text: string }).text?.trim() ?? ''
  return NextResponse.json({ goal })
}
