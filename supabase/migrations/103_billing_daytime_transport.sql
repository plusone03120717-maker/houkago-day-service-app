-- 日中一時支援の送迎フラグを billing_daily_records に追加
-- 基本の送迎（pickup_arrival_time / dropoff_arrival_time）とは独立したフラグ
ALTER TABLE billing_daily_records
  ADD COLUMN IF NOT EXISTS daytime_pickup  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daytime_dropoff BOOLEAN NOT NULL DEFAULT false;
