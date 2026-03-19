-- =====================================================
-- 処遇改善加算設定テーブル
-- =====================================================

CREATE TABLE IF NOT EXISTS addition_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  addition_type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  custom_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_id, addition_type)
);

CREATE INDEX IF NOT EXISTS idx_addition_settings_unit_id ON addition_settings(unit_id);

ALTER TABLE addition_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_addition_settings" ON addition_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "admin_manage_addition_settings" ON addition_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER update_addition_settings_updated_at
  BEFORE UPDATE ON addition_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
