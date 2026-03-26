-- 学校マスタテーブル
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_schools" ON schools
  FOR SELECT USING (auth.role() = 'authenticated');

-- 学校マスタデータ
INSERT INTO schools (municipality, name, address) VALUES
('富士河口湖町', '富士河口湖町立船津小学校', '山梨県南都留郡富士河口湖町船津3737'),
('富士河口湖町', '富士河口湖町立小立小学校', '山梨県南都留郡富士河口湖町小立2446'),
('富士河口湖町', '富士河口湖町立大石小学校', '山梨県南都留郡富士河口湖町大石1425'),
('富士河口湖町', '富士河口湖町立河口小学校', '山梨県南都留郡富士河口湖町河口1560'),
('富士河口湖町', '富士河口湖町立勝山小学校', '山梨県南都留郡富士河口湖町勝山1047'),
('富士河口湖町', '富士河口湖町立西浜小学校', '山梨県南都留郡富士河口湖町長浜2427'),
('富士河口湖町', '富士河口湖町立大嵐小学校', '山梨県南都留郡富士河口湖町大嵐559'),
('富士河口湖町', '富士河口湖町立富士豊茂小学校', '山梨県南都留郡富士河口湖町富士ヶ嶺1209'),
('鳴沢村',       '鳴沢村立鳴沢小学校',           '山梨県南都留郡鳴沢村1585'),
('忍野村',       '忍野村立忍野小学校',             '山梨県南都留郡忍野村忍草1516'),
('富士吉田市',   '富士吉田市立明見小学校',         '山梨県富士吉田市小明見2113'),
('富士吉田市',   '富士吉田市立下吉田第一小学校',   '山梨県富士吉田市新町1丁目8-1'),
('富士吉田市',   '富士吉田市立下吉田第二小学校',   '山梨県富士吉田市緑ヶ丘2丁目8-2'),
('富士吉田市',   '富士吉田市立下吉田東小学校',     '山梨県富士吉田市下吉田9丁目21-1'),
('富士吉田市',   '富士吉田市立富士小学校',         '山梨県富士吉田市上暮地1丁目22-1'),
('富士吉田市',   '富士吉田市立吉田小学校',         '山梨県富士吉田市上吉田5丁目1-1'),
('富士吉田市',   '富士吉田市立吉田西小学校',       '山梨県富士吉田市新西原3丁目7-1'),
('富士河口湖町', '山梨県立ふじざくら支援学校',     '山梨県南都留郡富士河口湖町船津6663-1');

-- childrenテーブルに school_id カラムを追加
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE SET NULL;
