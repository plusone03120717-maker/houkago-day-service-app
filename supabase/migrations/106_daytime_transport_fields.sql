-- 日中一時支援用の送迎時刻・ドライバー・車種カラムを追加
ALTER TABLE daily_attendance
  ADD COLUMN IF NOT EXISTS daytime_pickup_departure_time  TIME,
  ADD COLUMN IF NOT EXISTS daytime_pickup_arrival_time    TIME,
  ADD COLUMN IF NOT EXISTS daytime_dropoff_departure_time TIME,
  ADD COLUMN IF NOT EXISTS daytime_dropoff_arrival_time   TIME,
  ADD COLUMN IF NOT EXISTS daytime_pickup_driver_member_id  UUID REFERENCES staff_members(id),
  ADD COLUMN IF NOT EXISTS daytime_pickup_vehicle_id        UUID REFERENCES transport_vehicles(id),
  ADD COLUMN IF NOT EXISTS daytime_dropoff_driver_member_id UUID REFERENCES staff_members(id),
  ADD COLUMN IF NOT EXISTS daytime_dropoff_vehicle_id       UUID REFERENCES transport_vehicles(id);
