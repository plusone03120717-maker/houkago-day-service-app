-- 児童ごとの送迎デフォルト設定テーブル
CREATE TABLE child_transport_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL UNIQUE REFERENCES children(id) ON DELETE CASCADE,
  pickup_location_type TEXT NOT NULL DEFAULT 'home'
    CHECK (pickup_location_type IN ('home', 'school')),
  dropoff_location_type TEXT NOT NULL DEFAULT 'home'
    CHECK (dropoff_location_type IN ('home', 'school')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE child_transport_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_child_transport_settings" ON child_transport_settings
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );
