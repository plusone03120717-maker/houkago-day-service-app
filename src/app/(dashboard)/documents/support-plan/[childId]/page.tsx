import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PrintButton } from '@/components/documents/print-button'
import { formatDate, formatWareki } from '@/lib/utils'

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
  support_content: string | null
  monitoring_notes: string | null
  family_wishes: string | null
  child_wishes: string | null
  created_by: string | null
  users: { name: string } | null
}

type BenefitCert = {
  certificate_number: string
  max_days_per_month: number
  start_date: string
  end_date: string
  municipality: string | null
}

export default async function SupportPlanPrintPage({
  params,
}: {
  params: Promise<{ childId: string }>
}) {
  const { childId } = await params
  const supabase = await createClient()

  const [childResult, plansResult, certsResult, facilityResult] = await Promise.all([
    supabase
      .from('children')
      .select('id, name, name_kana, birth_date, disability_type, school_name, grade')
      .eq('id', childId)
      .single(),

    supabase
      .from('support_plans')
      .select('id, plan_date, review_date, status, long_term_goals, short_term_goals, support_content, monitoring_notes, family_wishes, child_wishes, created_by, users!support_plans_created_by_fkey(name)')
      .eq('child_id', childId)
      .in('status', ['active', 'reviewed'])
      .order('plan_date', { ascending: false })
      .limit(1),

    supabase
      .from('benefit_certificates')
      .select('certificate_number, max_days_per_month, start_date, end_date, municipality')
      .eq('child_id', childId)
      .order('end_date', { ascending: false })
      .limit(1),

    supabase
      .from('facilities')
      .select('name, address')
      .limit(1)
      .single(),
  ])

  if (!childResult.data) notFound()

  const child = childResult.data as unknown as Child
  const plan = (plansResult.data?.[0] ?? null) as unknown as SupportPlan | null
  const cert = (certsResult.data?.[0] ?? null) as unknown as BenefitCert | null
  const facility = facilityResult.data as unknown as { name: string; address: string | null } | null

  const today = formatDate(new Date(), 'yyyy年MM月dd日')

  return (
    <>
      {/* 操作バー（印刷時は非表示） */}
      <div className="print:hidden flex items-center gap-3 mb-6">
        <Link href="/documents/support-plan" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{child.name} — 個別支援計画書</h1>
          <p className="text-xs text-gray-400">
            {plan ? `${formatDate(plan.plan_date)} 作成の計画` : '有効な支援計画がありません'}
          </p>
        </div>
        <PrintButton />
      </div>

      {plan === null && (
        <div className="print:hidden text-center py-16 text-gray-400 text-sm">
          有効な支援計画（active / reviewed）がありません。<br />
          <Link href={`/support-plans/${childId}`} className="text-indigo-500 hover:underline">
            支援計画を作成する
          </Link>
        </div>
      )}

      {plan !== null && (
        /* 印刷用帳票本体 */
        <div className="bg-white print:p-0 p-6 max-w-3xl mx-auto">
          {/* ヘッダー */}
          <div className="text-center border-b-2 border-gray-800 pb-3 mb-4">
            <h1 className="text-lg font-bold tracking-wider">個別支援計画書</h1>
            <p className="text-xs text-gray-500 mt-0.5">（放課後等デイサービス）</p>
          </div>

          {/* 基本情報 */}
          <table className="w-full text-sm border-collapse mb-4">
            <tbody>
              <tr>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium w-28 text-xs">施設名</td>
                <td className="border border-gray-400 px-3 py-1.5">{facility?.name ?? '—'}</td>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium w-28 text-xs">作成日</td>
                <td className="border border-gray-400 px-3 py-1.5">{formatDate(plan.plan_date, 'yyyy年MM月dd日')}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">氏名</td>
                <td className="border border-gray-400 px-3 py-1.5 font-bold">{child.name}</td>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">ふりがな</td>
                <td className="border border-gray-400 px-3 py-1.5">{child.name_kana ?? '—'}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">生年月日</td>
                <td className="border border-gray-400 px-3 py-1.5">
                  {child.birth_date ? formatWareki(child.birth_date) : '—'}
                </td>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">障害の種類</td>
                <td className="border border-gray-400 px-3 py-1.5">{child.disability_type ?? '—'}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">学校名</td>
                <td className="border border-gray-400 px-3 py-1.5">{child.school_name ?? '—'}</td>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">学年</td>
                <td className="border border-gray-400 px-3 py-1.5">{child.grade ?? '—'}</td>
              </tr>
              {cert && (
                <tr>
                  <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">受給者証番号</td>
                  <td className="border border-gray-400 px-3 py-1.5">{cert.certificate_number}</td>
                  <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">月間上限日数</td>
                  <td className="border border-gray-400 px-3 py-1.5">{cert.max_days_per_month}日</td>
                </tr>
              )}
              {cert && (
                <tr>
                  <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">受給者証有効期間</td>
                  <td className="border border-gray-400 px-3 py-1.5" colSpan={3}>
                    {formatDate(cert.start_date, 'yyyy年MM月dd日')} ～ {formatDate(cert.end_date, 'yyyy年MM月dd日')}
                    {cert.municipality && <span className="ml-2 text-gray-500">（{cert.municipality}）</span>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 本人・家族の希望 */}
          {(child_wishes_text => (
            <div className="mb-4">
              <table className="w-full text-sm border-collapse">
                <tbody>
                  <tr>
                    <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs w-28 align-top">本人の希望</td>
                    <td className="border border-gray-400 px-3 py-2 min-h-[40px] whitespace-pre-wrap">
                      {plan.child_wishes || '　'}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs align-top">保護者の希望</td>
                    <td className="border border-gray-400 px-3 py-2 min-h-[40px] whitespace-pre-wrap">
                      {plan.family_wishes || '　'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))(null)}

          {/* 支援目標・内容 */}
          <div className="mb-4">
            <table className="w-full text-sm border-collapse">
              <tbody>
                <tr>
                  <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs w-28 align-top">長期目標</td>
                  <td className="border border-gray-400 px-3 py-2 whitespace-pre-wrap min-h-[48px]">
                    {plan.long_term_goals || '　'}
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs align-top">短期目標</td>
                  <td className="border border-gray-400 px-3 py-2 whitespace-pre-wrap min-h-[48px]">
                    {plan.short_term_goals || '　'}
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs align-top">支援内容</td>
                  <td className="border border-gray-400 px-3 py-2 whitespace-pre-wrap min-h-[72px]">
                    {plan.support_content || '　'}
                  </td>
                </tr>
                {plan.monitoring_notes && (
                  <tr>
                    <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs align-top">モニタリング</td>
                    <td className="border border-gray-400 px-3 py-2 whitespace-pre-wrap">
                      {plan.monitoring_notes}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 見直し予定日 */}
          <div className="mb-6">
            <table className="w-full text-sm border-collapse">
              <tbody>
                <tr>
                  <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs w-28">見直し予定日</td>
                  <td className="border border-gray-400 px-3 py-1.5">
                    {plan.review_date ? formatDate(plan.review_date, 'yyyy年MM月dd日') : '　'}
                  </td>
                  <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs w-28">担当者</td>
                  <td className="border border-gray-400 px-3 py-1.5">
                    {plan.users?.name ?? '　'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 同意署名欄 */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-700 mb-2">【保護者同意欄】</p>
            <table className="w-full text-sm border-collapse">
              <tbody>
                <tr>
                  <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs w-28">説明日</td>
                  <td className="border border-gray-400 px-3 py-2 w-48">　　　年　　月　　日</td>
                  <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs w-28">保護者署名</td>
                  <td className="border border-gray-400 px-3 py-2">　</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* フッター */}
          <div className="text-right text-xs text-gray-400 mt-4 print:mt-8">
            出力日：{today}
          </div>
        </div>
      )}
    </>
  )
}
