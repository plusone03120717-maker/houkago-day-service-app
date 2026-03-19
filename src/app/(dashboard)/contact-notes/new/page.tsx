import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NewContactNoteForm } from '@/components/contact-notes/new-contact-note-form'

type Child = { id: string; name: string; name_kana: string | null }
type Unit = { id: string; name: string }
type AttendedChild = {
  child_id: string
  unit_id: string
  children: Child | null
  units: Unit | null
}

export default async function NewContactNotePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; childId?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const targetDate = params.date ?? new Date().toISOString().slice(0, 10)

  // 当日の出席児童一覧
  const { data: attendedRaw } = await supabase
    .from('daily_attendance')
    .select('child_id, unit_id, children(id, name, name_kana), units(id, name)')
    .eq('date', targetDate)
    .eq('status', 'attended')
  const attended = (attendedRaw ?? []) as unknown as AttendedChild[]

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href={`/contact-notes?date=${targetDate}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">連絡帳を作成</h1>
          <p className="text-sm text-gray-500">{targetDate}</p>
        </div>
      </div>

      <NewContactNoteForm
        date={targetDate}
        attended={attended}
        defaultChildId={params.childId}
        staffId={user?.id ?? ''}
      />
    </div>
  )
}
