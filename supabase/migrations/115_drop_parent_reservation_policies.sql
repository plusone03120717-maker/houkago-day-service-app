-- 保護者ポータルの利用予約機能を廃止（LINE利用連絡に一本化）したため、
-- 保護者が usage_reservations を読み書きするRLSポリシーを削除する。
-- スタッフ・管理者向けのポリシーはそのまま維持され、利用管理画面は影響を受けない。
DROP POLICY IF EXISTS "parent_insert_own_reservations" ON usage_reservations;
DROP POLICY IF EXISTS "parent_update_own_reservations" ON usage_reservations;
DROP POLICY IF EXISTS "parent_read_own_reservations" ON usage_reservations;
