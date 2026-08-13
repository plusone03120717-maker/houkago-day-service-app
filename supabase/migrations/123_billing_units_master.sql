-- 出席実績から請求単位数を自動集計するための単位数マスタ
-- これまで billing_service_items には単位数がなく、請求明細の単位数は手入力するしかなかった。

-- 加算・保険外項目の1回あたり単位数
ALTER TABLE billing_service_items
  ADD COLUMN IF NOT EXISTS unit_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN billing_service_items.unit_count IS
  '1回あたりの単位数。延長加算（trigger_field=extension）は 1時間あたりの単位数として扱う。0 は未設定（集計対象外）';

-- 基本報酬の単位数は 提供形態（①平日 / ②学校休業日）× 時間区分 で変わるためマトリクスで持つ
CREATE TABLE IF NOT EXISTS billing_basic_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  -- 1=平日（提供形態①） 2=学校休業日・土日祝（提供形態②）
  service_form_type SMALLINT NOT NULL CHECK (service_form_type IN (1, 2)),
  -- 0=30分未満（原則算定不可） 1=30分以上90分以下 2=90分超
  billing_category SMALLINT NOT NULL CHECK (billing_category IN (0, 1, 2)),
  unit_count INTEGER NOT NULL DEFAULT 0,
  billing_code TEXT CHECK (billing_code IS NULL OR billing_code ~ '^[0-9A-Z]{6}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unit_id, service_form_type, billing_category)
);

COMMENT ON TABLE billing_basic_rates IS '基本報酬の単位数・サービスコード（提供形態×時間区分ごと）';

CREATE INDEX IF NOT EXISTS idx_billing_basic_rates_unit ON billing_basic_rates(unit_id);

ALTER TABLE billing_basic_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_billing_basic_rates" ON billing_basic_rates;
CREATE POLICY "staff_manage_billing_basic_rates" ON billing_basic_rates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff'))
  );

-- 請求明細: サービスコード別の内訳（国保連CSVの明細情報レコードにそのまま出力する）
-- 形式: [{ "code": "631111", "unitCount": 604, "count": 12, "units": 7248, "name": "放デイ基本報酬（平日・区分2）" }, ...]
ALTER TABLE billing_details
  ADD COLUMN IF NOT EXISTS service_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recalculated_at TIMESTAMPTZ;

COMMENT ON COLUMN billing_details.service_breakdown IS
  '出席実績から集計したサービスコード別内訳。空配列の場合は手入力（内訳なし）';
COMMENT ON COLUMN billing_details.recalculated_at IS
  '「出席実績から再集計」を最後に実行した日時。NULL は手入力のみ';

-- 単位数単価は 10.000〜11.200 の小数。INTEGER のままでは施設設定の単価を保存できない
ALTER TABLE billing_details
  ALTER COLUMN unit_price TYPE NUMERIC(6,3);

-- 同じ児童の明細行が重複しうる状態だったため、1行に統合したうえで一意制約を付ける
-- （確定済み → 利用日数が多い → 新しい の順に残す）
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY billing_monthly_id, child_id
    ORDER BY is_confirmed DESC, total_days DESC, created_at DESC
  ) AS rn
  FROM billing_details
)
DELETE FROM billing_details d
USING ranked r
WHERE d.id = r.id AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_details_monthly_child_unique'
  ) THEN
    ALTER TABLE billing_details
      ADD CONSTRAINT billing_details_monthly_child_unique UNIQUE (billing_monthly_id, child_id);
  END IF;
END $$;
