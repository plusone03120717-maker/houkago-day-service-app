-- 児童別学校休日テーブル
-- start_date と end_date で期間を表す（個別日付の場合は同じ日付を設定）
CREATE TABLE child_school_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  label TEXT NOT NULL,         -- 例: "夏休み", "振替休日"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_child_school_holidays_child_id ON child_school_holidays(child_id);
CREATE INDEX idx_child_school_holidays_dates ON child_school_holidays(start_date, end_date);

ALTER TABLE child_school_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_child_school_holidays" ON child_school_holidays
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
    )
  );

CREATE POLICY "parent_read_own_child_school_holidays" ON child_school_holidays
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_children pc
      WHERE pc.child_id = child_school_holidays.child_id
        AND pc.user_id = auth.uid()
    )
  );
