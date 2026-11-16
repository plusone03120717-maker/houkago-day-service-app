# Cloudflare への移行の手引き

放デイ管理アプリを、Vercel から Cloudflare Workers に移すための手引きです。データベース（Supabase）は移さず、アプリを動かす場所だけを変えます。

## 今の状態（2026-11-16）

- 作業ブランチ `feat/cloudflare-migration` で、Cloudflare でも動くように直した。本番は Vercel のまま。
- GitHub Actions（Cloudflare build check）で、Cloudflare 向けの組み立てが通る。圧縮後の大きさは約3.6MB なので、Workers の有料プラン（上限10MB）が要る。
- 同じブランチを Vercel で試しに組み立てても通る。Vercel ではこれまでどおり動く。
- 手元の Workers（workerd）で、ログイン画面と保護者の登録画面が開き、ログインしていないときはログイン画面へ戻されることを確かめた。

## 試験環境（2026-11-16 に用意したもの）

- データベース： Supabase に試験用のプロジェクト「houkago-staging」を作り、本番と同じ表の手順をすべて当てた。見本の名前の児童6人・ユニット2つ・いつもの予定と、試験用のログイン（システム管理者とスタッフ）を `npm run seed:staging` で入れた。本番のデータは写していない。
- 値のファイル： 試験用の値は `.env.staging`（Git に入れない）にある。LINE・FAX・AI のキーは入れていないので、試験環境からは送らない。ログイン画面の Turnstile は、Cloudflare が公開している試験用のキーを使う。
- 手元で確かめたこと： `npm run dev:staging` で、試験用の値だけで手元の開発サーバー（localhost:3026）を動かせる。試験用の管理者でログインし、ダッシュボード・利用状況・児童の一覧・送迎管理が開くことを確かめた。
- まだのもの： Cloudflare への試験環境の公開（有料プランが要る）と、試験用の LIFF（行き先にする試験環境のアドレスが決まってから足す）。

## 直したところ

| 所 | 直し方 |
|---|---|
| 操作マニュアル（docs/manual.html） | Workers では実行中にファイルを読めないので、組み立ての前に `scripts/gen-docs-module.mjs` で文字列にして取りこむ |
| FAX のメール（jFax） | nodemailer は Workers から Gmail につながらない。Workers で動くときだけ worker-mailer で送る |
| 決まった時刻の処理（cron） | `cloudflare/worker.ts` が、今と同じ `/api/cron/...` を同じ認証で呼ぶ。時刻は `wrangler.jsonc` に書く |
| 組み立ての出力先 | OpenNext は `.next` しか読まないので、Cloudflare 向けのときだけ `.next` に出す（`scripts/cf.mjs` が `CF_BUILD=1` を付ける） |
| Next.js | OpenNext が 16.4.5 以上を求めるので、16.4.6 に上げた |

## 依頼主の操作が要るところ

1. Cloudflare の Workers の有料プラン（月5ドル）に申しこむ。
2. 試験用の Supabase のプロジェクトを作るかを決める。無料プランで作れるのは2つまで。
3. 試験用の LINE を用意する（試験用の LIFF と、試験用の LINE チャンネル）。本物の保護者とスタッフに LINE が届かないようにするため。
4. 手元で `npx wrangler login` を行い、Cloudflare にログインする。パスワードは依頼主が入れる。

## 試験環境に出す流れ

1. 試験用の値を入れたファイル（`.env.staging` など。Git に入れない）を作る。DB・LINE・メールは試験用の値にする。
2. `npx wrangler secret bulk .env.staging --env staging` で、試験環境（houkago-app-staging）にまとめて入れる。
3. `NEXT_PUBLIC_` で始まる値は組み立てのときに要るので、組み立てる場所にも入れる。
4. GitHub Actions か Linux の上で `npm run cf:deploy:staging` を動かす。Windows では組み立ての最後が権限で止まる。
5. 試験環境で、全画面・LINE から開く画面（LIFF）・FAX・決まった時刻の処理を確かめる。決まった時刻の処理は試験環境では自動で動かないので、手で呼ぶ。

## 本番に切り替える日

- 12/10 の国保連の締めのあと、利用の少ない日に切り替える。
- Vercel は消さずに残す。不具合が出たら、LIFF のアドレスと LINE の Webhook の URL を Vercel のアドレスに戻すだけで元に戻せる。
- 切り替えた日は Cloudflare の記録（Observability）でエラーを見張る。
- 1〜2週間問題がなければ、Vercel の放デイのプロジェクトを止める。
