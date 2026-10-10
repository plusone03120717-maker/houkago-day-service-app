-- 保護者のLINE初回登録を「申請 → スタッフ承認」で行えるようにする。
--
-- これまでは児童ごとに登録コードを発行し、保護者へ1人ずつ送っていた。
-- 公式LINEで全員に一斉案内したいが、コードは個別なので一斉送信に載せられず、
-- 「コードが通らない」「なくした」という問い合わせも1件ずつ受けることになる。
--
-- 申請方式では、保護者は全員共通のURLから「お子さまの名前（ひらがな）＋生年月日」を送り、
-- スタッフが児童を選んで承認する。入力は候補を探す手がかりにすぎず、
-- 紐付ける児童はスタッフが決めるので、表記ゆれがあっても登録できる。
CREATE TABLE IF NOT EXISTS guardian_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id text NOT NULL,
  line_display_name text,
  child_name_kana text NOT NULL,
  birth_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_child_id uuid REFERENCES children(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE guardian_registration_requests IS
  '保護者のLINE初回登録の申請。スタッフが児童を選んで承認すると guardians / guardian_children が作られる';

-- 承認待ちは1つのLINEアカウントにつき1件。送り直したら上書きする
CREATE UNIQUE INDEX IF NOT EXISTS uq_guardian_registration_requests_pending
  ON guardian_registration_requests (line_user_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_guardian_registration_requests_status
  ON guardian_registration_requests (status, created_at DESC);

ALTER TABLE guardian_registration_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can manage guardian_registration_requests"
  ON guardian_registration_requests FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'staff')
    )
  );
