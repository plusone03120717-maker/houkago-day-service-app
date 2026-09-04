import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { loadManualText } from '@/lib/support/manual'
import { SUPPORT_TOOLS, runSupportTool } from '@/lib/support/tools'
import { toolLabel } from '@/lib/support/labels'
import {
  SUPPORT_MODEL,
  SUPPORT_EFFORT,
  SUPPORT_MAX_TOKENS,
  MAX_HISTORY_MESSAGES,
  MAX_TOOL_ITERATIONS,
  buildSystemBlocks,
  createAdminClient,
  stripMarkdown,
} from '@/lib/support/bot'

// データ確認のためにモデルとの往復が数回発生するので、既定の30秒では足りない
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** 1通の上限。貼り付け事故で巨大なテキストが飛んでくるのを防ぐ */
const MAX_MESSAGE_LENGTH = 2000
/** 1つの問い合わせで続けられる往復の上限 */
const MAX_TOTAL_MESSAGES = 60
/**
 * データ確認に使ってよい時間。関数のタイムアウト（60秒）に当たって
 * 502 になるより、途中で切り上げて「分かったところまで」を返す方がよい。
 */
const TOOL_TIME_BUDGET_MS = 40_000

type ChatBody = {
  inquiryId?: string
  message?: string
  pagePath?: string
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  if (user.role === 'parent') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const { inquiryId, message, pagePath } = (await request.json()) as ChatBody
  const text = (message ?? '').trim()
  if (!text) {
    return NextResponse.json({ error: 'メッセージが空です' }, { status: 400 })
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `1回に送れるのは${MAX_MESSAGE_LENGTH}文字までです` },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // --- 問い合わせ（会話）を特定する ---------------------------------
  let currentId = inquiryId ?? null

  if (currentId) {
    // 他人の会話に発言を差し込めないよう、必ず本人確認する
    const { data: existing } = await admin
      .from('support_inquiries')
      .select('id, created_by, status')
      .eq('id', currentId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: '問い合わせが見つかりません' }, { status: 404 })
    }
    if (existing.created_by !== user.id) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }
  } else {
    const { data: created, error } = await admin
      .from('support_inquiries')
      .insert({
        created_by: user.id,
        created_by_name: user.name,
        page_path: pagePath ?? null,
      })
      .select('id')
      .single()

    if (error || !created) {
      console.error('support chat: 問い合わせの作成に失敗', error)
      return NextResponse.json({ error: '問い合わせを開始できませんでした' }, { status: 500 })
    }
    currentId = created.id
  }

  // --- これまでの会話を読む -----------------------------------------
  const { data: historyRaw } = await admin
    .from('support_inquiry_messages')
    .select('role, content')
    .eq('inquiry_id', currentId)
    .order('created_at', { ascending: true })

  const history = (historyRaw ?? []) as { role: 'user' | 'assistant'; content: string }[]

  if (history.length >= MAX_TOTAL_MESSAGES) {
    return NextResponse.json(
      {
        error:
          'この問い合わせは長くなりすぎました。いったん「管理者に報告」するか、新しく質問し直してください。',
      },
      { status: 400 }
    )
  }

  // --- Claude に投げる -----------------------------------------------
  const manual = await loadManualText()

  const messages: Anthropic.MessageParam[] = [
    // 履歴が伸びても入力が膨らみ続けないよう、直近だけを渡す
    ...history.slice(-MAX_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: text },
  ]

  const system = buildSystemBlocks({
    manual,
    userName: user.name ?? '職員',
    role: user.role ?? 'staff',
    pagePath: pagePath ?? null,
  })

  // データ参照は「ログイン中の職員のセッション」で行う。service_role を渡すと
  // RLS が外れ、その職員が画面で見られない情報までボットが読めてしまう。
  const supabaseAsUser = await createClient()

  const toolCalls: { name: string; input: unknown }[] = []
  const startedAt = Date.now()
  let reply: string

  try {
    reply = ''

    for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
      // 残り回数か時間が尽きたら、道具を取り上げて言葉での回答だけを求める
      const outOfBudget =
        iteration === MAX_TOOL_ITERATIONS || Date.now() - startedAt > TOOL_TIME_BUDGET_MS

      const response = await anthropic.messages.create({
        model: SUPPORT_MODEL,
        max_tokens: SUPPORT_MAX_TOKENS,
        ...(SUPPORT_EFFORT ? { output_config: { effort: SUPPORT_EFFORT } } : {}),
        system,
        tools: SUPPORT_TOOLS,
        tool_choice: outOfBudget ? { type: 'none' } : { type: 'auto' },
        messages,
      })

      const textOut = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')

      const toolUses = response.content.filter((block) => block.type === 'tool_use')
      if (toolUses.length === 0) {
        reply = stripMarkdown(textOut)
        break
      }

      messages.push({ role: 'assistant', content: response.content })

      // 同じ返答内の複数のツール呼び出しは、まとめて1つの user メッセージで返す
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const toolUse of toolUses) {
        toolCalls.push({ name: toolUse.name, input: toolUse.input })
        const output = await runSupportTool(
          toolUse.name,
          (toolUse.input ?? {}) as Record<string, unknown>,
          supabaseAsUser
        )
        results.push({ type: 'tool_result', tool_use_id: toolUse.id, content: output })
      }
      messages.push({ role: 'user', content: results })
    }
  } catch (error) {
    console.error('support chat: AI応答に失敗', error)
    return NextResponse.json(
      { error: '回答を作成できませんでした。時間をおいて試すか、管理者にご連絡ください。' },
      { status: 500 }
    )
  }

  if (!reply) {
    reply = 'うまく回答を作れませんでした。もう一度、別の言い方で質問していただけますか。'
  }

  // --- 会話を残す -----------------------------------------------------
  // 応答が返ってから2件まとめて入れる。AIが失敗したときに
  // 質問だけが宙に浮いた状態で残らないようにするため。
  await admin.from('support_inquiry_messages').insert([
    { inquiry_id: currentId, role: 'user', content: text },
    {
      inquiry_id: currentId,
      role: 'assistant',
      content: reply,
      // 回答の根拠として何を見たかを残す（監査と検算のため）
      tool_calls: toolCalls.length > 0 ? toolCalls : null,
    },
  ])

  await admin
    .from('support_inquiries')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', currentId)

  return NextResponse.json({
    inquiryId: currentId,
    reply,
    // 「何を見て答えたか」を会話画面にも出す
    checked: [...new Set(toolCalls.map((t) => toolLabel(t.name)))],
  })
}
