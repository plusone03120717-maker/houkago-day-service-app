import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PrintOptions } from '@/components/documents/print-options'
import { formatDate } from '@/lib/utils'

type Child = {
  id: string
  name: string
}

type SupportPlan = {
  id: string
  plan_date: string
  review_date: string | null
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
  users: { name: string } | null
}

const SUPPORT_AREAS: { key: keyof SupportPlan; label: string; kasan: string }[] = [
  { key: 'support_health_life',            label: '本人支援\n（健康・生活）',              kasan: '医療連携体制加算' },
  { key: 'support_movement_sensory',       label: '本人支援\n（運動・感覚）',              kasan: '専門的支援実施加算' },
  { key: 'support_cognition_behavior',     label: '本人支援\n（認知・行動）',              kasan: '' },
  { key: 'support_language_communication', label: '本人支援\n（言語・コミュニケーション）', kasan: '' },
  { key: 'support_social_relationships',   label: '本人支援\n（人間関係・社会性）',        kasan: '' },
  { key: 'support_transition',             label: '本人支援\n（移行支援）',               kasan: '' },
  { key: 'support_family',                 label: '家族支援',                            kasan: '家族支援加算' },
]

export default async function PrintSupportPlanPage({
  params,
}: {
  params: Promise<{ childId: string }>
}) {
  const { childId } = await params
  const supabase = await createClient()

  const [childResult, plansResult] = await Promise.all([
    supabase.from('children').select('id, name').eq('id', childId).single(),
    supabase
      .from('support_plans')
      .select('id, plan_date, review_date, long_term_goals, short_term_goals, family_wishes, child_wishes, support_policy, support_health_life, support_movement_sensory, support_cognition_behavior, support_language_communication, support_social_relationships, support_transition, support_family, users!support_plans_created_by_fkey(name)')
      .eq('child_id', childId)
      .in('status', ['active', 'reviewed'])
      .order('plan_date', { ascending: false })
      .limit(1),
  ])

  if (!childResult.data) notFound()
  const child = childResult.data as unknown as Child
  const plan = (plansResult.data?.[0] ?? null) as unknown as SupportPlan | null

  const reviewDate  = plan?.review_date ? formatDate(plan.review_date, 'yyyy年MM月dd日') : '　'
  const planDate    = plan ? formatDate(plan.plan_date, 'yyyy年MM月dd日') : '　'
  const managerName = plan?.users?.name ?? '　'
  const wishes      = [plan?.child_wishes, plan?.family_wishes].filter(Boolean).join('\n') || '　'

  return (
    <>
      {/* 操作バー（印刷時は非表示） */}
      <div className="print:hidden flex items-start gap-4 p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <Link href={`/support-plans/${childId}`} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <p className="font-semibold text-gray-900">{child.name} — 個別支援計画書</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {plan ? `${planDate} 作成の計画` : '有効な支援計画がありません'}
          </p>
        </div>
        {plan && <PrintOptions />}
      </div>

      {!plan && (
        <div className="print:hidden text-center py-16 text-gray-400 text-sm">
          有効な支援計画がありません。
        </div>
      )}

      {plan && (
        <>
          {/* 印刷スタイル */}
          <style>{`
            @media print {
              /* margin: 0 でブラウザ自動出力のURL・日付・ページ番号を非表示にする */
              @page { size: A4 portrait; margin: 0; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; }
            }
            .doc {
              font-family: var(--font-noto-sans-jp), 'Hiragino Sans', 'Yu Gothic', sans-serif;
              font-size: 7.5pt;
              color: #000;
              width: 190mm;
              margin: 8mm auto;
              padding: 0;
            }
            @media print {
              .doc { margin: 0; width: 100%; padding: 10mm; box-sizing: border-box; }
            }
            table { border-collapse: collapse; width: 100%; }
            td, th { border: 1px solid #111; padding: 2px 4px; vertical-align: top; line-height: 1.45; }
            th { background-color: #e0e0e0; text-align: center; font-size: 7pt; }
            .lbl { background-color: #eeeeee; text-align: center; font-size: 7pt; white-space: pre-line; }
            .content { min-height: 26px; white-space: pre-wrap; word-break: break-all; }
            .tall { min-height: 38px; }
          `}</style>

          <div className="doc">
            {/* タイトル行 */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'3px' }}>
              <span>利用時氏名：{child.name}</span>
              <strong style={{ fontSize:'12pt', letterSpacing:'0.15em' }}>個別支援計画書</strong>
              <span>作成年月日　{planDate}</span>
            </div>

            {/* 意向・方針 */}
            <table style={{ marginBottom:'2px' }}>
              <tbody>
                <tr>
                  <td className="lbl" style={{ width:'72px' }}>利用児及び家族の<br />生活に対する意向</td>
                  <td className="content tall">{wishes}</td>
                </tr>
                <tr>
                  <td className="lbl">総合的な支援の方針</td>
                  <td className="content tall">{plan.support_policy || '　'}</td>
                </tr>
              </tbody>
            </table>

            {/* 目標 */}
            <table style={{ marginBottom:'2px' }}>
              <tbody>
                <tr>
                  <td className="lbl" style={{ width:'72px' }}>長期目標<br />（内容・期間等）</td>
                  <td className="content tall">{plan.long_term_goals || '　'}</td>
                  <td className="lbl" rowSpan={2} style={{ width:'88px', fontSize:'6.5pt' }}>
                    支援の標準的な提供時間等<br />（曜日・頻度・時間）
                  </td>
                  <td rowSpan={2} style={{ width:'52px' }}></td>
                </tr>
                <tr>
                  <td className="lbl">短期目標<br />（内容・期間等）</td>
                  <td className="content tall">{plan.short_term_goals || '　'}</td>
                </tr>
              </tbody>
            </table>

            {/* 支援テーブル */}
            <div style={{ fontSize:'7pt', marginBottom:'1px' }}>○支援目標及び具体的な支援内容等</div>
            <table style={{ marginBottom:'4px' }}>
              <thead>
                <tr>
                  <th style={{ width:'50px' }}>項　目</th>
                  <th style={{ width:'88px' }}>支援目標<br />（具体的な到達目標）</th>
                  <th>支援内容<br /><span style={{ fontWeight:'normal', fontSize:'6pt' }}>（内容・支援の提供上のポイント・5領域（※）との関連性等）</span></th>
                  <th style={{ width:'36px' }}>達成時期</th>
                  <th style={{ width:'56px' }}></th>
                  <th style={{ width:'36px' }}>担当者</th>
                  <th style={{ width:'26px' }}>優先順位</th>
                </tr>
              </thead>
              <tbody>
                {SUPPORT_AREAS.map((area) => (
                  <tr key={area.key}>
                    <td className="lbl" style={{ fontSize:'6.5pt', whiteSpace:'pre-line', minHeight:'30px' }}>{area.label}</td>
                    <td style={{ minHeight:'30px' }}></td>
                    <td className="content" style={{ minHeight:'30px' }}>{(plan[area.key] as string) || ''}</td>
                    <td style={{ fontSize:'6.5pt', textAlign:'center', verticalAlign:'middle' }}>{reviewDate}</td>
                    <td style={{ fontSize:'6.5pt', textAlign:'center' }}>{area.kasan}</td>
                    <td style={{ fontSize:'6.5pt', textAlign:'center', verticalAlign:'middle' }}>{managerName}</td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* フッター */}
            <div style={{ fontSize:'6pt', color:'#333', marginBottom:'4px' }}>
              ※5領域の視点「健康・生活」「運動・感覚」「認知・行動」「言語・コミュニケーション」「人間関係・社会性」<br />
              本計画書に基づき支援の説明を受け、内容に同意しました。
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', fontSize:'7pt' }}>
              <div>
                提供する支援内容について、本計画書に基づき説明しました。<br />
                児童発達支援管理責任者氏名：{managerName}
              </div>
              <div style={{ textAlign:'right' }}>
                　　年　　月　　日　　（保護者署名）
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
