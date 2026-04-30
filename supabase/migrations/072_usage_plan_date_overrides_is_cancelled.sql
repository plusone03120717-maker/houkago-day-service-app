-- usage_plan_date_overrides に is_cancelled フラグを追加
-- 特定日のキャンセルをプランの有効/無効切り替えと独立して管理する

ALTER TABLE usage_plan_date_overrides
  ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT FALSE;
