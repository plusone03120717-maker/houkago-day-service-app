-- 提供時間フィールドをdaily_attendanceに追加
ALTER TABLE daily_attendance
  ADD COLUMN IF NOT EXISTS service_start_time time,
  ADD COLUMN IF NOT EXISTS service_end_time time;

-- 提供時間デフォルト設定をnotification_settingsに追加
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS default_service_end_time time DEFAULT '16:30',
  ADD COLUMN IF NOT EXISTS holiday_service_end_time time DEFAULT '16:00';
