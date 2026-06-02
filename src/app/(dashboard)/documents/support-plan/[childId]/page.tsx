import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PrintButton } from '@/components/documents/print-button'
import { formatDate } from '@/lib/utils'

type Child = {
  id: string
  name: string
  name_kana: string | null
  birth_date: string | null
  disability_type: string | null
  school_name: string | null
  grade: string | null
}

type SupportPlan = {
  id: string
  plan_date: string
  review_date: string | null
  status: string
  long_term_goals: string | null
  short_term_goals: string | null
  family_wishes: string | null
  child_wishes: string | null
  support_policy: string | null
  support_health_life: string | null
  support_movement_sensory: string | null
  support_cognition_behavior: string | null
  support_language_communication: string | null
  support_social_relationships: string | null
  support_transition: string | null
  support_family: string | null
  created_by: string | null
  users: { name: string } | null
}

const SUPPORT_AREAS = [
  { key: 'support_health_life',             label: '本人支援\n（健康・生活）',              kasan: '医療連携体制加算' },
  { key: 'support_movement_sensory',        label: '本人支援\n（運動・感覚）',              kasan: '専門的支援実施加算' },
  { key: 'support_cognition_behavior',      label: '本人支援\n（認知・行動）',              kasan: '' },
  { key: 'support_language_communication',  label: '本人支援\n（言語・コミュニケーション）', kasan: '' },
  { key: 'support_social_relationships',    label: '本人支援\n（人間関係・社会性）',        kasan: '' },
  { key: 'support_transition',              label: '本人支援\n（移行支援）',               kasan: '' },
  { key: 'support_family',                  label: '家族支援',                            kasan: '家族支援加算' },
] as const

export default async function SupportPlanPrintPage({
  params,
}: {
  params: Promise<{ childId: string }>
}) {
  const { childId } = await params
  const supabase = await createClient()

  const [childResult, plansResult] = await Promise.all([
    supabase
      .from('children')
      .select('id, name, name_kana, birth_date, disability_type, school_name, grade')
      .eq('id', childId)
      .single(),
    supabase
      .from('support_plans')
      .select('id, plan_date, review_date, status, long_term_goals, short_term_goals, family_wishes, child_wishes, support_policy, support_health_life, support_movement_sensory, support_cognition_behavior, support_language_communication, support_social_relationships, support_transition, support_family, created_by, users!support_plans_created_by_fkey(name)')
      .eq('child_id', childId)
      .in('status', ['active', 'reviewed'])
      .order('plan_date', { ascending: false })
      .limit(1),
  ])

  if (!childResult.data) notFound()
  const child = childResult.data as unknown as Child
  const plan = (plansResult.data?.[0] ?? null) as unknown as SupportPlan | null

  const reviewDate = plan?.review_date ? formatDate(plan.review_date, 'yyyy年MM月dd日') : '　'
  const planDate   = plan ? formatDate(plan.plan_date, 'yyyy年MM月dd日') : '　'
  const managerName = plan?.users?.name ?? '　'
  const wishes = [plan?.child_wishes, plan?.family_wishes].filter(Boolean).join('\n') || '　'

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-hide { display: none !important; }
          .print-page { width: 194mm; min-height: 277mm; padding: 0; }
        }
        .print-page {
          font-family: 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif;
          font-size: 7.5pt;
          color: #000;
        }
        table { border-collapse: collapse; width: 100%; }
        td, th {
          border: 1px solid #000;
          padding: 2px 4px;
          vertical-align: top;
          line-height: 1.4;
        }
        th { background: #e8e8e8; text-align: center; font-weight: bold; }
        .cell-label { background: #f0f0f0; font-size: 7pt; text-align: center; white-space: pre-line; }
        .content-cell { min-height: 28px; white-space: pre-wrap; word-break: break-all; }
        .tall { height: 38px; }
        .kasan-label { font-size: 6.5pt; text-align: center; }
      `}</style>

      {/* 操作バー（印刷時は非表示） */}
      <div className="print-hide flex items-center gap-3 mb-6">
        <Link href={`/support-plans/${childId}`} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{child.name} — 個別支援計画書</h1>
          <p className="text-xs text-gray-400">
            {plan ? `${formatDate(plan.plan_date)} 作成の計画` : '有効な支援計画がありません'}
          </p>
        </div>
        {plan && <PrintButton />}
      </div>

      {!plan && (
        <div className="print-hide text-center py-16 text-gray-400 text-sm">
          有効な支援計画（active / reviewed）がありません。<br />
          <Link href={`/support-plans/${childId}`} className="text-indigo-500 hover:underline">
            支援計画を作成する
          </Link>
        </div>
      )}

      {plan && (
        <div className="print-page bg-white mx-auto" style={{ width: '194mm', padding: '0 2mm' }}>

          {/* ─── タイトル行 ─────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
            <span style={{ fontSize: '7.5pt' }}>利用時氏名：{child.name}</span>
            <strong style={{ fontSize: '11pt', letterSpacing: '0.1em' }}>個別支援計画書</strong>
            <span style={{ fontSize: '7.5pt' }}>作成年月日　{planDate}</span>
          </div>

          {/* ─── 意向・方針 ─────────────────────────────────────── */}
          <table style={{ marginBottom: '2px' }}>
            <tbody>
              <tr>
                <td className="cell-label" style={{ width: '80px' }}>利用児及び家族の<br />生活に対する意向</td>
                <td className="content-cell tall">{wishes}</td>
              </tr>
              <tr>
                <td className="cell-label">総合的な支援の方針</td>
                <td className="content-cell tall">{plan.support_policy || '　'}</td>
              </tr>
            </tbody>
          </table>

          {/* ─── 目標 ───────────────────────────────────────────── */}
          <table style={{ marginBottom: '2px' }}>
            <tbody>
              <tr>
                <td className="cell-label" style={{ width: '80px' }}>長期目標<br />（内容・期間等）</td>
                <td className="content-cell tall">{plan.long_term_goals || '　'}</td>
                <td className="cell-label" rowSpan={2} style={{ width: '90px', fontSize: '6.5pt' }}>
                  支援の標準的な提供時間等<br />（曜日・頻度、時間）
                </td>
                <td rowSpan={2} style={{ width: '60px' }}></td>
              </tr>
              <tr>
                <td className="cell-label">短期目標<br />（内容・期間等）</td>
                <td className="content-cell tall">{plan.short_term_goals || '　'}</td>
              </tr>
            </tbody>
          </table>

          {/* ─── 支援テーブル ────────────────────────────────────── */}
          <div style={{ fontSize: '7pt', marginBottom: '1px' }}>○支援目標及び具体的な支援内容等</div>
          <table style={{ marginBottom: '4px' }}>
            <thead>
              <tr>
                <th style={{ width: '52px', fontSize: '6.5pt' }}>項　目</th>
                <th style={{ width: '90px', fontSize: '6.5pt' }}>支援目標<br />（具体的な到達目標）</th>
                <th style={{ fontSize: '6.5pt' }}>
                  支援内容<br />
                  <span style={{ fontWeight: 'normal' }}>（内容・支援の提供上のポイント・5領域（※）との関連性等）</span>
                </th>
                <th style={{ width: '38px', fontSize: '6.5pt' }}>達成時期</th>
                <th style={{ width: '60px', fontSize: '6.5pt' }}></th>
                <th style={{ width: '38px', fontSize: '6.5pt' }}>担当者</th>
                <th style={{ width: '28px', fontSize: '6.5pt' }}>優先順位</th>
              </tr>
            </thead>
            <tbody>
              {SUPPORT_AREAS.map((area) => {
                const content = plan[area.key] || ''
                return (
                  <tr key={area.key}>
                    <td className="cell-label" style={{ fontSize: '6.5pt', whiteSpace: 'pre-line', textAlign: 'center', minHeight: '32px' }}>
                      {area.label}
                    </td>
                    <td className="content-cell" style={{ minHeight: '32px' }}></td>
                    <td className="content-cell" style={{ minHeight: '32px' }}>{content}</td>
                    <td style={{ fontSize: '6.5pt', textAlign: 'center', verticalAlign: 'middle' }}>{reviewDate}</td>
                    <td className="kasan-label">{area.kasan}</td>
                    <td style={{ fontSize: '6.5pt', textAlign: 'center', verticalAlign: 'middle' }}>{managerName}</td>
                    <td></td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* ─── フッター ────────────────────────────────────────── */}
          <div style={{ fontSize: '6pt', color: '#333', marginBottom: '4px' }}>
            ※5領域の視点「健康・生活」「運動・感覚」「認知・行動」「言語・コミュニケーション」「人間関係・社会性」
            <br />本計画書に基づき支援の説明を受け、内容に同意しました。
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '7pt' }}>
            <div>
              提供する支援内容について、本計画書に基づき説明しました。<br />
              児童発達支援管理責任者氏名：{managerName}
            </div>
            <div style={{ textAlign: 'right' }}>
              　　年　　月　　日　　（保護者署名）
            </div>
          </div>
        </div>
      )}
    </>
  )
}
