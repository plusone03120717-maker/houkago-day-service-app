-- =====================================================
-- アプリ内サポートボットへの問い合わせ
-- =====================================================
-- これまで「スタッフ → 管理者 → 開発」と口頭で伝言していた不具合報告・
-- 操作の質問を、アプリ内のボットが一次受けする。
--
-- 【設計方針】
-- 会話は必ず1件の support_inquiries として残す。ボットだけで解決した
-- ものも残すのは、「スタッフが実際に何につまずいているか」がマニュアル
-- 改訂と機能改善の一次情報になるため。ボットで解決しなかったものだけを
-- エスカレーション（status='open'）して管理者の対応待ち行列に載せる。
--
-- title / category / summary などのチケット項目が空のまま作られるのは
-- 意図的。会話の途中では何の問い合わせか確定しないので、エスカレーション
-- 時に会話全体をAIが要約して初めて埋まる。

CREATE TABLE IF NOT EXISTS support_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 退職・アカウント削除後も「誰が出した問い合わせか」を追えるように非正規化
  created_by_name TEXT,
  -- 問い合わせを始めた画面。再現手順を聞き出す手間が減る
  page_path TEXT,

  -- ここから下はエスカレーション時にAIが会話から起こす
  title TEXT,
  category TEXT CHECK (category IN ('bug', 'input_mistake', 'how_to', 'request', 'other')),
  severity TEXT CHECK (severity IN ('high', 'medium', 'low')),
  summary TEXT,
  steps TEXT,
  expected TEXT,
  actual TEXT,

  -- 'bot_only'    = ボット対応のみで完結（管理者の対応待ちではない）
  -- 'open'        = 管理者に報告済み・未対応
  -- 'in_progress' = 対応中
  -- 'resolved'    = 対応済み
  -- 'dismissed'   = 対応不要
  status TEXT NOT NULL
    CHECK (status IN ('bot_only', 'open', 'in_progress', 'resolved', 'dismissed'))
    DEFAULT 'bot_only',
  -- 管理者の未読フラグ。他の通知（overtime_requests 等）と同じ is_new 方式に揃える
  is_new BOOLEAN NOT NULL DEFAULT FALSE,
  admin_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  escalated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_support_inquiries_status
  ON support_inquiries (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_inquiries_creator
  ON support_inquiries (created_by, updated_at DESC);

-- =====================================================
-- 会話ログ
-- =====================================================
-- Claude に渡す会話履歴そのもの。role は API の messages 形式に合わせる。

CREATE TABLE IF NOT EXISTS support_inquiry_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES support_inquiries(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_inquiry_messages_inquiry
  ON support_inquiry_messages (inquiry_id, created_at);

-- =====================================================
-- RLS
-- =====================================================
-- 参照：自分が出した問い合わせ、または管理者なら全件。
-- 書き込み：会話中の INSERT/UPDATE はすべて API ルート側が service_role で行う
-- （ログイン確認と本人確認は API 側で必ず実施）。したがって一般ユーザー向けの
-- INSERT ポリシーは作らない ＝ 他人の会話に発言を差し込むことが構造的にできない。
-- 管理者だけは対応状況を画面から直接更新するので UPDATE ポリシーを与える。

ALTER TABLE support_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_inquiry_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own or admin can read support_inquiries" ON support_inquiries;
CREATE POLICY "Own or admin can read support_inquiries"
  ON support_inquiries FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admin can update support_inquiries" ON support_inquiries;
CREATE POLICY "Admin can update support_inquiries"
  ON support_inquiries FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Own or admin can read support_inquiry_messages" ON support_inquiry_messages;
CREATE POLICY "Own or admin can read support_inquiry_messages"
  ON support_inquiry_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM support_inquiries i
      WHERE i.id = inquiry_id
        AND (
          i.created_by = auth.uid()
          OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
        )
    )
  );
