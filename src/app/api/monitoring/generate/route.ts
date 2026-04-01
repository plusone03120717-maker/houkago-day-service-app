import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { supportPlanId, childId } = await request.json() as { supportPlanId: string; childId: string }
  if (!supportPlanId || !childId) {
    return NextResponse.json({ error: 'supportPlanId and childId are required' }, { status: 400 })
  }

  // 支援計画を取得
  const { data: plan } = await supabase
    .from('support_plans')
    .select('plan_date, long_term_goals, short_term_goals, support_content')
    .eq('id', supportPlanId)
    .single()
  if (!plan) return NextResponse.json({ error: 'Support plan not found' }, { status: 404 })

  // このプランの直近モニタリング記録の日付を取得（期間の開始日に使用）
  const { data: lastRecord } = await supabase
    .from('monitoring_records')
    .select('record_date')
    .eq('support_plan_id', supportPlanId)
    .order('record_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const startDate = lastRecord?.record_date ?? (plan.plan_date as string)
  const endDate = new Date().toISOString().slice(0, 10)

  // 対象期間の日々の記録を取得
  const { data: attendancesRaw } = await supabase
    .from('daily_attendance')
    .select('id, date')
    .eq('child_id', childId)
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('status', 'attended')
    .order('date')

  const attendances = (attendancesRaw ?? []) as { id: string; date: string }[]
  const attendanceIds = attendances.map((a) => a.id)

  const { data: dailyRecordsRaw } = attendanceIds.length > 0
    ? await supabase
        .from('daily_records')
        .select('content, record_type, daily_attendance!inner(date)')
        .in('attendance_id', attendanceIds)
        .order('created_at')
    : { data: [] }

  type DailyRecordRow = {
    content: string
    record_type: string
    daily_attendance: { date: string }
  }
  const dailyRecords = (dailyRecordsRaw ?? []) as unknown as DailyRecordRow[]

  // 日々の記録をテキストに整形（日付ごとにまとめる）
  const recordsByDate: Record<string, string[]> = {}
  for (const rec of dailyRecords) {
    const date = rec.daily_attendance?.date ?? ''
    if (!recordsByDate[date]) recordsByDate[date] = []
    const prefix = rec.record_type === 'notable' ? '【特記】' : ''
    if (rec.content?.trim()) {
      recordsByDate[date].push(`${prefix}${rec.content.trim()}`)
    }
  }

  const dailyRecordsText = Object.entries(recordsByDate)
    .map(([date, contents]) => `${date}：${contents.join(' / ')}`)
    .join('\n')

  if (!dailyRecordsText) {
    return NextResponse.json({ error: '対象期間に日々の記録がありません' }, { status: 400 })
  }

  const prompt = `あなたは放課後等デイサービスの専門スタッフです。
以下の個別支援計画の目標と、対象期間の日々の記録を照らし合わせて、モニタリング記録を作成してください。

【個別支援計画】
長期目標: ${plan.long_term_goals ?? '未設定'}
短期目標: ${plan.short_term_goals ?? '未設定'}
支援内容・方法: ${plan.support_content ?? '未設定'}

【対象期間の日々の記録（${startDate} 〜 ${endDate}）】
${dailyRecordsText}

以下のJSON形式のみで出力してください（説明文は不要）：
{
  "long_term_progress": "長期目標に対する達成状況を具体的に記述（80〜150字）",
  "short_term_progress": "短期目標に対する達成状況を具体的に記述（80〜150字）",
  "issues": "日々の記録から読み取れる課題・気になる点（80〜150字）",
  "next_actions": "今後の支援の方向性・見直し点（80〜150字）",
  "overall_status": "ongoing か achieved か revised か needs_review のいずれか1つ"
}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    // JSON部分を抽出してパース
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AIの応答を解析できませんでした' }, { status: 500 })
    }
    const result = JSON.parse(jsonMatch[0]) as {
      long_term_progress: string
      short_term_progress: string
      issues: string
      next_actions: string
      overall_status: string
    }

    const validStatuses = ['ongoing', 'achieved', 'revised', 'needs_review']
    if (!validStatuses.includes(result.overall_status)) {
      result.overall_status = 'ongoing'
    }

    return NextResponse.json({
      ...result,
      period: { startDate, endDate },
    })
  } catch (error) {
    console.error('Monitoring generate error:', error)
    return NextResponse.json({ error: 'AI処理に失敗しました' }, { status: 500 })
  }
}
