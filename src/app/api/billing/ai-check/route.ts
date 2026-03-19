import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

type BillingDetail = {
  id: string
  child_id: string
  total_days: number
  total_units: number
  service_code: string | null
  unit_price: number
  copay_amount: number
  billed_amount: number
  errors: string[]
  children: { name: string; name_kana: string | null } | null
}

type BillingMonthly = {
  id: string
  year_month: string
  status: string
  units: { name: string; service_type: string } | null
  billing_details: BillingDetail[]
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { billingMonthlyId } = await request.json() as { billingMonthlyId: string }
  if (!billingMonthlyId) {
    return NextResponse.json({ error: 'billingMonthlyId is required' }, { status: 400 })
  }

  const { data: billingRaw } = await supabase
    .from('billing_monthly')
    .select(`
      id, year_month, status,
      units (name, service_type),
      billing_details (id, child_id, total_days, total_units, service_code, unit_price, copay_amount, billed_amount, errors, children (name, name_kana))
    `)
    .eq('id', billingMonthlyId)
    .single()

  if (!billingRaw) {
    return NextResponse.json({ error: '請求データが見つかりません' }, { status: 404 })
  }

  const billing = billingRaw as unknown as BillingMonthly
  const details = billing.billing_details ?? []

  const year = billing.year_month.slice(0, 4)
  const month = billing.year_month.slice(4, 6)

  // Claude に送るデータを整形
  const summaryLines = details.map((d) => {
    const name = d.children?.name ?? '不明'
    const errorList = Array.isArray(d.errors) && d.errors.length > 0
      ? `エラー: ${d.errors.join('; ')}`
      : 'エラーなし'
    return `- ${name}: 利用日数=${d.total_days}日, 単位数=${d.total_units}, 単価=${d.unit_price}円, 給付費=${d.billed_amount}円, 負担額=${d.copay_amount}円, ${errorList}`
  }).join('\n')

  const prompt = `あなたは放課後等デイサービスの国保連請求に精通した専門家です。
以下の${year}年${month}月の請求データを分析し、問題点と改善提案を日本語で報告してください。

【ユニット名】${billing.units?.name ?? '不明'}
【サービス種類】${billing.units?.service_type ?? '不明'}
【ステータス】${billing.status}
【対象児童数】${details.length}名

【児童別明細】
${summaryLines || '（データなし）'}

以下の観点で分析してください：
1. エラーが発生している児童とその原因・対処法
2. 単位数・金額が0円の明細（未設定の可能性）
3. 全体的な整合性チェック（給付費と負担額のバランス等）
4. 提出前に確認すべき重要ポイント
5. 総合評価と推奨アクション

簡潔かつ具体的に、箇条書きで回答してください。`

  const anthropic = new Anthropic()
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const result = message.content[0].type === 'text' ? message.content[0].text : ''

  return NextResponse.json({ result })
}
