-- 179: よく使う絞りこみ・つなぎ合わせに索引（インデックス）を足す（2026-11-06）
--
-- 外部キーなどに索引がなく、表を頭から全部読む動き（seq scan）が多かった。
--   transport_details : 約6.2万回・のべ約9,066万行（送迎管理を開くたび）
--   daily_records     : 約3.0万回・のべ約3,015万行（日誌・ダッシュボード）
--   daily_activities  : 約1.3万回・のべ約2,057万行
--   usage_plans       : 約8.1万回（ユニット×有効の絞りこみ）
--   time_records      : お知らせベルの「未確認の中抜け」
-- 表を止めずに作るため CONCURRENTLY を使う。CONCURRENTLY はトランザクションの中では
-- 動かないので、本番には1文ずつ流して、そのあと migration repair で適用済みにした。
-- データ・画面の見た目は変わらない。

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transport_details_schedule
  ON public.transport_details (schedule_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transport_details_child
  ON public.transport_details (child_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_records_attendance
  ON public.daily_records (attendance_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_activities_attendance
  ON public.daily_activities (attendance_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_plans_unit_active
  ON public.usage_plans (unit_id, is_active);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_time_records_new
  ON public.time_records (type, is_new) WHERE is_new = true;
