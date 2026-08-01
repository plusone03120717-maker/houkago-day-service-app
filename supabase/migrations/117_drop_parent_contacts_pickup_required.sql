-- migration 116 で transport_type に置き換えたため、旧列 pickup_required を削除する。
-- 116 適用 → 新コードのデプロイ完了を確認した後に実行すること。
ALTER TABLE parent_attendance_contacts
  DROP COLUMN IF EXISTS pickup_required;
