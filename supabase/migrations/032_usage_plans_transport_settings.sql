-- usage_plans に送迎設定を追加（子ども単位から計画単位へ移行）
ALTER TABLE usage_plans
  ADD COLUMN IF NOT EXISTS transport_type TEXT NOT NULL DEFAULT 'both'
    CHECK (transport_type IN ('none', 'pickup_only', 'dropoff_only', 'both')),
  ADD COLUMN IF NOT EXISTS pickup_location_type TEXT NOT NULL DEFAULT 'home'
    CHECK (pickup_location_type IN ('home', 'school'));

-- 既存の child_transport_settings の設定を usage_plans に移行
UPDATE usage_plans up
SET
  transport_type = cts.transport_type,
  pickup_location_type = cts.pickup_location_type
FROM child_transport_settings cts
WHERE cts.child_id = up.child_id;
