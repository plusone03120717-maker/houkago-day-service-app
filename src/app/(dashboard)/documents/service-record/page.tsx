import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PrintButton } from '@/components/documents/print-button'

type AttendanceRow = {
  id: string
  child_id: string
  date: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  pickup_type: string
  children: {
    name: string
    name_kana: string | null
    benefit_certificates: Array<{ certificate_number: string }>
  } | null
}

type Unit = {
  id: string
  name: string
  service_type: string
  facilities: { name: string; facility_number: string } | null
}

export default async function ServiceRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; unit?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name, service_type, facilities(name, facility_number)')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as Unit[]

  const selectedUnitId = params.unit ?? units[0]?.id ?? ''
  const selectedUnit = units.find((u) => u.id === selectedUnitId)

  const { data: attendanceRaw } = selectedUnitId
    ? await supabase
        .from('daily_attendance')
        .select(`
          id, child_id, date, status, check_in_time, check_out_time, pickup_type,
          children (name, name_kana, benefit_certificates (certificate_number))
        `)
        .eq('unit_id', selectedUnitId)
        .eq('status', 'attended')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('child_id')
        .order('date')
    : { data: [] }
  const attendance = (attendanceRaw ?? []) as unknown as AttendanceRow[]

  // 日付一覧
  const days = Array.from({ length: lastDay }, (_, i) => i + 1)

  // 児童ごとにグループ
  const childMap = new Map<string, {
    name: string
    nameKana: string | null
    certNumber: string
    dates: Set<number>
    pickupDates: Set<number>
    dropoffDates: Set<number>
  }>()

  attendance.forEach((a) => {
    const child = a.children
    if (!child) return
    const dayNum = parseInt(a.date.slice(8, 10))
    const certNumber = child.benefit_certificates?.[0]?.certificate_number ?? ''

    if (!childMap.has(a.child_id)) {
      childMap.set(a.child_id, {
        name: child.name,
        nameKana: child.name_kana,
        certNumber,
        dates: new Set(),
        pickupDates: new Set(),
        dropoffDates: new Set(),
      })
    }
    const entry = childMap.get(a.child_id)!
    entry.dates.add(dayNum)
    if (a.pickup_type === 'both' || a.pickup_type === 'pickup_only') entry.pickupDates.add(dayNum)
    if (a.pickup_type === 'both' || a.pickup_type === 'dropoff_only') entry.dropoffDates.add(dayNum)
  })

  const children = Array.from(childMap.entries())

  const pickupLabel: Record<string, string> = {
    both: '送迎',
    pickup_only: '送',
    dropoff_only: '迎',
    none: '',
  }

  return (
    <div className="space-y-4">
      {/* 印刷時は非表示のヘッダー */}
      <div className="print:hidden flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/documents" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">サービス提供実績記録票</h1>
            <p className="text-sm text-gray-500">{year}年{month}月 | {selectedUnit?.name}</p>
          </div>
        </div>
        <PrintButton />
      </div>

      {/* ユニット選択（印刷時非表示） */}
      {units.length > 1 && (
        <div className="print:hidden flex gap-2 flex-wrap">
          {units.map((u) => (
            <Link
              key={u.id}
              href={`/documents/service-record?year=${year}&month=${month}&unit=${u.id}`}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedUnitId === u.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {u.name}
            </Link>
          ))}
        </div>
      )}

      {/* 印刷用帳票 */}
      <div className="bg-white border border-gray-300 rounded-lg p-6 print:border-none print:rounded-none print:p-0">
        {/* タイトル */}
        <div className="text-center mb-4">
          <h2 className="text-lg font-bold">サービス提供実績記録票</h2>
          <p className="text-sm mt-1">
            {year}年{month}月分 ／ {selectedUnit?.facilities?.name} ／ {selectedUnit?.name}
          </p>
          <p className="text-xs text-gray-500">
            事業所番号: {selectedUnit?.facilities?.facility_number}
          </p>
        </div>

        {/* テーブル */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-400 p-1 bg-gray-100 text-left whitespace-nowrap" rowSpan={2}>氏名</th>
                <th className="border border-gray-400 p-1 bg-gray-100 text-center whitespace-nowrap" rowSpan={2}>受給者証番号</th>
                {days.map((d) => {
                  const dow = new Date(year, month - 1, d).getDay()
                  return (
                    <th
                      key={d}
                      className={`border border-gray-400 p-0.5 bg-gray-100 text-center w-6 ${
                        dow === 0 ? 'text-red-600' : dow === 6 ? 'text-blue-600' : ''
                      }`}
                    >
                      {d}
                    </th>
                  )
                })}
                <th className="border border-gray-400 p-1 bg-gray-100 text-center whitespace-nowrap">利用<br/>日数</th>
                <th className="border border-gray-400 p-1 bg-gray-100 text-center whitespace-nowrap">送迎<br/>回数</th>
              </tr>
              <tr>
                {days.map((d) => {
                  const dow = new Date(year, month - 1, d).getDay()
                  const dayLabels = ['日', '月', '火', '水', '木', '金', '土']
                  return (
                    <th
                      key={d}
                      className={`border border-gray-400 p-0.5 bg-gray-50 text-center text-xs w-6 ${
                        dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-500'
                      }`}
                    >
                      {dayLabels[dow]}
                    </th>
                  )
                })}
                <th className="border border-gray-400" />
                <th className="border border-gray-400" />
              </tr>
            </thead>
            <tbody>
              {children.map(([childId, child]) => (
                <tr key={childId}>
                  <td className="border border-gray-400 p-1 whitespace-nowrap font-medium">
                    {child.name}
                  </td>
                  <td className="border border-gray-400 p-1 text-center whitespace-nowrap text-xs">
                    {child.certNumber}
                  </td>
                  {days.map((d) => {
                    const attended = child.dates.has(d)
                    const pickup = child.pickupDates.has(d)
                    const dropoff = child.dropoffDates.has(d)
                    const transportLabel = pickup && dropoff ? '送迎' : pickup ? '送' : dropoff ? '迎' : ''

                    return (
                      <td
                        key={d}
                        className={`border border-gray-400 p-0.5 text-center w-6 ${
                          attended ? 'bg-indigo-50' : ''
                        }`}
                      >
                        {attended ? (
                          <div>
                            <div className="text-indigo-700 font-bold">○</div>
                            {transportLabel && (
                              <div className="text-xs text-gray-500">{transportLabel}</div>
                            )}
                          </div>
                        ) : ''}
                      </td>
                    )
                  })}
                  <td className="border border-gray-400 p-1 text-center font-bold">
                    {child.dates.size}
                  </td>
                  <td className="border border-gray-400 p-1 text-center">
                    {child.pickupDates.size + child.dropoffDates.size}
                  </td>
                </tr>
              ))}
              {children.length === 0 && (
                <tr>
                  <td colSpan={lastDay + 4} className="border border-gray-400 p-4 text-center text-gray-400">
                    この月の実績データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 署名欄 */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-sm">
          <div className="border border-gray-400 p-3">
            <p className="text-xs text-gray-500 mb-4">管理者確認</p>
            <div className="h-8" />
          </div>
          <div className="border border-gray-400 p-3">
            <p className="text-xs text-gray-500 mb-4">担当者</p>
            <div className="h-8" />
          </div>
          <div className="border border-gray-400 p-3">
            <p className="text-xs text-gray-500 mb-4">作成日: {new Date().toLocaleDateString('ja-JP')}</p>
            <div className="h-8" />
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { font-size: 11px; }
          .print\\:hidden { display: none !important; }
          nav, header, aside { display: none !important; }
        }
      `}</style>
    </div>
  )
}
