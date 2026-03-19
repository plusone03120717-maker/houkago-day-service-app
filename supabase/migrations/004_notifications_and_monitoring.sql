-- =====================================================
-- 通知設定テーブル
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID REFERENCES facilities(id) ON DELETE CASCADE,
  notify_contact_note BOOLEAN NOT NULL DEFAULT TRUE,
  contact_note_timing TEXT NOT NULL DEFAULT 'immediate', -- 'immediate' | 'daily_17' | 'daily_18'
  notify_billing BOOLEAN NOT NULL DEFAULT TRUE,
  notify_reservation BOOLEAN NOT NULL DEFAULT TRUE,
  notify_announcement BOOLEAN NOT NULL DEFAULT TRUE,
  notify_transport_status BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_facility_id ON notification_settings(facility_id);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_notification_settings" ON notification_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "staff_read_notification_settings" ON notification_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- モニタリング記録テーブル
-- =====================================================

CREATE TABLE IF NOT EXISTS monitoring_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  support_plan_id UUID NOT NULL REFERENCES support_plans(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,
  long_term_progress TEXT,
  short_term_progress TEXT,
  issues TEXT,
  next_actions TEXT,
  overall_status TEXT NOT NULL DEFAULT 'ongoing'
    CHECK (overall_status IN ('ongoing', 'achieved', 'revised', 'needs_review')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_records_support_plan_id ON monitoring_records(support_plan_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_records_child_id ON monitoring_records(child_id);

ALTER TABLE monitoring_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_monitoring_records" ON monitoring_records
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE TRIGGER update_monitoring_records_updated_at
  BEFORE UPDATE ON monitoring_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
