import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

type StaffUser = { id: string; name: string }
type ShiftEntry = {
  staff_id: string
  date: string
  shift_type: string
  start_time: string | null
  end_time: string | null
}

const SHIFT_DISPLAY: Record<string, { label: string; abbr: string; class: string }> = {
  full:      { label: '全日', abbr: '全', class: 'bg-indigo-100 text-indigo-700' },
  morning:   { label: '午前', abbr: '前', class: 'bg-blue-100 text-blue-700' },
  afternoon: { label: '午後', abbr: '後', class: 'bg-teal-100 text-teal-700' },
  off:       { label: '休み', abbr: '休', class: 'bg-gray-100 text-gray-500' },
  holiday:   { label: '有休', abbr: '有', class: 'bg-orange-100 text-orange-700' },
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export default async function ShiftTablePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: staffRaw } = await supabase
    .from('users')
    .select('id, name')
    .in('role', ['admin', 'staff'])
    .order('name')
  const staff = (staffRaw ?? []) as unknown as StaffUser[]

  const { data: shiftsRaw } = staff.length > 0
    ? await supabase
        .from('staff_shifts')
        .select('staff_id, date, shift_type, start_time, end_time')
        .gte('date', startDate)
        .lte('date', endDate)
    : { data: [] }
  const shifts = (shiftsRaw ?? []) as unknown as ShiftEntry[]

  // シフトマップ: staffId -> day -> shift
  const shiftMap: Record<string, Record<number, ShiftEntry>> = {}
  shifts.forEach((s) => {
    if (!shiftMap[s.staff_id]) shiftMap[s.staff_id] = {}
    const day = parseInt(s.date.slice(8, 10))
    shiftMap[s.staff_id][day] = s
  })

  // 日付配列
  const days = Array.from({ length: lastDay }, (_, i) => i + 1)

  // 各日の出勤人数
  const dailyStaffCount: Record<number, number> = {}
  shifts.forEach((s) => {
    if (s.shift_type !== 'off' && s.shift_type !== 'holiday') {
      const day = parseInt(s.date.slice(8, 10))
      dailyStaffCount[day] = (dailyStaffCount[day] ?? 0) + 1
    }
  })

  return (
    <div className="space-y-4">
      <div className="print:hidden flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/documents" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">シフト表 — {year}年{month}月</h1>
        </div>
        <Button onClick={() => window.print()} size="sm" variant="outline">
          <Printer className="h-4 w-4" />
          印刷
        </Button>
      </div>

      <div className="bg-white border border-gray-300 rounded-lg p-6 print:border-none print:p-0">
        <div className="text-center mb-4">
          <h2 className="text-lg font-bold">シフト表</h2>
          <p className="text-sm">{year}年{month}月</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-400 p-2 bg-gray-100 text-left whitespace-nowrap">スタッフ名</th>
                {days.map((d) => {
                  const dow = new Date(year, month - 1, d).getDay()
                  return (
                    <th
                      key={d}
                      className={`border border-gray-400 p-0.5 bg-gray-100 text-center w-8 ${
                        dow === 0 ? 'text-red-600' : dow === 6 ? 'text-blue-600' : ''
                      }`}
                    >
                      <div>{d}</div>
                      <div className="text-gray-500 font-normal">{DAY_LABELS[dow]}</div>
                    </th>
                  )
                })}
                <th className="border border-gray-400 p-1 bg-gray-100 text-center whitespace-nowrap">出勤<br/>日数</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const staffShifts = shiftMap[s.id] ?? {}
                const workDays = Object.values(staffShifts).filter(
                  (sh) => sh.shift_type !== 'off' && sh.shift_type !== 'holiday'
                ).length

                return (
                  <tr key={s.id}>
                    <td className="border border-gray-400 p-1 whitespace-nowrap font-medium">{s.name}</td>
                    {days.map((d) => {
                      const shift = staffShifts[d]
                      const info = shift ? SHIFT_DISPLAY[shift.shift_type] : null
                      return (
                        <td key={d} className={`border border-gray-400 p-0.5 text-center w-8 ${info?.class ?? ''}`}>
                          {info?.abbr ?? ''}
                        </td>
                      )
                    })}
                    <td className="border border-gray-400 p-1 text-center font-bold">{workDays}</td>
                  </tr>
                )
              })}

              {/* 出勤人数行 */}
              <tr className="bg-gray-50">
                <td className="border border-gray-400 p-1 font-semibold text-gray-600">出勤人数</td>
                {days.map((d) => (
                  <td key={d} className="border border-gray-400 p-0.5 text-center font-semibold text-indigo-700">
                    {dailyStaffCount[d] ?? ''}
                  </td>
                ))}
                <td className="border border-gray-400" />
              </tr>
            </tbody>
          </table>
        </div>

        {/* 凡例 */}
        <div className="mt-4 flex gap-4 flex-wrap text-xs">
          {Object.entries(SHIFT_DISPLAY).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1">
              <span className={`px-1.5 py-0.5 rounded ${val.class}`}>{val.abbr}</span>
              <span className="text-gray-500">{val.label}</span>
            </div>
          ))}
        </div>

        {/* 署名欄 */}
        <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
          {['管理者確認', '担当者', `作成日: ${new Date().toLocaleDateString('ja-JP')}`].map((label) => (
            <div key={label} className="border border-gray-400 p-3">
              <p className="text-xs text-gray-500 mb-4">{label}</p>
              <div className="h-8" />
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media print {
          body { font-size: 10px; }
          .print\\:hidden { display: none !important; }
          nav, header, aside { display: none !important; }
        }
      `}</style>
    </div>
  )
}
