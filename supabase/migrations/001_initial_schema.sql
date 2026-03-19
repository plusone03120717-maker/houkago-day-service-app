-- =====================================================
-- 放課後等デイサービス管理アプリ 初期スキーマ
-- =====================================================

-- 拡張機能
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 組織・施設
-- =====================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  corporate_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE facilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  facility_number TEXT NOT NULL UNIQUE, -- 事業所番号（10桁）
  address TEXT,
  phone TEXT,
  service_types TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('afterschool', 'development_support')),
  capacity INTEGER NOT NULL DEFAULT 10,
  unit_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- ユーザー・スタッフ
-- =====================================================

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'parent')) DEFAULT 'staff',
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE staff_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  qualification TEXT,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('full_time', 'part_time')) DEFAULT 'full_time',
  hire_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE staff_unit_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, unit_id)
);

-- =====================================================
-- 児童・利用者
-- =====================================================

CREATE TABLE children (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  name_kana TEXT,
  birth_date DATE NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  address TEXT,
  school_name TEXT,
  grade TEXT,
  disability_type TEXT,
  allergy_info TEXT,
  medical_info TEXT,
  emergency_contact JSONB,
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE children_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (child_id, unit_id)
);

CREATE TABLE parent_children (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, child_id)
);

CREATE TABLE benefit_certificates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  certificate_number TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('afterschool', 'development_support')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  max_days_per_month INTEGER NOT NULL DEFAULT 23,
  copay_limit INTEGER NOT NULL DEFAULT 0,
  copay_category TEXT,
  municipality TEXT,
  alert_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 日々の記録・出席
-- =====================================================

CREATE TABLE daily_attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('attended', 'absent', 'cancel_waiting')) DEFAULT 'attended',
  check_in_time TIME,
  check_out_time TIME,
  pickup_type TEXT NOT NULL CHECK (pickup_type IN ('both', 'pickup_only', 'dropoff_only', 'none')) DEFAULT 'none',
  body_temperature DECIMAL(3,1),
  health_condition TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (child_id, unit_id, date)
);

CREATE TABLE activity_programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE daily_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attendance_id UUID NOT NULL REFERENCES daily_attendance(id) ON DELETE CASCADE,
  program_id UUID REFERENCES activity_programs(id),
  participated BOOLEAN NOT NULL DEFAULT TRUE,
  achievement_level INTEGER CHECK (achievement_level BETWEEN 1 AND 5),
  evaluation_notes TEXT,
  goal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE daily_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attendance_id UUID NOT NULL REFERENCES daily_attendance(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('daily_record', 'notable')) DEFAULT 'daily_record',
  content TEXT NOT NULL,
  has_notable_flag BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE record_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_record_id UUID REFERENCES daily_records(id) ON DELETE CASCADE,
  daily_activity_id UUID REFERENCES daily_activities(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video')),
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 送迎管理
-- =====================================================

CREATE TABLE transport_vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 4,
  driver_staff_id UUID REFERENCES staff_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE transport_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  vehicle_id UUID REFERENCES transport_vehicles(id),
  direction TEXT NOT NULL CHECK (direction IN ('pickup', 'dropoff')),
  driver_staff_id UUID REFERENCES staff_profiles(id),
  departure_time TIME,
  route_order INTEGER[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE transport_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES transport_schedules(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  attendance_id UUID REFERENCES daily_attendance(id),
  pickup_location TEXT,
  pickup_time TIME,
  actual_pickup_time TIME,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'boarded', 'arrived')) DEFAULT 'scheduled',
  parent_notified BOOLEAN NOT NULL DEFAULT FALSE,
  notification_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 利用予定・スケジュール
-- =====================================================

CREATE TABLE usage_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  day_of_week INTEGER[] NOT NULL DEFAULT '{}', -- 0=日, 1=月, ..., 6=土
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE usage_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'confirmed', 'cancelled', 'cancel_waiting')) DEFAULT 'reserved',
  requested_by UUID REFERENCES users(id),
  requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (child_id, unit_id, date)
);

-- =====================================================
-- 国保連請求
-- =====================================================

CREATE TABLE billing_monthly (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL, -- YYYYMM
  status TEXT NOT NULL CHECK (status IN ('draft', 'checked', 'exported', 'submitted', 'finalized')) DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_id, year_month)
);

CREATE TABLE billing_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_monthly_id UUID NOT NULL REFERENCES billing_monthly(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id),
  certificate_id UUID REFERENCES benefit_certificates(id),
  total_days INTEGER NOT NULL DEFAULT 0,
  total_units INTEGER NOT NULL DEFAULT 0,
  service_code TEXT,
  unit_price INTEGER NOT NULL DEFAULT 0,
  additions JSONB NOT NULL DEFAULT '[]',
  copay_amount INTEGER NOT NULL DEFAULT 0,
  billed_amount INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE billing_actual_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  item_name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  billing_monthly_id UUID REFERENCES billing_monthly(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE billing_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('invoice', 'receipt', 'proxy_notice')),
  copay_amount INTEGER NOT NULL DEFAULT 0,
  actual_cost_total INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 保護者向け機能
-- =====================================================

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id),
  content TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE contact_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attendance_id UUID REFERENCES daily_attendance(id),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ai_draft TEXT,
  staff_id UUID REFERENCES users(id),
  parent_comment TEXT,
  parent_commented_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('all', 'unit')) DEFAULT 'all',
  target_unit_id UUID REFERENCES units(id),
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  keys_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- updated_at 自動更新トリガー
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations', 'facilities', 'units', 'users', 'staff_profiles',
    'children', 'benefit_certificates', 'daily_attendance', 'activity_programs',
    'daily_activities', 'daily_records', 'transport_vehicles', 'transport_schedules',
    'transport_details', 'usage_plans', 'usage_reservations', 'billing_monthly',
    'billing_details', 'billing_actual_costs', 'billing_invoices', 'messages',
    'contact_notes', 'announcements'
  ]
  LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t);
  END LOOP;
END $$;

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_unit_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE benefit_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_actual_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分の情報を参照・更新できる
CREATE POLICY "users_self" ON users
  FOR ALL USING (auth.uid() = id);

-- スタッフ・管理者はfacilitiesを参照できる（自施設のみ）
CREATE POLICY "staff_read_facilities" ON facilities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff_profiles sp
      WHERE sp.user_id = auth.uid() AND sp.facility_id = facilities.id
    )
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- スタッフはunitsを参照できる
CREATE POLICY "staff_read_units" ON units
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff_profiles sp
      JOIN staff_unit_assignments sua ON sua.staff_id = sp.id
      WHERE sp.user_id = auth.uid() AND sua.unit_id = units.id
    )
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- 保護者は自分の子供の情報のみ参照できる
CREATE POLICY "parent_read_own_children" ON children
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_children pc
      WHERE pc.user_id = auth.uid() AND pc.child_id = children.id
    )
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
    )
  );

-- スタッフ・管理者はchildrenをCRUDできる
CREATE POLICY "staff_manage_children" ON children
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
    )
  );

-- メッセージは送受信者のみ参照できる
CREATE POLICY "messages_participants" ON messages
  FOR ALL USING (
    sender_id = auth.uid() OR receiver_id = auth.uid()
  );

-- push_subscriptions は本人のみ
CREATE POLICY "push_subscriptions_self" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid());

-- =====================================================
-- インデックス
-- =====================================================

CREATE INDEX idx_daily_attendance_date ON daily_attendance(date);
CREATE INDEX idx_daily_attendance_child_id ON daily_attendance(child_id);
CREATE INDEX idx_daily_attendance_unit_id ON daily_attendance(unit_id);
CREATE INDEX idx_usage_reservations_date ON usage_reservations(date);
CREATE INDEX idx_usage_reservations_child_id ON usage_reservations(child_id);
CREATE INDEX idx_contact_notes_child_id ON contact_notes(child_id);
CREATE INDEX idx_contact_notes_date ON contact_notes(date);
CREATE INDEX idx_messages_receiver ON messages(receiver_id, read_at);
CREATE INDEX idx_benefit_certificates_child_id ON benefit_certificates(child_id);
CREATE INDEX idx_benefit_certificates_end_date ON benefit_certificates(end_date);
