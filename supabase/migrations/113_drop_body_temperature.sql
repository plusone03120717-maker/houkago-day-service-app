-- 体温は業務で使用しないため daily_attendance から削除する。
-- 適用時点で body_temperature に値が入っている行は 0 件（全1011行がNULL）のため、
-- この削除によって失われる記録はない。
ALTER TABLE daily_attendance DROP COLUMN IF EXISTS body_temperature;
