-- お迎え場所の表示名（別の自宅などカスタム名称）
-- null の場合は「自宅」として通知に表示される
ALTER TABLE child_transport_settings
  ADD COLUMN IF NOT EXISTS pickup_location_label TEXT;
