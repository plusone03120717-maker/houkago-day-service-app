-- =====================================================
-- 出勤実績カラムを staff_shifts に追加
-- =====================================================

ALTER TABLE staff_shifts
  ADD COLUMN IF NOT EXISTS actual_start_time TIME,
  ADD COLUMN IF NOT EXISTS actual_end_time TIME,
  ADD COLUMN IF NOT EXISTS actual_note TEXT,
  ADD COLUMN IF NOT EXISTS is_attendance_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

-- =====================================================
-- 業務日報テーブル（放デイ義務帳票）
-- =====================================================

CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_date DATE NOT NULL UNIQUE,
  facility_id UUID REFERENCES facilities(id),
  manager_comment TEXT,
  safety_check BOOLEAN NOT NULL DEFAULT FALSE,
  medication_records TEXT,
  incident_notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_daily_reports" ON daily_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE TRIGGER update_daily_reports_updated_at
  BEFORE UPDATE ON daily_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
