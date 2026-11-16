import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// このアプリはほとんどの画面がログインした人ごとに作る画面なので、
// 組み立て後のページの保存（R2 などの incremental cache）は使わない。
export default defineCloudflareConfig({})
