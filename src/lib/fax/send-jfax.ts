// You First の Gmail から jFax へメールを送る（サーバー専用）。
//
// jFax は登録したメールアドレスの本来のアカウントからのメールしか受け付けないため、
// Gmail の SMTP に You First のアカウントでログインして送る。パスワードは Google の
// 「アプリ パスワード」（2段階認証が必要）を Vercel の環境変数に入れておく。
//   JFAX_GMAIL_USER         … you.first.2022.0111@gmail.com
//   JFAX_GMAIL_APP_PASSWORD … アプリ パスワード（16文字）

import nodemailer from 'nodemailer'

export function jfaxSenderConfigured(): boolean {
  return !!process.env.JFAX_GMAIL_USER && !!process.env.JFAX_GMAIL_APP_PASSWORD
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
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
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
