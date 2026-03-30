import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, BookOpen, ClipboardList, ExternalLink, MessageCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'

export default async function AttendanceDateDetailPage({
  params,
}: {
  params: Promise<{ childId: string; date: string }>
}) {
  const { childId, date } = await params
  const supabase = await createClient()

  const [{ data: child }, { data: attendanceRaw }] = await Promise.all([
    supabase.from('children').select('id, name').eq('id', childId).single(),
    supabase
      .from('daily_attendance')
      .select('id, status, check_in_time, check_out_time, unit_id, units(name)')
      .eq('child_id', childId)
      .eq('date', date)
      .maybeSingle(),
  ])

  if (!child) notFound()

  type Attendance = {
    id: string
    status: string
    check_in_time: string | null
    check_out_time: string | null
    unit_id: string
    units: { name: string } | null
  }
  const attendance = attendanceRaw as unknown as Attendance | null

  // 日々の記録
  type DailyRecord = { id: string; record_type: string; content: string; has_notable_flag: boolean }
  const { data: dailyRecordsRaw } = attendance
    ? await supabase
        .from('daily_records')
        .select('id, record_type, content, has_notable_flag')
        .eq('attendance_id', attendance.id)
        .order('created_at')
    : { data: [] }
  const dailyRecords = (dailyRecordsRaw ?? []) as unknown as DailyRecord[]

  // 連絡帳
  type ContactNote = { id: string; content: string; published_at: string | null; parent_comment: string | null }
  const { data: contactNoteRaw } = attendance
    ? await supabase
        .from('contact_notes')
        .select('id, content, published_at, parent_comment')
        .eq('child_id', childId)
        .eq('date', date)
        .eq('unit_id', attendance.unit_id)
        .maybeSingle()
    : { data: null }
  const contactNote = contactNoteRaw as unknown as ContactNote | null

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href={`/attendance/child/${childId}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{formatDate(date)}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{child.name} · {attendance?.units?.name ?? '—'}</p>
        </div>
        {attendance && (
          <div className="ml-auto">
            <Badge variant={attendance.status === 'attended' ? 'success' : 'secondary'}>
              {attendance.status === 'attended' ? '出席' : attendance.status === 'absent' ? '欠席' : 'その他'}
            </Badge>
          </div>
        )}
      </div>

      {/* 入退室時刻 */}
      {attendance?.check_in_time && attendance?.check_out_time && (
        <p className="text-sm text-gray-500">
          入室 {attendance.check_in_time.slice(0, 5)} 〜 退室 {attendance.check_out_time.slice(0, 5)}
        </p>
      )}

      {!attendance && (
        <p className="text-sm text-gray-400 text-center py-6">この日の出席記録がありません</p>
      )}

      {/* 日々の記録 */}
      {attendance && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-indigo-500" />
                日々の記録
              </CardTitle>
              <Link
                href={`/records/${childId}?date=${date}&unit=${attendance.unit_id}`}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                編集
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {dailyRecords.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-3">記録がありません</p>
            ) : (
              <div className="space-y-3">
                {dailyRecords.map((r) => (
                  <div key={r.id} className={`rounded-lg p-3 text-sm ${r.has_notable_flag ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
                    {r.has_notable_flag && (
                      <span className="inline-block text-xs font-medium text-yellow-700 bg-yellow-100 rounded px-1.5 py-0.5 mb-1">特記事項</span>
                    )}
                    <p className="text-gray-800 whitespace-pre-wrap">{r.content}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 連絡帳 */}
      {attendance && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-500" />
                連絡帳
              </CardTitle>
              {contactNote && (
                <Link
                  href={`/contact-notes/${contactNote.id}`}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  編集
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!contactNote ? (
              <p className="text-sm text-gray-400 text-center py-3">連絡帳がありません</p>
            ) : (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">スタッフより</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{contactNote.content}</p>
                </div>
                {contactNote.parent_comment && (
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                    <p className="text-xs text-blue-600 mb-1 flex items-center gap-1">
                      <MessageCircle className="h-3.5 w-3.5" />
                      保護者コメント
                    </p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{contactNote.parent_comment}</p>
                  </div>
                )}
                {!contactNote.published_at && (
                  <p className="text-xs text-amber-600">※ 未公開（保護者には未表示）</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
