-- スタッフ（ログインアカウント）削除時に
-- 「Database error deleting user」になる問題の修正
--
-- 原因: users / staff_members / staff_profiles を参照する外部キーのうち、
--       created_by・staff_id・assessor_id など ON DELETE の指定がないもの
--       （NO ACTION）が残っており、参照レコードがあると削除が拒否される。
--       auth.users → public.users は CASCADE のため、Auth 側の削除も失敗する。
--
-- 対応: NULL 許容カラムの外部キーを ON DELETE SET NULL に変更する。
--       記録（日誌・実績・ヒヤリハット等）自体は残し、作成者だけ NULL にする。
--       NOT NULL のカラムはすでに ON DELETE CASCADE のため対象外。

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname                       AS conname,
           c.conrelid::regclass::text      AS tbl,
           c.confrelid::regclass::text     AS ref_tbl,
           a.attname                       AS col
    FROM pg_constraint c
    JOIN unnest(c.conkey) AS k(attnum) ON TRUE
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f'
      AND c.confrelid IN (
        'public.users'::regclass,
        'public.staff_members'::regclass,
        'public.staff_profiles'::regclass
      )
      AND c.confdeltype = 'a'          -- NO ACTION（ON DELETE 指定なし）
      AND array_length(c.conkey, 1) = 1
      AND NOT a.attnotnull             -- NULL 許容カラムのみ
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(id) ON DELETE SET NULL',
      r.tbl, r.conname, r.col, r.ref_tbl
    );
    RAISE NOTICE 'set null: %.% -> %', r.tbl, r.col, r.ref_tbl;
  END LOOP;
END $$;
