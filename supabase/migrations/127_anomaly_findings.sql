-- =====================================================
-- 入力チェックの検知結果
-- =====================================================
-- 夜間バッチ（api/cron/anomaly-check）が予定・実績の矛盾を検知して
-- ここに書き込み、「入力チェック」ページ（/checks）が表示する。
--
-- 【設計方針】
-- 毎回全消し＆全入れ直しにはしない。職員が「確認済み」「無視」にした
-- 判断が翌朝のバッチで消えてしまうため。finding_key で同一性を保ち、
--   ・再検知された    → last_seen_at だけ更新（status は維持）
--   ・検知されなくなった → status を 'resolved' に（＝直った）
-- という差分更新にする。
--
-- finding_key はアプリ側で `ルール:児童ID:対象日:レコードID` として組み立てる。
-- UNIQUE 制約に NULL を含めると Postgres は行ごとに別物として扱い重複するので、
-- NULL を文字列に畳んだ単一キーにしている。

CREATE TABLE IF NOT EXISTS anomaly_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_key TEXT NOT NULL UNIQUE,
  rule TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  child_id UUID REFERENCES children(id) ON DELETE CASCADE,
  target_date DATE,
  table_name TEXT NOT NULL,
  record_id UUID,
  message TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'dismissed')) DEFAULT 'open',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 職員が「無視」にしたときの理由。あとから判断の妥当性を追えるように
  closed_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_anomaly_findings_status
  ON anomaly_findings (status, severity, target_date DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_findings_child
  ON anomaly_findings (child_id, target_date);

-- =====================================================
-- バッチの実行記録
-- =====================================================
-- 「昨夜ちゃんと動いたのか」を画面で確認できるようにする。
-- 監視システム自体が止まっていることに気づけないのが一番まずい。

CREATE TABLE IF NOT EXISTS anomaly_check_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  -- 'cron' | 'manual'
  trigger_source TEXT NOT NULL DEFAULT 'cron',
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  checked_from DATE,
  checked_to DATE,
  found_count INT NOT NULL DEFAULT 0,
  new_count INT NOT NULL DEFAULT 0,
  resolved_count INT NOT NULL DEFAULT 0,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_anomaly_check_runs_started
  ON anomaly_check_runs (started_at DESC);

-- =====================================================
-- RLS
-- =====================================================
-- 検知結果の参照と、対応状況（確認済み・無視）の更新はログインユーザーに許可。
-- 作成・削除はバッチ（service_role）だけが行うので、ポリシーは作らない。

ALTER TABLE anomaly_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_check_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read anomaly_findings" ON anomaly_findings;
CREATE POLICY "Authenticated users can read anomaly_findings"
  ON anomaly_findings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can update anomaly_findings" ON anomaly_findings;
CREATE POLICY "Authenticated users can update anomaly_findings"
  ON anomaly_findings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read anomaly_check_runs" ON anomaly_check_runs;
CREATE POLICY "Authenticated users can read anomaly_check_runs"
  ON anomaly_check_runs FOR SELECT
  TO authenticated
  USING (true);
