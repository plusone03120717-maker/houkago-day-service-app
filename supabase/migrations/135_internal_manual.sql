-- =====================================================
-- 社内マニュアル
-- =====================================================
-- アプリの操作マニュアル（docs/manual.html）とは別に、法人の運用ルールや
-- 支援の方針といった「事業所の中の知識」を溜める場所。
-- サポートボットはここに書かれた内容も根拠にして職員の質問に答える。
--
-- 【設計方針】
-- 現場の知識は、整った文章としてではなく「気づいたときの短いメモ」として
-- しか出てこない。そこで2段構えにする。
--
--   internal_notes            … 職員が思いついたときに放り込む断片。誰でも書ける
--   internal_manual_articles  … それを整えた読み物。管理者が確定させたものだけ
--
-- ボットが根拠にするのは確定済みの記事だけ。書きかけのメモを事実として
-- 職員に案内してしまうと、誤った社内ルールが独り歩きするため。

CREATE TABLE IF NOT EXISTS internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 分類。アプリ側の定数（lib/internal-manual/categories.ts）と対応する
  category TEXT NOT NULL
    CHECK (category IN ('corporate', 'afterschool', 'development', 'other')),
  content TEXT NOT NULL,
  -- 'open'     = まだマニュアルに反映していない
  -- 'included' = 記事に取り込み済み
  -- 'archived' = 反映しないと判断した
  status TEXT NOT NULL CHECK (status IN ('open', 'included', 'archived')) DEFAULT 'open',
  -- 取り込み先の記事。記事が消えてもメモは残す（元の気づきまで失わないため）
  article_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 退職後も「誰の気づきだったか」を残す
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_notes_category
  ON internal_notes (category, status, created_at DESC);

CREATE TABLE IF NOT EXISTS internal_manual_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL
    CHECK (category IN ('corporate', 'afterschool', 'development', 'other')),
  title TEXT NOT NULL,
  -- 公開されている本文。ボットが読むのはここだけ
  body TEXT NOT NULL DEFAULT '',
  -- AIが作った未確定の改訂案。確定すると body へ移して NULL に戻す。
  -- 版管理テーブルを別に作らないのは、「今の内容」と「これから直す案」の
  -- 2つさえ見えれば運用が回るため。過去版が必要になったら別途用意する。
  draft_body TEXT,
  -- 'draft'     = まだ一度も公開していない（ボットは読まない）
  -- 'published' = 公開中
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_internal_manual_articles_category
  ON internal_manual_articles (category, status, sort_order, created_at);

-- =====================================================
-- RLS
-- =====================================================
-- 保護者も authenticated なので、role で必ず絞る。
-- メモは職員なら誰でも書ける（現場の気づきを集めるのが目的）。
-- 記事の作成・編集・公開は管理者だけ（＝ボットの回答根拠になる内容の門番）。

ALTER TABLE internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_manual_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read internal_notes" ON internal_notes;
CREATE POLICY "Staff can read internal_notes"
  ON internal_notes FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff')));

DROP POLICY IF EXISTS "Staff can insert internal_notes" ON internal_notes;
CREATE POLICY "Staff can insert internal_notes"
  ON internal_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- 自分のメモは直せる。他人のメモを整理できるのは管理者だけ
DROP POLICY IF EXISTS "Own or admin can update internal_notes" ON internal_notes;
CREATE POLICY "Own or admin can update internal_notes"
  ON internal_notes FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Own or admin can delete internal_notes" ON internal_notes;
CREATE POLICY "Own or admin can delete internal_notes"
  ON internal_notes FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Staff can read internal_manual_articles" ON internal_manual_articles;
CREATE POLICY "Staff can read internal_manual_articles"
  ON internal_manual_articles FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff')));

DROP POLICY IF EXISTS "Admin can write internal_manual_articles" ON internal_manual_articles;
CREATE POLICY "Admin can write internal_manual_articles"
  ON internal_manual_articles FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- =====================================================
-- 問い合わせの区分に「社内ルール」を追加
-- =====================================================
-- ボットが社内マニュアルにも答えるようになるため、
-- 「アプリの使い方」とは別の区分で管理者に届くようにする。

ALTER TABLE support_inquiries DROP CONSTRAINT IF EXISTS support_inquiries_category_check;
ALTER TABLE support_inquiries
  ADD CONSTRAINT support_inquiries_category_check
  CHECK (category IN ('bug', 'input_mistake', 'how_to', 'internal_rule', 'request', 'other'));
