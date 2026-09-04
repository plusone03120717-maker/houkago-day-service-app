import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSessionUser } from '@/lib/auth'
import { loadManualText } from '@/lib/support/manual'
import {
  SUPPORT_MODEL,
  MAX_HISTORY_MESSAGES,
  buildSystemBlocks,
  createAdminClient,
  stripMarkdown,
} from '@/lib/support/bot'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** 1通の上限。貼り付け事故で巨大なテキストが飛んでくるのを防ぐ */
const MAX_MESSAGE_LENGTH = 2000
/** 1つの問い合わせで続けられる往復の上限 */
const MAX_TOTAL_MESSAGES = 60

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

  let reply: string
  try {
    const response = await anthropic.messages.create({
      model: SUPPORT_MODEL,
      max_tokens: 1024,
      system: buildSystemBlocks({
        manual,
        userName: user.name ?? '職員',
        role: user.role ?? 'staff',
        pagePath: pagePath ?? null,
      }),
      messages,
    })

    reply = stripMarkdown(
      response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
    )
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
    { inquiry_id: currentId, role: 'assistant', content: reply },
  ])

  await admin
    .from('support_inquiries')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', currentId)

  return NextResponse.json({ inquiryId: currentId, reply })
}
