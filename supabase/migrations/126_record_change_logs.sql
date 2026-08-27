-- =====================================================
-- 変更履歴（監査ログ）
-- =====================================================
-- 2026-08-27 の事故（9月分の予定を8月に入力し、既存の実績を上書き）では、
-- 上書き前の値がどこにも残っておらず復元不能だった。updated_at は上書き
-- されるだけで、旧値を保持しない。
--
-- 【設計方針】
-- アプリ側のコードを一切変更せずに漏れなく記録したいので、DBトリガーで
-- 実装する。API経由・SQLエディタ経由・スクリプト経由のどれで書き換えても
-- 必ず残る。
--
-- old_data / new_data に行まるごとの jsonb を持たせるのは容量より復元性を
-- 優先したため。1行あたり数百バイト、対象テーブルの更新頻度から見て
-- 年間でも数十MB程度に収まる。
--
-- child_id / record_date は old/new から取り出して非正規化しておく。
-- 「この児童のこの日付の履歴」という最も多い検索を、jsonb の展開なしで
-- インデックスから引けるようにするため。

CREATE TABLE IF NOT EXISTS record_change_logs (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  -- UPDATE のとき、実際に値が変わった列名（updated_at は除く）
  changed_fields TEXT[] NOT NULL DEFAULT '{}',
  old_data JSONB,
  new_data JSONB,
  -- 検索用に非正規化（対象テーブルに該当列が無ければ NULL）
  child_id UUID,
  record_date DATE,
  -- 実行者。service_role やバッチからの操作では NULL になる
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_record_change_logs_record
  ON record_change_logs (table_name, record_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_record_change_logs_changed_at
  ON record_change_logs (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_record_change_logs_child
  ON record_change_logs (child_id, record_date);
CREATE INDEX IF NOT EXISTS idx_record_change_logs_actor
  ON record_change_logs (changed_by, changed_at DESC);

-- =====================================================
-- 汎用トリガー関数
-- =====================================================
-- SECURITY DEFINER にしているのは、record_change_logs への INSERT 権限を
-- 一般ユーザーに与えずに済ませるため。ログ自体を改ざんできてはいけない。

CREATE OR REPLACE FUNCTION public.log_record_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_old    jsonb;
  v_new    jsonb;
  v_row    jsonb;
  v_fields text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  ELSE
    v_old := to_jsonb(OLD);
  END IF;

  v_row := COALESCE(v_new, v_old);

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k ORDER BY k) INTO v_fields
    FROM jsonb_object_keys(v_new) AS k
    WHERE k <> 'updated_at'
      AND (v_new -> k) IS DISTINCT FROM (v_old -> k);

    -- 実質的な変更が updated_at だけなら記録しない。
    -- 保存ボタンを押しただけの空振りでログが埋まるのを防ぐ。
    IF v_fields IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO record_change_logs (
    table_name, record_id, operation, changed_fields,
    old_data, new_data, child_id, record_date, changed_by
  ) VALUES (
    TG_TABLE_NAME,
    (v_row ->> 'id')::uuid,
    TG_OP,
    COALESCE(v_fields, '{}'),
    v_old,
    v_new,
    NULLIF(v_row ->> 'child_id', '')::uuid,
    NULLIF(v_row ->> 'date', '')::date,
    auth.uid()
  );

  RETURN NULL;
END;
$function$;

-- =====================================================
-- 対象テーブルへの適用
-- =====================================================
-- 「予定・実績・請求の元データ」に絞る。連絡帳やメッセージのような
-- 上書きしても取り返しがつく情報は対象外。

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'daily_attendance',
    'usage_plans',
    'usage_reservations',
    'usage_plan_date_overrides',
    'usage_plan_day_settings',
    'transport_details'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS log_changes ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER log_changes AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION public.log_record_change()', t);
  END LOOP;
END $$;

-- =====================================================
-- RLS
-- =====================================================
-- 参照は全ログインユーザーに許可（自分の入力ミスを自分で辿れるように）。
-- 書き込みポリシーは作らない ＝ トリガー（SECURITY DEFINER）以外は書けない。

ALTER TABLE record_change_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read record_change_logs" ON record_change_logs;
CREATE POLICY "Authenticated users can read record_change_logs"
  ON record_change_logs FOR SELECT
  TO authenticated
  USING (true);
