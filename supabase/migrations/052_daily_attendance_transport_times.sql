-- 日々の記録：送迎時間の記録用カラムを追加
ALTER TABLE daily_attendance
  ADD COLUMN IF NOT EXISTS pickup_departure_time  time,  -- お迎えに行った時間
  ADD COLUMN IF NOT EXISTS pickup_arrival_time    time,  -- 事務所に到着した時間（お迎え後）
  ADD COLUMN IF NOT EXISTS dropoff_departure_time time,  -- 事務所を出た時間（送り）
  ADD COLUMN IF NOT EXISTS dropoff_arrival_time   time;  -- 自宅に到着した時間（送り後）
