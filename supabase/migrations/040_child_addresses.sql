-- 子どもの複数住所テーブル
-- 自宅・祖父母宅など複数の住所を名前付きで管理できる
CREATE TABLE IF NOT EXISTS child_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '自宅',
  postal_code TEXT,
  address TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE child_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage child_addresses"
  ON child_addresses FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
