/**
 * Cloudflare Workers の入口（OpenNext が作るアプリの入口を包む）。
 *
 * 画面や API へのリクエストは、そのまま OpenNext のアプリに渡す。
 * それに加えて、決まった時刻の処理（cron）を受けて、今まで Vercel Cron が
 * 呼んでいたのと同じ /api/cron/... を、同じ認証（Bearer CRON_SECRET）で呼ぶ。
 *
 * 時刻は wrangler.jsonc の triggers.crons と、下の CRON_ROUTES の両方に書く。
 * どちらも UTC（日本時間 − 9時間）。Vercel の vercel.json と同じ値にしてある。
 */

// .open-next/worker.js は組み立てのときに作られる。まだ無いときも、あるときも
// 型の検査を通すため、@ts-expect-error ではなく @ts-ignore を使う
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { default as handler } from '../.open-next/worker.js'

type Env = {
  CRON_SECRET?: string
  NEXT_PUBLIC_APP_URL?: string
  [key: string]: unknown
}

type ScheduledController = { cron: string; scheduledTime: number }
type ExecutionContext = { waitUntil(promise: Promise<unknown>): void }
type OpenNextHandler = {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>
}

/** cron の式 → 呼ぶ API（vercel.json の crons と同じ） */
export const CRON_ROUTES: Record<string, string> = {
  // 毎朝 6:00（日本時間）：前日の記録の抜け・おかしな値の点検
  '0 21 * * *': '/api/cron/anomaly-check',
  // 毎晩 20:30（日本時間）：打刻の忘れの知らせ
  '30 11 * * *': '/api/cron/punch-reminder',
  // 月末の数日の 7:00（日本時間）：月初めの請求の準備
  '0 22 28-31 * *': '/api/cron/billing-month-start',
}

const app = handler as OpenNextHandler

const worker = {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx)
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const path = CRON_ROUTES[controller.cron]
    if (!path) {
      console.error(`cron: 「${controller.cron}」に対応する処理がありません`)
      return
    }
    if (!env.CRON_SECRET) {
      console.error('cron: CRON_SECRET が未設定です')
      return
    }
    // アプリの中の処理を直接呼ぶ（外のネットワークには出ない）。
    // ホスト名は、処理の中で URL を組み立てるときの土台にだけ使われる
    const base = env.NEXT_PUBLIC_APP_URL || 'https://localhost'
    const request = new Request(new URL(path, base), {
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    })
    const response = await app.fetch(request, env, ctx)
    if (!response.ok) {
      console.error(`cron: ${path} が ${response.status} を返しました`, await response.text())
    }
  },
}

export default worker
