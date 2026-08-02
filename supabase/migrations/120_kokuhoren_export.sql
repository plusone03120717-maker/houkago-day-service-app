-- 国保連請求CSV（インタフェース仕様準拠）出力に必要な項目を追加

-- 施設: 地域区分コードと単位数単価（円）
ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS region_code TEXT NOT NULL DEFAULT '20',
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(6,3) NOT NULL DEFAULT 10.000;

COMMENT ON COLUMN facilities.region_code IS '地域区分コード（2桁: 01=一級地〜20=その他）';
COMMENT ON COLUMN facilities.unit_price IS '単位数単価（円）: 地域区分・サービス種類で決まる 10.000〜11.200';

-- 受給者証: 契約情報レコード（レコード種別05）に必要な項目
ALTER TABLE benefit_certificates
  ADD COLUMN IF NOT EXISTS decision_service_code TEXT NOT NULL DEFAULT '631000',
  ADD COLUMN IF NOT EXISTS contract_amount INTEGER,
  ADD COLUMN IF NOT EXISTS contract_start_date DATE,
  ADD COLUMN IF NOT EXISTS contract_end_date DATE,
  ADD COLUMN IF NOT EXISTS contract_line_number INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN benefit_certificates.decision_service_code IS '決定サービスコード6桁（例: 631000=放デイ基本決定）';
COMMENT ON COLUMN benefit_certificates.contract_amount IS '契約支給量（日数）。未設定時は max_days_per_month を使用';
COMMENT ON COLUMN benefit_certificates.contract_start_date IS '受給者証の事業者記入欄に記載した契約開始日';
COMMENT ON COLUMN benefit_certificates.contract_end_date IS '受給者証の事業者記入欄に記載したサービス提供終了日';
COMMENT ON COLUMN benefit_certificates.contract_line_number IS '受給者証の事業者記入欄番号';

-- 請求明細: 利用者負担上限額管理の結果（明細書 基本情報レコードに出力）
ALTER TABLE billing_details
  ADD COLUMN IF NOT EXISTS upper_limit_office_number TEXT,
  ADD COLUMN IF NOT EXISTS upper_limit_result TEXT CHECK (upper_limit_result IN ('1', '2', '3')),
  ADD COLUMN IF NOT EXISTS upper_limit_result_amount INTEGER;

COMMENT ON COLUMN billing_details.upper_limit_office_number IS '上限額管理事業所の事業所番号（10桁）';
COMMENT ON COLUMN billing_details.upper_limit_result IS '上限額管理結果（1〜3）';
COMMENT ON COLUMN billing_details.upper_limit_result_amount IS '上限額管理結果額（円）';
