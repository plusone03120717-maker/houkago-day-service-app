// You First の Gmail から jFax へメールを送る（サーバー専用）。
//
// jFax は登録したメールアドレスの本来のアカウントからのメールしか受け付けないため、
// Gmail の SMTP に You First のアカウントでログインして送る。パスワードは Google の
// 「アプリ パスワード」（2段階認証が必要）を Vercel の環境変数に入れておく。
//   JFAX_GMAIL_USER         … you.first.2022.0111@gmail.com
//   JFAX_GMAIL_APP_PASSWORD … アプリ パスワード（16文字）

//
// 動かす場所で送り方を分ける。
//   Vercel（Node.js）      … nodemailer
//   Cloudflare Workers     … worker-mailer（Workers の通信のしくみで SMTP を話す部品）
// nodemailer は Workers では Gmail につながらない（2026-11-16 に手元の Workers で確認）。

export function jfaxSenderConfigured(): boolean {
  return !!process.env.JFAX_GMAIL_USER && !!process.env.JFAX_GMAIL_APP_PASSWORD
}

const GMAIL_SMTP = { host: 'smtp.gmail.com', port: 465 }

/** Cloudflare Workers の中で動いているか */
function isCloudflareWorkers(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'
}

export async function sendJfaxMail(input: {
  to: string
  subject: string
  /** jFax の送付状（カバーページ）に載る本文 */
  body: string
  fileName: string
  pdf: Buffer
}): Promise<void> {
  const user = process.env.JFAX_GMAIL_USER
  const pass = process.env.JFAX_GMAIL_APP_PASSWORD
  if (!user || !pass) {
    throw new Error('jFax 用の Gmail の設定（JFAX_GMAIL_USER・JFAX_GMAIL_APP_PASSWORD）がありません')
  }

  if (isCloudflareWorkers()) {
    // worker-mailer は Workers 専用の部品なので、Workers のときだけ読みこむ
    // （next.config.ts の serverExternalPackages で、Next の組み立てでは中まで読まない）
    const { WorkerMailer } = await import('worker-mailer')
    const mailer = await WorkerMailer.connect({
      ...GMAIL_SMTP,
      secure: true,
      credentials: { username: user, password: pass },
      authType: 'plain',
    })
    try {
      await mailer.send({
        from: user,
        to: input.to,
        subject: input.subject,
        text: input.body,
        attachments: [
          { filename: input.fileName, content: input.pdf.toString('base64'), mimeType: 'application/pdf' },
        ],
      })
    } finally {
      await mailer.close()
    }
    return
  }

  const { default: nodemailer } = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    ...GMAIL_SMTP,
    secure: true,
    auth: { user, pass },
  })
  await transporter.sendMail({
    from: user,
    to: input.to,
    subject: input.subject,
    text: input.body,
    attachments: [{ filename: input.fileName, content: input.pdf, contentType: 'application/pdf' }],
  })
}
