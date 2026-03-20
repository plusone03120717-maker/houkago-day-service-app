-- =====================================================
-- 支援ニーズアセスメントテーブル
-- =====================================================

CREATE TABLE IF NOT EXISTS child_assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  assessment_date DATE NOT NULL,
  assessor_id UUID REFERENCES users(id),

  -- 本人・生活の様子
  child_situation TEXT,         -- 本人の様子・強み・得意なこと
  current_issues TEXT,          -- 現在の課題・困り事

  -- 家族・環境
  family_situation TEXT,        -- 家族の状況・家庭環境
  related_agencies TEXT,        -- 関係機関（学校・医療機関等）との連携状況

  -- 希望・目標
  child_wishes TEXT,            -- 本人の希望・やりたいこと
  parent_wishes TEXT,           -- 保護者の希望・期待すること
  usage_goals TEXT,             -- 放デイ利用の目標

  -- 補足
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_child_assessments_child_id ON child_assessments(child_id);
CREATE INDEX IF NOT EXISTS idx_child_assessments_date ON child_assessments(assessment_date);

ALTER TABLE child_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_child_assessments" ON child_assessments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE TRIGGER update_child_assessments_updated_at
  BEFORE UPDATE ON child_assessments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
