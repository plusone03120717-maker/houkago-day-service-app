/**
 * 日誌から見たスタッフ対応の月次調査（毎月15日の定期タスクで使う）。
 *
 *   node scripts/diary-staff-review.mjs --from 2026-10-19 --to 2026-11-14
 *
 * 期間の日誌（日常記録・特記事項・活動のメモ）、ヒヤリハット・事故報告、数字の集計を
 * 子どもごとに並べた Markdown にして、Temp/claude/houkago-diary-review/ に書き出す。
 * 前の期間の日付で、--from 以降に後から書かれた日誌も「後から書かれた日誌」として出す。
 * 読むだけで、データは一切書き換えない。子どもの記録を含むので vault には書き出さない。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const FROM = arg('--from')
const TO = arg('--to')
if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(TO ?? '')) {
  console.error('使い方: node scripts/diary-staff-review.mjs --from YYYY-MM-DD --to YYYY-MM-DD')
  process.exit(1)
}

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

// JST の "MM-DD HH:MM"
const jst = (t) => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ')
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0)
// 日誌の文がこの日に書かれたとみなす基準（利用日の18時 JST）からの遅れ（時間）
const lagHours = (date, createdAt) => (new Date(createdAt) - new Date(`${date}T18:00:00+09:00`)) / 3600e3
// 英会話・プログラミングの教室は放デイの日誌の対象外
const NON_DIARY_UNITS = /英会話|プログラミング/

const [units, children, users, programs] = await Promise.all([
  all('units', 'select=id,name'),
  all('children', 'select=id,name,name_kana,grade'),
  all('users', 'select=id,name'),
  all('activity_programs', 'select=id,name'),
])
const unitName = Object.fromEntries(units.map((u) => [u.id, u.name]))
const child = Object.fromEntries(children.map((c) => [c.id, c]))
const userName = Object.fromEntries(users.map((u) => [u.id, u.name]))
const programName = Object.fromEntries(programs.map((p) => [p.id, p.name]))

// 期間の出席と、前の期間の日付で後から書かれた日誌のための出席
const att = await all('daily_attendance', `select=id,child_id,unit_id,date,status,absence_reason&date=gte.${FROM}&date=lte.${TO}`)
const fromJst = new Date(`${FROM}T00:00:00+09:00`).toISOString()
const lateRecords = await all('daily_records', `select=*&created_at=gte.${fromJst}`)
const attIds = new Set(att.map((a) => a.id))
const lateAttIds = [...new Set(lateRecords.map((r) => r.attendance_id).filter((id) => !attIds.has(id)))]
const lateAtt = lateAttIds.length
  ? (await Promise.all(
      Array.from({ length: Math.ceil(lateAttIds.length / 100) }, (_, i) =>
        all('daily_attendance', `select=id,child_id,unit_id,date,status&id=in.(${lateAttIds.slice(i * 100, i * 100 + 100).join(',')})`)
      )
    )).flat().filter((a) => a.date < FROM)
  : []
const attById = Object.fromEntries([...att, ...lateAtt].map((a) => [a.id, a]))

const ids = att.map((a) => a.id)
const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100))
const records = (await Promise.all(chunks.map((c) => all('daily_records', `select=*&attendance_id=in.(${c.join(',')})`)))).flat()
const activities = (await Promise.all(chunks.map((c) => all('daily_activities', `select=*&attendance_id=in.(${c.join(',')})`)))).flat()
const incidents = await all('incident_reports', `select=*&report_date=gte.${FROM}&report_date=lte.${TO}&order=report_date`)
const lateIncidents = (await all('incident_reports', `select=*&created_at=gte.${fromJst}`)).filter((x) => x.report_date < FROM)

// ---------- 数字 ----------
const diaryAtt = att.filter((a) => a.status === 'attended' && !NON_DIARY_UNITS.test(unitName[a.unit_id] ?? ''))
const hasDaily = new Set(records.filter((r) => r.record_type === 'daily_record').map((r) => r.attendance_id))
const missing = diaryAtt.filter((a) => !hasDaily.has(a.id))
const daily = records.filter((r) => r.record_type === 'daily_record')
const notable = records.filter((r) => r.record_type === 'notable')
const byWriter = {}
for (const r of records) {
  const k = userName[r.created_by] ?? '(記録者なし)'
  byWriter[k] ??= { n: 0, notable: 0, lag: [] }
  byWriter[k].n++
  if (r.record_type === 'notable') byWriter[k].notable++
  byWriter[k].lag.push(lagHours(attById[r.attendance_id].date, r.created_at))
}
const absent = att.filter((a) => a.status === 'absent' && !NON_DIARY_UNITS.test(unitName[a.unit_id] ?? ''))

let md = `# 日誌の月次調査データ（${FROM}〜${TO}）\n\n`
md += `作成：${jst(new Date().toISOString())}（JST）。読むだけで作った。子どもの記録を含むので vault に貼り付けない。\n\n`
md += `## 数字\n`
md += `- 出席（放デイ・児発。英会話・プログラミングは除く）：${diaryAtt.length} 回、日常記録あり ${diaryAtt.length - missing.length} 回、なし ${missing.length} 回\n`
md += `- 日誌 ${records.length} 件（日常記録 ${daily.length}・特記事項 ${notable.length}）、「支援計画との照合」あり ${daily.filter((r) => r.content.includes('支援計画との照合')).length} / ${daily.length}\n`
md += `- 欠席 ${absent.length} 回（欠席理由が空 ${absent.filter((a) => !a.absence_reason).length} 回）\n`
md += `- ヒヤリハット・事故報告 ${incidents.length} 件（うちヒヤリハット ${incidents.filter((x) => x.incident_type === 'near_miss').length} 件・対応中のまま ${incidents.filter((x) => x.status === 'open').length} 件）\n\n`
md += `| 記録者 | 件数 | 特記 | 書いた時刻の遅れ（中央値・時間） | 48時間超 |\n|---|---|---|---|---|\n`
for (const [k, b] of Object.entries(byWriter).sort((x, y) => y[1].n - x[1].n)) {
  md += `| ${k} | ${b.n} | ${b.notable} | ${Math.round(median(b.lag))} | ${b.lag.filter((x) => x > 48).length} |\n`
}
md += `\n（遅れは利用日の18時からの時間。児発の午前の日誌はマイナスになる。「成瀬佑一」は経営者2人の共用アカウント）\n\n`
if (missing.length) {
  md += `### 日常記録がない出席\n`
  for (const a of missing.sort((x, y) => x.date.localeCompare(y.date))) md += `- ${a.date} ${unitName[a.unit_id]} ${child[a.child_id]?.name}\n`
  md += '\n'
}

// ---------- 事故報告 ----------
const incidentText = (x) =>
  `- ${x.report_date} ${child[x.child_id]?.name ?? '(児童なし)'}｜種類 ${x.incident_type}・程度 ${x.severity}・${x.status}｜場所 ${x.location ?? ''}｜記録者 ${userName[x.created_by] ?? '(なし)'}・${jst(x.created_at)}\n` +
  `  - 内容：${x.description}\n  - すぐの対応：${x.immediate_response ?? ''}\n  - 原因：${x.root_cause ?? ''}\n  - 再発防止：${x.preventive_measures ?? ''}\n` +
  `  - 保護者へ報告 ${x.reported_to_family ? 'あり' : 'なし'}・市町村へ ${x.reported_to_municipality ? 'あり' : 'なし'}・フォロー ${x.follow_up_required ? '要' : '不要'} ${x.follow_up_notes ?? ''}\n`
md += `## ヒヤリハット・事故報告（期間内）\n${incidents.length ? incidents.map(incidentText).join('') : '- なし\n'}\n`
if (lateIncidents.length) md += `### 前の期間の日付で、後から出た報告\n${lateIncidents.map(incidentText).join('')}\n`

// ---------- 子どもごとの日誌 ----------
const entryText = (r) => {
  const a = attById[r.attendance_id]
  const kind = r.record_type === 'notable' ? '特記' : '日'
  return `- ${a.date.slice(5)} [${kind}] ${userName[r.created_by] ?? '(記録者なし)'}・${jst(r.created_at)}：${r.content.replace(/\s+/g, ' ').trim()}\n`
}
const lateOnly = lateRecords.filter((r) => attById[r.attendance_id]?.date < FROM)
if (lateOnly.length) {
  md += `## 前の期間の日付で、後から書かれた日誌（${lateOnly.length}件）\n`
  for (const r of lateOnly.sort((x, y) => attById[x.attendance_id].date.localeCompare(attById[y.attendance_id].date))) {
    md += `- ${child[attById[r.attendance_id].child_id]?.name} ` + entryText(r).slice(2)
  }
  md += '\n'
}

const perChild = {}
for (const r of records) (perChild[attById[r.attendance_id].child_id] ??= []).push({ r })
for (const x of activities) {
  if (!x.evaluation_notes?.trim()) continue
  ;(perChild[attById[x.attendance_id].child_id] ??= []).push({ act: x })
}
md += `## 子どもごとの日誌\n（[日]＝日常記録、[特記]＝特記事項、[活動]＝活動のメモ。時刻は書いた時刻 JST）\n\n`
const order = Object.entries(perChild).sort((x, y) => y[1].length - x[1].length)
for (const [cid, items] of order) {
  const c = child[cid]
  md += `### ${c?.name ?? cid}（${c?.name_kana ?? ''}・${c?.grade ?? '学年なし'}・${items.filter((i) => i.r).length}件）\n`
  items.sort((x, y) => {
    const ax = attById[(x.r ?? x.act).attendance_id].date, ay = attById[(y.r ?? y.act).attendance_id].date
    return ax.localeCompare(ay) || (x.r ? 0 : 1) - (y.r ? 0 : 1)
  })
  for (const i of items) {
    if (i.r) md += entryText(i.r)
    else md += `- ${attById[i.act.attendance_id].date.slice(5)} [活動] ${programName[i.act.program_id] ?? ''}：${i.act.evaluation_notes.replace(/\s+/g, ' ').trim()}\n`
  }
  md += '\n'
}

const dir = join(tmpdir(), 'claude', 'houkago-diary-review')
mkdirSync(dir, { recursive: true })
const out = join(dir, `diary-review_${FROM}_${TO}.md`)
writeFileSync(out, md)
console.log(`書き出し：${out.replace(/\\/g, '/')}`)
console.log(`日誌 ${records.length} 件・事故報告 ${incidents.length} 件・後から書かれた日誌 ${lateOnly.length} 件・子ども ${order.length} 人・${md.length} 文字`)
