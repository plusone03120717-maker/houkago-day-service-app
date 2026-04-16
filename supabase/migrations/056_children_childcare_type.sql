-- 児童発達支援利用児童の通園先区分（保育園 or その他）
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS childcare_type TEXT CHECK (childcare_type IN ('nursery', 'other'));
