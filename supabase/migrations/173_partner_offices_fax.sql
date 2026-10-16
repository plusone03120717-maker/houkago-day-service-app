-- 上限管理でやり取りする他事業所の FAX 番号と、アプリから jFax で送った記録。
--
-- 上限管理の一覧表・結果票は、You First の Gmail から「81＋先頭の0を除いた番号@jfaxsend.com」へ
-- PDF を添付して送ると、相手に FAX で届く（jFax は登録したアドレスからのメールしか受け付けない）。
-- これまで職員が Gmail で手作業していたものを、上限管理の画面の「jFax で送る」ボタンで送れるようにする。
-- 送信は必ず職員が宛先と中身を確かめてから押す。

CREATE TABLE IF NOT EXISTS partner_offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- 事業所番号（10桁）。わからないときは空のまま
  office_number TEXT,
  -- FAX 番号（ハイフンありのまま。送るときに数字だけにする）
  fax_number TEXT NOT NULL DEFAULT '',
  -- 受給者証・上限管理事業所情報に書かれている別の呼び方（「LUPE」「ルーペ」など）。名前で突き合わせるときに使う
  aliases TEXT[] NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_offices_office_number_unique
  ON partner_offices(office_number) WHERE office_number IS NOT NULL AND office_number <> '';

COMMENT ON TABLE partner_offices IS
  '上限管理でやり取りする他事業所（FAX 番号）。設定 → 他事業所の FAX 番号 で編集する';

ALTER TABLE partner_offices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_partner_offices" ON partner_offices;
CREATE POLICY "staff_manage_partner_offices" ON partner_offices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

DROP TRIGGER IF EXISTS update_partner_offices_updated_at ON partner_offices;
CREATE TRIGGER update_partner_offices_updated_at
  BEFORE UPDATE ON partner_offices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS fax_send_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL,
  -- copay_list = 利用者負担額一覧表／result = 上限額管理結果票
  kind TEXT NOT NULL CHECK (kind IN ('copay_list', 'result')),
  partner_office_id UUID REFERENCES partner_offices(id) ON DELETE SET NULL,
  office_name TEXT NOT NULL DEFAULT '',
  fax_number TEXT NOT NULL,
  child_ids UUID[] NOT NULL DEFAULT '{}',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  page_count INTEGER,
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_by_name TEXT NOT NULL DEFAULT '',
  -- sent = jFax へのメールを送れた（相手に届いたかは jFax の送信完了メールで確かめる）／failed = 送れなかった
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fax_send_logs_month ON fax_send_logs(year_month);

COMMENT ON TABLE fax_send_logs IS
  'アプリから jFax で送った上限管理の FAX の記録';

ALTER TABLE fax_send_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_fax_send_logs" ON fax_send_logs;
CREATE POLICY "staff_read_fax_send_logs" ON fax_send_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- 2026-10-16 時点で You First の Gmail の送信履歴（連絡先名と jfaxsend.com の宛先）と、
-- 届いた FAX の帳票に書かれた事業所番号・FAX 番号から読み取ったもの。
INSERT INTO partner_offices (name, office_number, fax_number, aliases, note) VALUES
  ('カラーズ',             '1951200763', '0555-68-0982', ARRAY['colors', 'HDカラーズ'],           'Gmail の送信履歴から'),
  ('ぱるっこ',             '1951305125', '0555-83-3171', ARRAY['放課後デイサービス事業所ぱるっこ', 'pal-pal', 'パルパル'], 'Gmail の送信履歴・届いた FAX から'),
  ('ベルテール富士吉田',   NULL,         '042-657-2111', ARRAY['ベルテール'],                     'Gmail の送信履歴から。事業所番号は未確認'),
  ('キッズサポート',       NULL,         '0555-72-9421', ARRAY[]::TEXT[],                         'Gmail の送信履歴から。事業所番号は未確認'),
  ('合同会社おもちゃ箱',   '1951200557', '0555-28-5652', ARRAY['おもちゃ箱'],                     'Gmail の送信履歴から'),
  ('ルーペ',               '1951200722', '0555-22-2307', ARRAY['LUPE', 'IrodorI合同会社 LUPE'],   'Gmail の送信履歴・届いた FAX から'),
  ('ココロン富士吉田',     '1951200631', '0555-28-5233', ARRAY[]::TEXT[],                         'Gmail の送信履歴・届いた FAX から'),
  ('ココロン松山',         '1951200649', '0555-25-7436', ARRAY[]::TEXT[],                         'Gmail の送信履歴・届いた FAX から')
ON CONFLICT DO NOTHING;
