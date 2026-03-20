-- =====================================================
-- 職員研修記録テーブル
-- =====================================================

CREATE TABLE IF NOT EXISTS staff_training_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  training_name TEXT NOT NULL,           -- 研修名
  training_type TEXT NOT NULL DEFAULT 'general'
    CHECK (training_type IN ('initial', 'regular', 'specialized', 'career', 'other')),
    -- initial: 初任者研修, regular: 定期研修, specialized: 専門研修, career: キャリアパス, other: その他
  organizer TEXT,                        -- 主催機関・実施機関
  completed_date DATE NOT NULL,          -- 修了日
  certificate_number TEXT,              -- 修了証番号
  hours NUMERIC(5,1),                   -- 研修時間（時間）
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_training_records_staff_id ON staff_training_records(staff_profile_id);
CREATE INDEX IF NOT EXISTS idx_staff_training_records_date ON staff_training_records(completed_date);

ALTER TABLE staff_training_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_training_records" ON staff_training_records
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );
