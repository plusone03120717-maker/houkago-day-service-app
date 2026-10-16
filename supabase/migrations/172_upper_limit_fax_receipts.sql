-- 国保連請求の月初自動化：他事業所から届いた上限管理の FAX を、Claude Code のルーティンが
-- 読み取った結果を残す。どの児童の分がそろったか・まだ届いていないかを判定し、
-- そろった日／未着が残る8日ごろ／おかしな点があるときに、請求担当へ LINE で知らせる。
--
-- ここに入るのは読み取りの「下書き」。上限管理の金額（upper_limit_managements）には
-- 自動で書き込まない。確定は職員が FAX の画像と見比べて上限管理の画面で行う。

CREATE TABLE IF NOT EXISTS upper_limit_fax_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- サービス提供月（YYYYMM）
  year_month TEXT NOT NULL,
  -- jFax が付けた PDF のファイル名（FAX_20261002_1790907980_472.pdf など）。同じ FAX を二重に数えないため
  fax_file TEXT NOT NULL,
  -- FAX を受信した日時（jFax のメールの日時）
  received_at TIMESTAMPTZ,
  -- 帳票の種類。copay_list = 利用者負担額一覧表（うちが管理する児童の分が届く）
  --              result    = 利用者負担上限額管理結果票（他事業所が管理する児童の結果が届く）
  form_type TEXT NOT NULL CHECK (form_type IN ('copay_list', 'result')),
  -- 帳票を出した事業所（一覧表なら提供事業所、結果票なら管理事業所）
  office_number TEXT NOT NULL DEFAULT '',
  office_name TEXT NOT NULL DEFAULT '',
  -- 帳票に印字された受給者証番号。氏名は伏せ字のことが多いので、児童はこの番号で突き合わせる
  certificate_number TEXT NOT NULL,
  child_id UUID REFERENCES children(id) ON DELETE SET NULL,
  -- 一覧表：その事業所の総費用額・利用者負担額
  total_cost INTEGER,
  copay_amount INTEGER,
  -- 結果票：管理結果（1〜3）と、うちの管理結果後利用者負担額
  result TEXT CHECK (result IN ('1', '2', '3')),
  managed_copay_amount INTEGER,
  -- 読み取った内容そのもの（結果票の全事業所の行など）
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fax_file, office_number, certificate_number, form_type)
);

COMMENT ON TABLE upper_limit_fax_receipts IS
  '他事業所から届いた上限管理の FAX の読み取り結果（下書き）。Claude Code のルーティンが毎朝記録する';

CREATE INDEX IF NOT EXISTS idx_upper_limit_fax_receipts_month
  ON upper_limit_fax_receipts(year_month);

ALTER TABLE upper_limit_fax_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_upper_limit_fax_receipts" ON upper_limit_fax_receipts;
CREATE POLICY "staff_read_upper_limit_fax_receipts" ON upper_limit_fax_receipts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- ルーティンが読んだ FAX の控え。上限管理と関係のない FAX も入れて、翌朝に読み直さないようにする
CREATE TABLE IF NOT EXISTS upper_limit_fax_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fax_file TEXT NOT NULL UNIQUE,
  year_month TEXT NOT NULL,
  received_at TIMESTAMPTZ,
  -- 上限管理の帳票が入っていたか
  has_upper_limit_forms BOOLEAN NOT NULL DEFAULT false,
  -- 読んだときのメモ（「送付状のみ」「上限管理と関係のない FAX」など）
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE upper_limit_fax_files IS
  '月初の FAX チェックで読んだ FAX の控え（同じ FAX を読み直さないため）';

ALTER TABLE upper_limit_fax_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_upper_limit_fax_files" ON upper_limit_fax_files;
CREATE POLICY "staff_read_upper_limit_fax_files" ON upper_limit_fax_files
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- 同じ知らせを二度送らないための控え（そろった・未着の一覧・違和感）
CREATE TABLE IF NOT EXISTS billing_month_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL,
  -- fax_complete = 全員分そろった／fax_missing = 未着の一覧／fax_concern:<内容のハッシュ> = 違和感
  kind TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year_month, kind)
);

COMMENT ON TABLE billing_month_notices IS
  '国保連請求の月初自動化で請求担当へ送った LINE の控え（同じ知らせを二度送らないため）';

ALTER TABLE billing_month_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_billing_month_notices" ON billing_month_notices;
CREATE POLICY "staff_read_billing_month_notices" ON billing_month_notices
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );
