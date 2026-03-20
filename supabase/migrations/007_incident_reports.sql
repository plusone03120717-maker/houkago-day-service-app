-- =====================================================
-- ヒヤリハット・事故報告テーブル
-- =====================================================

CREATE TABLE IF NOT EXISTS incident_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID REFERENCES facilities(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE SET NULL,
  report_date DATE NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  incident_type TEXT NOT NULL CHECK (incident_type IN (
    'injury',        -- 負傷
    'near_miss',     -- ヒヤリハット
    'elopement',     -- 無断外出・行方不明
    'medication',    -- 服薬事故
    'property',      -- 器物破損
    'other'          -- その他
  )),
  severity TEXT NOT NULL CHECK (severity IN (
    'minor',     -- 軽微（治療不要）
    'moderate',  -- 中程度（要治療）
    'serious',   -- 重大（入院・死亡等）
    'near_miss'  -- ヒヤリハット
  )),
  description TEXT NOT NULL,
  immediate_response TEXT,
  root_cause TEXT,
  preventive_measures TEXT,
  reported_to_family BOOLEAN NOT NULL DEFAULT FALSE,
  reported_to_municipality BOOLEAN NOT NULL DEFAULT FALSE,
  municipality_report_date DATE,
  follow_up_required BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_date ON incident_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_incident_reports_child_id ON incident_reports(child_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_facility_id ON incident_reports(facility_id);

ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_incident_reports" ON incident_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE TRIGGER update_incident_reports_updated_at
  BEFORE UPDATE ON incident_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
