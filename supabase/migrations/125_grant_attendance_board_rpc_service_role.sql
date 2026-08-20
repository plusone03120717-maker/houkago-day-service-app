-- 124 で PUBLIC から REVOKE したため、service_role からも実行できなくなっていた。
-- サーバー側のバッチ・検証用途で呼べるように明示的に付与する。
-- （関数は SECURITY INVOKER なので、権限のある呼び出し元の RLS がそのまま適用される）

GRANT EXECUTE ON FUNCTION public.get_attendance_board(uuid, date) TO service_role;
