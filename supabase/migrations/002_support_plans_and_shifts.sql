-- =====================================================
-- 個別支援計画・シフト管理テーブル追加
-- =====================================================

-- facilities に postal_code と is_active を追加
ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- units に is_active を追加
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- children に is_active と diagnosis を追加
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS diagnosis TEXT;

-- =====================================================
-- 個別支援計画
-- =====================================================

CREATE TABLE IF NOT EXISTS support_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  plan_date DATE NOT NULL,
  review_date DATE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'reviewed', 'archived')) DEFAULT 'draft',
  long_term_goals TEXT,
  short_term_goals TEXT,
  support_content TEXT,
  monitoring_notes TEXT,
  family_wishes TEXT,
  child_wishes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_plans_child_id ON support_plans(child_id);
CREATE INDEX IF NOT EXISTS idx_support_plans_plan_date ON support_plans(plan_date);

-- =====================================================
-- スタッフシフト
-- =====================================================

CREATE TABLE IF NOT EXISTS staff_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('full', 'morning', 'afternoon', 'off', 'holiday')) DEFAULT 'full',
  start_time TIME,
  end_time TIME,
  unit_id UUID REFERENCES units(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, date)
);

CREATE INDEX IF NOT EXISTS idx_staff_shifts_date ON staff_shifts(date);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff_id ON staff_shifts(staff_id);

-- =====================================================
-- updated_at トリガー
-- =====================================================

CREATE TRIGGER update_support_plans_updated_at
  BEFORE UPDATE ON support_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_shifts_updated_at
  BEFORE UPDATE ON staff_shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- RLS ポリシー
-- =====================================================

ALTER TABLE support_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_shifts ENABLE ROW LEVEL SECURITY;

-- support_plans: スタッフは全件参照・作成可
CREATE POLICY "staff_read_support_plans" ON support_plans
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "staff_insert_support_plans" ON support_plans
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "staff_update_support_plans" ON support_plans
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- staff_shifts: スタッフは全件参照・管理者は全操作
CREATE POLICY "staff_read_shifts" ON staff_shifts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "staff_manage_shifts" ON staff_shifts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "staff_own_shifts" ON staff_shifts
  FOR INSERT WITH CHECK (auth.uid() = staff_id);

CREATE POLICY "staff_update_own_shifts" ON staff_shifts
  FOR UPDATE USING (auth.uid() = staff_id);
