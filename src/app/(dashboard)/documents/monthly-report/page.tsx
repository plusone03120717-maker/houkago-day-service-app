import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Unit = {
  id: string
  name: string
  capacity: number
  service_type: string
}

type AttendanceRow = {
  child_id: string
  date: string
  status: string
  children: { name: string; disability_type: string | null } | null
}

type StaffShift = {
  date: string
  shift_type: string
  users: { name: string } | null
  units: { id: string } | null
}

type Facility = {
  name: string
  facility_number: string | null
  address: string | null
}

export default async function MonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; unit?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
  const monthLabel = `${year}年${month}月`
  const printDate = formatDate(new Date(), 'yyyy年MM月dd日')

  const prevDate = new Date(year, month - 2, 1)
  const nextDate = new Date(year, month, 1)

  // 施設・ユニット情報
  const [facilityResult, unitsResult] = await Promise.all([
    supabase.from('facilities').select('name, facility_number, address').limit(1).single(),
    supabase.from('units').select('id, name, capacity, service_type').order('name'),
  ])

  const facility = facilityResult.data as unknown as Facility | null
  const units = (unitsResult.data ?? []) as unknown as Unit[]
  const selectedUnitId = params.unit ?? units[0]?.id ?? ''
  const selectedUnit = units.find((u) => u.id === selectedUnitId)

  // 出席データ（当月・選択ユニット）
  const { data: attendanceRaw } = selectedUnitId
    ? await supabase
        .from('daily_attendance')
        .select('child_id, date, status, children(name, disability_type)')
        .eq('unit_id', selectedUnitId)
        .gte('date', monthStart)
        .lte('date', monthEnd)
    : { data: [] }
  const attendance = (attendanceRaw ?? []) as unknown as AttendanceRow[]

  const attended = attendance.filter((r) => r.status === 'attended')

  // 出席データを日付ごとに集計
  const dailyCount: Record<string, number> = {}
  for (const r of attended) {
    dailyCount[r.date] = (dailyCount[r.date] ?? 0) + 1
  }

  // 児童ごとの利用日数
  const childDays = new Map<string, { name: string; days: number }>()
  for (const r of attended) {
    const existing = childDays.get(r.child_id) ?? { name: r.children?.name ?? '—', days: 0 }
    childDays.set(r.child_id, { ...existing, days: existing.days + 1 })
  }
  const childRows = Array.from(childDays.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  // 月間合計
  const totalDays = attended.length
  const uniqueChildren = childDays.size
  const avgDays = uniqueChildren > 0 ? (totalDays / uniqueChildren).toFixed(1) : '—'
  const openDays = Object.keys(dailyCount).length

  // スタッフ勤務日数（当ユニット）
  const { data: shiftsRaw } = selectedUnitId
    ? await supabase
        .from('staff_shifts')
        .select('date, shift_type, users(name), units:unit_id(id)')
        .eq('unit_id', selectedUnitId)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .not('shift_type', 'eq', 'off')
        .not('shift_type', 'eq', 'holiday')
    : { data: [] }
  const shifts = (shiftsRaw ?? []) as unknown as StaffShift[]

  const staffDays = new Map<string, { name: string; days: number }>()
  for (const s of shifts) {
    const name = s.users?.name ?? '不明'
    const existing = staffDays.get(name) ?? { name, days: 0 }
    staffDays.set(name, { ...existing, days: existing.days + 1 })
  }
  const staffRows = Array.from(staffDays.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  // 日別利用者数テーブル用データ
  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dow = new Date(dateStr).getDay()
    return { dateStr, day: d, dow, count: dailyCount[dateStr] ?? 0 }
  })

  return (
    <>
      {/* 操作バー（印刷時非表示） */}
      <div className="print:hidden flex items-center gap-3 mb-6 flex-wrap">
        <Link href="/documents" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">月次運営実績報告書</h1>
          <p className="text-xs text-gray-400">{monthLabel} {selectedUnit?.name ?? ''}</p>
        </div>

        {/* 月選択 */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1">
          <Link
            href={`/documents/monthly-report?year=${prevDate.getFullYear()}&month=${prevDate.getMonth() + 1}${selectedUnitId ? `&unit=${selectedUnitId}` : ''}`}
            className="px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            ＜
          </Link>
          <span className="px-2 text-sm font-medium">{monthLabel}</span>
          <Link
            href={`/documents/monthly-report?year=${nextDate.getFullYear()}&month=${nextDate.getMonth() + 1}${selectedUnitId ? `&unit=${selectedUnitId}` : ''}`}
            className="px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            ＞
          </Link>
        </div>

        {/* ユニット選択 */}
        <div className="flex gap-2 flex-wrap">
          {units.map((u) => (
            <Link
              key={u.id}
              href={`/documents/monthly-report?year=${year}&month=${month}&unit=${u.id}`}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selectedUnitId === u.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {u.name}
            </Link>
          ))}
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Printer className="h-4 w-4" />
          印刷
        </button>
      </div>

      {/* 帳票本体 */}
      <div className="bg-white print:p-0 p-6 max-w-4xl mx-auto space-y-6 text-sm">
        {/* タイトル */}
        <div className="text-center border-b-2 border-gray-800 pb-3">
          <h1 className="text-lg font-bold tracking-wider">月次運営実績報告書</h1>
          <p className="text-xs text-gray-500 mt-0.5">（放課後等デイサービス）</p>
        </div>

        {/* 基本情報 */}
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium w-28 text-xs">事業所名</td>
              <td className="border border-gray-400 px-3 py-1.5">{facility?.name ?? '—'}</td>
              <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium w-28 text-xs">事業所番号</td>
              <td className="border border-gray-400 px-3 py-1.5">{facility?.facility_number ?? '—'}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">所在地</td>
              <td className="border border-gray-400 px-3 py-1.5" colSpan={3}>{facility?.address ?? '—'}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">対象年月</td>
              <td className="border border-gray-400 px-3 py-1.5 font-bold">{monthLabel}</td>
              <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">ユニット</td>
              <td className="border border-gray-400 px-3 py-1.5">{selectedUnit?.name ?? '—'}</td>
            </tr>
          </tbody>
        </table>

        {/* 月間サマリー */}
        <div>
          <h2 className="text-sm font-bold text-gray-800 mb-2 border-l-4 border-indigo-500 pl-2">月間集計</h2>
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs w-36">開所日数</td>
                <td className="border border-gray-400 px-3 py-1.5 font-bold text-center">{openDays}日</td>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs w-36">延べ利用者数</td>
                <td className="border border-gray-400 px-3 py-1.5 font-bold text-center">{totalDays}名</td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">実利用児童数</td>
                <td className="border border-gray-400 px-3 py-1.5 font-bold text-center">{uniqueChildren}名</td>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">平均利用日数</td>
                <td className="border border-gray-400 px-3 py-1.5 font-bold text-center">{avgDays}日</td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">定員</td>
                <td className="border border-gray-400 px-3 py-1.5 font-bold text-center">{selectedUnit?.capacity ?? '—'}名</td>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">定員稼働率</td>
                <td className="border border-gray-400 px-3 py-1.5 font-bold text-center">
                  {selectedUnit?.capacity && openDays > 0
                    ? `${Math.round((totalDays / (selectedUnit.capacity * openDays)) * 100)}%`
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 日別利用者数 */}
        <div>
          <h2 className="text-sm font-bold text-gray-800 mb-2 border-l-4 border-indigo-500 pl-2">日別利用者数</h2>
          <div className="grid grid-cols-7 border-t border-l border-gray-400">
            {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
              <div
                key={d}
                className={`border-r border-b border-gray-400 text-center text-xs py-1 font-medium bg-gray-50 ${
                  i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'
                }`}
              >
                {d}
              </div>
            ))}
            {/* 先頭の空白 */}
            {Array.from({ length: new Date(year, month - 1, 1).getDay() }).map((_, i) => (
              <div key={`pad-${i}`} className="border-r border-b border-gray-400 h-10" />
            ))}
            {dates.map(({ day, dow, count }) => (
              <div
                key={day}
                className={`border-r border-b border-gray-400 text-center py-1 h-10 ${
                  dow === 0 ? 'bg-red-50' : dow === 6 ? 'bg-blue-50' : ''
                }`}
              >
                <p className={`text-xs font-medium ${dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700'}`}>{day}</p>
                {count > 0 && <p className="text-xs font-bold text-indigo-700">{count}名</p>}
              </div>
            ))}
          </div>
        </div>

        {/* 児童別利用日数 */}
        <div>
          <h2 className="text-sm font-bold text-gray-800 mb-2 border-l-4 border-indigo-500 pl-2">
            児童別利用実績 ({childRows.length}名)
          </h2>
          {childRows.length === 0 ? (
            <p className="text-gray-400 text-xs py-4 text-center">利用実績がありません</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-400 px-3 py-1.5 text-left text-xs font-medium">氏名</th>
                  <th className="border border-gray-400 px-3 py-1.5 text-center text-xs font-medium w-20">利用日数</th>
                </tr>
              </thead>
              <tbody>
                {childRows.map((child) => (
                  <tr key={child.name}>
                    <td className="border border-gray-400 px-3 py-1.5">{child.name}</td>
                    <td className="border border-gray-400 px-3 py-1.5 text-center font-bold">{child.days}日</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-gray-400 px-3 py-1.5">合計（延べ）</td>
                  <td className="border border-gray-400 px-3 py-1.5 text-center">{totalDays}日</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* スタッフ勤務状況 */}
        {staffRows.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-800 mb-2 border-l-4 border-indigo-500 pl-2">
              スタッフ勤務状況
            </h2>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-400 px-3 py-1.5 text-left text-xs font-medium">氏名</th>
                  <th className="border border-gray-400 px-3 py-1.5 text-center text-xs font-medium w-24">勤務日数</th>
                </tr>
              </thead>
              <tbody>
                {staffRows.map((s) => (
                  <tr key={s.name}>
                    <td className="border border-gray-400 px-3 py-1.5">{s.name}</td>
                    <td className="border border-gray-400 px-3 py-1.5 text-center">{s.days}日</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 作成者・承認欄 */}
        <div>
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs w-28">作成日</td>
                <td className="border border-gray-400 px-3 py-2">{printDate}</td>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs w-28">作成者</td>
                <td className="border border-gray-400 px-3 py-2">　</td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-50 px-3 py-1.5 font-medium text-xs">管理者確認</td>
                <td className="border border-gray-400 px-3 py-4" colSpan={3}>　</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
