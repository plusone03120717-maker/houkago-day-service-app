/**
 * 保護者の利用連絡 → 予定への反映を、テスト用児童を使って実際のDBで検証する。
 *
 *   npx tsx scripts/verify-parent-contact-sync.ts
 *
 * 画面から承認ボタンを押したときと同じ関数（src/lib/parent-contact-schedule.ts）を
 * そのまま呼ぶので、承認まわりの動作確認に使える。
 * テスト用児童（既定では「テスト 太郎」）の行だけを触り、最後に必ず後片付けする。
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  applyParentContact,
  revertParentContact,
  PARENT_CONTACT_COLUMNS,
  type ParentContact,
} from '../src/lib/parent-contact-schedule'
import {
  validateUsageContact,
  saveUsageContacts,
  loadTransportPlaces,
  validateTransportPlaces,
} from '../src/lib/parent-usage-contact'
import {
  resolveAssignment,
  defaultAssignment,
  validateAssignment,
  type ServiceAssignment,
  type ServiceAssignmentType,
} from '../src/lib/parent-contact-service'
import { buildRouteGroups } from '../src/lib/transport-route'

function loadEnv(path: string) {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const key = line.slice(0, i).trim()
    if (!process.env[key]) {
      process.env[key] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
}

loadEnv('.env.local')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const TEST_CHILD_NAME = process.env.TEST_CHILD_NAME ?? 'テスト 太郎'
/** 本番データに紛れないよう、十分先の日付で検証する */
const BASE_DATE = '2027-03-01'

let passed = 0
let failed = 0

function check(label: string, ok: boolean | undefined, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.log(`  ❌ ${label}`)
    if (detail !== undefined) console.log(`     ${JSON.stringify(detail)}`)
  }
}

function dateFor(offset: number): string {
  const d = new Date(BASE_DATE + 'T00:00:00')
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

type ContactSeed = {
  date: string
  status: 'attending' | 'absent'
  service_type?: ServiceAssignmentType
  service_start_time?: string | null
  service_end_time?: string | null
  transport_type?: 'none' | 'pickup_only' | 'dropoff_only' | 'both'
  pickup_location_type?: 'home' | 'school'
  dropoff_location_type?: 'home' | 'school'
}

async function seedContact(childId: string, seed: ContactSeed): Promise<ParentContact> {
  const { data, error } = await supabase
    .from('parent_attendance_contacts')
    .upsert(
      {
        child_id: childId,
        date: seed.date,
        status: seed.status,
        service_type: seed.service_type ?? 'regular',
        service_start_time: seed.service_start_time ?? null,
        service_end_time: seed.service_end_time ?? null,
        transport_type: seed.transport_type ?? 'none',
        pickup_time: null,
        dropoff_time: null,
        pickup_location_type: seed.pickup_location_type ?? 'home',
        dropoff_location_type: seed.dropoff_location_type ?? 'home',
        note: '検証スクリプトが作成',
        reported_via: 'line',
        reported_at: new Date().toISOString(),
        is_new: true,
        approval_status: 'pending',
        applied_at: null,
        applied_unit_id: null,
        applied_reservation_id: null,
      },
      { onConflict: 'child_id,date' }
    )
    .select(PARENT_CONTACT_COLUMNS)
    .single()
  if (error) throw new Error(`連絡の作成に失敗: ${error.message}`)
  return data as unknown as ParentContact
}

/** 児童・日付から連絡を読み直す */
async function reloadContact2(childId: string, date: string): Promise<ParentContact> {
  const { data } = await supabase
    .from('parent_attendance_contacts')
    .select(PARENT_CONTACT_COLUMNS)
    .eq('child_id', childId)
    .eq('date', date)
    .single()
  return data as unknown as ParentContact
}

/** 反映後の控えを読み直す（applied_* は apply の中で更新されるため） */
async function reloadContact(id: string): Promise<ParentContact> {
  const { data } = await supabase
    .from('parent_attendance_contacts')
    .select(PARENT_CONTACT_COLUMNS)
    .eq('id', id)
    .single()
  return data as unknown as ParentContact
}

async function getReservation(childId: string, date: string) {
  const { data } = await supabase
    .from('usage_reservations')
    .select('id, unit_id, status, requested_by, transport_type, pickup_time, dropoff_time, pickup_location_type, dropoff_location_type')
    .eq('child_id', childId)
    .eq('date', date)
    .maybeSingle()
  return data as {
    id: string
    unit_id: string
    status: string
    requested_by: string | null
    transport_type: string | null
    pickup_time: string | null
    dropoff_time: string | null
    pickup_location_type: string | null
    dropoff_location_type: string | null
  } | null
}

async function getAttendance(childId: string, date: string) {
  const { data } = await supabase
    .from('daily_attendance')
    .select(
      'id, unit_id, status, basic_service, service_start_time, service_end_time, daytime_support, daytime_support_start_time, daytime_support_end_time, pickup_type'
    )
    .eq('child_id', childId)
    .eq('date', date)
    .maybeSingle()
  return data as {
    id: string
    unit_id: string
    status: string
    service_start_time: string | null
    service_end_time: string | null
    basic_service: boolean
    daytime_support: boolean
    daytime_support_start_time: string | null
    daytime_support_end_time: string | null
    pickup_type: string
  } | null
}

/** その日のテストデータを消す */
async function cleanupDate(childId: string, date: string) {
  await supabase.from('daily_attendance').delete().eq('child_id', childId).eq('date', date)
  await supabase.from('usage_reservations').delete().eq('child_id', childId).eq('date', date)
  await supabase.from('parent_attendance_contacts').delete().eq('child_id', childId).eq('date', date)
}

async function main() {
  // ── 準備 ──
  const { data: childRaw } = await supabase
    .from('children')
    .select('id, name')
    .eq('name', TEST_CHILD_NAME)
    .maybeSingle()
  const child = childRaw as { id: string; name: string } | null
  if (!child) {
    console.error(`テスト用児童「${TEST_CHILD_NAME}」が見つかりません`)
    process.exit(1)
  }

  const { data: staffRaw } = await supabase
    .from('users')
    .select('id, name')
    .in('role', ['admin', 'staff'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const staff = staffRaw as { id: string; name: string } | null
  if (!staff) {
    console.error('スタッフユーザーが見つかりません')
    process.exit(1)
  }

  const { data: unitsRaw } = await supabase
    .from('children_units')
    .select('unit_id')
    .eq('child_id', child.id)
  const childUnitId = ((unitsRaw ?? []) as { unit_id: string }[])[0]?.unit_id
  if (!childUnitId) {
    console.error('テスト用児童にユニットが設定されていません')
    process.exit(1)
  }

  console.log(`児童: ${child.name} / 承認者: ${staff.name} / ユニット: ${childUnitId}\n`)

  const dates = Array.from({ length: 9 }, (_, i) => dateFor(i))
  for (const d of dates) await cleanupDate(child.id, d)

  try {
    // ── 1. 利用連絡を承認すると予定ができる ──
    console.log('1. 放デイの利用連絡を承認する')
    {
      const d = dates[0]
      const contact = await seedContact(child.id, {
        date: d,
        status: 'attending',
        service_start_time: '10:00',
        service_end_time: '16:00',
        transport_type: 'both',
        pickup_location_type: 'school',
      })
      const result = await applyParentContact(supabase, contact, staff.id)
      check('反映が成功する', !result.error, result.error)

      const res = await getReservation(child.id, d)
      check('利用予定ができる', res !== null)
      check('ステータスが confirmed', res?.status === 'confirmed', res?.status)
      check('requested_by が入る（出席管理から漏れない）', res?.requested_by === staff.id, res?.requested_by)
      check('送迎区分が反映される', res?.transport_type === 'both', res?.transport_type)
      // 送迎の時刻は保護者に聞いていない。割り振った利用時間から施設側で決まる
      check('迎えの時刻が利用開始から決まる', res?.pickup_time?.startsWith('10:00'), res?.pickup_time)
      check('送りの時刻が利用終了から決まる', res?.dropoff_time?.startsWith('16:00'), res?.dropoff_time)
      check('迎えに行く場所が反映される', res?.pickup_location_type === 'school', res?.pickup_location_type)
      check('送り届ける場所が反映される', res?.dropoff_location_type === 'home', res?.dropoff_location_type)

      const att = await getAttendance(child.id, d)
      check('出席記録が予定として下書きされる', att?.status === 'scheduled', att?.status)
      check('利用開始時刻が下書きされる', att?.service_start_time?.startsWith('10:00'), att?.service_start_time)
      check('利用終了時刻が下書きされる', att?.service_end_time?.startsWith('16:00'), att?.service_end_time)
      check('送迎区分が出席記録にも入る', att?.pickup_type === 'both', att?.pickup_type)

      const after = await reloadContact(contact.id)
      check('反映先が控えられる', after.applied_at !== null && after.applied_unit_id !== null)
      check('作成した予約IDが控えられる', after.applied_reservation_id === res?.id, after.applied_reservation_id)

      // ── 2. 取り消すと予定も消える ──
      console.log('\n2. 承認を取り消す')
      await revertParentContact(supabase, after)
      check('利用予定が消える', (await getReservation(child.id, d)) === null)
      check('下書きの出席記録も消える', (await getAttendance(child.id, d)) === null)
      const reverted = await reloadContact(contact.id)
      check('控えがクリアされる', reverted.applied_at === null && reverted.applied_reservation_id === null)
    }

    // ── 3. 日中一時（区分は承認時に施設が割り振る） ──
    console.log('\n3. 日中一時として割り振って承認する')
    {
      const d = dates[1]
      // 保護者は区分を送ってこない。希望時間だけの連絡を施設が日中一時に割り振る
      const contact = await seedContact(child.id, {
        date: d,
        status: 'attending',
        service_start_time: '09:00',
        service_end_time: '15:00',
      })
      check(
        '区分未指定の連絡は放デイとして読める',
        resolveAssignment(contact).serviceType === 'regular',
        resolveAssignment(contact).serviceType
      )

      const assignment = defaultAssignment(contact, 'daytime_support')
      check('日中一時に切り替えると希望時間が引き継がれる', assignment.daytimeStartTime === '09:00', assignment)
      check('放デイ側は空になる', assignment.serviceStartTime === null, assignment.serviceStartTime)

      await applyParentContact(supabase, contact, staff.id, assignment)
      const att = await getAttendance(child.id, d)
      check('日中一時フラグが立つ', att?.daytime_support === true, att?.daytime_support)
      check('日中一時の開始時刻に入る', att?.daytime_support_start_time?.startsWith('09:00'), att?.daytime_support_start_time)
      check('日中一時の終了時刻に入る', att?.daytime_support_end_time?.startsWith('15:00'), att?.daytime_support_end_time)
      check('放デイの提供は立てない', att?.basic_service === false, att?.basic_service)
      check('通常の利用時間は空のまま', att?.service_start_time === null, att?.service_start_time)

      const stored = await reloadContact(contact.id)
      check('割り振りが連絡にも残る', stored.service_type === 'daytime_support', stored.service_type)
      check(
        '取り消して承認し直しても同じ割り振りになる',
        resolveAssignment(stored).daytimeStartTime === '09:00',
        resolveAssignment(stored)
      )
    }

    // ── 4. 予定が無い日のお休み連絡 ──
    console.log('\n4. 予定が無い日のお休み連絡')
    {
      const d = dates[2]
      const contact = await seedContact(child.id, { date: d, status: 'absent' })
      const result = await applyParentContact(supabase, contact, staff.id)
      check('理由つきで反映を見送る', !!result.error, result.error)
      check('欠席記録は作らない', (await getAttendance(child.id, d)) === null)
    }

    // ── 5. 予定がある日のお休み連絡 ──
    console.log('\n5. 利用を承認した日にお休み連絡が来る')
    {
      const d = dates[3]
      const attending = await seedContact(child.id, { date: d, status: 'attending' })
      await applyParentContact(supabase, attending, staff.id)
      check('先に利用予定ができている', (await getReservation(child.id, d)) !== null)

      // 保護者が同じ日を「お休み」に変更して再送信した状態
      const absent = await seedContact(child.id, { date: d, status: 'absent' })
      const result = await applyParentContact(supabase, absent, staff.id)
      check('欠席として反映できる', !result.error, result.error)
      const att = await getAttendance(child.id, d)
      check('欠席として記録される', att?.status === 'absent', att?.status)
      check('利用予定は残る（欠席時対応加算のため）', (await getReservation(child.id, d)) !== null)
    }

    // ── 6. スタッフが入れた予定を承認しても、取り消しで消さない ──
    console.log('\n6. スタッフが自分で入れた予定がある日を承認する')
    {
      const d = dates[4]
      const { error: insertError } = await supabase.from('usage_reservations').insert({
        child_id: child.id,
        unit_id: childUnitId,
        date: d,
        status: 'confirmed',
        requested_by: staff.id,
        requested_at: new Date().toISOString(),
      })
      check('前提：スタッフの予約を作成できる', !insertError, insertError?.message)

      const contact = await seedContact(child.id, { date: d, status: 'attending', transport_type: 'pickup_only' })
      await applyParentContact(supabase, contact, staff.id)
      const after = await reloadContact(contact.id)
      check('新規作成ではないので予約IDは控えない', after.applied_reservation_id === null, after.applied_reservation_id)
      check('送迎希望は既存の予約に反映される', (await getReservation(child.id, d))?.transport_type === 'pickup_only')

      await revertParentContact(supabase, after)
      check('取り消してもスタッフの予約は残る', (await getReservation(child.id, d)) !== null)
    }

    // ── 7. スタッフが入力済みの時刻を上書きしない ──
    console.log('\n7. スタッフが入力済みの利用時間を上書きしない')
    {
      const d = dates[5]
      const { error: insertError } = await supabase.from('daily_attendance').insert({
        child_id: child.id,
        unit_id: childUnitId,
        date: d,
        status: 'scheduled',
        pickup_type: 'none',
        service_start_time: '11:00',
        service_end_time: null,
      })
      check('前提：スタッフの出席記録を作成できる', !insertError, insertError?.message)

      const contact = await seedContact(child.id, {
        date: d,
        status: 'attending',
        service_start_time: '10:00',
        service_end_time: '16:00',
      })
      await applyParentContact(supabase, contact, staff.id)
      const att = await getAttendance(child.id, d)
      check('入力済みの開始時刻は変わらない', att?.service_start_time?.startsWith('11:00'), att?.service_start_time)
      check('空欄だった終了時刻は埋まる', att?.service_end_time?.startsWith('16:00'), att?.service_end_time)
    }

    // ── 8. 再送信 → 再承認 → 取り消し ──
    console.log('\n8. 保護者が再送信した連絡を承認し直してから取り消す')
    {
      const d = dates[6]
      const first = await seedContact(child.id, { date: d, status: 'attending' })
      await applyParentContact(supabase, first, staff.id)
      const applied = await reloadContact(first.id)
      const createdId = applied.applied_reservation_id
      check('1回目の承認で予約が作られる', createdId !== null)

      // 保護者が同じ日を再送信（approval_status は pending に戻るが applied_* は残る）
      await supabase
        .from('parent_attendance_contacts')
        .update({ is_new: true, approval_status: 'pending', transport_type: 'both' })
        .eq('id', first.id)
      const resent = await reloadContact(first.id)

      await applyParentContact(supabase, resent, staff.id)
      const reapplied = await reloadContact(first.id)
      check(
        '再承認しても、作った予約IDの控えが消えない',
        reapplied.applied_reservation_id === createdId,
        { before: createdId, after: reapplied.applied_reservation_id }
      )

      await revertParentContact(supabase, reapplied)
      check('取り消すと予約が消える', (await getReservation(child.id, d)) === null)
    }

    // ── 9. キャンセル済みの予約しか無い日のお休み連絡 ──
    console.log('\n9. キャンセル済みの予約しか無い日のお休み連絡')
    {
      const d = dates[7]
      await supabase.from('usage_reservations').insert({
        child_id: child.id,
        unit_id: childUnitId,
        date: d,
        status: 'cancelled',
        requested_by: staff.id,
        requested_at: new Date().toISOString(),
      })
      const contact = await seedContact(child.id, { date: d, status: 'absent' })
      const result = await applyParentContact(supabase, contact, staff.id)
      check('理由つきで反映を見送る', !!result.error, result.error)
      check('欠席記録は作らない', (await getAttendance(child.id, d)) === null)
    }
    // ── 10. 保護者ポータルからの送信 → 承認まで通しで ──
    console.log('\n10. 保護者ポータルから送信した連絡を承認する')
    {
      const d = dates[0]
      await cleanupDate(child.id, d)

      const entries = [
        {
          childId: child.id,
          status: 'attending' as const,
          serviceStartTime: '10:00',
          serviceEndTime: '16:00',
          transportType: 'pickup_only' as const,
          pickupPlace: 'school',
          note: '検証スクリプトが作成',
        },
      ]

      check('入力チェックを通る', validateUsageContact(d, entries) === null, validateUsageContact(d, entries))
      check(
        '過去日は弾かれる',
        validateUsageContact('2020-01-01', entries) !== null
      )
      check(
        '開始より前の終了時刻は弾かれる',
        validateUsageContact(d, [{ ...entries[0], serviceStartTime: '16:00', serviceEndTime: '10:00' }]) !== null
      )

      const saved = await saveUsageContacts(supabase, d, entries)
      check('ポータルからの連絡を保存できる', !saved.error, saved.error)

      const { data: stored } = await supabase
        .from('parent_attendance_contacts')
        .select(PARENT_CONTACT_COLUMNS + ', reported_via, is_new, approval_status')
        .eq('child_id', child.id)
        .eq('date', d)
        .single()
      const contact = stored as unknown as ParentContact & {
        reported_via: string
        is_new: boolean
        approval_status: string
      }
      check('ポータル経由として記録される', contact.reported_via === 'portal', contact.reported_via)
      check('未確認・未承認で入る', contact.is_new && contact.approval_status === 'pending')

      const result = await applyParentContact(supabase, contact, staff.id)
      check('承認して予定に反映できる', !result.error, result.error)
      const res = await getReservation(child.id, d)
      check('送迎希望が予定に入る', res?.transport_type === 'pickup_only', res?.transport_type)
      check('迎えに行く場所が予定に入る', res?.pickup_location_type === 'school', res?.pickup_location_type)
      check('迎えの時刻は利用開始から決まる', res?.pickup_time?.startsWith('10:00'), res?.pickup_time)
      check('送りの時刻は入らない（帰りは保護者）', res?.dropoff_time === null, res?.dropoff_time)
    }

    // ── 11. 同じ日に放デイと日中一時の両方 ──
    console.log('\n11. 同じ日に放デイと日中一時の両方を割り振る')
    {
      const d = dates[8]
      await cleanupDate(child.id, d)

      // 学校休業日の想定。保護者は朝から夕方までの1件しか送らない
      const contact = await seedContact(child.id, {
        date: d,
        status: 'attending',
        service_start_time: '09:00',
        service_end_time: '18:00',
        transport_type: 'both',
      })

      const blank = defaultAssignment(contact, 'both')
      check(
        '切り替え時刻が無いと承認できない',
        validateAssignment(blank) !== null,
        validateAssignment(blank)
      )

      const overlapping: ServiceAssignment = {
        serviceType: 'both',
        daytimeStartTime: '09:00',
        daytimeEndTime: '15:00',
        serviceStartTime: '14:00',
        serviceEndTime: '18:00',
      }
      check(
        '時間が重なっていると承認できない',
        validateAssignment(overlapping)?.includes('重なって'),
        validateAssignment(overlapping)
      )

      const split: ServiceAssignment = {
        serviceType: 'both',
        daytimeStartTime: '09:00',
        daytimeEndTime: '14:00',
        serviceStartTime: '14:00',
        serviceEndTime: '18:00',
      }
      check('分けて入力すれば承認できる', validateAssignment(split) === null, validateAssignment(split))

      const applied = await applyParentContact(supabase, contact, staff.id, split)
      check('予定に反映できる', !applied.error, applied.error)

      const att = await getAttendance(child.id, d)
      check('放デイの提供が立つ', att?.basic_service === true, att?.basic_service)
      check('日中一時フラグも立つ', att?.daytime_support === true, att?.daytime_support)
      check('日中一時は午前に入る', att?.daytime_support_start_time?.startsWith('09:00'), att?.daytime_support_start_time)
      check('日中一時は14時で終わる', att?.daytime_support_end_time?.startsWith('14:00'), att?.daytime_support_end_time)
      check('放デイは14時から始まる', att?.service_start_time?.startsWith('14:00'), att?.service_start_time)
      check('放デイは18時で終わる', att?.service_end_time?.startsWith('18:00'), att?.service_end_time)

      // 送迎は1日2本のまま。行き・帰りの希望はそのまま予定に載る
      const res = await getReservation(child.id, d)
      check('送迎は行き帰りの1組だけ', res?.transport_type === 'both', res?.transport_type)
      // 通しで使う日は、行き＝いちばん早い開始・帰り＝いちばん遅い終了になる
      check('行きは日中一時の開始から決まる', res?.pickup_time?.startsWith('09:00'), res?.pickup_time)
      check('帰りは放デイの終了から決まる', res?.dropoff_time?.startsWith('18:00'), res?.dropoff_time)

      const stored = await reloadContact(contact.id)
      check('両方として控えられる', stored.service_type === 'both', stored.service_type)
      check(
        '割り振った時間も控えられる',
        resolveAssignment(stored).daytimeEndTime === '14:00' &&
          resolveAssignment(stored).serviceStartTime === '14:00',
        resolveAssignment(stored)
      )

      // ── 保護者が送り直すと、割り振りは白紙に戻る ──
      await saveUsageContacts(supabase, d, [
        {
          childId: child.id,
          status: 'attending',
          serviceStartTime: '10:00',
          serviceEndTime: '17:00',
          transportType: 'both',
          pickupPlace: 'home',
          dropoffPlace: 'home',
          note: '検証スクリプトが作成',
        },
      ])
      const resent = await reloadContact(contact.id)
      check('再送信しても区分は残る', resent.service_type === 'both', resent.service_type)
      check(
        '割り振った時間は消えて決め直しになる',
        validateAssignment(resolveAssignment(resent)) !== null,
        resolveAssignment(resent)
      )
    }
    // ── 12. 送迎の行き先・帰り先 ──
    console.log('\n12. 送迎の行き先・帰り先を保護者が指定する')
    {
      const d = dates[7]
      await cleanupDate(child.id, d)

      // 祖父母宅を1件だけ足して、選択肢に出るか・指定が予定まで届くかを見る
      const { data: addrRow } = await supabase
        .from('child_addresses')
        .insert({
          child_id: child.id,
          label: '検証用 祖父母宅',
          address: '東京都新宿区西新宿2-8-1',
          is_default: false,
          sort_order: 99,
        })
        .select('id')
        .single()
      const addressId = (addrRow as { id: string }).id

      try {
        const places = await loadTransportPlaces(supabase, [child.id])
        const own = places[0]
        check('選択肢が取れる', !!own && own.places.length > 0, own?.places)
        check(
          '登録した住所が選択肢に出る',
          own?.places.some((pl) => pl.value === `addr:${addressId}`),
          own?.places.map((pl) => pl.label)
        )

        const entry = {
          childId: child.id,
          status: 'attending' as const,
          serviceStartTime: '10:00',
          serviceEndTime: '16:00',
          transportType: 'both' as const,
          pickupPlace: own!.places[0].value,
          dropoffPlace: `addr:${addressId}`,
          note: '検証スクリプトが作成',
        }
        check('選択肢の場所は通る', validateTransportPlaces(places, [entry]) === null)
        check(
          '他人の住所IDは弾かれる',
          validateTransportPlaces(places, [
            { ...entry, dropoffPlace: 'addr:00000000-0000-0000-0000-000000000000' },
          ]) !== null
        )
        check(
          '形の違う値は入力チェックで弾かれる',
          validateUsageContact(d, [{ ...entry, pickupPlace: 'どこか' }]) !== null
        )

        const saved = await saveUsageContacts(supabase, d, [entry])
        check('場所つきで保存できる', !saved.error, saved.error)

        const stored = await reloadContact2(child.id, d)
        const { data: rawRow } = await supabase
          .from('parent_attendance_contacts')
          .select('pickup_time, dropoff_time')
          .eq('child_id', child.id)
          .eq('date', d)
          .single()
        const raw = rawRow as { pickup_time: string | null; dropoff_time: string | null }
        check('送迎の時刻は保存しない', raw.pickup_time === null && raw.dropoff_time === null, raw)
        check(
          '帰り先の住所が控えられる',
          stored.dropoff_address_id === addressId,
          stored.dropoff_address_id
        )

        await applyParentContact(supabase, stored, staff.id)
        const res = await getReservation(child.id, d)
        check('帰り先が予定にも入る', res?.dropoff_location_type === 'home', res?.dropoff_location_type)
        const { data: resRow } = await supabase
          .from('usage_reservations')
          .select('dropoff_address_id')
          .eq('child_id', child.id)
          .eq('date', d)
          .maybeSingle()
        check(
          '予定にも住所IDが入る',
          (resRow as { dropoff_address_id: string | null } | null)?.dropoff_address_id === addressId,
          resRow
        )

        // 送迎の便も、指定された住所のエリアでまとめる
        const routeChild = {
          child_id: child.id,
          children: {
            id: child.id,
            name: child.name,
            postal_code: null,
            address: '東京都千代田区丸の内1-1-1',
            school_id: null,
            schools: null,
          },
          pickup_location_type: 'home' as const,
          dropoff_location_type: 'home' as const,
          pickup_address: null,
          dropoff_address: '東京都新宿区西新宿2-8-1',
        }
        const pickupGroups = buildRouteGroups([routeChild], 'pickup')
        const dropoffGroups = buildRouteGroups([routeChild], 'dropoff')
        check('迎えは基本住所のエリアのまま', pickupGroups[0]?.label.includes('丸の内'), pickupGroups[0]?.label)
        check('送りは指定した住所のエリアになる', dropoffGroups[0]?.label.includes('西新宿'), dropoffGroups[0]?.label)
      } finally {
        await supabase.from('child_addresses').delete().eq('id', addressId)
      }
    }
  } finally {
    // ── 後片付け ──
    console.log('\n後片付け中...')
    for (const d of dates) await cleanupDate(child.id, d)
    console.log('完了')
  }

  console.log(`\n結果: ${passed} 件成功 / ${failed} 件失敗`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
