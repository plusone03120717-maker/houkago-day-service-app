-- monitoring_records.support_plan_id を nullable に変更（支援計画なしでもモニタリング記録を追加できるようにする）
ALTER TABLE monitoring_records
  ALTER COLUMN support_plan_id DROP NOT NULL;

-- 外部キー制約を再設定（NULL許可、SET NULLで支援計画削除時にNULLにする）
ALTER TABLE monitoring_records
  DROP CONSTRAINT monitoring_records_support_plan_id_fkey;

ALTER TABLE monitoring_records
  ADD CONSTRAINT monitoring_records_support_plan_id_fkey
  FOREIGN KEY (support_plan_id) REFERENCES support_plans(id) ON DELETE SET NULL;
