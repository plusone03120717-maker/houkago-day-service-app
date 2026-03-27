-- usage_reservations に利用時間・送迎設定を追加
ALTER TABLE usage_reservations
  ADD COLUMN IF NOT EXISTS pickup_time TIME,
  ADD COLUMN IF NOT EXISTS dropoff_time TIME,
  ADD COLUMN IF NOT EXISTS transport_type TEXT
    CHECK (transport_type IN ('none', 'pickup_only', 'dropoff_only', 'both'))
    DEFAULT 'both';
