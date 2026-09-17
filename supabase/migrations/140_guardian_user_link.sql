-- LINEの保護者（guardians）と 保護者ポータルのアカウント（users.role='parent'）を結び付ける。
--
-- これまで保護者は2系統に分かれていた。
--   LINE側    : guardians(line_user_id) ─ guardian_children ─ children
--   ポータル側: users(role='parent')    ─ parent_children   ─ children
-- 同じ保護者でも実体が別テーブルで、登録作業も2回必要だった。
-- guardians.user_id を張ることで「LINEで登録すればポータルにも入れる」状態にする。
ALTER TABLE guardians
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN guardians.user_id IS
  '同じ保護者の保護者ポータルアカウント。LINE登録時／ポータルアカウント作成時に自動で結び付ける。'
  'null＝ポータルアカウント未作成';

-- 一意にはしない。父母それぞれがLINE登録している家庭では、
-- 2つの guardians が同じ保護者ポータルアカウントを指すのが正しい形になる。
CREATE INDEX IF NOT EXISTS idx_guardians_user_id
  ON guardians (user_id) WHERE user_id IS NOT NULL;

-- 既存データの結び付け：
-- 同じ児童を見ている LINE保護者 と ポータル保護者 を1組だけ紐付ける。
-- 片方の児童に保護者アカウントが複数ある施設でも壊れないよう、最も古い1件を選ぶ。
UPDATE guardians g
SET user_id = sub.user_id
FROM (
  SELECT DISTINCT ON (gc.guardian_id)
    gc.guardian_id,
    pc.user_id
  FROM guardian_children gc
  JOIN parent_children pc ON pc.child_id = gc.child_id
  JOIN users u ON u.id = pc.user_id AND u.role = 'parent'
  ORDER BY gc.guardian_id, u.created_at
) sub
WHERE g.id = sub.guardian_id
  AND g.user_id IS NULL;
