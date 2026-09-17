/**
 * LINEの保護者（guardians）と 保護者ポータルのアカウント（users）の結び付きを検証する。
 *
 *   npx tsx scripts/verify-parent-account-link.ts
 *
 * 検証用の児童・LINE保護者・ポータルアカウントをその場で作り、検証が終わったら必ず消す。
 * 既存の児童（「テスト 太郎」を含む）には一切触らない。
 * 実在の児童を使うと、その児童にすでに紐付いているLINE保護者まで
 * 結び付け対象になってしまい、検証にならないため。
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  linkGuardianToPortalAccount,
  linkPortalAccountToGuardians,
  linkChildrenToPortalAccount,
} from '../src/lib/parent-account-link'

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

/** 後片付けで確実に見分けられるよう、専用の名前を付ける */
const CHILD_NAME = 'テスト 検証長子（自動削除）'
const SIBLING_NAME = 'テスト 検証次子（自動削除）'
const TEST_EMAIL = 'VERIFY@parent.local'
const TEST_EMAIL2 = 'VERIFY2@parent.local'
const TEST_LINE_ID = 'U_verify_parent_account_link'

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

async function childIdsOf(userId: string): Promise<string[]> {
  const { data } = await supabase.from('parent_children').select('child_id').eq('user_id', userId)
  return ((data ?? []) as { child_id: string }[]).map((r) => r.child_id).sort()
}

async function guardianUserId(guardianId: string): Promise<string | null> {
  const { data } = await supabase.from('guardians').select('user_id').eq('id', guardianId).maybeSingle()
  return (data as { user_id: string | null } | null)?.user_id ?? null
}

/** 検証用に作ったものを、名前・メール・LINE IDを手がかりに消す */
async function cleanupAll() {
  for (const email of [TEST_EMAIL, TEST_EMAIL2]) {
    const { data } = await supabase.from('users').select('id').eq('email', email).maybeSingle()
    const id = (data as { id: string } | null)?.id
    if (!id) continue
    await supabase.from('parent_children').delete().eq('user_id', id)
    await supabase.from('users').delete().eq('id', id)
    await supabase.auth.admin.deleteUser(id).catch(() => {})
  }
  await supabase.from('guardians').delete().eq('line_user_id', TEST_LINE_ID)
  await supabase.from('children').delete().in('name', [CHILD_NAME, SIBLING_NAME])
}

/** 検証用の児童を作る */
async function createChild(name: string): Promise<string> {
  const { data, error } = await supabase
    .from('children')
    .insert({
      name,
      birth_date: '2018-04-01',
      gender: 'male',
      service_type: 'afterschool',
      notes: '※検証スクリプトが作成。自動で削除されます',
    })
    .select('id')
    .single()
  if (error) throw new Error(`検証用児童の作成に失敗: ${error.message}`)
  return (data as { id: string }).id
}

async function main() {
  // 前回の残骸があれば先に消す
  await cleanupAll()

  let userId: string | null = null
  let guardianId: string | null = null
  let siblingId: string | null = null
  let childId: string | null = null

  try {
    // ── 準備：児童2人・ポータルアカウント・LINE保護者を作る ──
    childId = await createChild(CHILD_NAME)
    siblingId = await createChild(SIBLING_NAME)
    const child = { id: childId }

    const { data: created, error: userError } = await supabase.auth.admin.createUser({
      email: TEST_EMAIL,
      password: 'verify-password-1234',
      email_confirm: true,
      user_metadata: { name: '検証用 保護者', role: 'parent' },
    })
    if (userError) throw new Error(`ポータルアカウントの作成に失敗: ${userError.message}`)
    userId = created.user.id
    await supabase
      .from('users')
      .upsert({ id: userId, name: '検証用 保護者', email: TEST_EMAIL, role: 'parent' })

    const { data: guardian, error: guardianError } = await supabase
      .from('guardians')
      .insert({ line_user_id: TEST_LINE_ID, name: '検証用 LINE保護者' })
      .select('id')
      .single()
    if (guardianError) throw new Error(`LINE保護者の作成に失敗: ${guardianError.message}`)
    guardianId = (guardian as { id: string }).id

    // ── 1. LINE → ポータル（登録コードを使ったとき） ──
    console.log('1. LINEで登録した保護者を、既存のポータルアカウントに結び付ける')
    {
      // 保護者はポータル側でテスト太郎が紐付いている状態
      await linkChildrenToPortalAccount(supabase, userId, [child.id])
      // LINE側でテスト太郎ときょうだいの2人を登録した状態
      await supabase.from('guardian_children').upsert([
        { guardian_id: guardianId, child_id: child.id },
        { guardian_id: guardianId, child_id: siblingId },
      ])

      const linked = await linkGuardianToPortalAccount(supabase, guardianId)
      check('ポータルアカウントが見つかる', linked === userId, { linked, userId })
      check('guardians.user_id が張られる', (await guardianUserId(guardianId)) === userId)

      const ids = await childIdsOf(userId)
      check(
        'LINEで登録したきょうだいもポータルから見えるようになる',
        ids.length === 2 && ids.includes(child.id) && ids.includes(siblingId!),
        ids
      )
    }

    // ── 2. すでに結び付いている場合に壊れないこと ──
    console.log('\n2. もう一度呼んでも結果が変わらない')
    {
      const linked = await linkGuardianToPortalAccount(supabase, guardianId)
      check('同じアカウントを返す', linked === userId, linked)
      const ids = await childIdsOf(userId)
      check('児童の紐付けが重複しない', ids.length === 2, ids)
    }

    // ── 3. ポータル → LINE（スタッフがアカウントを作ったとき） ──
    console.log('\n3. ポータルのアカウント作成から、LINE保護者を結び付ける')
    {
      // 結び付いていない状態に戻す
      await supabase.from('guardians').update({ user_id: null }).eq('id', guardianId)
      await supabase.from('parent_children').delete().eq('user_id', userId)
      await linkChildrenToPortalAccount(supabase, userId, [child.id])

      const count = await linkPortalAccountToGuardians(supabase, userId, child.id)
      check('LINE保護者が1人結び付く', count === 1, count)
      check('guardians.user_id が張られる', (await guardianUserId(guardianId)) === userId)

      const ids = await childIdsOf(userId)
      check(
        'LINE側のきょうだいも一緒に紐付く',
        ids.length === 2 && ids.includes(siblingId!),
        ids
      )
    }

    // ── 4. すでに別のアカウントを見ているLINE保護者は横取りしない ──
    console.log('\n4. 別のアカウントに結び付いているLINE保護者は触らない')
    {
      const { data: other, error: otherError } = await supabase.auth.admin.createUser({
        email: TEST_EMAIL2,
        password: 'verify-password-1234',
        email_confirm: true,
        user_metadata: { name: '検証用 保護者2', role: 'parent' },
      })
      if (otherError) throw new Error(`2つ目のアカウント作成に失敗: ${otherError.message}`)
      const otherId = other.user.id
      await supabase
        .from('users')
        .upsert({ id: otherId, name: '検証用 保護者2', email: TEST_EMAIL2, role: 'parent' })

      try {
        // guardian はすでに userId に結び付いている
        const count = await linkPortalAccountToGuardians(supabase, otherId, child.id)
        check('横取りしない（結び付け件数0）', count === 0, count)
        check('元の結び付きが残る', (await guardianUserId(guardianId)) === userId)
      } finally {
        await supabase.from('parent_children').delete().eq('user_id', otherId)
        await supabase.from('users').delete().eq('id', otherId)
        await supabase.auth.admin.deleteUser(otherId).catch(() => {})
      }
    }

    // ── 5. ポータルアカウントが無い児童では何も起きない ──
    console.log('\n5. ポータルアカウントが無ければ結び付けない')
    {
      await supabase.from('guardians').update({ user_id: null }).eq('id', guardianId)
      await supabase.from('parent_children').delete().eq('user_id', userId)

      const linked = await linkGuardianToPortalAccount(supabase, guardianId)
      check('null を返す', linked === null, linked)
      check('guardians.user_id は null のまま', (await guardianUserId(guardianId)) === null)
    }
  } finally {
    console.log('\n後片付け中...')
    await cleanupAll()
    console.log('完了')
  }

  console.log(`\n結果: ${passed} 件成功 / ${failed} 件失敗`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
