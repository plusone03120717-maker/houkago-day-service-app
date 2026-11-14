import Link from 'next/link'
import { CalendarRange } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { pickPrimaryPlanPerChild } from '@/lib/schedule-defaults'
import { getTodayJST } from '@/lib/utils'
import { ChildTransportNotesForm } from '@/components/children/child-transport-notes-form'

const DOW = ['日', '月', '火', '水', '木', '金', '土']
const TRANSPORT_LABELS: Record<string, string> = {
  none: '送迎なし',
  pickup_only: '行きのみ',
  dropoff_only: '帰りのみ',
  both: '行き・帰り両方',
}

type PlanRow = {
  id: string
  child_id: string
  name: string | null
  start_date: string
  end_date: string | null
  day_of_week: number[] | null
  transport_type: string | null
  pickup_location_type: string | null
  dropoff_location_type: string | null
  units: { name: string } | null
}

/**
 * 児童の「送迎」の表示（2026-11-14 依頼主：予定がぶつかったときの優先順位を1つにそろえる）。
 *
 * いつもの送迎（送迎区分・お迎え場所・送り先）は利用スケジュール1か所で決める。
 * ここは表示だけで、変えるときは利用スケジュールへ案内する。
 * 以前はここでも選べたが、実際は「新しいスケジュールの初期値」にしか効かず、
 * 利用スケジュールと食い違ったまま残ることがあった。備考だけはここで書ける。
 */
export async function ChildTransportSummary({ childId }: { childId: string }) {
  const supabase = await createClient()
  const today = getTodayJST()

  const [{ data: childRaw }, { data: plansRaw }, { data: settingRaw }] = await Promise.all([
    supabase.from('children').select('address, schools(name)').eq('id', childId).maybeSingle(),
    supabase
      .from('usage_plans')
      .select('id, child_id, name, start_date, end_date, day_of_week, transport_type, pickup_location_type, dropoff_location_type, units(name)')
      .eq('child_id', childId)
      .eq('is_active', true)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order('start_date', { ascending: false }),
    supabase.from('child_transport_settings').select('id, notes').eq('child_id', childId).maybeSingle(),
  ])

  const child = childRaw as unknown as { address: string | null; schools: { name: string } | null } | null
  const plans = (plansRaw ?? []) as unknown as PlanRow[]
  const setting = settingRaw as { id: string; notes: string | null } | null
  // 期間の重なる計画が2本ある児童もいるので、いま効いている方（開始日の新しい方）を先頭に出す
  const primaryId = pickPrimaryPlanPerChild(plans)[0]?.id

  const place = (type: string | null) =>
    type === 'school'
      ? `学校${child?.schools?.name ? `（${child.schools.name}）` : ''}`
      : `自宅${child?.address ? `（${child.address}）` : ''}`

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 leading-relaxed">
        いつもの送迎は<span className="font-semibold">利用スケジュール</span>で決まります。
        その日だけの変更は、利用スケジュールの「特定日の変更」か、保護者の利用連絡で決まり、いつもの送迎より優先されます。
      </p>

      {plans.length === 0 ? (
        <p className="text-sm text-gray-500">利用スケジュールがまだ登録されていません。</p>
      ) : (
        <div className="space-y-2">
          {plans.map((p) => (
            <div key={p.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-gray-800">{p.name ?? 'スケジュール'}</span>
                {p.units?.name && <span className="text-xs text-gray-500">{p.units.name}</span>}
                <span className="text-xs text-gray-500">
                  {(p.day_of_week ?? []).slice().sort().map((d) => DOW[d]).join('・')}
                </span>
                {plans.length > 1 && p.id === primaryId && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">いま効いている予定</span>
                )}
              </div>
              <dl className="mt-2 grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
                <dt className="text-gray-500">送迎</dt>
                <dd className="text-gray-800">{TRANSPORT_LABELS[p.transport_type ?? 'both'] ?? p.transport_type}</dd>
                {(p.transport_type === 'both' || p.transport_type === 'pickup_only') && (
                  <>
                    <dt className="text-gray-500">お迎え</dt>
                    <dd className="text-gray-800 break-words">{place(p.pickup_location_type)}</dd>
                  </>
                )}
                {(p.transport_type === 'both' || p.transport_type === 'dropoff_only') && (
                  <>
                    <dt className="text-gray-500">送り</dt>
                    <dd className="text-gray-800 break-words">{place(p.dropoff_location_type)}</dd>
                  </>
                )}
              </dl>
              <p className="mt-1.5 text-[11px] text-gray-400">
                土日・祝日は、学校の設定でも自宅になります（学校が休みのため）
              </p>
            </div>
          ))}
        </div>
      )}

      <Link
        href={`/children/${childId}/schedule`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
      >
        <CalendarRange className="h-4 w-4" />
        利用スケジュールで変える
      </Link>

      <div className="border-t border-gray-100 pt-4">
        <ChildTransportNotesForm childId={childId} settingId={setting?.id ?? null} initialNotes={setting?.notes ?? ''} />
      </div>
    </div>
  )
}
