/**
 * 国保連請求の月初自動化：上限管理の FAX チェック。Claude Code のルーティンが毎朝呼ぶ。
 *
 *   読んだことのある FAX の一覧 : npx tsx scripts/fax-check.ts processed [YYYYMM]
 *   いまの状況を見る（送らない）: npx tsx scripts/fax-check.ts status [YYYYMM]
 *   読み取り結果を記録して知らせる: npx tsx scripts/fax-check.ts record <読み取り結果.json> [--dry-run]
 *
 * 月を省くと前月。record の JSON は src/lib/billing/fax-arrivals.ts の FaxRunInput。
 * record は、記録したあと次の順に請求担当（設定 → 国保連請求の月初お知らせ）へ LINE で送る。
 *   1. 違和感（まだ送っていないものだけ）
 *   2. 全員分そろった（月に1回だけ）
 *   3. 8日以降で未着が残っている（月に1回だけ）
 * --dry-run は何も書き込まず、送るはずの本文を表示する。
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  faxCompleteNotice,
  faxConcernNotice,
  faxMissingNotice,
  loadArrivalStatus,
  prepareFaxRun,
  saveFaxRun,
  type Concern,
  type FaxRunInput,
} from '../src/lib/billing/fax-arrivals'
import { previousYearMonthJST } from '../src/lib/billing/month-start'

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

const LINE_PUSH_API = 'https://api.line.me/v2/bot/message/push'
const PRODUCTION_URL = 'https://houkago-day-service-app-kotti.vercel.app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)
const client = supabase as unknown as Parameters<typeof loadArrivalStatus>[0]

/** JST の今日の日付（1〜31） */
const todayJST = () => new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDate()

async function alreadySent(yearMonth: string, kind: string): Promise<boolean> {
  const { data } = await supabase
    .from('billing_month_notices')
    .select('id')
    .eq('year_month', yearMonth)
    .eq('kind', kind)
    .maybeSingle()
  return !!data
}

/** 請求担当へ送る。dry-run なら表示だけ */
async function notify(yearMonth: string, kind: string, text: string, dryRun: boolean): Promise<void> {
  console.log(`\n----- LINE（${kind}）${dryRun ? '※送りません' : ''} -----\n${text}`)
  if (dryRun) return

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN が未設定です')
  const { data: staff } = await supabase
    .from('staff_members')
    .select('name, line_user_id')
    .eq('receives_billing_notice', true)
  const recipients = ((staff ?? []) as { name: string; line_user_id: string | null }[]).filter((s) => s.line_user_id)
  if (recipients.length === 0) {
    console.log('請求担当が未設定のため送りませんでした（設定 → 国保連請求の月初お知らせ）')
    return
  }
  for (const s of recipients) {
    const res = await fetch(LINE_PUSH_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: s.line_user_id, messages: [{ type: 'text', text }] }),
    })
    console.log(`${s.name}: ${res.ok ? '送信しました' : `送信失敗 ${res.status}`}`)
  }
  await supabase.from('billing_month_notices').insert({ year_month: yearMonth, kind, message: text })
}

function printStatus(status: Awaited<ReturnType<typeof loadArrivalStatus>>) {
  console.log(`${status.yearMonth}: 待つ先 ${status.expected.length}件／届いた ${status.arrived.length}件／未着 ${status.missing.length}件`)
  for (const m of status.missing) {
    console.log(`  未着 ${m.officeName || m.officeNumber}（${m.formType === 'result' ? '結果票' : '一覧表'}）: ${m.childName}`)
  }
  for (const c of status.concerns) console.log(`  違和感 ${c.text}`)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const dryRun = rest.includes('--dry-run')
  const appUrl = PRODUCTION_URL

  if (command === 'processed') {
    const yearMonth = rest.find((a) => /^\d{6}$/.test(a)) ?? previousYearMonthJST()
    const { data } = await supabase.from('upper_limit_fax_files').select('fax_file').eq('year_month', yearMonth)
    for (const r of data ?? []) console.log(r.fax_file)
    return
  }

  if (command === 'status') {
    const yearMonth = rest.find((a) => /^\d{6}$/.test(a)) ?? previousYearMonthJST()
    printStatus(await loadArrivalStatus(client, yearMonth))
    return
  }

  if (command === 'record') {
    const file = rest.find((a) => !a.startsWith('--'))
    if (!file) throw new Error('読み取り結果の JSON を指定してください')
    const input = JSON.parse(readFileSync(file, 'utf8')) as FaxRunInput
    if (!/^\d{6}$/.test(input.yearMonth ?? '')) throw new Error('yearMonth（YYYYMM）がありません')

    const prepared = await prepareFaxRun(client, input)
    const runConcerns = prepared.concerns
    if (dryRun) {
      console.log(`（dry-run）FAX ${input.faxes.length}通・帳票の行 ${prepared.receipts.length}件を記録したつもりで状況を見ます。保存はしません`)
    } else {
      await saveFaxRun(client, prepared)
      console.log(`FAX ${input.faxes.length}通・帳票の行 ${prepared.receipts.length}件を記録しました`)
    }

    const status = await loadArrivalStatus(client, input.yearMonth, dryRun ? prepared.receipts : [])
    printStatus(status)

    // 1. 違和感：まだ送っていないものだけ。同じ内容は二度送らない
    const kindOf = (key: string) => `fax_concern:${createHash('sha1').update(key).digest('hex').slice(0, 12)}`
    const fresh: Concern[] = []
    for (const c of [...runConcerns, ...status.concerns]) {
      if (fresh.some((f) => f.key === c.key)) continue
      if (!(await alreadySent(input.yearMonth, kindOf(c.key)))) fresh.push(c)
    }
    if (fresh.length > 0) {
      const text = faxConcernNotice(input.yearMonth, fresh.map((c) => c.text))
      await notify(input.yearMonth, 'fax_concern', text, dryRun)
      if (!dryRun) {
        // 1件ずつ控えを残し、翌朝に同じ違和感を送らないようにする
        await supabase.from('billing_month_notices').upsert(
          fresh.map((c) => ({ year_month: input.yearMonth, kind: kindOf(c.key), message: c.text })),
          { onConflict: 'year_month,kind' },
        )
      }
    }

    // 2. 全員分そろった
    if (status.expected.length > 0 && status.missing.length === 0 && !(await alreadySent(input.yearMonth, 'fax_complete'))) {
      await notify(input.yearMonth, 'fax_complete', faxCompleteNotice(status, appUrl), dryRun)
    }

    // 3. 8日以降で未着が残っている
    if (todayJST() >= 8 && status.missing.length > 0 && !(await alreadySent(input.yearMonth, 'fax_missing'))) {
      await notify(input.yearMonth, 'fax_missing', faxMissingNotice(status, appUrl), dryRun)
    }
    return
  }

  console.error('使い方: npx tsx scripts/fax-check.ts processed|status [YYYYMM] ／ record <json> [--dry-run]')
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
