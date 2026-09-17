-- 利用者負担上限額管理を月ごとに記録できるようにする。
--
-- これまで「上限管理事業所」は child_limit_management / benefit_certificates に
-- 事業所名（テキスト）しか持っておらず、国保連に出す管理結果（1〜3）も、
-- 他事業所の総費用額・利用者負担額も保存できなかった。そのため
-- 明細書（K122）の上限額管理欄が常に空になり、上限額管理結果票（K411）も出せなかった。
--
-- 対象児童は基本的に毎月変わらないので、受給者証に「当事業所が管理事業所か」を持ち、
-- 金額だけを月ごとに入力する形にする。他事業所とのやり取りはFAX（JFAX）。

-- ── 受給者証: 当事業所が上限額管理事業所か ──────────────
ALTER TABLE benefit_certificates
  ADD COLUMN IF NOT EXISTS is_upper_limit_manager BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS upper_limit_manager_number TEXT;

COMMENT ON COLUMN benefit_certificates.is_upper_limit_manager IS
  '当事業所がこの児童の利用者負担上限額管理事業所である場合 true';
COMMENT ON COLUMN benefit_certificates.upper_limit_manager_number IS
  '上限額管理事業所の事業所番号（10桁）。当事業所が管理事業所のときは自事業所の番号';

-- ── 月ごとの上限額管理 ───────────────────────────────────
CREATE TABLE IF NOT EXISTS upper_limit_managements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL, -- YYYYMM
  -- 上限額管理事業所の事業所番号（10桁）
  manager_office_number TEXT NOT NULL,
  -- 当事業所が管理事業所か。true のときだけ上限額管理結果票（K411）を出力する
  is_self_managed BOOLEAN NOT NULL DEFAULT false,
  -- 1=管理事業所で充当（他事業所の負担なし） 2=合算額が上限月額以下 3=超過のため調整
  result TEXT NOT NULL CHECK (result IN ('1', '2', '3')),
  -- その月の利用者負担上限月額（結果票に印字する）
  copay_limit INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (child_id, year_month)
);

COMMENT ON TABLE upper_limit_managements IS
  '利用者負担上限額管理の月次記録。明細書（K122）の上限額管理欄と上限額管理結果票（K411）の元データ';

CREATE INDEX IF NOT EXISTS idx_upper_limit_managements_month
  ON upper_limit_managements(year_month);

-- ── 事業所ごとの内訳 ─────────────────────────────────────
-- 当事業所の行も必ず1行入れる。その行の managed_copay_amount が
-- 明細書の「上限額管理後利用者負担額」＝決定利用者負担額になる。
CREATE TABLE IF NOT EXISTS upper_limit_management_offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  management_id UUID NOT NULL REFERENCES upper_limit_managements(id) ON DELETE CASCADE,
  -- 結果票の項番（1〜）
  line_no SMALLINT NOT NULL,
  office_number TEXT NOT NULL,
  office_name TEXT NOT NULL DEFAULT '',
  total_cost INTEGER NOT NULL DEFAULT 0,
  copay_amount INTEGER NOT NULL DEFAULT 0,
  managed_copay_amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (management_id, line_no)
);

COMMENT ON TABLE upper_limit_management_offices IS
  '上限額管理結果票の事業所ごとの内訳。FAX（JFAX）で他事業所から受け取った金額を入力する';

CREATE INDEX IF NOT EXISTS idx_upper_limit_management_offices_management
  ON upper_limit_management_offices(management_id);

-- ── RLS ─────────────────────────────────────────────────
ALTER TABLE upper_limit_managements ENABLE ROW LEVEL SECURITY;
ALTER TABLE upper_limit_management_offices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_upper_limit_managements" ON upper_limit_managements;
CREATE POLICY "staff_manage_upper_limit_managements" ON upper_limit_managements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff'))
  );

DROP POLICY IF EXISTS "staff_manage_upper_limit_management_offices" ON upper_limit_management_offices;
CREATE POLICY "staff_manage_upper_limit_management_offices" ON upper_limit_management_offices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff'))
  );

-- 既に受給者証に上限管理事業所名が入っている児童は、事業所番号の入力待ちであることが
-- 分かるようにしておく（名前だけでは国保連に出せない）。
COMMENT ON COLUMN benefit_certificates.upper_limit_manager IS
  '上限額管理事業所の名称（表示用）。国保連請求には upper_limit_manager_number が必要';
