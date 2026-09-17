-- 国保連CSVを実データ（前システムが取込成功した令和8年7月分）に合わせるための項目追加。
--
-- 判明した差分:
--   1. 地域区分「その他」のコードは 23（アプリの既定値 20 は誤り）
--   2. 明細書の「開始年月日」は当月1日ではなく、その事業所を初めて利用した日
--   3. 専門的支援実施加算は日々の記録ではなく、月の実利用日数から回数を自動算出する
--   4. 請求書は事業所番号ごとに1枚。児発・放デイが同一事業所番号なら1枚にまとめる

-- ── 1. 地域区分コード ────────────────────────────────────
-- 「その他」= 23。既定値 20 で登録された施設を直す。
ALTER TABLE facilities ALTER COLUMN region_code SET DEFAULT '23';
UPDATE facilities SET region_code = '23' WHERE region_code = '20';

COMMENT ON COLUMN facilities.region_code IS
  '地域区分コード（2桁）。その他 = 23（国保連取込済みの実データに準拠）';

-- ── 2. サービス開始年月日（当事業所の初回利用日） ────────
-- 明細書 日数情報レコード（K122 レコード種別02）の開始年月日に使う。
-- 受給者証に記載はなく、契約情報レコード（種別05）の契約開始日とも別物。
ALTER TABLE benefit_certificates
  ADD COLUMN IF NOT EXISTS service_start_date DATE;

COMMENT ON COLUMN benefit_certificates.service_start_date IS
  '当事業所を初めて利用した日。明細書 日数情報レコードの開始年月日に出力する。'
  '未設定時は出席実績の最古日、それも無ければ契約開始日を使う';

-- 無償化・多子軽減等で利用者負担が生じない児童。
-- 受給者証の負担上限月額は 4,600円 のまま、上限月額調整と決定利用者負担額が 0 になる
-- （実データでも負担上限月額4,600円・上限月額調整0 の児童が3人いた）。
ALTER TABLE benefit_certificates
  ADD COLUMN IF NOT EXISTS copay_exempt BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN benefit_certificates.copay_exempt IS
  '無償化・軽減等で利用者負担が生じない場合 true。明細書の上限月額調整・決定利用者負担額を0にする';

-- ── 3. 専門的支援実施加算 ────────────────────────────────
ALTER TABLE billing_service_items
  DROP CONSTRAINT IF EXISTS billing_service_items_trigger_field_check;

ALTER TABLE billing_service_items
  ADD CONSTRAINT billing_service_items_trigger_field_check
  CHECK (trigger_field IN (
    'basic',
    'transport_pickup',
    'transport_dropoff',
    'daytime_support',
    'daytime_pickup',
    'daytime_dropoff',
    'absent',
    'extension',
    'specialized_support',
    'manual'
  ));

-- 回数は月の実利用日数から自動算出するため、日ごとのチェックは行わない。
--   児発  : 12日未満 → 4回 / 12日以上 → 6回
--   放デイ: 6日未満 → 2回 / 6〜11日 → 4回 / 12日以上 → 6回
--   いずれも 回数 <= 実利用日数（1日1回まで）
INSERT INTO billing_service_items (unit_id, name, category, trigger_field, billing_code, unit_count, is_active, sort_order)
SELECT
  u.id,
  '専門的支援実施加算',
  '加算',
  'specialized_support',
  CASE WHEN u.service_type = 'development_support' THEN '615702' ELSE '635702' END,
  150,
  true,
  900
FROM units u
WHERE NOT EXISTS (
  SELECT 1 FROM billing_service_items i
  WHERE i.unit_id = u.id AND i.trigger_field = 'specialized_support'
);

-- ── 4. 請求対象ユニット ──────────────────────────────────
-- プログラミング・英会話のような活動用ユニットは国保連請求の対象外。
-- 請求書を事業所番号単位でまとめる際に、これらを巻き込まないようにする。
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS is_billing_target BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN units.is_billing_target IS
  '国保連請求の対象ユニットか。false のユニットは請求書・明細書に含めない';

UPDATE units SET is_billing_target = false WHERE name IN ('プログラミング', '英会話');
