-- 利用者負担額（請求書・領収書）機能
--   ① 放デイ給付費の1割（billing_details.copay_amount を流用）
--   ② 日中一時支援の1割（利用時間区分 × 児区分 の単位数表から算出。上限額とは別枠）
--   ③ 日中一時の送迎（片道あたり定額）
--   ④ 活動プログラムの追加料金（activity_programs.extra_charge）
--   ⑤ その他の実費（billing_actual_costs）

-- ── ① 日中一時支援の児区分（1〜3）──────────────────────────
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS daytime_support_category SMALLINT
    CHECK (daytime_support_category IS NULL OR daytime_support_category BETWEEN 1 AND 3);

COMMENT ON COLUMN children.daytime_support_category IS
  '日中一時支援の児区分（1〜3）。NULL は日中一時の利用なし・未設定';

-- ── ② 日中一時支援の単位数表 ───────────────────────────────
CREATE TABLE IF NOT EXISTS daytime_support_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  -- 1=2時間未満 2=2〜4時間 3=4〜6時間 4=6〜8時間 5=8時間以上
  time_category SMALLINT NOT NULL CHECK (time_category BETWEEN 1 AND 5),
  child_category SMALLINT NOT NULL CHECK (child_category BETWEEN 1 AND 3),
  unit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (facility_id, time_category, child_category)
);

COMMENT ON TABLE daytime_support_rates IS
  '日中一時支援の単位数（利用時間区分 × 児区分）。単位数 × 単位数単価 の1割が利用者負担';

CREATE INDEX IF NOT EXISTS idx_daytime_support_rates_facility ON daytime_support_rates(facility_id);

ALTER TABLE daytime_support_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_daytime_support_rates" ON daytime_support_rates;
CREATE POLICY "staff_manage_daytime_support_rates" ON daytime_support_rates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff'))
  );

-- 既存施設に標準の単位数表（障害児・18歳未満）をシード
INSERT INTO daytime_support_rates (facility_id, time_category, child_category, unit_count)
SELECT f.id, r.time_category, r.child_category, r.unit_count
FROM facilities f
CROSS JOIN (VALUES
  (1, 3, 235), (1, 2, 185), (1, 1, 153),
  (2, 3, 314), (2, 2, 246), (2, 1, 204),
  (3, 3, 392), (3, 2, 308), (3, 1, 255),
  (4, 3, 470), (4, 2, 369), (4, 1, 305),
  (5, 3, 549), (5, 2, 431), (5, 1, 356)
) AS r(time_category, child_category, unit_count)
ON CONFLICT (facility_id, time_category, child_category) DO NOTHING;

-- ── ③ 日中一時の送迎単価（片道あたり）─────────────────────
ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS daytime_transport_fee INTEGER NOT NULL DEFAULT 140;

COMMENT ON COLUMN facilities.daytime_transport_fee IS
  '日中一時支援の送迎にかかる利用者負担（片道あたりの円）。往復なら2回分';

-- ── ④ 「プリント」を活動プログラムに追加（1回200円）────────
INSERT INTO activity_programs (facility_id, name, category, extra_charge)
SELECT f.id, 'プリント', '学習', 200
FROM facilities f
WHERE NOT EXISTS (
  SELECT 1 FROM activity_programs ap WHERE ap.facility_id = f.id AND ap.name = 'プリント'
);

-- ── ⑤ 請求書・領収書 ──────────────────────────────────────
ALTER TABLE billing_invoices
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_monthly_id UUID REFERENCES billing_monthly(id) ON DELETE SET NULL,
  -- 明細のスナップショット（発行時点の内訳を固定する）
  -- [{ "category": "copay", "name": "放課後等デイサービス利用者負担（1割）", "unitPrice": null, "count": 1, "amount": 4600 }, ...]
  ADD COLUMN IF NOT EXISTS lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS daytime_copay_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_charge_total INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_no TEXT,
  ADD COLUMN IF NOT EXISTS paid_at DATE,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT;

COMMENT ON COLUMN billing_invoices.lines IS '発行時点の請求明細スナップショット';
COMMENT ON COLUMN billing_invoices.daytime_copay_amount IS '日中一時支援の利用者負担（送迎費を含む）';
COMMENT ON COLUMN billing_invoices.extra_charge_total IS '活動プログラムの追加料金合計（おやつ・パソコン等）';
COMMENT ON COLUMN billing_invoices.total_cost IS '総費用額（放デイ給付費の10割）。請求書の内訳表示用';
COMMENT ON COLUMN billing_invoices.paid_at IS '入金日。設定すると領収書を発行できる';

-- 児童×年月×種別で1枚に統一（重複行があれば新しいものを残す）
DELETE FROM billing_invoices a
USING billing_invoices b
WHERE a.child_id = b.child_id
  AND a.year_month = b.year_month
  AND a.invoice_type = b.invoice_type
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_invoices_child_month_type
  ON billing_invoices (child_id, year_month, invoice_type);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_month ON billing_invoices (year_month);

ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_billing_invoices" ON billing_invoices;
CREATE POLICY "staff_manage_billing_invoices" ON billing_invoices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff'))
  );

-- 保護者の閲覧ポリシー（parent_read_own_billing_invoices）は 046 で作成済みのためそのまま使う
