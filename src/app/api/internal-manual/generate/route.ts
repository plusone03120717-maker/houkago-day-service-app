import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { SUPPORT_MODEL } from '@/lib/support/bot'
import { CATEGORY_META, isCategory } from '@/lib/internal-manual/categories'

// 記事が数本まとまって生成されるので、既定の30秒では足りないことがある
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * 溜まったメモを記事に起こすためのツール定義。
 *
 * strict を効かせるため、すべての項目を required にしている。
 * mode='new' のときに article_id を省略できないので、その場合は空文字を入れさせる。
 */
const DRAFT_TOOL: Anthropic.Tool = {
  name: 'draft_manual',
  description:
    '職員が書き溜めたメモを、社内マニュアルの記事に起こす。' +
    '既存の記事に足すべき内容は update、どの記事にも属さない内容は new にする。',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      articles: {
        type: 'array',
        description: '作成または更新する記事。関連するメモは1つの記事にまとめること。',
        items: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['new', 'update'],
              description: 'new=新しい記事を作る / update=既存の記事を書き直す',
            },
            article_id: {
              type: 'string',
              description: 'mode=update のとき対象の記事ID。mode=new のときは空文字にする',
            },
            title: {
              type: 'string',
              description: '記事の見出し。10〜25字程度。何について書かれているかが分かること',
            },
            body: {
              type: 'string',
              description:
                '記事の本文。読み物として通して読める文章にする。' +
                'update のときは、渡された現在の本文にメモの内容を織り込んだ全文を返す（差分ではない）',
            },
            note_indexes: {
              type: 'array',
              items: { type: 'integer' },
              description: 'この記事に取り込んだメモの番号',
            },
          },
          required: ['mode', 'article_id', 'title', 'body', 'note_indexes'],
          additionalProperties: false,
        },
      },
    },
    required: ['articles'],
    additionalProperties: false,
  },
}

type DraftedArticle = {
  mode: 'new' | 'update'
  article_id: string
  title: string
  body: string
  note_indexes: number[]
}

/** モデルが改行を「\n」という2文字のまま入れてくることがあるので実際の改行に直す */
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

  const { category, noteIds } = (await request.json()) as {
    category?: string
    noteIds?: string[]
  }
  if (!category || !isCategory(category)) {
    return NextResponse.json({ error: '分類が不正です' }, { status: 400 })
  }

  const supabase = await createClient()

  let noteQuery = supabase
    .from('internal_notes')
    .select('id, content, created_by_name, created_at')
    .eq('category', category)
    .eq('status', 'open')
    .order('created_at')
  if (noteIds?.length) noteQuery = noteQuery.in('id', noteIds)

  const [{ data: notesRaw }, { data: articlesRaw }] = await Promise.all([
    noteQuery,
    supabase
      .from('internal_manual_articles')
      .select('id, title, body, status')
      .eq('category', category)
      .order('sort_order')
      .order('created_at'),
  ])

  const notes = (notesRaw ?? []) as {
    id: string
    content: string
    created_by_name: string | null
    created_at: string
  }[]
  if (notes.length === 0) {
    return NextResponse.json({ error: 'まだ反映していないメモがありません' }, { status: 400 })
  }

  const articles = (articlesRaw ?? []) as {
    id: string
    title: string
    body: string
    status: string
  }[]

  const meta = CATEGORY_META[category]

  const existingText = articles.length
    ? articles
        .map(
          (a) =>
            `--- 記事ID: ${a.id}\n見出し: ${a.title}\n状態: ${a.status === 'published' ? '公開中' : '未公開'}\n本文:\n${a.body || '（まだ本文がありません）'}`
        )
        .join('\n\n')
    : '（まだ記事はありません）'

  const notesText = notes
    .map(
      (n, i) =>
        `[${i}] ${n.created_by_name ?? '職員'}（${n.created_at.slice(0, 10)}）\n${n.content}`
    )
    .join('\n\n')

  let drafted: DraftedArticle[]
  try {
    const response = await anthropic.messages.create({
      model: SUPPORT_MODEL,
      max_tokens: 8000,
      system: `あなたは放課後等デイサービスを運営する法人の、社内マニュアル編集担当です。
職員が書き溜めた断片的なメモを、新人がそれだけ読んで動けるマニュアルに整えます。

【今回の分類】
${meta.label}（${meta.description}）

【守ること】
1. メモに書かれていないことを足してはいけません。
   一般論・世間の常識・法令の一般的な説明を勝手に補うと、
   その法人では決めていないルールがマニュアルとして流通してしまいます。
   メモの内容が薄ければ、薄いまま短い記事にしてください。
2. メモの言い回しが曖昧なときは、無理に断定せず、
   メモの表現に沿った書き方にとどめてください。
3. 同じ話題のメモは1つの記事にまとめてください。話題が違うものは分けます。
4. 既存の記事に足すべき内容は mode=update にし、その記事の全文を
   書き直して返してください（差分ではなく、完成した本文全体）。
   既存記事にすでに書かれている内容を削らないよう注意してください。
5. どの既存記事にも属さない内容は mode=new で新しい記事にします。
6. 本文はマークダウン記法（#、**、- など）を使わず、
   見出しは「■ 〜」、箇条書きは「・」で書いてください。
   画面ではそのままの文字として表示されます。
7. 日付・人名など、メモを書いた人にしか分からない私的な情報は本文に含めません。
   マニュアルとして誰が読んでも意味が通る形にします。`,
      tools: [DRAFT_TOOL],
      tool_choice: { type: 'tool', name: 'draft_manual' },
      messages: [
        {
          role: 'user',
          content: `【この分類の既存の記事】\n${existingText}\n\n【今回反映するメモ】\n${notesText}`,
        },
      ],
    })

    const toolUse = response.content.find((block) => block.type === 'tool_use')
    if (!toolUse) throw new Error('ツール呼び出しが返りませんでした')
    drafted = (toolUse.input as { articles: DraftedArticle[] }).articles ?? []
  } catch (error) {
    console.error('internal-manual generate: 下書き作成に失敗', error)
    return NextResponse.json(
      { error: '下書きを作成できませんでした。時間をおいて試してください。' },
      { status: 500 }
    )
  }

  if (drafted.length === 0) {
    return NextResponse.json({ error: '下書きを作成できませんでした' }, { status: 500 })
  }

  const now = new Date().toISOString()
  const validIds = new Set(articles.map((a) => a.id))
  let created = 0
  let updated = 0

  for (const item of drafted) {
    const title = normalize(item.title)
    const body = normalize(item.body)
    if (!title || !body) continue

    let articleId: string | null = null

    if (item.mode === 'update' && validIds.has(item.article_id)) {
      // 公開中の本文はそのままにして、下書き側だけを差し替える。
      // 管理者が中身を確認して「公開」を押すまで、職員とボットには
      // これまでの内容が見え続ける。
      const { error } = await supabase
        .from('internal_manual_articles')
        .update({ draft_body: body, updated_by: user.id, updated_at: now })
        .eq('id', item.article_id)
      if (!error) {
        articleId = item.article_id
        updated++
      }
    } else {
      const { data, error } = await supabase
        .from('internal_manual_articles')
        .insert({
          category,
          title,
          body: '',
          draft_body: body,
          status: 'draft',
          created_by: user.id,
          updated_by: user.id,
        })
        .select('id')
        .single()
      if (!error && data) {
        articleId = (data as { id: string }).id
        created++
      }
    }

    // どのメモがどの記事に入ったかを紐づけておく。
    // 公開したときに、そのメモを「反映済み」に落とすために使う。
    if (articleId) {
      const ids = (item.note_indexes ?? [])
        .map((i) => notes[i]?.id)
        .filter((v): v is string => Boolean(v))
      if (ids.length > 0) {
        await supabase
          .from('internal_notes')
          .update({ article_id: articleId, updated_at: now })
          .in('id', ids)
      }
    }
  }

  return NextResponse.json({ ok: true, created, updated })
}
