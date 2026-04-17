import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const FIELD_PROMPTS: Record<string, string> = {
  long_term_goals: `以下は個別支援計画の長期目標（6ヶ月〜1年）として書かれた内容です。
箇条書きやメモ書きも含まれている場合があります。
これを放課後等デイサービスの個別支援計画書として適切な、具体的かつ測定可能な目標文に整えてください。

【整形ルール】
・「〜できるようになる」「〜を身につける」などの目標表現を使う
・専門的で簡潔な文体
・100〜200字程度
・整えた文章のみ出力（説明不要）`,

  short_term_goals: `以下は個別支援計画の短期目標（3〜6ヶ月）として書かれた内容です。
箇条書きやメモ書きも含まれている場合があります。
これを放課後等デイサービスの個別支援計画書として適切な、具体的かつ測定可能な目標文に整えてください。

【整形ルール】
・長期目標を達成するためのステップとして記述
・「〜できる」「〜を行える」などの目標表現を使う
・専門的で簡潔な文体
・100〜200字程度
・整えた文章のみ出力（説明不要）`,

  support_content: `以下は個別支援計画の支援内容・方法として書かれた内容です。
箇条書きやメモ書きも含まれている場合があります。
これを放課後等デイサービスの個別支援計画書として適切な支援内容の記述に整えてください。

【整形ルール】
・具体的な支援方法・活動内容・配慮事項を含める
・専門的で簡潔な文体
・150〜300字程度
・整えた文章のみ出力（説明不要）`,

  monitoring_notes: `以下は個別支援計画のモニタリング記録として書かれた内容です。
箇条書きやメモ書きも含まれている場合があります。
これを放課後等デイサービスの個別支援計画書として適切な記録文に整えてください。

【整形ルール】
・目標の達成状況・課題・今後の方針を含める
・専門的で簡潔な文体
・100〜200字程度
・整えた文章のみ出力（説明不要）`,

  long_term_progress: `以下はモニタリング記録の「長期目標の達成状況」として書かれた内容です。
これを放課後等デイサービスの支援記録として適切な達成状況の記述に整えてください。

【整形ルール】
・目標に対する現在の進捗・変化を具体的に記述
・専門的で簡潔な文体
・80〜150字程度
・整えた文章のみ出力（説明不要）`,

  short_term_progress: `以下はモニタリング記録の「短期目標の達成状況」として書かれた内容です。
これを放課後等デイサービスの支援記録として適切な達成状況の記述に整えてください。

【整形ルール】
・目標に対する現在の進捗・変化を具体的に記述
・専門的で簡潔な文体
・80〜150字程度
・整えた文章のみ出力（説明不要）`,

  issues: `以下はモニタリング記録の「課題・気になること」として書かれた内容です。
これを放課後等デイサービスの支援記録として適切な課題記述に整えてください。

【整形ルール】
・現在の課題・懸念事項を客観的に記述
・専門的で簡潔な文体
・80〜150字程度
・整えた文章のみ出力（説明不要）`,

  next_actions: `以下はモニタリング記録の「今後の対応・方針」として書かれた内容です。
これを放課後等デイサービスの支援記録として適切な方針記述に整えてください。

【整形ルール】
・次期計画への反映事項・支援の見直し点を具体的に記述
・専門的で簡潔な文体
・80〜150字程度
・整えた文章のみ出力（説明不要）`,

  notable_record: `以下は放課後等デイサービスの特記事項（保護者への報告・ヒヤリハット・体調異変など）として書かれた内容です。
箇条書きやメモ書きも含まれている場合があります。
これを支援記録として適切な特記事項の文章に整えてください。

【整形ルール】
・事実を客観的かつ簡潔に記述
・保護者・関係者が読む文体
・100〜200字程度
・整えた文章のみ出力（説明不要）`,

  family_meeting: `以下は放課後等デイサービスにおける家族支援会議のメモ・記録として書かれた内容です。
箇条書きやメモ書きも含まれている場合があります。
これを支援記録として適切な会議記録の文章に整えてください。

【整形ルール】
・話し合われた内容・決定事項・今後の方針を含める
・保護者・支援者双方の視点を尊重した文体
・専門的かつ丁寧な表現
・200〜400字程度
・整えた文章のみ出力（説明不要）`,
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { fieldType, content } = await request.json() as { fieldType: string; content: string }

  if (!content?.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const systemPrompt = FIELD_PROMPTS[fieldType]
  if (!systemPrompt) {
    return NextResponse.json({ error: 'Invalid fieldType' }, { status: 400 })
  }

  const prompt = `${systemPrompt}

【入力された内容】
${content}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const refined = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ refined })
  } catch (error) {
    console.error('AI refine error:', error)
    return NextResponse.json({ error: 'AI処理に失敗しました' }, { status: 500 })
  }
}
