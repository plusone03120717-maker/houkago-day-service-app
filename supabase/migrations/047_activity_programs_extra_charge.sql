-- 活動プログラムに保険適用外追加料金を追加
ALTER TABLE activity_programs
  ADD COLUMN IF NOT EXISTS extra_charge INTEGER DEFAULT NULL;

COMMENT ON COLUMN activity_programs.extra_charge IS '保険適用外の追加料金（円）。NULLは料金なし';
