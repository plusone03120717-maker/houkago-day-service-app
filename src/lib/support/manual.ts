import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * サポートボットの知識源。docs/manual.html をテキスト化して返す。
 *
 * マニュアルは 4万字ほどあり、これを毎リクエスト読み直すのは無駄なので
 * モジュールスコープにキャッシュする。Vercel の関数インスタンスが生きている
 * 間は再読み込みされない（デプロイのたびに新しいインスタンスになるので、
 * マニュアルを更新して push すれば自動的に反映される）。
 *
 * docs/ は public/ の外にあり、そのままでは関数バンドルに含まれない。
 * next.config.ts の outputFileTracingIncludes で明示的に同梱している。
 */
let cache: string | null = null

const DOCS_DIRS = [
  path.join(process.cwd(), 'docs'),
  // Vercel でトレースの基準がずれた場合の保険
  path.join(process.cwd(), '..', 'docs'),
]

/**
 * docs/ 配下のファイルをそのまま読む。見つからなければ null。
 *
 * マニュアルを画面に出す /manual と、ボットの知識源の両方から使う。
 * 同じファイルを見ているので、docs/manual.html を更新して push すれば
 * 両方に反映される。
 */
export async function readDocsFile(fileName: string): Promise<string | null> {
  for (const dir of DOCS_DIRS) {
    try {
      return await readFile(path.join(dir, fileName), 'utf8')
    } catch {
      // 次の候補へ
    }
  }
  return null
}

export async function loadManualText(): Promise<string | null> {
  if (cache !== null) return cache

  const html = await readDocsFile('manual.html')
  if (html === null) {
    console.error('support bot: docs/manual.html を読み込めませんでした')
    return null
  }

  cache = htmlToText(html)
  return cache
}

/**
 * マニュアルHTMLを、AIに渡すためのプレーンテキストへ落とす。
 *
 * 見出し・箇条書き・表の行はそのまま潰すと意味が失われるので、
 * 改行と区切り文字に置き換えてから残りのタグを外す。
 */
function htmlToText(html: string): string {
  return html
    // 改行コードを先に揃える。CRLF のままだと後段の空行畳み込みが効かず、
    // 空行だけで数千トークンを無駄に送ることになる
    .replace(/\r\n?/g, '\n')
    // 表示に関係ない塊を先に落とす
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // 表は「列 | 列」の行として残す
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' | ')
    .replace(/<\/tr>/gi, '\n')
    // 見出し・段落・箇条書きは改行に
    .replace(/<\/(h[1-6]|p|li|div|section|article|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '・')
    .replace(/<br\s*\/?>/gi, '\n')
    // 残りのタグを外す
    .replace(/<[^>]+>/g, '')
    // 実体参照を戻す
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    // 空白の整理
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
