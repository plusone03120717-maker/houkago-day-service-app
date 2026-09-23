-- 児童発達支援のユニットを追加し、算定情報を登録する
--
-- これまでアプリに登録されていたユニットは4つとも放課後等デイサービスで、
-- 児童発達支援の請求先（ユニット）が存在しなかった。事業所から提供された
-- 「算定情報」画面には児童発達支援の分も載っているため、ユニットを作って
-- 同じ区分を登録する。
--
-- 算定情報（児童発達支援／地域区分:その他／
-- サービス給付費:児童発達支援センター以外・障害児(10人以下)／主に未就学児）:
--   児童指導員等加配加算 … (2)常勤専従・経験5年未満
--   専門的支援加算       … あり（事業所の体制に対する「専門的支援体制加算」）
--   上記以外の加算・減算 … すべて「なし」
--   処遇改善加算         … 画面では「-」で読み取れなかったため登録しない
--
-- 定員は「障害児(10人以下)」から10人とする。実際の定員が違う場合は
-- 設定 → 施設・ユニット管理 で変更する。
-- 単位数・サービスコードは算定情報からは読み取れないため未設定のままにする。

-- ── 1. ユニット ──────────────────────────────────────────
INSERT INTO units (facility_id, name, service_type, capacity, is_active, is_billing_target)
SELECT f.id, '児童発達支援', 'development_support', 10, true, true
FROM facilities f
WHERE NOT EXISTS (
  SELECT 1 FROM units u
  WHERE u.facility_id = f.id AND u.service_type = 'development_support'
)
ORDER BY f.created_at
LIMIT 1;

-- ── 2. サービス項目 ──────────────────────────────────────
-- 放デイのユニットと同じ構成。単位数・サービスコードは未設定（要入力）。
-- 専門的支援実施加算だけは 142 と同じく児発のコード・単位数を入れる。
INSERT INTO billing_service_items (unit_id, name, category, trigger_field, billing_code, unit_count, is_active, sort_order)
SELECT u.id, v.name, v.category, v.trigger_field, v.billing_code, v.unit_count, true, v.sort_order
FROM units u
CROSS JOIN (VALUES
  ('児発基本報酬',         '基本', 'basic',               NULL,     0,   1),
  ('送迎加算（迎え）',     '加算', 'transport_pickup',    NULL,     0,   2),
  ('送迎加算（送り）',     '加算', 'transport_dropoff',   NULL,     0,   3),
  ('欠席時対応加算',       '加算', 'absent',              NULL,     0,   4),
  ('延長加算',             '加算', 'extension',           NULL,     0,   5),
  ('専門的支援実施加算',   '加算', 'specialized_support', '615702', 150, 900)
) AS v(name, category, trigger_field, billing_code, unit_count, sort_order)
WHERE u.service_type = 'development_support'
  AND NOT EXISTS (
    SELECT 1 FROM billing_service_items i
    WHERE i.unit_id = u.id AND i.trigger_field = v.trigger_field
  );

-- ── 3. 事業所の加算・減算設定（算定情報） ────────────────
INSERT INTO unit_addition_settings (unit_id, addition_key, option_value, unit_count, rate, billing_code)
SELECT u.id, v.addition_key, v.option_value, 0, NULL, NULL
FROM units u
CROSS JOIN (VALUES
  ('child_instructor_extra', 'fulltime_under5y'),
  ('specialized_support_system', 'yes')
) AS v(addition_key, option_value)
WHERE u.service_type = 'development_support'
  AND u.is_billing_target = true
ON CONFLICT (unit_id, addition_key) DO NOTHING;
