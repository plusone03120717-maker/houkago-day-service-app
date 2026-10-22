-- 施設長（お金まわりを外した管理者）を追加するにあたり、権限の列を本人が書き換えられないようにする。
--
-- users には「本人は自分の行を何でも変えられる」ポリシー（users_self・FOR ALL）しかないため、
-- ログイン中のスタッフや保護者が、ブラウザから自分の users.role を 'admin' に書き換えられてしまう。
-- 施設長も job_titles から facility_manager を消せば、請求・給与まで開けてしまう。
--
-- そこで users.role と users.job_titles は、サーバーの API（service role）か、DB に直接つないだ作業だけが
-- 変えられるようにする。役職の変更は画面から /api/staff/access・/api/staff/invite を通す。
-- 名前・LINE User ID など、ほかの列はこれまでどおり変えられる。

CREATE OR REPLACE FUNCTION guard_users_access_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- service_role（サーバーの API）と、DB に直接つないだ作業（auth.role() が NULL）は通す
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- ブラウザから作ってよいのは保護者の行だけ
    IF NEW.role IS DISTINCT FROM 'parent' OR coalesce(array_length(NEW.job_titles, 1), 0) > 0 THEN
      RAISE EXCEPTION 'スタッフ・管理者のアカウントは、スタッフ管理の画面から登録してください'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.role IS DISTINCT FROM OLD.role OR NEW.job_titles IS DISTINCT FROM OLD.job_titles THEN
    RAISE EXCEPTION '役職・権限は、スタッフ管理の画面から変更してください'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_access_guard ON users;
CREATE TRIGGER users_access_guard
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_users_access_columns();

COMMENT ON FUNCTION guard_users_access_columns() IS
  'users.role / users.job_titles（システム管理者・施設長・サービス管理者など）をブラウザから変えさせない';
