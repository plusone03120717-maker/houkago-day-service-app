-- daily_attendance.status に 'scheduled'（利用予定）を追加
ALTER TABLE daily_attendance
  DROP CONSTRAINT IF EXISTS daily_attendance_status_check;

ALTER TABLE daily_attendance
  ADD CONSTRAINT daily_attendance_status_check
  CHECK (status IN ('attended', 'absent', 'cancel_waiting', 'scheduled'));
