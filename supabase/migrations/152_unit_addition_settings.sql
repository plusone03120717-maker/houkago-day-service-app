-- 事業所（ユニット）単位で算定する加算・減算の設定
--
-- 国保連の加算には「事業所につく加算」と「利用者ごとにつく加算」がある。
-- 利用者ごとの加算（送迎・欠席時対応・延長・専門的支援実施など）は
-- billing_service_items で日々の実績から判定しているが、事業所につく加算
-- （児童指導員等加配加算・処遇改善加算・各種減算）はあらかじめ登録しておき、
-- 再集計時に全児童の明細へ自動で積む必要がある。その設定をここに持つ。
--
-- 単位数・率・サービスコードは定員規模・地域区分・年度改定で変わるため、
-- マスタとして固定せず事業所が入力する（国保連サービスコード設定と同じ方針）。

CREATE TABLE IF NOT EXISTS unit_addition_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  -- lib/billing/facility-additions.ts の FACILITY_ADDITIONS[].key
  addition_key TEXT NOT NULL,
  -- 選択した区分。NULL・空文字は「なし（算定しない）」
  option_value TEXT,
  -- 日額加算・月額加算の1回あたり単位数
  unit_count INTEGER NOT NULL DEFAULT 0,
  -- 減算・処遇改善加算の割合（％）
  rate NUMERIC(5,2),
  billing_code TEXT CHECK (billing_code IS NULL OR billing_code ~ '^[0-9A-Z]{6}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unit_id, addition_key)
);

COMMENT ON TABLE unit_addition_settings IS '事業所（ユニット）単位で算定する加算・減算の設定';
COMMENT ON COLUMN unit_addition_settings.option_value IS '選択した区分。NULL・空文字は算定しない';
COMMENT ON COLUMN unit_addition_settings.unit_count IS '日額・月額加算の1回あたり単位数（0は未設定）';
COMMENT ON COLUMN unit_addition_settings.rate IS '減算率・処遇改善加算の加算率（％）';

CREATE INDEX IF NOT EXISTS idx_unit_addition_settings_unit ON unit_addition_settings(unit_id);

ALTER TABLE unit_addition_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_unit_addition_settings" ON unit_addition_settings;
CREATE POLICY "staff_read_unit_addition_settings" ON unit_addition_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff'))
  );

DROP POLICY IF EXISTS "admin_manage_unit_addition_settings" ON unit_addition_settings;
CREATE POLICY "admin_manage_unit_addition_settings" ON unit_addition_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP TRIGGER IF EXISTS update_unit_addition_settings_updated_at ON unit_addition_settings;
CREATE TRIGGER update_unit_addition_settings_updated_at
  BEFORE UPDATE ON unit_addition_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
