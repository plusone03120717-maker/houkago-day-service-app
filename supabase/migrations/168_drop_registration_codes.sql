-- 保護者のLINE登録は「名前＋生年月日の申請 → スタッフ承認」（migration 167）に一本化し、
-- 登録コードの仕組みは使わないことにしたので、コードのテーブルを削除する。
-- コードで登録済みの保護者と児童の紐付けは guardian_children にあるので、消しても影響しない。
DROP TABLE IF EXISTS registration_codes;
