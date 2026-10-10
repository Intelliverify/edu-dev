-- Auto-generated schema dump of client-prod (mmzn) public schema
-- Generated 2026-10-10T09:19:27.246Z
set check_function_bodies = off;

-- ========== EXTENSIONS (4) ==========
create extension if not exists "pg_stat_statements" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "supabase_vault" with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- ========== SEQUENCES (2) ==========
create sequence if not exists public.fee_receipt_seq;
create sequence if not exists public.vehicle_location_history_id_seq;

-- ========== FUNCTIONS (6) ==========
CREATE OR REPLACE FUNCTION public.calc_child_age_months()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  BEGIN
    IF NEW.child_dob IS NOT NULL THEN
      NEW.child_age_months := (
        EXTRACT(YEAR  FROM age(NOW(), NEW.child_dob::date)) * 12 +
        EXTRACT(MONTH FROM age(NOW(), NEW.child_dob::date))
      )::INTEGER;
    END IF;
    RETURN NEW;
  END;
  $function$
;

CREATE OR REPLACE FUNCTION public.generate_receipt_number()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
  begin
    return 'EPS-RCP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receipt_number_seq')::text, 4, '0');
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.run_transport_cleanup_auto()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  paused boolean;
BEGIN
  SELECT COALESCE(
    (SELECT setting_value::boolean
     FROM transport_settings
     WHERE setting_key = 'cleanup_paused'),
    false
  ) INTO paused;

  IF paused THEN
    RETURN 'skipped (paused by admin)';
  END IF;

  DELETE FROM vehicle_location_history
    WHERE recorded_at < NOW() - INTERVAL '7 days';

  DELETE FROM ride_logs
    WHERE date < (NOW() - INTERVAL '30 days')::date;

  RETURN 'done';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_kb_chunks(query_text text, target_filter text DEFAULT 'parent'::text, limit_count integer DEFAULT 5)
 RETURNS TABLE(id uuid, content text, document_id uuid, document_title text, doc_type text, rank real)
 LANGUAGE plpgsql
AS $function$
  begin
    return query
      select
        kc.id,
        kc.content,
        kc.document_id,
        kd.title  as document_title,
        kd.doc_type,
        ts_rank(kc.content_tsv, plainto_tsquery('english', query_text)) as rank
      from kb_chunks kc
      join kb_documents kd on kd.id = kc.document_id
      where kd.is_active = true
        and (kd.target = target_filter or kd.target = 'both' or target_filter = 'both')
        and kc.content_tsv @@ plainto_tsquery('english', query_text)
      order by rank desc
      limit limit_count;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  begin
    new.updated_at = now();
    return new;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

-- ========== TABLES (63) ==========
create table if not exists public.academic_years (
  id uuid default gen_random_uuid() not null,
  label text not null,
  start_date date not null,
  end_date date not null,
  is_current boolean default false,
  created_at timestamp with time zone default now()
);

create table if not exists public.admin_accounts (
  id uuid default uuid_generate_v4() not null,
  username text not null,
  password_hash text not null,
  name text,
  role text default 'admin'::text,
  last_login timestamp with time zone,
  created_at timestamp with time zone default now(),
  is_active boolean default true
);

create table if not exists public.announcements (
  id uuid default uuid_generate_v4() not null,
  title text not null,
  body text not null,
  target text default 'all'::text,
  priority text default 'normal'::text,
  created_by uuid,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create table if not exists public.app_feature_flags (
  key text not null,
  enabled boolean default false,
  updated_at timestamp with time zone default now(),
  updated_by text
);

create table if not exists public.attendance (
  id uuid default uuid_generate_v4() not null,
  student_id uuid,
  date date not null,
  status text not null,
  check_in_time time without time zone,
  check_out_time time without time zone,
  marked_by uuid,
  notes text,
  created_at timestamp with time zone default now()
);

create table if not exists public.audio_overviews (
  id uuid default gen_random_uuid() not null,
  title text not null,
  source_type text default 'custom'::text,
  source_id uuid,
  script text,
  audio_url text,
  duration_seconds integer,
  status text default 'pending'::text,
  created_by text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  language text default 'en'::text
);

create table if not exists public.blog_posts (
  id uuid default gen_random_uuid() not null,
  title text not null,
  slug text not null,
  excerpt text default ''::text,
  content text not null,
  category text default 'news'::text not null,
  cover_image_url text default ''::text,
  author text default 'Evergreen Team'::text,
  is_published boolean default false,
  published_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.calendar_events (
  id uuid default uuid_generate_v4() not null,
  title text not null,
  event_date date not null,
  end_date date,
  event_type text not null,
  description text,
  icon text default '📅'::text,
  color text default '#178F78'::text,
  affects text default 'all'::text,
  is_holiday boolean default false,
  created_by text,
  created_at timestamp with time zone default now()
);

create table if not exists public.channel_members (
  id uuid default gen_random_uuid() not null,
  channel_id uuid not null,
  user_type text not null,
  user_ref text not null,
  display_name text not null,
  avatar_emoji text default '😊'::text not null,
  joined_at timestamp with time zone default now() not null
);

create table if not exists public.child_documents (
  id uuid default gen_random_uuid() not null,
  enquiry_id uuid,
  child_name text,
  document_type text not null,
  document_label text,
  file_url text not null,
  file_name text,
  file_size integer,
  mime_type text,
  uploaded_by text not null,
  uploaded_by_name text,
  status text default 'pending'::text,
  verified_by text,
  verified_at timestamp with time zone,
  rejection_reason text,
  ocr_data jsonb,
  ocr_applied boolean default false,
  created_at timestamp with time zone default now()
);

create table if not exists public.child_kit (
  id uuid default gen_random_uuid() not null,
  enquiry_id uuid,
  child_name text,
  programme_id text,
  academic_year_id uuid,
  programme_item_id uuid,
  item_name text not null,
  item_category text default 'book'::text,
  quantity integer default 1,
  size text,
  issued boolean default false,
  issued_date date,
  issued_by text,
  issued_by_role text,
  school_notes text,
  parent_comment text,
  parent_acknowledged boolean default false,
  parent_acknowledged_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.child_medical (
  id uuid default gen_random_uuid() not null,
  enquiry_id uuid not null,
  child_name text,
  blood_group text,
  allergies jsonb default '[]'::jsonb not null,
  vaccinations jsonb default '[]'::jsonb not null,
  emergency_contacts jsonb default '[]'::jsonb not null,
  medical_conditions text default ''::text,
  special_needs text default ''::text,
  doctor_name text default ''::text,
  doctor_phone text default ''::text,
  insurance_provider text default ''::text,
  updated_by text,
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

create table if not exists public.community_channels (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  name text not null,
  description text,
  icon text default '💬'::text not null,
  access text default 'all'::text not null,
  sort_order integer default 0 not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.community_messages (
  id uuid default gen_random_uuid() not null,
  channel_id uuid not null,
  member_id uuid not null,
  display_name text not null,
  user_type text not null,
  avatar_emoji text default '😊'::text not null,
  content text,
  msg_type text default 'text'::text not null,
  image_url text,
  is_deleted boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.community_reports (
  id uuid default gen_random_uuid() not null,
  message_id uuid,
  channel_id uuid,
  reported_member_id uuid,
  reported_name text,
  reported_content text,
  reporter_type text,
  reporter_ref text,
  reporter_name text,
  status text default 'open'::text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.enquiries (
  id uuid default uuid_generate_v4() not null,
  child_name text not null,
  child_dob date not null,
  child_age_months integer,
  phone text not null,
  parent_name text,
  address text,
  program_id text,
  program_label text,
  language text default 'en-IN'::text,
  source text default 'website'::text,
  status text default 'new'::text,
  notes text,
  follow_up_date date,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  section_id uuid,
  section_name text,
  enrolled_date date,
  academic_year text default '2025-26'::text,
  photo_url text,
  father_name text,
  mother_name text,
  blood_group text,
  allergies text,
  emergency_contact text,
  father_phone text,
  mother_phone text,
  guardian_phone text,
  email text,
  academic_year_id uuid,
  gender text
);

create table if not exists public.expenses (
  id uuid default gen_random_uuid() not null,
  category text not null,
  title text not null,
  amount numeric(10,2) not null,
  date date not null,
  added_by text,
  receipt_url text,
  notes text,
  created_at timestamp with time zone default now()
);

create table if not exists public.fee_assignments (
  id uuid default uuid_generate_v4() not null,
  enquiry_id uuid,
  child_name text,
  fee_structure_id uuid,
  fee_type text,
  amount numeric(10,2),
  due_date date not null,
  period_label text,
  status text default 'pending'::text,
  paid_at timestamp with time zone,
  payment_id text,
  receipt_no text,
  notes text,
  reminder_sent_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  payment_mode text default 'online'::text,
  paid_amount numeric,
  received_by text,
  reference_number text,
  receipt_number text,
  discount_amount numeric default 0,
  discount_reason text,
  payment_date date,
  paid_by_name text,
  paid_by_relation text default 'Father'::text,
  academic_year_id uuid
);

create table if not exists public.fee_structures (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  programme_id text,
  fee_type text not null,
  amount numeric(10,2) not null,
  currency text default 'INR'::text,
  description text,
  is_active boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists public.fees (
  id uuid default uuid_generate_v4() not null,
  student_id uuid,
  month text not null,
  amount numeric(10,2) not null,
  discount numeric(10,2) default 0,
  final_amount numeric(10,2),
  status text default 'pending'::text,
  payment_method text,
  payment_ref text,
  paid_at timestamp with time zone,
  receipt_url text,
  created_at timestamp with time zone default now()
);

create table if not exists public.gallery (
  id uuid default uuid_generate_v4() not null,
  title text,
  file_url text not null,
  file_type text default 'image'::text,
  class_name text,
  event_name text,
  uploaded_by uuid,
  created_at timestamp with time zone default now()
);

create table if not exists public.homework (
  id uuid default uuid_generate_v4() not null,
  class_name text,
  subject text,
  title text not null,
  description text,
  due_date date,
  file_url text,
  assigned_by text,
  created_at timestamp with time zone default now(),
  section_id uuid,
  section_name text,
  audio_keywords text,
  attachments jsonb default '[]'::jsonb
);

create table if not exists public.homework_status (
  id uuid default gen_random_uuid() not null,
  homework_id uuid,
  enquiry_id uuid,
  child_name text,
  status text default 'pending'::text,
  parent_doubt text,
  doubt_file_url text,
  proof_file_url text,
  teacher_reply text,
  replied_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.homework_submissions (
  id uuid default uuid_generate_v4() not null,
  homework_id uuid,
  student_id uuid,
  file_url text,
  submitted_at timestamp with time zone default now(),
  status text default 'submitted'::text,
  correction_url text,
  feedback text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone
);

create table if not exists public.incidents (
  id uuid default gen_random_uuid() not null,
  enquiry_id uuid,
  child_name text not null,
  section_name text default ''::text,
  incident_date date not null,
  incident_time time without time zone,
  incident_type text default 'other'::text not null,
  severity text default 'low'::text not null,
  description text default ''::text not null,
  action_taken text default ''::text,
  reported_by text default ''::text not null,
  parent_notified boolean default false,
  parent_notified_at timestamp with time zone,
  parent_notified_via text default ''::text,
  follow_up_required boolean default false,
  follow_up_notes text default ''::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.kb_chunks (
  id uuid default gen_random_uuid() not null,
  document_id uuid,
  chunk_index integer not null,
  content text not null,
  content_tsv tsvector generated always as (to_tsvector('english'::regconfig, content)) stored,
  created_at timestamp with time zone default now()
);

create table if not exists public.kb_documents (
  id uuid default gen_random_uuid() not null,
  title text not null,
  content text not null,
  file_url text,
  file_name text,
  target text default 'parent'::text,
  doc_type text default 'other'::text,
  uploaded_by text,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.lead_followups (
  id uuid default gen_random_uuid() not null,
  enquiry_id uuid,
  followup_date date not null,
  notes text default ''::text not null,
  status text default 'pending'::text not null,
  added_by text default 'admin'::text,
  created_at timestamp with time zone default now()
);

create table if not exists public.leads (
  id uuid default uuid_generate_v4() not null,
  parent_name text,
  phone text,
  child_name text,
  created_at timestamp without time zone default now(),
  program text,
  branch text,
  status text default 'ENQUIRY'::text
);

create table if not exists public.message_reactions (
  id uuid default gen_random_uuid() not null,
  message_id uuid not null,
  member_id uuid not null,
  emoji text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.owner_messages (
  id uuid default gen_random_uuid() not null,
  from_teacher_id uuid,
  from_teacher_name text not null,
  from_section text,
  subject text not null,
  message text not null,
  read_by_owner boolean default false,
  owner_reply text,
  replied_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create table if not exists public.parent_accounts (
  id uuid default uuid_generate_v4() not null,
  phone text not null,
  child_name text,
  child_dob date,
  password_hash text,
  is_first_login boolean default true,
  student_id uuid,
  enquiry_id uuid,
  last_login timestamp with time zone,
  created_at timestamp with time zone default now(),
  is_default_password boolean default true not null
);

create table if not exists public.parent_passwords (
  phone text not null,
  password text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.password_resets (
  id uuid default uuid_generate_v4() not null,
  phone text not null,
  role text not null,
  otp text not null,
  expires_at timestamp with time zone not null,
  used boolean default false,
  created_at timestamp with time zone default now()
);

create table if not exists public.pickup_authorizations (
  id uuid default gen_random_uuid() not null,
  enquiry_id uuid not null,
  child_name text,
  authorized_name text not null,
  relation text not null,
  phone text not null,
  id_type text default 'aadhaar'::text,
  id_number text default ''::text,
  is_active boolean default true,
  added_by text,
  notes text default ''::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.programme_items (
  id uuid default gen_random_uuid() not null,
  programme_id text not null,
  item_name text not null,
  item_category text default 'book'::text,
  quantity integer default 1,
  notes text,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists public.programmes (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  label text not null,
  icon text default '🎓'::text,
  color text default '#178F78'::text,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists public.ptm_bookings (
  id uuid default gen_random_uuid() not null,
  slot_id uuid,
  enquiry_id uuid,
  child_name text not null,
  parent_name text not null,
  phone text not null,
  status text default 'booked'::text not null,
  notes text default ''::text,
  created_at timestamp with time zone default now()
);

create table if not exists public.ptm_slots (
  id uuid default gen_random_uuid() not null,
  slot_date date not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  teacher_name text not null,
  section_name text default ''::text,
  max_bookings integer default 1,
  is_active boolean default true,
  notes text default ''::text,
  created_at timestamp with time zone default now()
);

create table if not exists public.qa_releases (
  id uuid default gen_random_uuid() not null,
  kind text default 'web'::text not null,
  version text not null,
  commit_sha text,
  title text,
  status text default 'pending'::text not null,
  staging_url text,
  prod_url text,
  notes text,
  approved_by text,
  approved_at timestamp with time zone,
  promoted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deployment_id text
);

create table if not exists public.qa_test_logs (
  id uuid default gen_random_uuid() not null,
  area text not null,
  feature text not null,
  scenario text not null,
  status text default 'fail'::text not null,
  severity text,
  notes text,
  fix_note text,
  tested_by text,
  created_at timestamp with time zone default now() not null,
  fixed_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.referrals (
  id uuid default gen_random_uuid() not null,
  referrer_enquiry_id uuid,
  referrer_name text not null,
  referee_name text not null,
  referee_phone text not null,
  referee_email text default ''::text,
  status text default 'pending'::text not null,
  reward_amount numeric(10,2) default 0,
  reward_given_at date,
  notes text default ''::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.report_cards (
  id uuid default uuid_generate_v4() not null,
  student_id uuid,
  academic_year text not null,
  term integer not null,
  strengths text,
  areas_growth text,
  overall_note text,
  pdf_url text,
  status text default 'draft'::text,
  created_by uuid,
  published_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create table if not exists public.ride_logs (
  id uuid default gen_random_uuid() not null,
  child_id uuid not null,
  child_name text not null,
  date date not null,
  checkin_time text,
  checkout_time text,
  checked_by text not null,
  status text default 'waiting'::text not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  boarded_by text,
  dropped_by text,
  route_id text default 'route_morning'::text not null
);

create table if not exists public.school_settings (
  id text default 'main'::text not null,
  school_name text default 'Evergreen Preschool & Daycare'::text,
  trust_name text default 'Jerrys Educational Trust'::text,
  address text default '1427, 13th Cross, Ananthnagar Phase-2, Bangalore - 560100'::text,
  phone text default '+91 7411574504'::text,
  email text default 'jerryseducationaltrust@gmail.com'::text,
  pan_number text,
  gst_number text,
  logo_url text default '/logo.png'::text,
  updated_at timestamp with time zone default now(),
  state text default ''::text
);

create table if not exists public.section_photos (
  id uuid default uuid_generate_v4() not null,
  section_id uuid,
  section_name text,
  title text,
  photo_url text not null,
  photo_type text default 'image'::text,
  event_name text,
  uploaded_by text,
  uploaded_at timestamp with time zone default now(),
  ai_tags text,
  ai_caption text,
  is_featured boolean default false,
  uploaded_by_role text default 'teacher'::text
);

create table if not exists public.sections (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  program_id text not null,
  program_label text,
  class_teacher text,
  strength integer default 20,
  academic_year text default '2025-26'::text,
  status text default 'active'::text,
  created_at timestamp with time zone default now(),
  academic_year_id uuid,
  class_teacher_id uuid
);

create table if not exists public.site_photos (
  slot text not null,
  photo_url text not null,
  updated_at timestamp with time zone default now()
);

create table if not exists public.staff (
  id uuid default uuid_generate_v4() not null,
  user_id uuid,
  name text not null,
  email text not null,
  phone text,
  role text not null,
  class_assigned text,
  photo_url text,
  join_date date,
  status text default 'active'::text,
  created_at timestamp with time zone default now(),
  address text,
  dob date,
  is_active boolean default true,
  notes text,
  updated_at timestamp with time zone default now(),
  last_working_day date
);

create table if not exists public.staff_attendance (
  id uuid default gen_random_uuid() not null,
  staff_id uuid,
  staff_name text not null,
  date date not null,
  clock_in timestamp with time zone,
  clock_out timestamp with time zone,
  status text default 'present'::text,
  notes text,
  created_at timestamp with time zone default now()
);

create table if not exists public.staff_payroll (
  id uuid default gen_random_uuid() not null,
  staff_id uuid,
  staff_name text not null,
  month integer not null,
  year integer not null,
  basic_pay numeric(10,2) default 0,
  hra numeric(10,2) default 0,
  transport_allowance numeric(10,2) default 0,
  other_allowances numeric(10,2) default 0,
  pf_deduction numeric(10,2) default 0,
  other_deductions numeric(10,2) default 0,
  net_pay numeric(10,2) generated always as ((((((basic_pay + hra) + transport_allowance) + other_allowances) - pf_deduction) - other_deductions)) stored,
  status text default 'draft'::text not null,
  payment_date date,
  payment_mode text default 'bank_transfer'::text,
  notes text default ''::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.staff_roles (
  id uuid default gen_random_uuid() not null,
  name text not null,
  color text default '#178F78'::text,
  sort_order integer default 0,
  created_at timestamp with time zone default now(),
  permissions text[] default '{}'::text[]
);

create table if not exists public.students (
  id uuid default uuid_generate_v4() not null,
  enquiry_id uuid,
  admission_no text,
  child_name text not null,
  child_dob date not null,
  gender text,
  blood_group text,
  photo_url text,
  father_name text,
  mother_name text,
  guardian_name text,
  phone_primary text not null,
  phone_secondary text,
  email text,
  address text,
  program_id text,
  class_name text,
  academic_year text,
  join_date date,
  status text default 'active'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.teacher_accounts (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  email text,
  phone text,
  username text not null,
  password_hash text not null,
  section_id uuid,
  section_name text,
  program_id text,
  program_label text,
  profile_photo text,
  role text default 'teacher'::text,
  status text default 'active'::text,
  last_login timestamp with time zone,
  created_at timestamp with time zone default now()
);

create table if not exists public.teacher_applications (
  id uuid default gen_random_uuid() not null,
  name text not null,
  phone text not null,
  email text,
  city text,
  experience text,
  qualification text,
  age_groups text[],
  prev_school text,
  available_from date,
  audio_base64 text,
  audio_duration_seconds integer,
  status text default 'new'::text,
  submitted_at timestamp with time zone default now()
);

create table if not exists public.test_results (
  id uuid default gen_random_uuid() not null,
  run_id uuid not null,
  tc_id text not null,
  module text not null,
  sub_module text,
  title text not null,
  status text not null,
  message text,
  duration_ms integer default 0,
  created_at timestamp with time zone default now()
);

create table if not exists public.test_runs (
  id uuid default gen_random_uuid() not null,
  started_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  total integer default 0,
  passed integer default 0,
  failed integer default 0,
  errors integer default 0,
  skipped integer default 0,
  triggered_by text default 'owner'::text,
  status text default 'running'::text
);

create table if not exists public.testimonials (
  id uuid default gen_random_uuid() not null,
  parent_name text not null,
  child_name text default ''::text,
  program text default ''::text,
  content text not null,
  rating integer default 5,
  avatar_url text default ''::text,
  is_published boolean default false,
  is_featured boolean default false,
  source text default 'direct'::text,
  created_at timestamp with time zone default now()
);

create table if not exists public.transport_opt_ins (
  id uuid default gen_random_uuid() not null,
  child_id uuid not null,
  child_name text not null,
  parent_phone text default ''::text not null,
  opted_in boolean default false not null,
  mode text default 'permanent'::text not null,
  start_date date,
  end_date date,
  pickup_order integer default 0 not null,
  drop_order integer default 0 not null,
  updated_by text default 'parent'::text not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.transport_settings (
  setting_key text not null,
  setting_value text not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.urid_registry (
  id uuid default gen_random_uuid() not null,
  urid text not null,
  product text default 'EDU'::text not null,
  year text default '2026'::text not null,
  module text not null,
  section text default ''::text not null,
  feature text not null,
  description text default ''::text,
  roles text default 'All'::text,
  status text default '✅ Live'::text,
  priority text default 'High'::text,
  mobile text default '—'::text,
  web_endpoint text default ''::text,
  mobile_endpoint text default ''::text,
  notes text default ''::text,
  doc_url text default ''::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.vehicle_location (
  route_id text not null,
  route_name text default ''::text not null,
  latitude double precision default 0 not null,
  longitude double precision default 0 not null,
  updated_at timestamp with time zone default now() not null,
  shared_by text default ''::text not null
);

create table if not exists public.vehicle_location_history (
  id bigint default nextval('vehicle_location_history_id_seq'::regclass) not null,
  route_id text not null,
  latitude double precision not null,
  longitude double precision not null,
  shared_by text default ''::text not null,
  date date not null,
  recorded_at timestamp with time zone default now() not null
);

-- ========== CONSTRAINTS (pk/unique/check) (102) ==========
alter table public.admin_accounts add constraint admin_accounts_username_key UNIQUE (username);
alter table public.attendance add constraint attendance_student_id_date_key UNIQUE (student_id, date);
alter table public.blog_posts add constraint blog_posts_slug_key UNIQUE (slug);
alter table public.channel_members add constraint channel_members_channel_id_user_type_user_ref_key UNIQUE (channel_id, user_type, user_ref);
alter table public.child_medical add constraint child_medical_enquiry_id_key UNIQUE (enquiry_id);
alter table public.community_channels add constraint community_channels_slug_key UNIQUE (slug);
alter table public.homework_status add constraint homework_status_homework_id_enquiry_id_key UNIQUE (homework_id, enquiry_id);
alter table public.homework_submissions add constraint homework_submissions_homework_id_student_id_key UNIQUE (homework_id, student_id);
alter table public.message_reactions add constraint message_reactions_message_id_member_id_emoji_key UNIQUE (message_id, member_id, emoji);
alter table public.parent_accounts add constraint parent_accounts_phone_key UNIQUE (phone);
alter table public.programmes add constraint programmes_slug_key UNIQUE (slug);
alter table public.ride_logs add constraint ride_logs_child_id_date_route_key UNIQUE (child_id, date, route_id);
alter table public.staff add constraint staff_email_key UNIQUE (email);
alter table public.staff_attendance add constraint staff_attendance_staff_id_date_key UNIQUE (staff_id, date);
alter table public.staff_payroll add constraint staff_payroll_staff_id_month_year_key UNIQUE (staff_id, month, year);
alter table public.students add constraint students_admission_no_key UNIQUE (admission_no);
alter table public.teacher_accounts add constraint teacher_accounts_username_key UNIQUE (username);
alter table public.transport_opt_ins add constraint transport_opt_ins_child_id_key UNIQUE (child_id);
alter table public.urid_registry add constraint urid_registry_urid_key UNIQUE (urid);
alter table public.academic_years add constraint academic_years_pkey PRIMARY KEY (id);
alter table public.admin_accounts add constraint admin_accounts_pkey PRIMARY KEY (id);
alter table public.announcements add constraint announcements_pkey PRIMARY KEY (id);
alter table public.app_feature_flags add constraint app_feature_flags_pkey PRIMARY KEY (key);
alter table public.attendance add constraint attendance_pkey PRIMARY KEY (id);
alter table public.audio_overviews add constraint audio_overviews_pkey PRIMARY KEY (id);
alter table public.blog_posts add constraint blog_posts_pkey PRIMARY KEY (id);
alter table public.calendar_events add constraint calendar_events_pkey PRIMARY KEY (id);
alter table public.channel_members add constraint channel_members_pkey PRIMARY KEY (id);
alter table public.child_documents add constraint child_documents_pkey PRIMARY KEY (id);
alter table public.child_kit add constraint child_kit_pkey PRIMARY KEY (id);
alter table public.child_medical add constraint child_medical_pkey PRIMARY KEY (id);
alter table public.community_channels add constraint community_channels_pkey PRIMARY KEY (id);
alter table public.community_messages add constraint community_messages_pkey PRIMARY KEY (id);
alter table public.community_reports add constraint community_reports_pkey PRIMARY KEY (id);
alter table public.enquiries add constraint enquiries_pkey PRIMARY KEY (id);
alter table public.expenses add constraint expenses_pkey PRIMARY KEY (id);
alter table public.fee_assignments add constraint fee_assignments_pkey PRIMARY KEY (id);
alter table public.fee_structures add constraint fee_structures_pkey PRIMARY KEY (id);
alter table public.fees add constraint fees_pkey PRIMARY KEY (id);
alter table public.gallery add constraint gallery_pkey PRIMARY KEY (id);
alter table public.homework add constraint homework_pkey PRIMARY KEY (id);
alter table public.homework_status add constraint homework_status_pkey PRIMARY KEY (id);
alter table public.homework_submissions add constraint homework_submissions_pkey PRIMARY KEY (id);
alter table public.incidents add constraint incidents_pkey PRIMARY KEY (id);
alter table public.kb_chunks add constraint kb_chunks_pkey PRIMARY KEY (id);
alter table public.kb_documents add constraint kb_documents_pkey PRIMARY KEY (id);
alter table public.lead_followups add constraint lead_followups_pkey PRIMARY KEY (id);
alter table public.leads add constraint leads_pkey PRIMARY KEY (id);
alter table public.message_reactions add constraint message_reactions_pkey PRIMARY KEY (id);
alter table public.owner_messages add constraint owner_messages_pkey PRIMARY KEY (id);
alter table public.parent_accounts add constraint parent_accounts_pkey PRIMARY KEY (id);
alter table public.parent_passwords add constraint parent_passwords_pkey PRIMARY KEY (phone);
alter table public.password_resets add constraint password_resets_pkey PRIMARY KEY (id);
alter table public.pickup_authorizations add constraint pickup_authorizations_pkey PRIMARY KEY (id);
alter table public.programme_items add constraint programme_items_pkey PRIMARY KEY (id);
alter table public.programmes add constraint programmes_pkey PRIMARY KEY (id);
alter table public.ptm_bookings add constraint ptm_bookings_pkey PRIMARY KEY (id);
alter table public.ptm_slots add constraint ptm_slots_pkey PRIMARY KEY (id);
alter table public.qa_releases add constraint qa_releases_pkey PRIMARY KEY (id);
alter table public.qa_test_logs add constraint qa_test_logs_pkey PRIMARY KEY (id);
alter table public.referrals add constraint referrals_pkey PRIMARY KEY (id);
alter table public.report_cards add constraint report_cards_pkey PRIMARY KEY (id);
alter table public.ride_logs add constraint ride_logs_pkey PRIMARY KEY (id);
alter table public.school_settings add constraint school_settings_pkey PRIMARY KEY (id);
alter table public.section_photos add constraint section_photos_pkey PRIMARY KEY (id);
alter table public.sections add constraint sections_pkey PRIMARY KEY (id);
alter table public.site_photos add constraint site_photos_pkey PRIMARY KEY (slot);
alter table public.staff add constraint staff_pkey PRIMARY KEY (id);
alter table public.staff_attendance add constraint staff_attendance_pkey PRIMARY KEY (id);
alter table public.staff_payroll add constraint staff_payroll_pkey PRIMARY KEY (id);
alter table public.staff_roles add constraint staff_roles_pkey PRIMARY KEY (id);
alter table public.students add constraint students_pkey PRIMARY KEY (id);
alter table public.teacher_accounts add constraint teacher_accounts_pkey PRIMARY KEY (id);
alter table public.teacher_applications add constraint teacher_applications_pkey PRIMARY KEY (id);
alter table public.test_results add constraint test_results_pkey PRIMARY KEY (id);
alter table public.test_runs add constraint test_runs_pkey PRIMARY KEY (id);
alter table public.testimonials add constraint testimonials_pkey PRIMARY KEY (id);
alter table public.transport_opt_ins add constraint transport_opt_ins_pkey PRIMARY KEY (id);
alter table public.transport_settings add constraint transport_settings_pkey PRIMARY KEY (setting_key);
alter table public.urid_registry add constraint urid_registry_pkey PRIMARY KEY (id);
alter table public.vehicle_location add constraint vehicle_location_pkey PRIMARY KEY (route_id);
alter table public.vehicle_location_history add constraint vehicle_location_history_pkey PRIMARY KEY (id);
alter table public.audio_overviews add constraint audio_overviews_source_type_check CHECK ((source_type = ANY (ARRAY['announcement'::text, 'document'::text, 'custom'::text])));
alter table public.audio_overviews add constraint audio_overviews_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'generating'::text, 'ready'::text, 'failed'::text])));
alter table public.blog_posts add constraint blog_posts_category_check CHECK ((category = ANY (ARRAY['news'::text, 'announcement'::text, 'event'::text, 'tips'::text, 'milestone'::text])));
alter table public.child_medical add constraint child_medical_blood_group_check CHECK ((blood_group = ANY (ARRAY['A+'::text, 'A-'::text, 'B+'::text, 'B-'::text, 'AB+'::text, 'AB-'::text, 'O+'::text, 'O-'::text, 'unknown'::text, ''::text])));
alter table public.expenses add constraint expenses_category_check CHECK ((category = ANY (ARRAY['salaries'::text, 'utilities'::text, 'maintenance'::text, 'supplies'::text, 'repairs'::text, 'events'::text, 'other'::text])));
alter table public.incidents add constraint incidents_incident_type_check CHECK ((incident_type = ANY (ARRAY['accident'::text, 'illness'::text, 'behaviour'::text, 'injury'::text, 'allergy'::text, 'other'::text])));
alter table public.incidents add constraint incidents_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
alter table public.incidents add constraint incidents_parent_notified_via_check CHECK ((parent_notified_via = ANY (ARRAY[''::text, 'phone'::text, 'whatsapp'::text, 'in-person'::text, 'email'::text])));
alter table public.kb_documents add constraint kb_documents_target_check CHECK ((target = ANY (ARRAY['parent'::text, 'staff'::text, 'both'::text])));
alter table public.kb_documents add constraint kb_documents_doc_type_check CHECK ((doc_type = ANY (ARRAY['handbook'::text, 'policy'::text, 'curriculum'::text, 'sop'::text, 'guidelines'::text, 'faq'::text, 'ncf'::text, 'other'::text])));
alter table public.lead_followups add constraint lead_followups_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text, 'no-answer'::text, 'rescheduled'::text])));
alter table public.pickup_authorizations add constraint pickup_authorizations_id_type_check CHECK ((id_type = ANY (ARRAY['aadhaar'::text, 'pan'::text, 'driving_license'::text, 'passport'::text, 'voter_id'::text, 'other'::text])));
alter table public.ptm_bookings add constraint ptm_bookings_status_check CHECK ((status = ANY (ARRAY['booked'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text])));
alter table public.referrals add constraint referrals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'contacted'::text, 'enrolled'::text, 'rewarded'::text, 'not-interested'::text])));
alter table public.staff_attendance add constraint staff_attendance_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'half_day'::text, 'leave'::text])));
alter table public.staff_payroll add constraint staff_payroll_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'paid'::text])));
alter table public.staff_payroll add constraint staff_payroll_month_check CHECK (((month >= 1) AND (month <= 12)));
alter table public.staff_payroll add constraint staff_payroll_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['bank_transfer'::text, 'cash'::text, 'cheque'::text, 'upi'::text])));
alter table public.testimonials add constraint testimonials_source_check CHECK ((source = ANY (ARRAY['direct'::text, 'google'::text, 'facebook'::text, 'whatsapp'::text])));
alter table public.testimonials add constraint testimonials_rating_check CHECK (((rating >= 1) AND (rating <= 5)));

-- ========== FOREIGN KEYS (42) ==========
alter table public.announcements add constraint announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff(id);
alter table public.attendance add constraint attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES staff(id);
alter table public.attendance add constraint attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES enquiries(id) ON DELETE CASCADE;
alter table public.channel_members add constraint channel_members_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES community_channels(id) ON DELETE CASCADE;
alter table public.child_documents add constraint child_documents_enquiry_id_fkey FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE;
alter table public.child_kit add constraint child_kit_enquiry_id_fkey FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE;
alter table public.child_kit add constraint child_kit_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years(id);
alter table public.child_kit add constraint child_kit_programme_item_id_fkey FOREIGN KEY (programme_item_id) REFERENCES programme_items(id) ON DELETE SET NULL;
alter table public.child_medical add constraint child_medical_enquiry_id_fkey FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE;
alter table public.community_messages add constraint community_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES community_channels(id) ON DELETE CASCADE;
alter table public.community_messages add constraint community_messages_member_id_fkey FOREIGN KEY (member_id) REFERENCES channel_members(id) ON DELETE CASCADE;
alter table public.enquiries add constraint enquiries_section_id_fkey FOREIGN KEY (section_id) REFERENCES sections(id);
alter table public.enquiries add constraint enquiries_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years(id);
alter table public.fee_assignments add constraint fee_assignments_fee_structure_id_fkey FOREIGN KEY (fee_structure_id) REFERENCES fee_structures(id);
alter table public.fee_assignments add constraint fee_assignments_enquiry_id_fkey FOREIGN KEY (enquiry_id) REFERENCES enquiries(id);
alter table public.fee_assignments add constraint fee_assignments_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years(id);
alter table public.fees add constraint fees_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.gallery add constraint gallery_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES staff(id);
alter table public.homework add constraint homework_section_id_fkey FOREIGN KEY (section_id) REFERENCES sections(id);
alter table public.homework_status add constraint homework_status_homework_id_fkey FOREIGN KEY (homework_id) REFERENCES homework(id) ON DELETE CASCADE;
alter table public.homework_submissions add constraint homework_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES staff(id);
alter table public.homework_submissions add constraint homework_submissions_homework_id_fkey FOREIGN KEY (homework_id) REFERENCES homework(id) ON DELETE CASCADE;
alter table public.homework_submissions add constraint homework_submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.incidents add constraint incidents_enquiry_id_fkey FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE SET NULL;
alter table public.kb_chunks add constraint kb_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE;
alter table public.lead_followups add constraint lead_followups_enquiry_id_fkey FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE;
alter table public.message_reactions add constraint message_reactions_member_id_fkey FOREIGN KEY (member_id) REFERENCES channel_members(id) ON DELETE CASCADE;
alter table public.message_reactions add constraint message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES community_messages(id) ON DELETE CASCADE;
alter table public.pickup_authorizations add constraint pickup_authorizations_enquiry_id_fkey FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE;
alter table public.ptm_bookings add constraint ptm_bookings_enquiry_id_fkey FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE SET NULL;
alter table public.ptm_bookings add constraint ptm_bookings_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES ptm_slots(id) ON DELETE CASCADE;
alter table public.referrals add constraint referrals_referrer_enquiry_id_fkey FOREIGN KEY (referrer_enquiry_id) REFERENCES enquiries(id) ON DELETE SET NULL;
alter table public.report_cards add constraint report_cards_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff(id);
alter table public.report_cards add constraint report_cards_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.section_photos add constraint section_photos_section_id_fkey FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE;
alter table public.sections add constraint sections_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years(id);
alter table public.sections add constraint sections_class_teacher_id_fkey FOREIGN KEY (class_teacher_id) REFERENCES staff(id) ON DELETE SET NULL;
alter table public.staff_attendance add constraint staff_attendance_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL;
alter table public.staff_payroll add constraint staff_payroll_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
alter table public.students add constraint students_enquiry_id_fkey FOREIGN KEY (enquiry_id) REFERENCES enquiries(id);
alter table public.teacher_accounts add constraint teacher_accounts_section_id_fkey FOREIGN KEY (section_id) REFERENCES sections(id);
alter table public.test_results add constraint test_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES test_runs(id) ON DELETE CASCADE;

-- ========== INDEXES (50) ==========
CREATE UNIQUE INDEX academic_years_current_idx ON public.academic_years USING btree (is_current) WHERE (is_current = true);
CREATE INDEX child_documents_enquiry_idx ON public.child_documents USING btree (enquiry_id);
CREATE INDEX child_documents_status_idx ON public.child_documents USING btree (status);
CREATE INDEX child_kit_enquiry_idx ON public.child_kit USING btree (enquiry_id);
CREATE INDEX idx_attendance_student ON public.attendance USING btree (student_id, date);
CREATE INDEX idx_calendar_month ON public.calendar_events USING btree (event_date);
CREATE INDEX idx_channel_members_channel ON public.channel_members USING btree (channel_id);
CREATE INDEX idx_channel_members_user ON public.channel_members USING btree (user_type, user_ref);
CREATE INDEX idx_child_medical_enquiry ON public.child_medical USING btree (enquiry_id);
CREATE INDEX idx_community_messages_channel ON public.community_messages USING btree (channel_id, created_at DESC);
CREATE INDEX idx_community_reports_message ON public.community_reports USING btree (message_id);
CREATE INDEX idx_community_reports_status ON public.community_reports USING btree (status, created_at DESC);
CREATE INDEX idx_enquiries_phone ON public.enquiries USING btree (phone);
CREATE INDEX idx_enquiries_status ON public.enquiries USING btree (status);
CREATE INDEX idx_fees_student ON public.fees USING btree (student_id, month);
CREATE INDEX idx_followups_date ON public.lead_followups USING btree (followup_date);
CREATE INDEX idx_followups_enquiry ON public.lead_followups USING btree (enquiry_id);
CREATE INDEX idx_homework_class ON public.homework USING btree (class_name, due_date);
CREATE INDEX idx_hwstatus_enq ON public.homework_status USING btree (enquiry_id);
CREATE INDEX idx_hwstatus_hw ON public.homework_status USING btree (homework_id);
CREATE INDEX idx_kb_chunks_doc ON public.kb_chunks USING btree (document_id);
CREATE INDEX idx_kb_chunks_tsv ON public.kb_chunks USING gin (content_tsv);
CREATE INDEX idx_kb_documents_target ON public.kb_documents USING btree (target, is_active);
CREATE INDEX idx_message_reactions_message ON public.message_reactions USING btree (message_id);
CREATE INDEX idx_parent_accounts_phone ON public.parent_accounts USING btree (phone);
CREATE INDEX idx_pickup_auth_enquiry ON public.pickup_authorizations USING btree (enquiry_id);
CREATE INDEX idx_ride_logs_child ON public.ride_logs USING btree (child_id);
CREATE INDEX idx_ride_logs_date ON public.ride_logs USING btree (date);
CREATE INDEX idx_ride_logs_route ON public.ride_logs USING btree (route_id);
CREATE INDEX idx_students_phone ON public.students USING btree (phone_primary);
CREATE INDEX idx_teacher_section ON public.teacher_accounts USING btree (section_id);
CREATE INDEX idx_teacher_username ON public.teacher_accounts USING btree (username);
CREATE INDEX idx_test_results_run_id ON public.test_results USING btree (run_id);
CREATE INDEX idx_test_results_status ON public.test_results USING btree (status);
CREATE INDEX idx_test_runs_started_at ON public.test_runs USING btree (started_at DESC);
CREATE INDEX idx_transport_opt_ins_child ON public.transport_opt_ins USING btree (child_id);
CREATE INDEX idx_transport_opt_ins_opted ON public.transport_opt_ins USING btree (opted_in);
CREATE INDEX idx_urid_doc_url ON public.urid_registry USING btree (((doc_url <> ''::text)));
CREATE INDEX idx_urid_module ON public.urid_registry USING btree (module);
CREATE INDEX idx_urid_priority ON public.urid_registry USING btree (priority);
CREATE INDEX idx_urid_product ON public.urid_registry USING btree (product);
CREATE INDEX idx_urid_status ON public.urid_registry USING btree (status);
CREATE INDEX idx_urid_year ON public.urid_registry USING btree (year);
CREATE INDEX idx_vlh_date_route ON public.vehicle_location_history USING btree (date DESC, route_id);
CREATE INDEX programme_items_prog_idx ON public.programme_items USING btree (programme_id);
CREATE INDEX qa_releases_created_idx ON public.qa_releases USING btree (created_at DESC);
CREATE INDEX qa_releases_dep_idx ON public.qa_releases USING btree (deployment_id);
CREATE INDEX qa_releases_status_idx ON public.qa_releases USING btree (status);
CREATE INDEX qa_test_logs_area_idx ON public.qa_test_logs USING btree (area);
CREATE INDEX qa_test_logs_status_idx ON public.qa_test_logs USING btree (status);

-- ========== TRIGGERS (5) ==========
CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER enquiries_updated_at BEFORE UPDATE ON public.enquiries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_child_age_months BEFORE INSERT OR UPDATE OF child_dob ON public.enquiries FOR EACH ROW EXECUTE FUNCTION calc_child_age_months();
CREATE TRIGGER students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER urid_updated_at BEFORE UPDATE ON public.urid_registry FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========== ENABLE RLS (37) ==========
alter table public.announcements enable row level security;
alter table public.app_feature_flags enable row level security;
alter table public.attendance enable row level security;
alter table public.audio_overviews enable row level security;
alter table public.blog_posts enable row level security;
alter table public.child_medical enable row level security;
alter table public.expenses enable row level security;
alter table public.fees enable row level security;
alter table public.gallery enable row level security;
alter table public.homework enable row level security;
alter table public.homework_status enable row level security;
alter table public.homework_submissions enable row level security;
alter table public.incidents enable row level security;
alter table public.kb_chunks enable row level security;
alter table public.kb_documents enable row level security;
alter table public.lead_followups enable row level security;
alter table public.owner_messages enable row level security;
alter table public.parent_passwords enable row level security;
alter table public.pickup_authorizations enable row level security;
alter table public.programmes enable row level security;
alter table public.ptm_bookings enable row level security;
alter table public.ptm_slots enable row level security;
alter table public.referrals enable row level security;
alter table public.report_cards enable row level security;
alter table public.ride_logs enable row level security;
alter table public.staff_attendance enable row level security;
alter table public.staff_payroll enable row level security;
alter table public.staff_roles enable row level security;
alter table public.students enable row level security;
alter table public.test_results enable row level security;
alter table public.test_runs enable row level security;
alter table public.testimonials enable row level security;
alter table public.transport_opt_ins enable row level security;
alter table public.transport_settings enable row level security;
alter table public.urid_registry enable row level security;
alter table public.vehicle_location enable row level security;
alter table public.vehicle_location_history enable row level security;

-- ========== POLICIES (36) ==========
create policy announcements_read on public.announcements as PERMISSIVE for SELECT to public using (true);
create policy announcements_write on public.announcements as PERMISSIVE for ALL to public using (true) with check (true);
create policy flags_all on public.app_feature_flags as PERMISSIVE for ALL to public using (true) with check (true);
create policy attendance_all on public.attendance as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_audio_overviews on public.audio_overviews as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_blog on public.blog_posts as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_child_medical on public.child_medical as PERMISSIVE for ALL to public using (true);
create policy "Anon can read own enquiry" on public.enquiries as PERMISSIVE for SELECT to public using (true);
create policy "Anyone can submit enquiry" on public.enquiries as PERMISSIVE for INSERT to public with check (true);
create policy owner_delete_enquiries on public.enquiries as PERMISSIVE for DELETE to public using (true);
create policy allow_all_expenses on public.expenses as PERMISSIVE for ALL to public using (true);
create policy allow_all_homework on public.homework as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_homework_status on public.homework_status as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_incidents on public.incidents as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_kb_chunks on public.kb_chunks as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_kb_documents on public.kb_documents as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_followups on public.lead_followups as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_owner_messages on public.owner_messages as PERMISSIVE for ALL to public using (true);
create policy parent_password_ops on public.parent_passwords as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_pickup_auth on public.pickup_authorizations as PERMISSIVE for ALL to public using (true);
create policy allow_all_programmes on public.programmes as PERMISSIVE for ALL to public using (true);
create policy allow_all_ptm_bookings on public.ptm_bookings as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_ptm_slots on public.ptm_slots as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_referrals on public.referrals as PERMISSIVE for ALL to public using (true) with check (true);
create policy ride_logs_all on public.ride_logs as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_staff_attendance on public.staff_attendance as PERMISSIVE for ALL to public using (true);
create policy allow_all_payroll on public.staff_payroll as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_staff_roles on public.staff_roles as PERMISSIVE for ALL to public using (true);
create policy test_results_all on public.test_results as PERMISSIVE for ALL to public using (true) with check (true);
create policy test_runs_all on public.test_runs as PERMISSIVE for ALL to public using (true) with check (true);
create policy allow_all_testimonials on public.testimonials as PERMISSIVE for ALL to public using (true) with check (true);
create policy transport_opt_ins_all on public.transport_opt_ins as PERMISSIVE for ALL to public using (true) with check (true);
create policy ts_all on public.transport_settings as PERMISSIVE for ALL to public using (true) with check (true);
create policy urid_registry_read_only_anon on public.urid_registry as PERMISSIVE for SELECT to public using (true);
create policy vehicle_location_all on public.vehicle_location as PERMISSIVE for ALL to public using (true) with check (true);
create policy vlh_all on public.vehicle_location_history as PERMISSIVE for ALL to public using (true) with check (true);
