'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getStaffAccess } from '@/lib/require-admin'

/**
 * 辞めたスタッフ・使わなくなった車の扱い（2026-11-17 依頼主「作って」）。
 *
 * - 退職・使わない：日付を入れて、翌日から選ぶ欄・送迎のボタン・打刻の知らせから外す。記録は残る
 * - 削除：記録が1件もないとき（まちがえて登録したときなど）だけ。
 *   スタッフを消すとタイムカード・有給・残業の記録まで一緒に消え、送迎のドライバーも空になるため、
 *   記録があるときは消さずに「退職にしてください」と返す
 *
 * 変えられるのはシステム管理者だけ（施設長・スタッフは閲覧のみ・2026-11-12 依頼主）。
 */

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

async function canEdit(): Promise<boolean> {
  return (await getStaffAccess())?.canEditOperations ?? false
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type RetireResult = { ok: true } | { ok: false; message: string }

/** スタッフを退職にする（retiredAt を null にすると在籍に戻す） */
export async function setStaffRetired(memberId: string, retiredAt: string | null): Promise<RetireResult> {
  if (!(await canEdit())) return { ok: false, message: '変更できるのはシステム管理者だけです' }
  if (retiredAt !== null && !DATE_RE.test(retiredAt)) return { ok: false, message: '退職日の形がちがいます' }
  const { error } = await admin()
    .from('staff_members')
    .update({ retired_at: retiredAt, updated_at: new Date().toISOString() })
    .eq('id', memberId)
  if (error) return { ok: false, message: `保存できませんでした（${error.message}）` }
  revalidatePath('/settings/staff')
  revalidatePath(`/settings/staff/member/${memberId}`)
  return { ok: true }
}

/** 車を使わないにする（retiredAt を null にすると使用中に戻す） */
export async function setVehicleRetired(vehicleId: string, retiredAt: string | null): Promise<RetireResult> {
  if (!(await canEdit())) return { ok: false, message: '変更できるのはシステム管理者だけです' }
  if (retiredAt !== null && !DATE_RE.test(retiredAt)) return { ok: false, message: '日付の形がちがいます' }
  const { error } = await admin()
    .from('transport_vehicles')
    .update({ retired_at: retiredAt, updated_at: new Date().toISOString() })
    .eq('id', vehicleId)
  if (error) return { ok: false, message: `保存できませんでした（${error.message}）` }
  revalidatePath('/settings/vehicles')
  return { ok: true }
}

type Ref = { table: string; column: string; label: string }

/** スタッフを指している記録。消すとここが一緒に消える（CASCADE）か空になる（SET NULL） */
const STAFF_REFS: Ref[] = [
  { table: 'time_records', column: 'staff_member_id', label: 'タイムカード' },
  { table: 'time_record_corrections', column: 'staff_member_id', label: '打刻の修正' },
  { table: 'overtime_requests', column: 'staff_id', label: '残業の申請' },
  { table: 'paid_leave_grants', column: 'staff_id', label: '有給の付与' },
  { table: 'paid_leave_usages', column: 'staff_id', label: '有給の使用' },
  { table: 'staff_hourly_rates', column: 'staff_member_id', label: '時給' },
  { table: 'daily_attendance', column: 'pickup_driver_member_id', label: '送迎（迎え）' },
  { table: 'daily_attendance', column: 'dropoff_driver_member_id', label: '送迎（送り）' },
  { table: 'daily_attendance', column: 'daytime_pickup_driver_member_id', label: '送迎（日中一時の迎え）' },
  { table: 'daily_attendance', column: 'daytime_dropoff_driver_member_id', label: '送迎（日中一時の送り）' },
  { table: 'transport_schedules', column: 'driver_member_id', label: '送迎表' },
]

const VEHICLE_REFS: Ref[] = [
  { table: 'daily_attendance', column: 'pickup_vehicle_id', label: '送迎（迎え）' },
  { table: 'daily_attendance', column: 'dropoff_vehicle_id', label: '送迎（送り）' },
  { table: 'daily_attendance', column: 'daytime_pickup_vehicle_id', label: '送迎（日中一時の迎え）' },
  { table: 'daily_attendance', column: 'daytime_dropoff_vehicle_id', label: '送迎（日中一時の送り）' },
  { table: 'transport_schedules', column: 'vehicle_id', label: '送迎表' },
]

/** 記録の数を数える。数えられなかった表があれば null（消さない側に倒す） */
async function countRefs(refs: Ref[], id: string): Promise<{ label: string; count: number }[] | null> {
  const db = admin()
  const results = await Promise.all(
    refs.map(async (r) => {
      const { count, error } = await db.from(r.table).select('id', { count: 'exact', head: true }).eq(r.column, id)
      return error ? null : { label: r.label, count: count ?? 0 }
    })
  )
  if (results.some((r) => r === null)) return null
  const byLabel = new Map<string, number>()
  for (const r of results as { label: string; count: number }[]) {
    // 送迎（迎え・送り・日中一時）は1つにまとめて出す
    const label = r.label.startsWith('送迎（') ? '送迎' : r.label
    byLabel.set(label, (byLabel.get(label) ?? 0) + r.count)
  }
  return [...byLabel].filter(([, n]) => n > 0).map(([label, count]) => ({ label, count }))
}

/** 記録が1件もないスタッフだけ消す */
export async function deleteStaffMemberIfUnused(memberId: string): Promise<RetireResult> {
  if (!(await canEdit())) return { ok: false, message: '削除できるのはシステム管理者だけです' }
  const used = await countRefs(STAFF_REFS, memberId)
  if (used === null) return { ok: false, message: '記録があるかを確かめられなかったので、削除しませんでした' }
  if (used.length > 0) {
    return {
      ok: false,
      message: `記録があるので削除できません（${used.map((u) => `${u.label} ${u.count}件`).join('・')}）。辞めた人は「退職にする」を使ってください。記録は残ったまま、選ぶ欄から外れます`,
    }
  }
  const { error } = await admin().from('staff_members').delete().eq('id', memberId)
  if (error) return { ok: false, message: `削除できませんでした（${error.message}）` }
  revalidatePath('/settings/staff')
  return { ok: true }
}

/** 記録が1件もない車だけ消す */
export async function deleteVehicleIfUnused(vehicleId: string): Promise<RetireResult> {
  if (!(await canEdit())) return { ok: false, message: '削除できるのはシステム管理者だけです' }
  const used = await countRefs(VEHICLE_REFS, vehicleId)
  if (used === null) return { ok: false, message: '記録があるかを確かめられなかったので、削除しませんでした' }
  if (used.length > 0) {
    return {
      ok: false,
      message: `記録があるので削除できません（${used.map((u) => `${u.label} ${u.count}件`).join('・')}）。使わなくなった車は「使わない」にしてください。記録は残ったまま、選ぶ欄から外れます`,
    }
  }
  const { error } = await admin().from('transport_vehicles').delete().eq('id', vehicleId)
  if (error) return { ok: false, message: `削除できませんでした（${error.message}）` }
  revalidatePath('/settings/vehicles')
  return { ok: true }
}
