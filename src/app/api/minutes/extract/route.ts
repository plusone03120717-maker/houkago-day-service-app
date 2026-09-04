import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { SUPPORT_MODEL } from '@/lib/support/bot'
import { CATEGORIES, CATEGORY_META } from '@/lib/internal-manual/categories'

export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * 議事録から「社内マニュアルに載せるべき決めごと」を拾うためのツール。
 *
 * 会議で出た話のほとんどは、その場限りの報告や個別の児童の話であって
 * マニュアルには載らない。載せるべきものだけを選ばせるのが眼目なので、
 * 候補が無ければ空の配列を返してよいことを明示している。
 */
const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_rules',
  description:
    '議事録から、社内マニュアルに載せるべき決めごとを抜き出す。' +
    '該当するものが無ければ items を空の配列にする。',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'マニュアルに載せるべき項目。無ければ空配列',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: [...CATEGORIES],
              description: `corporate=${CATEGORY_META.corporate.description} / afterschool=${CATEGORY_META.afterschool.description} / development=${CATEGORY_META.development.description} / other=それ以外`,
            },
            content: {
              type: 'string',
              description:
                'マニュアルに載せる文。議事録を読んでいない人が読んでも意味が通るように、' +
                '会議の文脈に依存しない書き方にする。1〜3文程度。',
            },
            source: {
              type: 'string',
              description:
                '根拠にした議事録の行を、そのままの文言で引き写す。' +
                '会議名や日付ではなく、議事録本文の該当する一行を入れること。',
            },
          },
          required: ['category', 'content', 'source'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
}

type ExtractedItem = {
  category: string
  content: string
  source: string
}

function normalize(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\\r\\n|\\n/g, '\n').trim()
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  if (user.role !== 'admin') {
    return NextResponse.json({ error: '管理者のみ実行できます' }, { status: 403 })
  }

  const { minutesId } = (await request.json()) as { minutesId?: string }
  if (!minutesId) return NextResponse.json({ error: 'minutesId が必要です' }, { status: 400 })

  const supabase = await createClient()
  const { data } = await supabase
    .from('meeting_minutes')
    .select('id, title, meeting_date, raw_body, formatted_body')
    .eq('id', minutesId)
    .single()

  if (!data) {
    return NextResponse.json({ error: '議事録が見つかりません' }, { status: 404 })
  }

  const minutes = data as {
    title: string
    meeting_date: string
    raw_body: string
    formatted_body: string | null
  }

  const body = (minutes.formatted_body ?? minutes.raw_body).trim()
  if (!body) return NextResponse.json({ error: '議事録が空です' }, { status: 400 })

  // すでにマニュアルに書かれていることを重ねて提案されても手間が増えるだけなので、
  // いま公開されている記事の見出しと本文を渡して避けさせる
  const { data: articlesRaw } = await supabase
    .from('internal_manual_articles')
    .select('category, title, body')
    .eq('status', 'published')
    .order('category')

  const articles = (articlesRaw ?? []) as { category: string; title: string; body: string }[]
  const existing = articles.length
    ? articles
        .map((a) => `[${CATEGORY_META[a.category as keyof typeof CATEGORY_META]?.label ?? a.category}] ${a.title}\n${a.body}`)
        .join('\n\n')
    : '（まだ記事はありません）'

  let items: ExtractedItem[]
  try {
    const response = await anthropic.messages.create({
      model: SUPPORT_MODEL,
      max_tokens: 4000,
      system: `あなたは放課後等デイサービスを運営する法人の社内マニュアル編集担当です。
会議の議事録を読み、そこから社内マニュアルに載せるべき決めごとだけを抜き出します。

【抜き出すもの】
・今後の運用として続くことになった決まりごと
・手順・持ち物・連絡先・判断の基準など、あとから誰かが調べたくなること
・これまでのやり方を変える、と決まったこと

【抜き出さないもの】
・特定の児童・保護者・職員個人についての話
・その日限りの報告、日程調整、進捗の共有
・すでに社内マニュアルに書かれていること
・決まっていないこと。とくに議事録の「■ 検討事項」に入っている項目は、
  この日は決まらなかったという意味なので、絶対に抜き出さないでください。
  「〜という話が出た」「〜する案」「保留」「仮」と書かれているものも同じです。
  決まっていないことをマニュアルに載せると、現場がそれに従って動いてしまいます。

【守ること】
1. 議事録に書かれていないことを足してはいけません。
   一般論や世間の常識で補うと、法人が決めていないルールが
   マニュアルとして流通してしまいます。
2. content は、議事録を読んでいない職員が読んでも意味が通る文にします。
   「先ほどの件」「今回の子」のような、その場に依存する言い方は使いません。
3. 個人名・児童名は含めません。役割（管理者・送迎担当など）に置き換えます。
4. 以前から続いている運用でも、社内マニュアルにまだ書かれていなければ
   抜き出してください（例「請求の締めは毎月5日まで」）。
   新しく決まったことだけが対象ではありません。
5. 決まっているかどうか迷ったら、抜き出さないでください。
   載せる価値が薄いものを並べるより、確実なものだけを挙げるほうが役に立ちます。
6. 該当するものが1つも無ければ、items を空の配列にしてください。`,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'extract_rules' },
      messages: [
        {
          role: 'user',
          content:
            `【すでに社内マニュアルに書かれていること】\n${existing}\n\n` +
            `【議事録】\n会議名: ${minutes.title}\n開催日: ${minutes.meeting_date}\n\n${body}`,
        },
      ],
    })

    const toolUse = response.content.find((block) => block.type === 'tool_use')
    if (!toolUse) throw new Error('ツール呼び出しが返りませんでした')
    items = (toolUse.input as { items: ExtractedItem[] }).items ?? []
  } catch (error) {
    console.error('minutes extract: 抽出に失敗', error)
    return NextResponse.json(
      { error: '抽出できませんでした。時間をおいて試してください。' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    items: items
      .filter((i) => (CATEGORIES as readonly string[]).includes(i.category))
      .map((i) => ({
        category: i.category,
        content: normalize(i.content),
        source: normalize(i.source),
      }))
      .filter((i) => i.content),
  })
}
