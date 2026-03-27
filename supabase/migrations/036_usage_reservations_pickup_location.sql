-- usage_reservations にお迎え場所を追加
ALTER TABLE usage_reservations
  ADD COLUMN IF NOT EXISTS pickup_location_type TEXT
    CHECK (pickup_location_type IN ('home', 'school'))
    DEFAULT 'home';
