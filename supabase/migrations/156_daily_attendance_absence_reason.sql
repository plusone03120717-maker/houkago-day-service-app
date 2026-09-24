-- 欠席の理由（体調不良・家庭の事情など）を出席記録に残す
ALTER TABLE daily_attendance
  ADD COLUMN IF NOT EXISTS absence_reason TEXT;
