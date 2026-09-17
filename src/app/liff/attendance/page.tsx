import { redirect } from 'next/navigation'

/**
 * 旧「利用連絡」ページ。
 *
 * 保護者の入口は保護者ポータルに一本化したため、この画面は無くなった。
 * LINE Developers に登録されているLIFFのエンドポイントがこのURLを指している場合や、
 * 保護者が古いリンクを開いた場合に迷子にならないよう、ポータルの入口へ送る。
 */
export default function LiffAttendanceRedirectPage() {
  redirect('/liff/portal')
}
