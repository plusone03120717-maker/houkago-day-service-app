-- モニタリング記録に専門的支援フィールドを追加
ALTER TABLE monitoring_records
  ADD COLUMN IF NOT EXISTS specialized_support TEXT;
