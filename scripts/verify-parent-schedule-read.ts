/**
 * 保護者が「施設で決まっている自分の子の利用予定」を読めるかを、
 * 実際に保護者としてログインした状態（RLSが効いた状態）で検証する。
 *
 *   npx tsx scripts/verify-parent-schedule-read.ts
 *
 * サービスロールで読めても意味がない。保護者ポータルは保護者のセッションで
 * 読むため、RLSポリシーが足りていないとカレンダーが空のままになる。
 *
 * 検証用の児童・予定・保護者アカウントをその場で作り、最後に必ず消す。
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { loadFacilitySchedule, saveUsageContacts } from '../src/lib/parent-usage-contact'
import {
  applyParentContact,
  PARENT_CONTACT_COLUMNS,
  type ParentContact,
} from '../src/lib/parent-contact-schedule'

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

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const CHILD_NAME = 'テスト 予定確認児（自動削除）'
const EMAIL = 'SCHEDCHK@parent.local'
const PASSWORD = 'schedule-check-1234'
/** 本番データに紛れないよう十分先の月で検証する */
const YEAR = 2027
const MONTH = 5

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

/** 連絡の現在値を読む（画面の文言は applied_at と approval_status で決まる） */
type ContactRow = ParentContact & { approval_status: 'pending' | 'approved' | 'rejected' }

async function readContact(childId: string, date: string): Promise<ContactRow | null> {
  const { data } = await admin
    .from('parent_attendance_contacts')
    .select(PARENT_CONTACT_COLUMNS + ', approval_status')
    .eq('child_id', childId)
    .eq('date', date)
    .maybeSingle()
  return (data as unknown as ContactRow) ?? null
}

async function cleanup() {
  const { data: child } = await admin
    .from('children')
    .select('id')
    .eq('name', CHILD_NAME)
    .maybeSingle()
  const childId = (child as { id: string } | null)?.id
  if (childId) {
    await admin.from('parent_attendance_contacts').delete().eq('child_id', childId)
    await admin.from('daily_attendance').delete().eq('child_id', childId)
    await admin.from('usage_reservations').delete().eq('child_id', childId)
    await admin.from('usage_plans').delete().eq('child_id', childId)
    await admin.from('children').delete().eq('id', childId)
  }
  const { data: user } = await admin.from('users').select('id').eq('email', EMAIL).maybeSingle()
  const userId = (user as { id: string } | null)?.id
  if (userId) {
    await admin.from('parent_children').delete().eq('user_id', userId)
    await admin.from('users').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId).catch(() => {})
  }
}

async function main() {
  await cleanup()

  try {
    // ── 準備 ──
    const { data: unitRow } = await admin.from('units').select('id').limit(1).maybeSingle()
    const unitId = (unitRow as { id: string }).id
    const { data: staffRow } = await admin
      .from('users')
      .select('id')
      .in('role', ['admin', 'staff'])
      .limit(1)
      .maybeSingle()
    const staffId = (staffRow as { id: string }).id

    const { data: childRow, error: childError } = await admin
      .from('children')
      .insert({
        name: CHILD_NAME,
        birth_date: '2018-04-01',
        gender: 'male',
        service_type: 'afterschool',
        notes: '※検証スクリプトが作成。自動で削除されます',
      })
      .select('id')
      .single()
    if (childError) throw new Error(`児童の作成に失敗: ${childError.message}`)
    const childId = (childRow as { id: string }).id
    await admin.from('children_units').upsert({ child_id: childId, unit_id: unitId })

    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: '検証用 保護者', role: 'parent' },
    })
    if (userError) throw new Error(`保護者アカウントの作成に失敗: ${userError.message}`)
    const userId = created.user.id
    await admin
      .from('users')
      .upsert({ id: userId, name: '検証用 保護者', email: EMAIL, role: 'parent' })
    await admin.from('parent_children').upsert({ user_id: userId, child_id: childId })

    // 2027-05: 事務所が入れた予定（5/20）、毎週火曜の利用計画、出席（5/4 火）、欠席（5/11 火）
    await admin.from('usage_reservations').insert({
      child_id: childId,
      unit_id: unitId,
      date: '2027-05-20',
      status: 'confirmed',
      requested_by: staffId,
      requested_at: new Date().toISOString(),
    })
    await admin.from('usage_plans').insert({
      child_id: childId,
      unit_id: unitId,
      day_of_week: [2], // 火曜
      start_date: '2027-05-01',
      end_date: null,
      is_active: true,
    })
    await admin.from('daily_attendance').insert([
      { child_id: childId, unit_id: unitId, date: '2027-05-04', status: 'attended', pickup_type: 'none' },
      { child_id: childId, unit_id: unitId, date: '2027-05-11', status: 'absent', pickup_type: 'none' },
    ])

    // ── 保護者としてログインする（ここからRLSが効く） ──
    const parent = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
    const { error: signInError } = await parent.auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD,
    })
    check('保護者としてログインできる', !signInError, signInError?.message)

    console.log('\n保護者のセッションで施設の予定を読む')
    const schedule = await loadFacilitySchedule(parent, [childId], YEAR, MONTH)
    const byDate = Object.fromEntries(schedule.map((s) => [s.date, s.kind]))

    check('予定が読める（空でない）', schedule.length > 0, schedule.length)
    check('事務所が入れた予定が見える', byDate['2027-05-20'] === 'planned', byDate['2027-05-20'])
    check('毎週の利用計画の日が見える（5/18 火）', byDate['2027-05-18'] === 'planned', byDate['2027-05-18'])
    check('出席した日が見える（5/4）', byDate['2027-05-04'] === 'attended', byDate['2027-05-04'])
    check('欠席の日が見える（5/11）', byDate['2027-05-11'] === 'absent', byDate['2027-05-11'])
    check('計画の無い曜日は出ない（5/6 木）', byDate['2027-05-06'] === undefined, byDate['2027-05-06'])

    console.log('\n他人の子の予定は読めない')
    const { data: others } = await parent
      .from('usage_reservations')
      .select('id')
      .neq('child_id', childId)
      .limit(1)
    check('自分の子以外の予定は返らない', (others ?? []).length === 0, others)

    console.log('\n保護者は予定を書き換えられない')
    const { error: writeError } = await parent
      .from('usage_reservations')
      .update({ status: 'cancelled' })
      .eq('child_id', childId)
      .eq('date', '2027-05-20')
      .select('id')
    const { data: after } = await admin
      .from('usage_reservations')
      .select('status')
      .eq('child_id', childId)
      .eq('date', '2027-05-20')
      .maybeSingle()
    check(
      '書き換えても反映されない（読み取り専用）',
      (after as { status: string } | null)?.status === 'confirmed',
      { writeError: writeError?.message, status: (after as { status: string } | null)?.status }
    )

    // ── 予定がある日にお休みを連絡したとき、保護者に何が見えるか ──
    // お休みの連絡は承認の対象外なので approval_status は pending のまま変わらない。
    // 「反映されたか」は applied_at で判断しないと、受理済みでも
    // 「確認中」と表示され続けてしまう（画面の文言はこの2つで決まる）
    console.log('\n予定がある日にお休みを連絡する')
    const ABSENT_DATE = '2027-05-18' // 火曜（利用計画のある日）
    {
      const saved = await saveUsageContacts(admin, ABSENT_DATE, [
        {
          childId,
          status: 'absent',
          serviceStartTime: null,
          serviceEndTime: null,
          transportType: 'none',
          pickupTime: null,
          dropoffTime: null,
          note: '検証スクリプト',
        },
      ])
      check('お休みの連絡を保存できる', !saved.error, saved.error)

      const before = await readContact(childId, ABSENT_DATE)
      check('反映前は applied_at が空（＝確認中と表示される）', before?.applied_at === null, before?.applied_at)
      check('お休みは承認待ちのまま', before?.approval_status === 'pending', before?.approval_status)

      // ヘッダーのベル（src/components/layout/pending-requests-badge.tsx）と同じ条件で数える。
      // お休みの連絡がここから漏れると、スタッフが気付かないまま予定が残り続ける
      const { data: belled } = await admin
        .from('parent_attendance_contacts')
        .select('id, date, status, service_type, children (name)')
        .eq('is_new', true)
        .eq('child_id', childId)
      const onBell = ((belled ?? []) as { date: string; status: string }[]).find(
        (r) => r.date === ABSENT_DATE
      )
      check('お知らせのベルに載る（未確認として数えられる）', !!onBell, belled)
      check('お休みとして載る', onBell?.status === 'absent', onBell?.status)

      const beforeSchedule = await loadFacilitySchedule(parent, [childId], YEAR, MONTH)
      check(
        '反映前は施設の予定が「利用予定」のまま',
        beforeSchedule.find((s) => s.date === ABSENT_DATE)?.kind === 'planned',
        beforeSchedule.find((s) => s.date === ABSENT_DATE)?.kind
      )

      // スタッフが「お休みとして反映」を押した状態
      const applied = await applyParentContact(admin, before!, staffId)
      check('欠席として反映できる', !applied.error, applied.error)

      const after = await readContact(childId, ABSENT_DATE)
      check(
        '反映後は applied_at が入る（＝お休みとして登録しましたと表示される）',
        after?.applied_at !== null,
        after?.applied_at
      )

      const afterSchedule = await loadFacilitySchedule(parent, [childId], YEAR, MONTH)
      check(
        '保護者にも「欠席」として見える',
        afterSchedule.find((s) => s.date === ABSENT_DATE)?.kind === 'absent',
        afterSchedule.find((s) => s.date === ABSENT_DATE)?.kind
      )
    }

    await parent.auth.signOut()
  } finally {
    console.log('\n後片付け中...')
    await cleanup()
    console.log('完了')
  }

  console.log(`\n結果: ${passed} 件成功 / ${failed} 件失敗`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
