-- billing_service_items.billing_code を国保連サービスコード（6桁）として使用する
-- （これまで全件 NULL の未使用カラムだったため、用途を確定させる）

ALTER TABLE billing_service_items
  DROP CONSTRAINT IF EXISTS billing_service_items_billing_code_check;

ALTER TABLE billing_service_items
  ADD CONSTRAINT billing_service_items_billing_code_check
  CHECK (billing_code IS NULL OR billing_code ~ '^[0-9A-Z]{6}$');

COMMENT ON COLUMN billing_service_items.billing_code IS
  '国保連サービスコード（6桁英数）。請求データ生成時に基本報酬項目のコードが billing_details.service_code に設定される';
