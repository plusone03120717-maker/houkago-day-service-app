-- =====================================================
-- 残業申請・有給管理テーブル
-- =====================================================

-- 残業申請（事前申請 & 自動検知）
CREATE TABLE IF NOT EXISTS overtime_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  scheduled_end_time TIME,           -- 予定退勤時刻（staff_shiftsのend_time）
  actual_end_time    TIME,           -- 実際退勤時刻（タイムカードから）
  overtime_minutes   INT NOT NULL DEFAULT 0,
  request_type  TEXT NOT NULL CHECK (request_type IN ('pre', 'auto')) DEFAULT 'auto',
  -- pre: 事前申請、auto: タイムカード自動検知
  status        TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  note          TEXT,
  approved_by   UUID REFERENCES users(id),
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, date, request_type)
);

CREATE INDEX IF NOT EXISTS idx_overtime_requests_staff_id ON overtime_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_date ON overtime_requests(date);

-- 有給付与（年度ごとの付与日数）
CREATE TABLE IF NOT EXISTS paid_leave_grants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year       INT NOT NULL,
  total_days NUMERIC(4,1) NOT NULL DEFAULT 0,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, year)
);

-- 有給使用（1日・半日単位）
CREATE TABLE IF NOT EXISTS paid_leave_usages (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date      DATE NOT NULL,
  days_used NUMERIC(3,1) NOT NULL DEFAULT 1.0 CHECK (days_used IN (0.5, 1.0)),
  note      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, date)
);

CREATE INDEX IF NOT EXISTS idx_paid_leave_usages_staff_id ON paid_leave_usages(staff_id);

-- updated_at トリガー
CREATE TRIGGER update_overtime_requests_updated_at
  BEFORE UPDATE ON overtime_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_paid_leave_grants_updated_at
  BEFORE UPDATE ON paid_leave_grants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- RLS
-- =====================================================

ALTER TABLE overtime_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_leave_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_leave_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_overtime_requests" ON overtime_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "staff_read_overtime_requests" ON overtime_requests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "admin_manage_paid_leave_grants" ON paid_leave_grants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "staff_read_paid_leave_grants" ON paid_leave_grants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "admin_manage_paid_leave_usages" ON paid_leave_usages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "staff_read_paid_leave_usages" ON paid_leave_usages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );
