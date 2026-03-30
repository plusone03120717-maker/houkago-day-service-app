-- 上限管理事業所情報テーブル
CREATE TABLE child_limit_management (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  facility_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_child_limit_management_child_id ON child_limit_management(child_id);

ALTER TABLE child_limit_management ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_child_limit_management" ON child_limit_management
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
    )
  );
