import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { SUPPORT_MODEL, stripMarkdown } from '@/lib/support/bot'

export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * 会議中の走り書きを、読み返せる議事録に整える。
 *
 * 整形結果は保存せずに返すだけ。画面で内容を確かめてから
 * 保存してもらう（勝手に上書きされると、走り書きの方が正しかった
 * ときに取り返しがつかない）。
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  if (user.role === 'parent') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const { minutesId } = (await request.json()) as { minutesId?: string }
  if (!minutesId) return NextResponse.json({ error: 'minutesId が必要です' }, { status: 400 })

  const supabase = await createClient()
  const { data } = await supabase
    .from('meeting_minutes')
    .select('id, title, meeting_date, attendees, raw_body')
    .eq('id', minutesId)
    .single()

  if (!data) {
    return NextResponse.json({ error: '議事録が見つかりません' }, { status: 404 })
  }

  const minutes = data as {
    title: string
    meeting_date: string
    attendees: string | null
    raw_body: string
  }

  if (!minutes.raw_body.trim()) {
    return NextResponse.json({ error: 'メモが空です' }, { status: 400 })
  }

  try {
    const response = await anthropic.messages.create({
      model: SUPPORT_MODEL,
      max_tokens: 4000,
      system: `あなたは放課後等デイサービスを運営する法人の議事録係です。
会議中に取られた走り書きを、あとから読み返せる議事録に整えます。

【守ること】
1. メモに書かれていないことを足してはいけません。
   議題として自然に思いつくことでも、メモに無ければ書きません。
2. 誰が言ったか分かる発言は、発言者を残してください。
   分からないものに発言者を推測して付けてはいけません。
3. 言い切られていないことを「決定事項」に入れてはいけません。
   これが最も起こしやすい間違いです。決まっていないことが決定事項として
   残ると、現場がそれに従って動いてしまいます。
   走り書きに「〜という話が出た」「〜でいこうという話」「決定ではない」
   「保留」「仮」「来月改めて」などの但し書きがあるものは、
   必ず ■ 検討事項 に入れ、その但し書きも本文に残してください。
   例）走り書き「5分で切り上げる方針でいこうという話が出た。決定ではない。」
     → ■ 検討事項
       ・5分で切り上げる方針とする案が出た（この日は決定に至らず）
4. 走り書きの意味が取れない箇所は、無理に解釈せず
   そのままの表現を残し、行末に（要確認）と付けてください。
5. マークダウン記法（#、**、- など）は使いません。
   見出しは「■ 〜」、箇条書きは「・」で書きます。

【構成】
次の見出しを、該当する内容があるものだけ使ってください。
中身が無い見出しは出さないこと。

■ 決定事項
　その場で決まったこと。今後こうする、と言い切られたもの
■ 検討事項
　話し合ったが決まらなかったこと
■ 共有・報告
　決めごとではない情報共有
■ 次回までにやること
　担当者が分かる場合は「（担当：○○）」を付ける
■ その他`,
      messages: [
        {
          role: 'user',
          content:
            `会議名: ${minutes.title}\n` +
            `開催日: ${minutes.meeting_date}\n` +
            `出席者: ${minutes.attendees ?? '記載なし'}\n\n` +
            `【走り書き】\n${minutes.raw_body}`,
        },
      ],
    })

    const formatted = stripMarkdown(
      response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
    )

    if (!formatted) {
      return NextResponse.json({ error: '整形結果が空でした' }, { status: 500 })
    }

    return NextResponse.json({ formatted })
  } catch (error) {
    console.error('minutes format: 整形に失敗', error)
    return NextResponse.json(
      { error: '整形できませんでした。時間をおいて試してください。' },
      { status: 500 }
    )
  }
}
