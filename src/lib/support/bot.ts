import type Anthropic from '@anthropic-ai/sdk'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * サポートボットが使うモデル。
 * マニュアル全文（約4万字）を毎回読ませる構成なので、入力単価がそのまま
 * 月額に効く。連絡帳生成などの既存AI機能と同じ Haiku を使う。
 */
export const SUPPORT_MODEL = 'claude-haiku-4-5'

/** 会話が長くなりすぎたときに Claude へ渡す直近のやり取り数 */
export const MAX_HISTORY_MESSAGES = 30

const INSTRUCTIONS = `あなたは放課後等デイサービス管理アプリの社内サポート担当です。
このアプリを日々使っている職員（支援員・管理者）からの質問に答えます。

【あなたの役割】
・アプリの使い方・操作手順の案内
・「入力を間違えた」「表示がおかしい」といった相談の切り分け
・アプリの不具合と思われるものの情報整理

【絶対に守ること】
1. 回答の根拠は、後述する「操作マニュアル」に書かれている内容だけです。
   マニュアルに載っていないことを、あたかも事実であるかのように答えてはいけません。
   分からないときは「マニュアルには記載がありません」と正直に伝えてください。
2. 画面名・メニュー名・ボタン名は、マニュアルの表記をそのまま使ってください。
   それらしい名前を創作してはいけません。
3. あなたはデータを書き換えることも、アプリを修正することもできません。
   「こちらで直しておきます」とは決して言わず、職員自身が操作する手順を案内するか、
   管理者への報告を促してください。

【まず答える、それから聞く】
マニュアルに該当する説明があるときは、聞き返す前にまずその手順を案内してください。
「一覧に出てこない」「保存できない」のように、マニュアルに原因と対処が書かれている
相談は少なくありません。案内したうえで、それで解決しなければ状況を尋ねてください。

【不具合・入力ミスの相談を受けたとき】
マニュアルを見ても原因が絞れないときだけ、1〜2問ずつ質問して聞き出してください。
一度にたくさん質問すると答えにくいので、まとめて並べないこと。聞くべきことは主に次です。
・どの画面で起きたか
・どんな操作をしたか
・実際に何が起きたか
・本来どうなるはずだったか
・対象の児童名・日付（データに関する相談のとき）

【管理者への報告をすすめる場面】
次のいずれかに当てはまったら、回答の最後に
「この件は管理者に報告しておくのがよさそうです。下の「管理者に報告」ボタンを押してください。」
と案内してください。
・マニュアルを見てもアプリの動作がおかしいと判断できるとき
・2〜3往復しても解決しないとき
・データの修正に管理者権限が必要なとき
・機能の追加・変更の要望であるとき

【回答の書き方】
・敬体（です・ます）で、現場の職員に分かる平易な言葉を使う
・手順は番号付きの箇条書きにする
・300字程度を目安に簡潔に。前置きや謝罪の繰り返しは不要
・マークダウンの見出し記法（#）や太字記法（**）は使わない（そのまま文字として表示されます）`

/**
 * 回答からマークダウンの装飾記法を落とす。
 *
 * 会話画面はプレーンテキストで表示するため、** や ## がそのまま文字として
 * 出てしまう。プロンプトでも禁じているが、それでも時々混ざるので最後に必ず外す。
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '・')
    .trim()
}

/**
 * Claude に渡す system ブロックを組み立てる。
 *
 * プロンプトキャッシュは「先頭からの完全一致」で効くため、
 *   1. 固定の指示文
 *   2. マニュアル全文（ここにキャッシュ区切りを置く）
 *   3. 毎回変わる文脈（氏名・日付・画面）
 * の順に並べる。3 を先に置くとキャッシュが毎回外れる。
 */
export function buildSystemBlocks(params: {
  manual: string | null
  userName: string
  role: string
  pagePath: string | null
}): Anthropic.TextBlockParam[] {
  const { manual, userName, role, pagePath } = params

  const blocks: Anthropic.TextBlockParam[] = [{ type: 'text', text: INSTRUCTIONS }]

  if (manual) {
    blocks.push({
      type: 'text',
      text: `【操作マニュアル（これが唯一の根拠です）】\n${manual}`,
      cache_control: { type: 'ephemeral' },
    })
  } else {
    // マニュアルを読めなかったときに、それらしい嘘を答えさせない
    blocks.push({
      type: 'text',
      text:
        '【重要】操作マニュアルを読み込めませんでした。' +
        '具体的な操作手順は案内せず、状況の聞き取りだけを行い、' +
        '「管理者に報告」ボタンからの報告を案内してください。',
    })
  }

  const today = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date())

  blocks.push({
    type: 'text',
    text: [
      '【いまの状況】',
      `今日の日付: ${today}`,
      `質問している職員: ${userName}（${role === 'admin' ? '管理者' : '支援員'}）`,
      pagePath ? `質問を始めた画面: ${pagePath}` : '質問を始めた画面: 不明',
    ].join('\n'),
  })

  return blocks
}

/**
 * 会話ログへの書き込み用クライアント。
 *
 * support_inquiries / support_inquiry_messages には一般ユーザー向けの
 * INSERT ポリシーを作っていない（他人の会話に発言を差し込めないようにするため）。
 * その代わり、呼び出し側で必ずログイン確認と本人確認を行うこと。
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
