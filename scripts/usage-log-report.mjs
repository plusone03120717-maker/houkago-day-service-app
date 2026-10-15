/**
 * 利用ログの集計（毎週木曜の定期分析で使う）。
 *
 *   node scripts/usage-log-report.mjs            … 直近7日（比較用に前の7日も出す）
 *   node scripts/usage-log-report.mjs --days 14
 *
 * 画面の閲覧ログはアプリに無いので、保存された操作だけを集計する。
 * 読むだけで、データは一切書き換えない。結果は標準出力に Markdown で出す。
 */
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const daysArg = process.argv.indexOf('--days')
const DAYS = daysArg > 0 ? Number(process.argv[daysArg + 1]) : 7
const now = Date.now()
const since = new Date(now - DAYS * 86400e3).toISOString()
const prevSince = new Date(now - 2 * DAYS * 86400e3).toISOString()

async function all(table, query) {
  let out = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${table}?${query}`, { headers: { ...H, Range: `${from}-${from + 999}` } })
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`)
    const j = await r.json()
    out = out.concat(j)
    if (j.length < 1000) return out
  }
}

// JST の "YYYY-MM-DDTHH:MM"
const jst = (t) => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(0, 16)
// JST 正午は UTC でも同じ日付なので getUTCDay で曜日が取れる
const wd = (d) => '日月火水木金土'[new Date(`${d}T12:00:00+09:00`).getUTCDay()]
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n }

const [users, staff, rcl, dr, tr, ot, shifts, inquiries, msgs, findings, pac, notes, messages] = await Promise.all([
  all('users', 'select=id,name,role'),
  all('staff_members', 'select=id,name,user_id,line_user_id'),
  all('record_change_logs', `select=table_name,operation,changed_by,changed_at&changed_at=gte.${prevSince}&order=changed_at`),
  all('daily_records', `select=created_by,created_at,record_type,has_notable_flag&created_at=gte.${prevSince}`),
  all('time_records', `select=staff_member_id,type,recorded_at,edited_at&recorded_at=gte.${prevSince}`),
  all('overtime_requests', `select=staff_id,date,overtime_minutes,scheduled_end_time,actual_end_time,note,created_at&created_at=gte.${prevSince}`),
  all('staff_shifts', `select=staff_id,date&date=gte.${since.slice(0, 10)}`),
  all('support_inquiries', `select=id,created_by_name,page_path,status,category,title,created_at&created_at=gte.${since}&order=created_at`),
  all('support_inquiry_messages', `select=inquiry_id,role,content,created_at&created_at=gte.${since}&order=created_at`),
  all('anomaly_findings', 'select=rule,status,detected_at'),
  all('parent_attendance_contacts', `select=child_id,status,reported_at&reported_at=gte.${since}`),
  all('contact_notes', `select=id,parent_comment,created_at&created_at=gte.${since}`),
  all('messages', `select=id,created_at&created_at=gte.${since}`),
])
const authRes = await fetch(`${URL_}/auth/v1/admin/users?per_page=500`, { headers: H }).then((r) => r.json())

const userName = Object.fromEntries(users.map((u) => [u.id, u.name]))
const staffName = Object.fromEntries(staff.map((s) => [s.id, s.name]))
const name = (id) => (id ? userName[id] || `削除済み(${id.slice(0, 8)})` : '(システム)')
const cur = (t) => t >= since

const out = []
const p = (s = '') => out.push(s)
p(`# 利用ログ集計 ${jst(since).slice(0, 10)} 〜 ${jst(new Date(now).toISOString()).slice(0, 10)}（${DAYS}日・比較は前の${DAYS}日）`)

// --- 1. 人ごとの操作量（出席・送迎・予定の変更履歴） ---
p('\n## 1. 人ごとの操作量（変更履歴）')
p('| 人 | 今期 | 前期 | 操作した日 | 19時以降/7時前 | 土日 | 多いテーブル |')
p('|---|---|---|---|---|---|---|')
const actors = {}
for (const x of rcl) {
  const a = (actors[x.changed_by || ''] ??= { cur: 0, prev: 0, days: new Set(), late: 0, weekend: 0, tables: {} })
  if (!cur(x.changed_at)) { a.prev++; continue }
  a.cur++
  const j = jst(x.changed_at)
  a.days.add(j.slice(0, 10))
  const h = +j.slice(11, 13)
  if (h >= 19 || h < 7) a.late++
  if ('土日'.includes(wd(j.slice(0, 10)))) a.weekend++
  inc(a.tables, `${x.table_name}:${x.operation}`)
}
for (const [id, a] of Object.entries(actors).sort((p, q) => q[1].cur - p[1].cur)) {
  const top = Object.entries(a.tables).sort((p, q) => q[1] - p[1]).slice(0, 3).map((e) => e.join('=')).join(' ')
  p(`| ${name(id || null)} | ${a.cur} | ${a.prev} | ${a.days.size} | ${a.late} | ${a.weekend} | ${top} |`)
}

// --- 2. 打刻と操作時刻の突き合わせ（退勤後・打刻なしの日の操作） ---
p('\n## 2. 打刻と操作時刻の突き合わせ（ログインのある職員）')
p('| 人 | 日付 | 出勤 | 退勤 | 最初の操作 | 最後の操作 | 操作数 | 退勤後の操作 |')
p('|---|---|---|---|---|---|---|---|')
for (const s of staff.filter((s) => s.user_id)) {
  const days = {}
  for (const x of tr) {
    if (x.staff_member_id !== s.id || !cur(x.recorded_at)) continue
    const j = jst(x.recorded_at)
    ;(days[j.slice(0, 10)] ??= { acts: [] })[x.type] = j.slice(11, 16)
  }
  for (const x of rcl) {
    if (x.changed_by !== s.user_id || !cur(x.changed_at)) continue
    const j = jst(x.changed_at)
    ;(days[j.slice(0, 10)] ??= { acts: [] }).acts.push(j.slice(11, 16))
  }
  for (const x of dr) {
    if (x.created_by !== s.user_id || !cur(x.created_at)) continue
    const j = jst(x.created_at)
    ;(days[j.slice(0, 10)] ??= { acts: [] }).acts.push(j.slice(11, 16))
  }
  for (const [d, v] of Object.entries(days).sort()) {
    if (!v.acts.length) continue
    const a = v.acts.sort()
    const after = v.clock_out ? a.filter((t) => t > v.clock_out).length : '打刻なし'
    p(`| ${s.name} | ${d.slice(5)}(${wd(d)}) | ${v.clock_in || '-'} | ${v.clock_out || '-'} | ${a[0]} | ${a.at(-1)} | ${a.length} | ${after} |`)
  }
}

// --- 3. 日誌の書き手 ---
p('\n## 3. 日誌（daily_records）の書き手')
const drBy = {}
for (const x of dr) {
  const k = name(x.created_by)
  const b = (drBy[k] ??= { cur: 0, prev: 0, notable: 0 })
  if (cur(x.created_at)) { b.cur++; if (x.has_notable_flag) b.notable++ } else b.prev++
}
for (const [k, b] of Object.entries(drBy)) p(`- ${k}: 今期 ${b.cur}（特記 ${b.notable}）／前期 ${b.prev}`)

// --- 4. LINE 打刻・残業申請・シフト ---
p('\n## 4. LINE打刻・残業申請・シフト')
const trBy = {}
for (const x of tr) {
  const b = (trBy[staffName[x.staff_member_id] || x.staff_member_id] ??= { cur: 0, prev: 0, edited: 0, days: new Set() })
  if (cur(x.recorded_at)) { b.cur++; b.days.add(jst(x.recorded_at).slice(0, 10)); if (x.edited_at) b.edited++ } else b.prev++
}
for (const [k, b] of Object.entries(trBy)) p(`- 打刻 ${k}: 今期 ${b.cur}件・${b.days.size}日（修正 ${b.edited}）／前期 ${b.prev}`)
const lineStaffNoPunch = staff.filter((s) => s.line_user_id && !trBy[s.name]).map((s) => s.name)
p(`- LINE連携済みで打刻0の人: ${lineStaffNoPunch.join('、') || 'なし'}`)
for (const x of ot.filter((x) => cur(x.created_at))) {
  p(`- 残業申請 ${x.date} ${staffName[x.staff_id] || x.staff_id}: ${x.overtime_minutes}分（予定終業 ${x.scheduled_end_time || 'シフト無し'} → ${x.actual_end_time || '-'}）${x.note || ''}`)
}
const shiftBy = {}
for (const x of shifts) inc(shiftBy, name(x.staff_id))
p(`- 今期以降のシフト登録: ${Object.entries(shiftBy).map((e) => e.join(' ')).join('、') || '0件'}`)

// --- 5. ログイン ---
p('\n## 5. 最終ログイン')
for (const u of (authRes.users || []).sort((p, q) => (q.last_sign_in_at || '').localeCompare(p.last_sign_in_at || ''))) {
  const role = users.find((x) => x.id === u.id)?.role || '?'
  p(`- ${userName[u.id] || u.id.slice(0, 8)}（${role}）: ${u.last_sign_in_at ? jst(u.last_sign_in_at) : '一度もなし'}`)
}

// --- 6. サポートボット ---
p('\n## 6. サポートボットの会話（今期）')
if (!inquiries.length) p('- なし')
for (const i of inquiries) {
  p(`### ${jst(i.created_at)} ${i.created_by_name || '?'} ${i.page_path || ''} [${i.status}${i.category ? '/' + i.category : ''}] ${i.title || ''}`)
  for (const m of msgs.filter((m) => m.inquiry_id === i.id)) {
    p(`- ${m.role === 'user' ? '質問' : 'ボット'}: ${m.content.replace(/\s+/g, ' ').slice(0, m.role === 'user' ? 400 : 200)}`)
  }
}

// --- 7. 入力チェック・保護者側 ---
p('\n## 7. 入力チェック・保護者側')
const open = findings.filter((f) => f.status === 'open')
const openBy = {}
for (const f of open) inc(openBy, f.rule)
p(`- 入力チェック未対応: ${open.length}件（最古 ${open.map((f) => f.detected_at).sort()[0]?.slice(0, 10) || '-'}） ${JSON.stringify(openBy)}`)
p(`- 今期に新しく出た指摘: ${findings.filter((f) => cur(f.detected_at)).length}件`)
const pacBy = {}
for (const x of pac) inc(pacBy, x.child_id.slice(0, 8))
p(`- 保護者の利用連絡（今期）: ${pac.length}件 児童別 ${JSON.stringify(pacBy)}`)
p(`- 連絡帳（今期）: ${notes.length}件（保護者コメントあり ${notes.filter((n) => n.parent_comment).length}）／メッセージ: ${messages.length}件`)

console.log(out.join('\n'))
