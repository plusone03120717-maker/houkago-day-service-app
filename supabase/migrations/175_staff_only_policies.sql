-- 「ログインしていれば誰でも」になっていた表を、職員（admin・staff）だけに絞る。
--
-- 次の表は TO authenticated USING (true) のポリシーだけで守られていたため、
-- 保護者のアカウントでもブラウザから直接、全児童の分を読めた（一部は書き換え・削除も）。
--   child_addresses            児童の住所（読み書き・削除）
--   usage_plan_day_settings    利用予定の曜日ごとの設定（読み書き・削除）
--   usage_plan_date_overrides  利用予定の日ごとの上書き（読み書き・削除）
--   record_change_logs         変更履歴（変更前後の中身つき・読み取り）
--   anomaly_findings           入力チェックの結果（読み取り・更新）
--   anomaly_check_runs         入力チェックの実行記録（読み取り）
--
-- 保護者の画面はこれらの表に直接さわらない（利用連絡・送迎場所はサーバーの API が
-- 「自分の子か」を確かめてから service role で書く）。保護者が自分の子の分を読む
-- ポリシー（parents can read own child addresses・parent_read_own_plan_overrides）は残す。
-- LINE のスタッフ予定・Cron・入力チェックのバッチは service role なので影響しない。

-- child_addresses
DROP POLICY IF EXISTS "Authenticated users can manage child_addresses" ON child_addresses;
DROP POLICY IF EXISTS "staff_manage_child_addresses" ON child_addresses;
CREATE POLICY "staff_manage_child_addresses" ON child_addresses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));

-- usage_plan_day_settings
DROP POLICY IF EXISTS "Authenticated users can manage usage_plan_day_settings" ON usage_plan_day_settings;
DROP POLICY IF EXISTS "staff_manage_usage_plan_day_settings" ON usage_plan_day_settings;
CREATE POLICY "staff_manage_usage_plan_day_settings" ON usage_plan_day_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));

-- usage_plan_date_overrides
DROP POLICY IF EXISTS "Authenticated users can manage usage_plan_date_overrides" ON usage_plan_date_overrides;
DROP POLICY IF EXISTS "staff_manage_usage_plan_date_overrides" ON usage_plan_date_overrides;
CREATE POLICY "staff_manage_usage_plan_date_overrides" ON usage_plan_date_overrides
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));

-- record_change_logs（書き込みは SECURITY DEFINER のトリガー log_record_change が行う）
DROP POLICY IF EXISTS "Authenticated users can read record_change_logs" ON record_change_logs;
DROP POLICY IF EXISTS "staff_read_record_change_logs" ON record_change_logs;
CREATE POLICY "staff_read_record_change_logs" ON record_change_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));

-- anomaly_findings
DROP POLICY IF EXISTS "Authenticated users can read anomaly_findings" ON anomaly_findings;
DROP POLICY IF EXISTS "Authenticated users can update anomaly_findings" ON anomaly_findings;
DROP POLICY IF EXISTS "staff_read_anomaly_findings" ON anomaly_findings;
DROP POLICY IF EXISTS "staff_update_anomaly_findings" ON anomaly_findings;
CREATE POLICY "staff_read_anomaly_findings" ON anomaly_findings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));
CREATE POLICY "staff_update_anomaly_findings" ON anomaly_findings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));

-- anomaly_check_runs
DROP POLICY IF EXISTS "Authenticated users can read anomaly_check_runs" ON anomaly_check_runs;
DROP POLICY IF EXISTS "staff_read_anomaly_check_runs" ON anomaly_check_runs;
CREATE POLICY "staff_read_anomaly_check_runs" ON anomaly_check_runs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));

-- schedule_event_children・schedule_event_staff は、本番では RLS が有効でポリシーなし
-- （＝service role の LINE のスタッフ予定だけが使う）だったが、migration には書かれていなかった。
-- 新しく作り直したときも同じになるよう、ここで明示する（本番では何も変わらない）。
ALTER TABLE schedule_event_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_event_staff ENABLE ROW LEVEL SECURITY;

-- 保護者のログイン（/api/auth/parent-login）の失敗の記録。回数制限に使う。
-- service role だけが読み書きする（ポリシーなし＝ブラウザからは触れない）。
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  name_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_name_time ON login_attempts(name_hash, created_at);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE login_attempts IS
  '保護者ログインの失敗の記録（IP と児童名はハッシュで保存）。10分に5回で止める。service role 専用';
