import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSessionUser } from '@/lib/auth'
import { SUPPORT_MODEL, createAdminClient } from '@/lib/support/bot'
import { toolLabel, type InquiryCategory, type InquirySeverity } from '@/lib/support/labels'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * 会話をチケット項目に起こすためのツール定義。
 *
 * 「JSONで返して」と文章で頼むと前置きが混ざったり項目が欠けたりするので、
 * ツール呼び出しを強制（tool_choice）し、strict でスキーマ検証まで保証する。
 */
const TICKET_TOOL: Anthropic.Tool = {
  name: 'create_ticket',
  description:
    '職員とサポートボットの会話から、管理者が対応するための問い合わせチケットを作成する。',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: '一覧に並べたときに中身が分かる件名。15〜30字程度。体言止め。',
      },
      category: {
        type: 'string',
        enum: ['bug', 'input_mistake', 'how_to', 'internal_rule', 'request', 'other'],
        description:
          'bug=アプリの動作がおかしい / input_mistake=入力ミスやデータの修正依頼 / ' +
          'how_to=アプリの使い方が分からない / internal_rule=社内の運用ルールや支援方針についての質問 / ' +
          'request=機能の追加・変更の要望 / other=それ以外',
      },
      severity: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description:
          'high=請求や記録が誤ったまま確定してしまう恐れがある、業務が止まっている / ' +
          'medium=業務は回るが困っている / low=急がない',
      },
      summary: {
        type: 'string',
        description: '管理者が最初に読む要約。100〜200字。会話に出てきた事実だけを書く。',
      },
      steps: {
        type: 'string',
        description:
          '再現手順。分かっている範囲で「1. ○○画面を開く」の形で番号を振る。' +
          '会話から分からなければ「会話からは特定できず」と書く。',
      },
      expected: {
        type: 'string',
        description: '職員が本来こうなるはずだと思っていた結果。不明なら「不明」。',
      },
      actual: {
        type: 'string',
        description: '実際に起きたこと。不明なら「不明」。',
      },
    },
    required: ['title', 'category', 'severity', 'summary', 'steps', 'expected', 'actual'],
    additionalProperties: false,
  },
}

/**
 * ツール呼び出しの文字列を画面表示用に整える。
 *
 * モデルは手順の改行を「\n」という2文字のまま入れてくることがあり、
 * そのまま保存すると画面に「1. …\n2. …」と出てしまう。実際の改行に直す。
 */
function normalize(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\\r\\n|\\n/g, '\n').trim()
}

type TicketInput = {
  title: string
  category: InquiryCategory
  severity: InquirySeverity
  summary: string
  steps: string
  expected: string
  actual: string
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  if (user.role === 'parent') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const { inquiryId } = (await request.json()) as { inquiryId?: string }
  if (!inquiryId) {
    return NextResponse.json({ error: 'inquiryId が必要です' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: inquiry } = await admin
    .from('support_inquiries')
    .select('id, created_by, status, page_path')
    .eq('id', inquiryId)
    .single()

  if (!inquiry) {
    return NextResponse.json({ error: '問い合わせが見つかりません' }, { status: 404 })
  }
  if (inquiry.created_by !== user.id) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }
  if (inquiry.status !== 'bot_only') {
    // 二重報告を防ぐ。すでに管理者の対応待ち行列に載っている
    return NextResponse.json({ alreadyEscalated: true })
  }

  const { data: messagesRaw } = await admin
    .from('support_inquiry_messages')
    .select('role, content, tool_calls')
    .eq('inquiry_id', inquiryId)
    .order('created_at', { ascending: true })

  const conversation = (messagesRaw ?? []) as {
    role: string
    content: string
    tool_calls: { name: string; input: Record<string, unknown> }[] | null
  }[]
  if (conversation.length === 0) {
    return NextResponse.json({ error: 'まだ会話がありません' }, { status: 400 })
  }

  const transcript = conversation
    .map((m) => {
      const speaker = m.role === 'user' ? '職員' : 'ボット'
      // 実データを見て答えた発言は、何を見たかも一緒に渡す。
      // 「確認済みの事実」と「聞いただけの話」を要約で混ぜないため。
      const checked = m.tool_calls?.length
        ? `\n（このときボットが確認した実データ: ${m.tool_calls
            .map((c) => `${toolLabel(c.name)} ${JSON.stringify(c.input)}`)
            .join(' / ')}）`
        : ''
      return `${speaker}: ${m.content}${checked}`
    })
    .join('\n\n')

  let ticket: TicketInput
  try {
    const response = await anthropic.messages.create({
      model: SUPPORT_MODEL,
      max_tokens: 1024,
      system:
        '放課後等デイサービス管理アプリの社内サポート窓口です。' +
        '職員とサポートボットの会話を読み、管理者が対応するためのチケットに起こしてください。' +
        '会話に書かれていないことを補ってはいけません。分からない項目は「不明」と書いてください。',
      tools: [TICKET_TOOL],
      tool_choice: { type: 'tool', name: 'create_ticket' },
      messages: [
        {
          role: 'user',
          content:
            `職員が問い合わせを始めた画面: ${inquiry.page_path ?? '不明'}\n\n` +
            `【会話】\n${transcript}`,
        },
      ],
    })

    const toolUse = response.content.find((block) => block.type === 'tool_use')
    if (!toolUse) throw new Error('ツール呼び出しが返りませんでした')
    ticket = toolUse.input as TicketInput
  } catch (error) {
    console.error('support escalate: チケット化に失敗', error)
    return NextResponse.json(
      { error: '報告内容をまとめられませんでした。時間をおいて試してください。' },
      { status: 500 }
    )
  }

  const now = new Date().toISOString()
  const { error: updateError } = await admin
    .from('support_inquiries')
    .update({
      title: normalize(ticket.title),
      category: ticket.category,
      severity: ticket.severity,
      summary: normalize(ticket.summary),
      steps: normalize(ticket.steps),
      expected: normalize(ticket.expected),
      actual: normalize(ticket.actual),
      status: 'open',
      is_new: true,
      escalated_at: now,
      updated_at: now,
    })
    .eq('id', inquiryId)

  if (updateError) {
    console.error('support escalate: 保存に失敗', updateError)
    return NextResponse.json({ error: '報告を保存できませんでした' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, title: ticket.title })
}
