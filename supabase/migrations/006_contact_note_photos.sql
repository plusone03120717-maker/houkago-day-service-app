-- =====================================================
-- 連絡帳写真添付
-- =====================================================

-- Supabase Storage バケット作成
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contact-photos',
  'contact-photos',
  false,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- 写真メタデータテーブル
CREATE TABLE IF NOT EXISTS contact_note_photos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id     UUID NOT NULL REFERENCES contact_notes(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  mime_type   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_note_photos_note_id ON contact_note_photos(note_id);

ALTER TABLE contact_note_photos ENABLE ROW LEVEL SECURITY;

-- スタッフ: 自分が担当するノートの写真のみ読み書き可
CREATE POLICY "staff_manage_photos" ON contact_note_photos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff')
    )
  );

-- Storage RLS ポリシー
CREATE POLICY "staff_upload_contact_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contact-photos'
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "staff_read_contact_photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contact-photos'
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff', 'parent'))
  );

CREATE POLICY "staff_delete_contact_photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'contact-photos'
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );
