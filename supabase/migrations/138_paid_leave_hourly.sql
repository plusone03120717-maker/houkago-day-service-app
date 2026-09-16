-- =====================================================
-- 時間単位年次有給休暇（労基法39条4項 / 労基則24条の4）対応
--
--  ・労使協定に基づき、年5日分を上限として時間単位で取得できる
--  ・1日分の時間数 = 所定労働時間数（1時間未満の端数は切り上げ）
--  ・時間単位の取得は「年5日の取得義務」には充当できない
-- =====================================================

-- 1日分の時間数（労使協定③）。スタッフごとの所定労働時間を時間単位（整数・切り上げ）で持つ
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS paid_leave_hours_per_day INT NOT NULL DEFAULT 8;

COMMENT ON COLUMN staff_members.paid_leave_hours_per_day IS
  '時間単位年休の「1日分の時間数」。所定労働時間数（1時間未満の端数は切り上げ）';

-- 取得単位と時間数
ALTER TABLE paid_leave_usages
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'day',
  ADD COLUMN IF NOT EXISTS hours_used INT;

COMMENT ON COLUMN paid_leave_usages.unit IS 'day: 1日/半日単位、hour: 時間単位';
COMMENT ON COLUMN paid_leave_usages.hours_used IS 'unit=hour のときの取得時間数';

-- 旧 CHECK 制約（days_used IN (0.5, 1.0)）を名前に依存せず外す
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'paid_leave_usages'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%days_used%'
  LOOP
    EXECUTE format('ALTER TABLE paid_leave_usages DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- 時間単位は 1日に複数件ありうるため、日付の UNIQUE 制約は日単位のみに限定する
ALTER TABLE paid_leave_usages DROP CONSTRAINT IF EXISTS paid_leave_usages_staff_id_date_key;

ALTER TABLE paid_leave_usages
  ADD CONSTRAINT paid_leave_usages_unit_check CHECK (unit IN ('day', 'hour'));

ALTER TABLE paid_leave_usages
  ADD CONSTRAINT paid_leave_usages_amount_check CHECK (
    (unit = 'day'  AND days_used IN (0.5, 1.0) AND hours_used IS NULL)
    OR
    (unit = 'hour' AND days_used = 0 AND hours_used IS NOT NULL AND hours_used BETWEEN 1 AND 24)
  );

-- 日単位は従来どおり「1人1日1件」
CREATE UNIQUE INDEX IF NOT EXISTS paid_leave_usages_day_unique
  ON paid_leave_usages (staff_id, date)
  WHERE unit = 'day';

-- 日付での絞り込み用
CREATE INDEX IF NOT EXISTS idx_paid_leave_usages_staff_date
  ON paid_leave_usages (staff_id, date);
