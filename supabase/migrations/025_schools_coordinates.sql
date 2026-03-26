-- 学校マスタに緯度経度を追加
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

UPDATE schools SET latitude = 35.5051, longitude = 138.7556 WHERE name = '富士河口湖町立船津小学校';
UPDATE schools SET latitude = 35.5031, longitude = 138.7424 WHERE name = '富士河口湖町立小立小学校';
UPDATE schools SET latitude = 35.5133, longitude = 138.7227 WHERE name = '富士河口湖町立大石小学校';
UPDATE schools SET latitude = 35.4976, longitude = 138.7657 WHERE name = '富士河口湖町立河口小学校';
UPDATE schools SET latitude = 35.4867, longitude = 138.7710 WHERE name = '富士河口湖町立勝山小学校';
UPDATE schools SET latitude = 35.4779, longitude = 138.7784 WHERE name = '富士河口湖町立西浜小学校';
UPDATE schools SET latitude = 35.4659, longitude = 138.7775 WHERE name = '富士河口湖町立大嵐小学校';
UPDATE schools SET latitude = 35.4263, longitude = 138.7228 WHERE name = '富士河口湖町立富士豊茂小学校';
UPDATE schools SET latitude = 35.4569, longitude = 138.6880 WHERE name = '鳴沢村立鳴沢小学校';
UPDATE schools SET latitude = 35.4698, longitude = 138.8397 WHERE name = '忍野村立忍野小学校';
UPDATE schools SET latitude = 35.4759, longitude = 138.7947 WHERE name = '富士吉田市立明見小学校';
UPDATE schools SET latitude = 35.4870, longitude = 138.8094 WHERE name = '富士吉田市立下吉田第一小学校';
UPDATE schools SET latitude = 35.4854, longitude = 138.8164 WHERE name = '富士吉田市立下吉田第二小学校';
UPDATE schools SET latitude = 35.4892, longitude = 138.8224 WHERE name = '富士吉田市立下吉田東小学校';
UPDATE schools SET latitude = 35.4940, longitude = 138.7986 WHERE name = '富士吉田市立富士小学校';
UPDATE schools SET latitude = 35.4979, longitude = 138.8098 WHERE name = '富士吉田市立吉田小学校';
UPDATE schools SET latitude = 35.5001, longitude = 138.8046 WHERE name = '富士吉田市立吉田西小学校';
UPDATE schools SET latitude = 35.5050, longitude = 138.7439 WHERE name = '山梨県立ふじざくら支援学校';
