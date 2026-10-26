import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // サポートボットの知識源。docs/ は public/ の外にあり、参照が動的なので
  // 自動トレースでは関数バンドルに含まれない。明示的に同梱する。
  outputFileTracingIncludes: {
    '/api/support/chat': ['docs/manual.html'],
    // 操作マニュアルをそのまま配信するルート。同じ理由で同梱が必要
    '/manual': ['docs/manual.html'],
  },
  // 既定の .next ディレクトリがファイルシステム破損で削除不能になったため出力先を変更
  // （ドライブを chkdsk で修復後は .next に戻してよい）
  distDir: 'build',
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
