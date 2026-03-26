-- 児童送迎設定に送迎区分カラムを追加
ALTER TABLE child_transport_settings
  ADD COLUMN IF NOT EXISTS transport_type TEXT NOT NULL DEFAULT 'both'
    CHECK (transport_type IN ('none', 'pickup_only', 'dropoff_only', 'both'));
