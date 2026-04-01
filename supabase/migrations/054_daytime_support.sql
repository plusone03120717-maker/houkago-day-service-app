-- 日中一時利用フィールドをdaily_attendanceに追加
ALTER TABLE daily_attendance
  ADD COLUMN IF NOT EXISTS daytime_support BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS daytime_support_start_time time,
  ADD COLUMN IF NOT EXISTS daytime_support_end_time time;
