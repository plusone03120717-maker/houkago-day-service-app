-- 打刻記録テーブル
CREATE TABLE time_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('clock_in', 'clock_out')),
  recorded_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  edited_at TIMESTAMPTZ,
  edited_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE time_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_time_records" ON time_records
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE INDEX time_records_staff_recorded ON time_records (staff_member_id, recorded_at);

-- スタッフ時給テーブル
CREATE TABLE staff_hourly_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  hourly_rate INTEGER NOT NULL CHECK (hourly_rate > 0),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE staff_hourly_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_hourly_rates" ON staff_hourly_rates
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );
