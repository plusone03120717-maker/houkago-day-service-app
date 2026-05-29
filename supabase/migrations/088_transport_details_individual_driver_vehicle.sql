-- お迎えの子ども個別ドライバー・車種設定
ALTER TABLE transport_details
  ADD COLUMN IF NOT EXISTS driver_member_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_id       UUID REFERENCES transport_vehicles(id) ON DELETE SET NULL;
