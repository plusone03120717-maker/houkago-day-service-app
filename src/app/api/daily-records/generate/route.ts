import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NO_INVENTED_FACTS } from '@/lib/ai/fact-rules'

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

  const prompt = `あなたは放課後等デイサービスの支援員です。以下のメモをもとに、日常記録の文章を作成してください。

${planSection}

${activitiesSection}

【メモ】
${bulletPoints}

【出力ルール】
・メモは箇条書きのこともあれば、すでに文章になっていることもあります。どちらの場合も、運営指導で読まれる支援記録として整え直してください
・すでに文章になっているメモも、ほぼそのまま返すことはしないでください。次の点を必ず見直してください
  - 出来事の順に並べ、「〜しました。〜しました。」と短く途切れた文は、つながりがわかる文にまとめる（「〜したところ」「〜ため」「また、」など）。長すぎる一文は区切る
  - 職員の関わり（声かけ・付き添いなど）と、それに対する本児の様子がわかる書き方にする
  - 話し言葉やくだけた言い方は、記録の言葉に置き換える（例：「理解するのが難しい様子でした」→「理解に難しさが見られました」）
  - 同じ言葉のくり返しや、なくても意味が変わらない言葉は省く
  - 文末が切れている・句点がないなどの崩れを直す
・分量はメモと同じくらい（2〜5文程度）にしてください
${NO_INVENTED_FACTS}
・メモにない理由・結果（「転倒など」「けがにつながる」など）や、「今後も〜が必要です」「〜していきます」などの今後の方針・課題・見立てを足さない
・支援計画の目標と今日の様子を照らし合わせ、メモに書かれた様子が目標とはっきり関係する場合だけ、文章の最後に1文で「（支援計画との照合：○○）」という形で補足してください
・関係があいまいなとき、迷うときは補足を付けないでください。補足がない日誌でかまいません
・支援計画が未設定または照合できない場合は補足なしで文章のみ出力してください
・専門的かつ自然な文体で、文末は「です・ます」でそろえてください
・文章のみ出力し、余計な説明は不要です`

  try {
    const message = await anthropic.messages.create({
      // Haiku ではきれいな文を入れるとほぼそのまま返り「AI が弱い」と言われたため Sonnet にする
      model: 'claude-sonnet-5-5',
      // 書く前に考えるので、考える深さを浅めにし、上限も広めにとる
      // （512 のままだと考えるだけで上限に達し、空の文章が返ることがあった）
      max_tokens: 2048,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    const content = textBlock?.type === 'text' ? textBlock.text.trim() : ''
    return NextResponse.json({ content })
  } catch (error) {
    console.error('AI generate error:', error)
    return NextResponse.json({ error: 'AI処理に失敗しました' }, { status: 500 })
  }
}
