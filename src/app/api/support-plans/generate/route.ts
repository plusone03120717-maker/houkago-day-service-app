import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { childName, diagnosis, recentRecords, existing } = await request.json()

  const recordsSummary = (recentRecords ?? [])
    .map((r: { date: string; notable_events?: string; contact_note?: string }) =>
      `${r.date}: ${r.notable_events ?? ''} ${r.contact_note ?? ''}`.trim()
    )
    .filter(Boolean)
    .join('\n')

  const prompt = `あなたは放課後等デイサービスの専門家です。以下の情報をもとに、個別支援計画の下書きを作成してください。

【対象児童】${childName}
【診断・障害特性】${diagnosis ?? '記載なし'}
【最近の支援記録（直近5回）】
${recordsSummary || '記録なし'}
${existing?.longTermGoals ? `【現在の長期目標】${existing.longTermGoals}` : ''}
${existing?.shortTermGoals ? `【現在の短期目標】${existing.shortTermGoals}` : ''}

以下の9項目をJSON形式で出力してください。各項目は100〜250文字程度で、具体的で実践的な内容にしてください。

{
  "longTermGoals": "長期目標（6ヶ月〜1年で達成を目指す目標）",
  "shortTermGoals": "短期目標（3〜6ヶ月で達成を目指す具体的な目標）",
  "supportHealthLife": "①健康・生活領域の支援内容（手洗い・片付け・スケジュール管理など生活習慣への支援）",
  "supportMovementSensory": "②運動・感覚領域の支援内容（指先運動・全身運動・感覚統合への支援）",
  "supportCognitionBehavior": "③認知・行動領域の支援内容（物の理解・指示への対応・時間概念への支援）",
  "supportLanguageCommunication": "④言語・コミュニケーション領域の支援内容（言葉・非言語コミュニケーション・対話への支援）",
  "supportSocialRelationships": "⑤人間関係・社会性領域の支援内容（友だちとの関わり・社会ルール・集団参加への支援）",
  "supportTransition": "⑥移行支援の内容（就学・進級・施設移行に向けた準備・関係機関連携・不安軽減への支援）",
  "supportFamily": "⑦家族支援の内容（保護者への情報提供・育児相談・家庭での対応方法の共有への支援）"
}

JSONのみを出力し、説明文は不要です。`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
  }

  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }
}
