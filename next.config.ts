import type { NextConfig } from 'next'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  cleanupOutdatedCaches: true,
  disable: process.env.NODE_ENV === 'development',
  fallbacks: {
    document: '/offline',
  },
  runtimeCaching: [
    // ナビゲーション（HTMLページ）はNetworkFirst — オンライン時は常に最新を取得
    {
      urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 1日
        },
      },
    },
    // APIルートはNetworkOnly — キャッシュしない
    {
      urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
      handler: 'NetworkOnly',
    },
    // Supabase APIはNetworkOnly — キャッシュしない
    {
      urlPattern: ({ url }: { url: URL }) => url.hostname.includes('supabase.co'),
      handler: 'NetworkOnly',
    },
    // Next.jsのコンテンツハッシュ付き静的ファイル（_next/static/）はCacheFirst（URL変化で自動無効化）
    {
      urlPattern: ({ url }: { url: URL }) =>
        url.pathname.startsWith('/_next/static/') &&
        (url.pathname.includes('.') ),
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-static-immutable',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 365 * 24 * 60 * 60, // 1年（ハッシュ付きで不変）
        },
      },
    },
    // その他のJS/CSS（ハッシュなし可能性あり）はNetworkFirst — 常に最新を取得
    {
      urlPattern: ({ request }: { request: Request }) =>
        ['style', 'script', 'worker'].includes(request.destination),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'scripts-networkfirst',
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 60,
          maxAgeSeconds: 24 * 60 * 60, // 1日（オフライン用フォールバックのみ）
        },
      },
    },
    // 画像はCacheFirst
    {
      urlPattern: ({ request }: { request: Request }) => request.destination === 'image',
      handler: 'CacheFirst',
      options: {
        cacheName: 'images-cache',
        expiration: {
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30日
        },
      },
    },
  ],
})

const nextConfig: NextConfig = {
  // サポートボットの知識源。docs/ は public/ の外にあり、参照が動的なので
  // 自動トレースでは関数バンドルに含まれない。明示的に同梱する。
  outputFileTracingIncludes: {
    '/api/support/chat': ['docs/manual.html'],
  },
  // 既定の .next ディレクトリがファイルシステム破損で削除不能になったため出力先を変更
  // （ドライブを chkdsk で修復後は .next に戻してよい）
  distDir: 'build',
  turbopack: {},
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

export default withPWA(nextConfig)
