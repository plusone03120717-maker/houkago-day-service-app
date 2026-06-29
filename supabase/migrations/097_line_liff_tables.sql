-- 保護者とLINEユーザーIDの紐付け
create table guardians (
  id uuid primary key default gen_random_uuid(),
  line_user_id text unique not null,
  name text,
  created_at timestamptz default now()
);

-- 保護者と児童の中間テーブル（兄弟児童対応）
create table guardian_children (
  guardian_id uuid references guardians(id) on delete cascade,
  child_id uuid references children(id) on delete cascade,
  primary key (guardian_id, child_id)
);

-- 初回紐付け用ワンタイムコード（スタッフが事前発行）
create table registration_codes (
  code text primary key,
  child_id uuid references children(id) on delete cascade,
  used boolean default false,
  created_at timestamptz default now()
);

-- 保護者からの日次利用連絡（既存のdaily_attendanceと区別するため命名）
create table parent_attendance_contacts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid references children(id) on delete cascade,
  date date not null,
  status text not null check (status in ('attending', 'absent')),
  pickup_required boolean default false,
  note text,
  reported_via text default 'line',
  reported_at timestamptz default now(),
  unique (child_id, date)
);

-- RLS有効化（service_roleキー経由のAPI Routeのみアクセス許可）
alter table guardians enable row level security;
alter table guardian_children enable row level security;
alter table registration_codes enable row level security;
alter table parent_attendance_contacts enable row level security;

-- スタッフ・管理者は全テーブルを読み書き可能
create policy "staff can manage guardians"
  on guardians for all
  to authenticated
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'staff')
    )
  );

create policy "staff can manage guardian_children"
  on guardian_children for all
  to authenticated
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'staff')
    )
  );

create policy "staff can manage registration_codes"
  on registration_codes for all
  to authenticated
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'staff')
    )
  );

create policy "staff can manage parent_attendance_contacts"
  on parent_attendance_contacts for all
  to authenticated
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'staff')
    )
  );
