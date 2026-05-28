-- 日々の記録の送迎時間にドライバーと車種を記録するカラムを追加
ALTER TABLE daily_attendance
  ADD COLUMN IF NOT EXISTS pickup_driver_member_id  UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pickup_vehicle_id         UUID REFERENCES transport_vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dropoff_driver_member_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dropoff_vehicle_id        UUID REFERENCES transport_vehicles(id) ON DELETE SET NULL;
