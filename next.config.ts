import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // docs/manual.html は実行中に読まず、組み立ての前に src/generated/ へ
  // 取りこむ（scripts/gen-docs-module.mjs）。Cloudflare Workers でも動くようにするため。

  // worker-mailer は Cloudflare Workers 専用（cloudflare:sockets を使う）。Next の組み立てでは
  // 中まで読まず、Workers で動くときだけ読みこむ（src/lib/fax/send-jfax.ts）
  serverExternalPackages: ['worker-mailer'],
  // 既定の .next ディレクトリがファイルシステム破損で削除不能になったため出力先を変更
  // （ドライブを chkdsk で修復後は .next に戻してよい）。
  // Cloudflare 向けの組み立て（scripts/cf.mjs が CF_BUILD=1 を付ける）は、OpenNext が
  // .next しか読まないので .next に出す
  distDir: process.env.CF_BUILD === '1' ? '.next' : 'build',
  turbopack: {
    resolveAlias: {
      // jsPDF（PDF保存ボタン）が使う圧縮ライブラリ。Node 用ビルドは worker_threads を
      // 動的に読むためビルドが失敗する。PDF化はブラウザでしか行わないのでブラウザ版に固定する
      fflate: 'fflate/browser',
    },
  },
  experimental: {
    // クライアントサイドのルーターキャッシュ。
    // 動的ページも30秒はキャッシュを再利用し「戻る」等の遷移を高速化する。
    // データ更新時は各フォームの router.refresh() / revalidatePath で即時破棄されるため安全。
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  // Supabase の画像を最適化できるように許可
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
