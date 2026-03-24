import type { NextConfig } from 'next'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
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
    // 静的アセット（JS/CSS）はStaleWhileRevalidate
    {
      urlPattern: ({ request }: { request: Request }) =>
        ['style', 'script', 'worker'].includes(request.destination),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-resources',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7日
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
  turbopack: {},
  experimental: {
    // クライアントサイドのルーターキャッシュを無効化（動的ページは常に再取得）
    staleTimes: {
      dynamic: 0,
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
