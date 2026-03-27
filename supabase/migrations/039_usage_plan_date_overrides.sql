-- 利用計画の特定日上書き設定テーブル
-- 繰り返しスケジュールのうち、特定の1日だけ送迎設定を変更できる
-- 優先順位: 日付上書き > 曜日別設定 > プランのデフォルト
CREATE TABLE IF NOT EXISTS usage_plan_date_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES usage_plans(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  transport_type TEXT NOT NULL CHECK (transport_type IN ('none', 'pickup_only', 'dropoff_only', 'both')),
  pickup_location_type TEXT NOT NULL CHECK (pickup_location_type IN ('home', 'school')),
  pickup_time TIME,
  dropoff_time TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (plan_id, date)
);

-- RLS
ALTER TABLE usage_plan_date_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage usage_plan_date_overrides"
  ON usage_plan_date_overrides FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
