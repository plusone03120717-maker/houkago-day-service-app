-- 受給者証に上限管理事業所を追加
ALTER TABLE benefit_certificates ADD COLUMN IF NOT EXISTS upper_limit_manager TEXT;
