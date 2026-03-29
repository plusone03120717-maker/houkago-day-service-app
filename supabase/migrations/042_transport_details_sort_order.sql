-- 送迎詳細にルート順序カラムを追加（ドラッグで並び替え可能にするため）
ALTER TABLE transport_details
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
