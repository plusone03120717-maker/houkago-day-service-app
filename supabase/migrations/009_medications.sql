-- =====================================================
-- 服薬管理テーブル
-- =====================================================

-- 児童ごとの定常薬登録
CREATE TABLE IF NOT EXISTS child_medications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL,                          -- 用量・用法（例: 1錠、食後）
  timing TEXT NOT NULL DEFAULT 'after_lunch'     -- 服薬タイミング
    CHECK (timing IN ('after_breakfast', 'after_lunch', 'after_dinner', 'as_needed', 'other')),
  instructions TEXT,                              -- 注意事項
  parent_consent_date DATE,                       -- 保護者同意日
  is_active BOOLEAN NOT NULL DEFAULT TRUE,        -- 現在処方中か
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_child_medications_child_id ON child_medications(child_id);

ALTER TABLE child_medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_child_medications" ON child_medications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE TRIGGER update_child_medications_updated_at
  BEFORE UPDATE ON child_medications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 服薬実施ログ
CREATE TABLE IF NOT EXISTS medication_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  medication_id UUID NOT NULL REFERENCES child_medications(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  administered_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'given'
    CHECK (status IN ('given', 'refused', 'skipped', 'not_needed')),
  staff_id UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medication_logs_child_date ON medication_logs(child_id, log_date);
CREATE INDEX IF NOT EXISTS idx_medication_logs_date ON medication_logs(log_date);

ALTER TABLE medication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_medication_logs" ON medication_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );
