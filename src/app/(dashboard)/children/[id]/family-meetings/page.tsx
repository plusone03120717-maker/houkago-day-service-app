import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FamilyMeetingsList } from '@/components/children/family-meetings-list'

type Meeting = {
  id: string
  meeting_date: string
  attendees: string | null
  content: string
  created_at: string
}

export default async function FamilyMeetingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: childRaw } = await supabase
    .from('children')
    .select('id, name')
    .eq('id', id)
    .single()
  if (!childRaw) notFound()
  const child = childRaw as { id: string; name: string }

  const { data: meetingsRaw } = await supabase
    .from('family_meetings')
    .select('id, meeting_date, attendees, content, created_at')
    .eq('child_id', id)
    .order('meeting_date', { ascending: false })
  const meetings = (meetingsRaw ?? []) as unknown as Meeting[]

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/children/${id}`} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{child.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">家族支援会議</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-500" />
            会議記録一覧
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FamilyMeetingsList childId={id} initialMeetings={meetings} />
        </CardContent>
      </Card>
    </div>
  )
}
