-- 算定時間数を実績記録票の入力番号（1〜4）に合わせる／延長支援加算を区分別単位数にする
-- 令和6年度改定の算定入力マニュアル準拠:
--   算定時間数 1: 30分以上〜1時間30分以下（放デイ411）
--              2: 1時間30分超〜3時間以下（放デイ412）
--              3: 3時間超〜5時間以下（放デイ412）
--              4: 5時間超（放デイ413）
--   延長支援加算 1: 30分以上〜1時間未満（111）
--                2: 1時間以上〜2時間未満（112）
--                3: 2時間以上（113）

-- 基本報酬の区分を 0〜2 から 0〜4 に拡張
ALTER TABLE billing_basic_rates
  DROP CONSTRAINT IF EXISTS billing_basic_rates_billing_category_check;

ALTER TABLE billing_basic_rates
  ADD CONSTRAINT billing_basic_rates_billing_category_check
  CHECK (billing_category IN (0, 1, 2, 3, 4));

COMMENT ON COLUMN billing_basic_rates.billing_category IS
  '算定時間数。0=30分未満（算定対象外） 1=30分以上1時間30分以下 2=1時間30分超3時間以下 3=3時間超5時間以下 4=5時間超';

-- 延長支援加算は延長時間の区分ごとに単位数・サービスコードが異なる
CREATE TABLE IF NOT EXISTS billing_extension_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  -- 1=30分以上1時間未満 2=1時間以上2時間未満 3=2時間以上
  extension_level SMALLINT NOT NULL CHECK (extension_level IN (1, 2, 3)),
  unit_count INTEGER NOT NULL DEFAULT 0,
  billing_code TEXT CHECK (billing_code IS NULL OR billing_code ~ '^[0-9A-Z]{6}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unit_id, extension_level)
);

COMMENT ON TABLE billing_extension_rates IS '延長支援加算の単位数・サービスコード（延長時間の区分ごと）';

CREATE INDEX IF NOT EXISTS idx_billing_extension_rates_unit ON billing_extension_rates(unit_id);

ALTER TABLE billing_extension_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_billing_extension_rates" ON billing_extension_rates;
CREATE POLICY "staff_manage_billing_extension_rates" ON billing_extension_rates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff'))
  );

-- 延長加算は「1時間あたり」ではなく区分ごとに1日1回算定する
COMMENT ON COLUMN billing_service_items.unit_count IS
  '1回あたりの単位数。延長加算（trigger_field=extension）は billing_extension_rates 未設定時のフォールバック。0 は未設定（集計対象外）';
