-- 中抜け時間（休憩開始・終了）を staff_shifts テーブルに追加
ALTER TABLE staff_shifts
  ADD COLUMN IF NOT EXISTS break_start_time TIME,
  ADD COLUMN IF NOT EXISTS break_end_time   TIME;
