-- =====================================================
-- 議事録
-- =====================================================
-- 会議で決まったことは、その場のメモのまま誰も見返さない形で埋もれる。
-- ここに残し、社内マニュアル（135）へ流し込めるようにする。
--
-- 【設計方針】
-- 走り書き（raw_body）と、AIが整えた議事録（formatted_body）を別々に持つ。
-- 整形をやり直したくなったときに元のメモへ戻れるようにするため。
-- 画面で読むのも、マニュアルへ反映するのも formatted_body を使う。
--
-- 議事録からマニュアルへは直接記事を作らず、いったん internal_notes
-- （メモ）に落とす。マニュアル記事にするかどうかの判断は、既存の
-- 「メモを溜めて記事に起こす」流れに合流させたほうが、確認の段が
-- 増えて事故が減るため。

CREATE TABLE IF NOT EXISTS meeting_minutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  meeting_date DATE NOT NULL,
  attendees TEXT,
  -- 会議中の走り書き。整形の元になる
  raw_body TEXT NOT NULL DEFAULT '',
  -- AIが整えた議事録。空のうちは raw_body を表示する
  formatted_body TEXT,
  -- 'draft'     = 作成中
  -- 'finalized' = 確定（読み返す対象・マニュアル反映の対象）
  status TEXT NOT NULL CHECK (status IN ('draft', 'finalized')) DEFAULT 'draft',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 退職後も「誰が書いた議事録か」を残す
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  -- 社内マニュアルへ反映した日時。二度手間を防ぐために画面へ出す
  reflected_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_date
  ON meeting_minutes (meeting_date DESC, created_at DESC);

-- どの議事録から生まれたメモなのかを辿れるようにする。
-- 議事録が消えてもメモは残す（決まったこと自体は失わない）。
ALTER TABLE internal_notes
  ADD COLUMN IF NOT EXISTS source_minutes_id UUID
    REFERENCES meeting_minutes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internal_notes_source_minutes
  ON internal_notes (source_minutes_id);

-- =====================================================
-- RLS
-- =====================================================
-- 保護者も authenticated なので role で必ず絞る。
-- 議事録は会議に出た職員が書くものなので、作成は職員なら誰でも。
-- 他人の議事録を直せるのは管理者だけ。
-- 社内マニュアルへの反映（＝ボットの回答根拠に近づける操作）は
-- API 側で管理者に限定している。

ALTER TABLE meeting_minutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read meeting_minutes" ON meeting_minutes;
CREATE POLICY "Staff can read meeting_minutes"
  ON meeting_minutes FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff')));

DROP POLICY IF EXISTS "Staff can insert meeting_minutes" ON meeting_minutes;
CREATE POLICY "Staff can insert meeting_minutes"
  ON meeting_minutes FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

DROP POLICY IF EXISTS "Own or admin can update meeting_minutes" ON meeting_minutes;
CREATE POLICY "Own or admin can update meeting_minutes"
  ON meeting_minutes FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Own or admin can delete meeting_minutes" ON meeting_minutes;
CREATE POLICY "Own or admin can delete meeting_minutes"
  ON meeting_minutes FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
