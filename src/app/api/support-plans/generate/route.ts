import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

// Vercel Pro: up to 60s / Hobby: up to 10s (this hint is respected on Pro)
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { childId, childName, diagnosis, existing } = await request.json()
  if (!childId) return NextResponse.json({ error: 'childId is required' }, { status: 400 })

  try {
    // 独立したクエリを並列実行
    const [
      { data: assessment },
      { data: attendancesRaw },
      { data: contactNotesRaw },
    ] = await Promise.all([
      supabase
        .from('child_assessments')
        .select('child_situation, current_issues, family_situation, child_wishes, parent_wishes, usage_goals')
        .eq('child_id', childId)
        .order('assessment_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('daily_attendance')
        .select('id, date')
        .eq('child_id', childId)
        .eq('status', 'attended')
        .order('date', { ascending: false })
        .limit(20),
      supabase
        .from('contact_notes')
        .select('date, content, parent_comment')
        .eq('child_id', childId)
        .neq('content', '')
        .order('date', { ascending: false })
        .limit(10),
    ])

    const attendances = (attendancesRaw ?? []) as { id: string; date: string }[]
    const attendanceIds = attendances.map((a) => a.id)
    const dateMap: Record<string, string> = {}
    for (const a of attendances) dateMap[a.id] = a.date

    // attendance依存のクエリを並列実行
    const [{ data: dailyRecordsRaw }, { data: dailyActivitiesRaw }] =
      attendanceIds.length > 0
        ? await Promise.all([
            supabase
              .from('daily_records')
              .select('content, record_type, attendance_id')
              .in('attendance_id', attendanceIds),
            supabase
              .from('daily_activities')
              .select('evaluation_notes, achievement_level, attendance_id, activity_programs(name)')
              .in('attendance_id', attendanceIds)
              .eq('participated', true)
              .not('program_id', 'is', null),
          ])
        : [{ data: [] }, { data: [] }]

    type DailyRecordRow = { content: string; record_type: string; attendance_id: string }
    type DailyActivityRow = {
      evaluation_notes: string | null
      achievement_level: number | null
      attendance_id: string
      activity_programs: { name: string } | null
    }
    type ContactNoteRow = { date: string; content: string; parent_comment: string | null }

    const dailyRecords = (dailyRecordsRaw ?? []) as DailyRecordRow[]
    const dailyActivities = (dailyActivitiesRaw ?? []) as unknown as DailyActivityRow[]
    const contactNotes = (contactNotesRaw ?? []) as ContactNoteRow[]

    // 日付ごとに記録をまとめる
    const recordsByDate: Record<string, string[]> = {}
    for (const rec of dailyRecords) {
      const date = dateMap[rec.attendance_id]
      if (!date) continue
      if (!recordsByDate[date]) recordsByDate[date] = []
      const prefix = rec.record_type === 'notable' ? '【特記】' : ''
      if (rec.content?.trim()) recordsByDate[date].push(`${prefix}${rec.content.trim()}`)
    }
    for (const act of dailyActivities) {
      const date = dateMap[act.attendance_id]
      if (!date) continue
      if (!recordsByDate[date]) recordsByDate[date] = []
      const name = act.activity_programs?.name
      if (name) {
        const note = act.evaluation_notes?.trim()
        const level = act.achievement_level != null ? `達成度${act.achievement_level}/5` : ''
        const detail = [note, level].filter(Boolean).join('・')
        recordsByDate[date].push(detail ? `【活動】${name}（${detail}）` : `【活動】${name}`)
      }
    }

    const dailyRecordsText = Object.entries(recordsByDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 15)
      .map(([date, contents]) => `${date}：${contents.join(' / ')}`)
      .join('\n') || '記録なし'

    const contactNotesText = contactNotes
      .map((n) => {
        const parts = [`${n.date}（連絡帳）：${n.content.trim()}`]
        if (n.parent_comment?.trim()) parts.push(`→保護者コメント：${n.parent_comment.trim()}`)
        return parts.join('\n')
      })
      .join('\n') || 'なし'

    const prompt = `あなたは放課後等デイサービスの専門家です。以下の情報をもとに、個別支援計画の下書きを作成してください。

【対象児童】${childName}
【診断・障害特性】${diagnosis ?? '記載なし'}
${existing?.longTermGoals ? `【現在の長期目標】${existing.longTermGoals}` : ''}
${existing?.shortTermGoals ? `【現在の短期目標】${existing.shortTermGoals}` : ''}

${assessment ? `【アセスメント情報】
・本人の様子・強み：${assessment.child_situation ?? '未記載'}
・現在の課題・困り事：${assessment.current_issues ?? '未記載'}
・本人の希望：${assessment.child_wishes ?? '未記載'}
・保護者の希望：${assessment.parent_wishes ?? '未記載'}
・放デイ利用の目標：${assessment.usage_goals ?? '未記載'}
・家族の状況：${assessment.family_situation ?? '未記載'}
` : '【アセスメント情報】未記録\n'}
【直近の日々の記録・活動記録】
${dailyRecordsText}

【連絡帳の記録】
${contactNotesText}

上記の情報を最大限に活用し、以下の12項目をJSON形式で出力してください。
アセスメントの「保護者の希望」はfamilyWishesに、「利用目標」はsupportPolicyに反映してください。
日々の記録・活動記録から読み取れる現状を各支援領域の内容に具体的に反映してください。
各項目は80〜200文字程度で具体的かつ実践的な内容にしてください。

{
  "familyWishes": "家族の意向（保護者の希望・期待・心配していること）",
  "supportPolicy": "支援の方針（事業所としての基本的な支援アプローチ）",
  "longTermGoals": "長期目標（6ヶ月〜1年で達成を目指す目標）",
  "shortTermGoals": "短期目標（3〜6ヶ月で達成を目指す具体的な目標）",
  "supportHealthLife": "①健康・生活領域の支援内容",
  "supportMovementSensory": "②運動・感覚領域の支援内容",
  "supportCognitionBehavior": "③認知・行動領域の支援内容",
  "supportLanguageCommunication": "④言語・コミュニケーション領域の支援内容",
  "supportSocialRelationships": "⑤人間関係・社会性領域の支援内容",
  "supportTransition": "⑥移行支援の内容",
  "supportFamily": "⑦家族支援の内容",
  "supportSpecialized": "専門的支援（PT・OT・ST・心理士等の専門職による支援内容）"
}

JSONのみを出力し、説明文は不要です。`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') {
      return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI response could not be parsed' }, { status: 500 })
    }
    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)

  } catch (error) {
    console.error('Support plan generate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI処理に失敗しました' },
      { status: 500 }
    )
  }
}
