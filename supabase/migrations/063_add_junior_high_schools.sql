-- facility_type に junior_high を追加
ALTER TABLE schools
  DROP CONSTRAINT IF EXISTS schools_facility_type_check;
ALTER TABLE schools
  ADD CONSTRAINT schools_facility_type_check
    CHECK (facility_type IN ('school', 'nursery', 'junior_high'));

-- 中学校データを挿入
INSERT INTO schools (municipality, name, address, facility_type) VALUES
-- 富士河口湖町
('富士河口湖町', '富士河口湖町立 河口湖北中学校', '山梨県南都留郡富士河口湖町河口3210', 'junior_high'),
('富士河口湖町', '富士河口湖町立 勝山中学校', '山梨県南都留郡富士河口湖町勝山1047', 'junior_high'),
('富士河口湖町', '組合立 河口湖南中学校', '山梨県南都留郡富士河口湖町船津1164', 'junior_high'),
('富士河口湖町', '私立 素和美中学校', '山梨県南都留郡富士河口湖町小立5931', 'junior_high'),
-- 富士吉田市
('富士吉田市', '富士吉田市立 下吉田中学校', '山梨県富士吉田市新町4-12-27', 'junior_high'),
('富士吉田市', '富士吉田市立 吉田中学校', '山梨県富士吉田市上吉田1-3-6', 'junior_high'),
('富士吉田市', '富士吉田市立 明見中学校', '山梨県富士吉田市小明見2327', 'junior_high'),
('富士吉田市', '富士吉田市立 富士見台中学校', '山梨県富士吉田市上暮地1-6-1', 'junior_high'),
('富士吉田市', '私立 富士学苑中学校', '山梨県富士吉田市下吉田1001-1', 'junior_high'),
-- 忍野村
('忍野村', '忍野村立 忍野中学校', '山梨県南都留郡忍野村忍草1666-36', 'junior_high');
