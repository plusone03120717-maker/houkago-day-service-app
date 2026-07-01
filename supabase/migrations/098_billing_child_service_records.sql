-- サービス項目マスタ（ユニット別）
CREATE TABLE billing_service_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('基本', '加算', '保険外')),
  -- 自動チェックのトリガー: 'basic'=出席時, 'transport_pickup'=お迎え時, 'transport_dropoff'=お送り時, 'daytime_support'=日中一時時, 'manual'=手動のみ
  trigger_field TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_field IN ('basic', 'transport_pickup', 'transport_dropoff', 'daytime_support', 'manual')),
  billing_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_service_items_unit ON billing_service_items(unit_id);

ALTER TABLE billing_service_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_billing_service_items" ON billing_service_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff'))
  );

-- 日別請求記録（手動上書き・追加用）
-- 自動計算値からの差分のみ記録する（auto_detected=trueの場合は自動、is_checked=falseは手動除外）
CREATE TABLE billing_daily_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  year_month TEXT NOT NULL,
  service_item_id UUID REFERENCES billing_service_items(id) ON DELETE CASCADE,
  -- is_checked=true: チェックあり（手動追加）, is_checked=false: 自動検出を手動除外
  is_checked BOOLEAN NOT NULL DEFAULT true,
  -- 請求用時間上書き（daily_attendanceのcheck_in/outと異なる場合）
  billing_start_time TIME,
  billing_end_time TIME,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (child_id, unit_id, date, service_item_id)
);

CREATE INDEX idx_billing_daily_records_child ON billing_daily_records(child_id, year_month);
CREATE INDEX idx_billing_daily_records_unit ON billing_daily_records(unit_id, year_month);

ALTER TABLE billing_daily_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_billing_daily_records" ON billing_daily_records
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff'))
  );
