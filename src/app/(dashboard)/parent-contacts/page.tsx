import { createClient } from '@/lib/supabase/server'
import { ParentContactsBoard } from '@/components/parent-contacts/parent-contacts-board'
import {
  attendanceToAssignment,
  type AttendanceAssignmentSource,
  type ServiceAssignment,
  type ServiceAssignmentType,
} from '@/lib/parent-contact-service'
import { loadTransportPlaces } from '@/lib/parent-usage-contact'
import type { AbsentHandling } from '@/lib/parent-contact-schedule'
import type { LocationType } from '@/lib/transport-place'

export default async function ParentContactsPage() {
  const supabase = await createClient()

  // 未確認の連絡のみを日付順に取得する
  const { data: unconfirmedRaw } = await supabase
    .from('parent_attendance_contacts')
    .select(
      'id, child_id, date, status, service_type, service_start_time, service_end_time, assigned_service_start_time, assigned_service_end_time, assigned_daytime_start_time, assigned_daytime_end_time, transport_type, pickup_location_type, pickup_address_id, dropoff_location_type, dropoff_address_id, note, reported_at, is_new, approval_status, applied_at, absent_handling, children (id, name)'
    )
    .eq('is_new', true)
    .order('date', { ascending: true })
    .order('reported_at', { ascending: false })

  type ContactRow = {
    id: string
    child_id: string
    date: string
    status: 'attending' | 'absent'
    service_type: ServiceAssignmentType
    service_start_time: string | null
    service_end_time: string | null
    assigned_service_start_time: string | null
    assigned_service_end_time: string | null
    assigned_daytime_start_time: string | null
    assigned_daytime_end_time: string | null
    transport_type: 'none' | 'pickup_only' | 'dropoff_only' | 'both'
    pickup_location_type: LocationType
    pickup_address_id: string | null
    dropoff_location_type: LocationType
    dropoff_address_id: string | null
    note: string | null
    reported_at: string
    is_new: boolean
    approval_status: 'pending' | 'approved' | 'rejected'
    applied_at: string | null
    /** キャンセル連絡をどう処理したか（欠席として記録 / 予定から削除）。null＝未処理 */
    absent_handling: AbsentHandling | null
    children: { id: string; name: string } | null
  }
  const unconfirmedContacts = (unconfirmedRaw ?? []) as unknown as ContactRow[]

  // その日の出席記録にすでに入っている予定を、承認画面の初期値にする。
  // これが無いと、スタッフが出席管理で入れた時刻を承認の拍子に
  // 保護者の希望で上書きしてしまう（@/lib/parent-contact-schedule）
  const days = [...new Set(unconfirmedContacts.map((c) => c.date))]
  const childIds = [...new Set(unconfirmedContacts.map((c) => c.child_id))]
  const { data: attendanceRaw } = days.length > 0
    ? await supabase
        .from('daily_attendance')
        .select(
          'child_id, date, basic_service, service_start_time, service_end_time, daytime_support, daytime_support_start_time, daytime_support_end_time'
        )
        .in('child_id', childIds)
        .in('date', days)
    : { data: [] }

  type AttendanceRow = AttendanceAssignmentSource & { child_id: string; date: string }
  const byChildDate = new Map<string, AttendanceRow>()
  for (const row of (attendanceRaw ?? []) as unknown as AttendanceRow[]) {
    byChildDate.set(`${row.child_id}|${row.date}`, row)
  }

  const initialAssignments: Record<string, ServiceAssignment> = {}
  for (const c of unconfirmedContacts) {
    const fromPlan = attendanceToAssignment(byChildDate.get(`${c.child_id}|${c.date}`))
    if (fromPlan) initialAssignments[c.id] = fromPlan
  }

  // 保護者が指定した行き先・帰り先を名前で出すための選択肢
  const transportPlaces = await loadTransportPlaces(supabase, childIds)

  return (
    <ParentContactsBoard
      unconfirmedContacts={unconfirmedContacts}
      initialAssignments={initialAssignments}
      transportPlaces={transportPlaces}
    />
  )
}
