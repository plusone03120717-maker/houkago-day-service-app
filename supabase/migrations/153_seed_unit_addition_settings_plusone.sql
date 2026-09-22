-- 事業所の加算・減算設定の初期登録（ぷらすわん・放課後等デイサービス）
--
-- 出典は事業所から提供された、これまで使っていた請求システムの「算定情報」画面
-- （放課後等デイサービス／地域区分:その他／サービス給付費:障害児(10人以下)）。
-- 画面で「あり」または区分が選ばれていたものだけを登録する。
--
--   児童指導員等加配加算 … (2)常勤専従・経験5年未満
--   専門的支援加算       … あり（事業所の体制に対する「専門的支援体制加算」）
--   処遇改善加算         … 福祉・介護職員等処遇改善加算（Ⅰ）ロ
--
-- 上記以外（開所時間減算・定員超過利用減算・職員欠如減算・身体拘束廃止未実施減算・
-- 児発管欠如減算・自己評価結果等未公表減算・中核機能強化事業所加算・情報公表未報告減算・
-- 虐待防止措置未実施減算・業務継続計画未策定減算・支援プログラム未公表減算・
-- 福祉専門職員配置等加算・看護職員加配加算・児発管専任加算）は画面上すべて「なし」なので
-- 登録しない（未登録＝なし）。
--
-- 単位数・加算率・サービスコードは定員規模と届出区分で変わり、算定情報の画面からは
-- 読み取れないため 0 / NULL のままにする。未設定のままだと「出席実績から再集計」で
-- 「単位数（または率）が未設定です」と警告が出るので、単位数表と体制届の控えを見て
-- 設定 → 事業所の加算・減算設定 から入力すること。
--
-- 体制届は事業所番号ごとの届出なので、請求対象の放デイユニット（プラスワン1・プラスワン2）
-- に同じ区分を入れる。定員規模が違うぶんは単位数・サービスコードの入力時に区別する。
-- 児童発達支援のユニットはアプリに未登録のため、児発の算定情報はここでは登録しない。

INSERT INTO unit_addition_settings (unit_id, addition_key, option_value, unit_count, rate, billing_code)
SELECT u.id, v.addition_key, v.option_value, 0, NULL, NULL
FROM units u
CROSS JOIN (VALUES
  ('child_instructor_extra', 'fulltime_under5y'),
  ('specialized_support_system', 'yes'),
  ('treatment_improvement', 'I')
) AS v(addition_key, option_value)
WHERE u.service_type = 'afterschool'
  AND u.is_billing_target = true
ON CONFLICT (unit_id, addition_key) DO NOTHING;
