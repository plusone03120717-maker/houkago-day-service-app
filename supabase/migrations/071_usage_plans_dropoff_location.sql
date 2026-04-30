-- usage_plans / usage_plan_day_settings / usage_plan_date_overrides に
-- dropoff_location_type（送る場所）列を追加

ALTER TABLE usage_plans
  ADD COLUMN IF NOT EXISTS dropoff_location_type TEXT NOT NULL DEFAULT 'home'
    CHECK (dropoff_location_type IN ('home', 'school'));

ALTER TABLE usage_plan_day_settings
  ADD COLUMN IF NOT EXISTS dropoff_location_type TEXT NOT NULL DEFAULT 'home'
    CHECK (dropoff_location_type IN ('home', 'school'));

ALTER TABLE usage_plan_date_overrides
  ADD COLUMN IF NOT EXISTS dropoff_location_type TEXT NOT NULL DEFAULT 'home'
    CHECK (dropoff_location_type IN ('home', 'school'));
