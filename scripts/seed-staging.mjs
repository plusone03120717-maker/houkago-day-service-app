/**
 * 試験環境（houkago-staging の Supabase）に、見本の名前のデータとログイン用のアカウントを入れる。
 *
 *   node scripts/seed-staging.mjs
 *
 * 値は .env.staging（Git に入れないファイル）から読む。本番の DB を指していたら止まる。
 * 何度動かしても同じ状態になる（あるものは作り直さない）。
 * ログインのメールアドレスとパスワードは .env.staging に書き足す（画面には出さない）。
 */
import { randomBytes } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const PRODUCTION_REF = 'hodlnaszbtlcfkhutbdv'
const STAGING_REF = 'rzspybadxbnjbkyzmsyl'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.join(root, '.env.staging')
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (url.includes(PRODUCTION_REF) || !url.includes(STAGING_REF)) {
  console.error('試験用の Supabase ではないので止めます:', url)
  process.exit(1)
}
const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const FACILITY_ID = 'b0000000-0000-0000-0000-000000000001'

async function must(label, promise) {
  const { data, error } = await promise
  if (error) {
    console.error(`${label} で失敗しました:`, error.message)
    process.exit(1)
  }
  return data
}

// ユニット
const UNITS = [
  { id: 'c0000000-0000-0000-0000-000000000001', name: '見本ユニットA', service_type: 'afterschool', unit_number: 1 },
  { id: 'c0000000-0000-0000-0000-000000000002', name: '見本ユニットB', service_type: 'afterschool', unit_number: 2 },
]
await must('ユニット', db.from('units').upsert(UNITS.map((u) => ({ ...u, facility_id: FACILITY_ID, capacity: 10 }))))

// 児童（見本の名前）
const CHILDREN = [
  ['青木 はな', 'あおき はな', 'female', '2016-05-10', 4],
  ['井上 ゆうと', 'いのうえ ゆうと', 'male', '2017-08-21', 3],
  ['上野 みお', 'うえの みお', 'female', '2015-02-03', 5],
  ['江口 そうた', 'えぐち そうた', 'male', '2018-11-30', 2],
  ['小川 りん', 'おがわ りん', 'female', '2014-07-14', 6],
  ['加藤 あおい', 'かとう あおい', 'female', '2016-12-01', 4],
].map(([name, kana, gender, birth, grade], i) => ({
  id: `d0000000-0000-0000-0000-00000000000${i + 1}`,
  name,
  name_kana: kana,
  gender,
  birth_date: birth,
  grade: `小${grade}`,
  school_name: '見本小学校',
  service_type: 'afterschool',
  is_active: true,
}))
await must('児童', db.from('children').upsert(CHILDREN))
await must(
  '児童とユニット',
  db.from('children_units').upsert(
    CHILDREN.map((c, i) => ({ child_id: c.id, unit_id: UNITS[i % 2].id })),
    { onConflict: 'child_id,unit_id' }
  )
)

// いつもの予定（月・水・金 14:30〜17:30、学校へお迎え・家へ送り）
for (const [i, c] of CHILDREN.entries()) {
  const planId = `e0000000-0000-0000-0000-00000000000${i + 1}`
  await must(
    'いつもの予定',
    db.from('usage_plans').upsert({
      id: planId,
      child_id: c.id,
      unit_id: UNITS[i % 2].id,
      start_date: '2026-11-01',
      is_active: true,
      transport_type: 'both',
      pickup_location_type: 'school',
      dropoff_location_type: 'home',
      service_start_time: '14:30',
      service_end_time: '17:30',
    })
  )
  const { data: existing } = await db.from('usage_plan_day_settings').select('id').eq('plan_id', planId)
  if (!existing?.length) {
    await must(
      '曜日ごとの予定',
      db.from('usage_plan_day_settings').insert(
        [1, 3, 5].map((dow) => ({
          plan_id: planId,
          day_of_week: dow,
          transport_type: 'both',
          pickup_location_type: 'school',
          dropoff_location_type: 'home',
          service_start_time: '14:30',
          service_end_time: '17:30',
        }))
      )
    )
  }
}

// ログイン用のアカウント（システム管理者・スタッフ）
const ACCOUNTS = [
  { key: 'ADMIN', email: 'staging-admin@example.com', name: '試験 管理者', role: 'admin' },
  { key: 'STAFF', email: 'staging-staff@example.com', name: '試験 スタッフ', role: 'staff' },
]
const { data: list } = await db.auth.admin.listUsers({ perPage: 200 })
for (const a of ACCOUNTS) {
  let user = list?.users.find((u) => u.email === a.email)
  if (!user) {
    const password = randomBytes(12).toString('base64url')
    const created = await must(
      `${a.name}のアカウント`,
      db.auth.admin.createUser({ email: a.email, password, email_confirm: true, user_metadata: { role: a.role } })
    )
    user = created.user
    appendFileSync(envFile, `STAGING_${a.key}_EMAIL=${a.email}\nSTAGING_${a.key}_PASSWORD=${password}\n`)
  }
  await must('職員の登録', db.from('users').upsert({ id: user.id, email: a.email, name: a.name, role: a.role }))
}

console.log(`試験用のデータを入れました（ユニット ${UNITS.length}・児童 ${CHILDREN.length}・アカウント ${ACCOUNTS.length}）`)
console.log('ログインのメールアドレスとパスワードは .env.staging にあります')
