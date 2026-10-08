-- 提供形態（平日／休日）の手動上書きの保存先を、基本報酬の行（billing_daily_records）から
-- 出欠記録（daily_attendance）へ移す。基本報酬の項目を持たないユニット（プラスワン2など）でも
-- 切り替えられるようにするため。
-- NULL は自動判定。1 = 平日（授業終了後） / 2 = 休日（学校休業日・土日祝）

ALTER TABLE daily_attendance
  ADD COLUMN IF NOT EXISTS service_form_override SMALLINT
  CHECK (service_form_override IN (1, 2));

-- 161 で billing_daily_records に保存済みの上書きを引き継ぐ
UPDATE daily_attendance a
SET service_form_override = r.service_form_override
FROM billing_daily_records r
WHERE r.service_form_override IS NOT NULL
  AND r.child_id = a.child_id
  AND r.unit_id = a.unit_id
  AND r.date = a.date;

ALTER TABLE billing_daily_records DROP COLUMN IF EXISTS service_form_override;
