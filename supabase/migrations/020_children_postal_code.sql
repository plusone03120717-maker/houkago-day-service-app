-- children テーブルに郵便番号カラムを追加
ALTER TABLE children ADD COLUMN IF NOT EXISTS postal_code TEXT;
