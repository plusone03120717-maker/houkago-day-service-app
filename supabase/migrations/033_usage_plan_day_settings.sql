-- 利用計画の曜日別送迎設定テーブル
-- plan全体のデフォルトを曜日単位で上書きできる
CREATE TABLE IF NOT EXISTS usage_plan_day_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES usage_plans(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  transport_type TEXT NOT NULL CHECK (transport_type IN ('none', 'pickup_only', 'dropoff_only', 'both')),
  pickup_location_type TEXT NOT NULL CHECK (pickup_location_type IN ('home', 'school')),
  pickup_time TIME,
  dropoff_time TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (plan_id, day_of_week)
);

-- RLS
ALTER TABLE usage_plan_day_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage usage_plan_day_settings"
  ON usage_plan_day_settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
