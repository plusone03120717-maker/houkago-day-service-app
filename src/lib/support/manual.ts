import { MANUAL_HTML } from '@/generated/docs-manual'

/**
 * サポートボットの知識源。docs/manual.html をテキスト化して返す。
 *
 * マニュアルは 4万字ほどあり、テキスト化を毎リクエストやり直すのは無駄なので
 * モジュールスコープにキャッシュする。
 *
 * docs/manual.html は、組み立ての前に scripts/gen-docs-module.mjs が
 * src/generated/docs-manual.ts へ文字列として書き出し、それを取りこむ。
 * 実行中にファイルを読まないので、Vercel でも Cloudflare Workers でも動く。
 * マニュアルを更新して push すれば、次の組み立てで両方に反映される。
 */
let cache: string | null = null

const DOCS: Record<string, string> = {
  'manual.html': MANUAL_HTML,
}

/**
 * docs/ 配下のファイルの中身を返す。取りこんでいないファイルなら null。
 *
 * マニュアルを画面に出す /manual と、ボットの知識源の両方から使う。
 */
export async function readDocsFile(fileName: string): Promise<string | null> {
  return DOCS[fileName] ?? null
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
