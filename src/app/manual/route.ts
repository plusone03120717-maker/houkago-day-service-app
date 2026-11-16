import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionUserId } from '@/lib/auth'
import { readDocsFile } from '@/lib/support/manual'

/**
 * アプリの操作マニュアル（docs/manual.html）をそのまま配信する。
 *
 * public/ に置くとログインなしで誰でも読めてしまうのと、サポートボットの
 * 知識源と実体が二重になるため、docs/ の1ファイルをここから読んで返す。
 * 中身は組み立ての前に src/generated/docs-manual.ts へ取りこんである
 * （scripts/gen-docs-module.mjs）。
 */

let cache: string | null = null

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (cache === null) {
    cache = await readDocsFile('manual.html')
  }

  if (cache === null) {
    return new NextResponse('操作マニュアルを読み込めませんでした', {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  return new NextResponse(cache, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // ログインしている本人のブラウザにだけ、短時間だけ持たせる
      'cache-control': 'private, max-age=300',
    },
  })
}
