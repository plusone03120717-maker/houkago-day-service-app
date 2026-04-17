-- 新規追加の「プラスワン1」を削除
DELETE FROM units WHERE name = 'プラスワン1';

-- 既存の「プラスワン」を「プラスワン1」に改名
UPDATE units SET name = 'プラスワン1' WHERE name = 'プラスワン';
