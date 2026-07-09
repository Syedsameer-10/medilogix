create extension if not exists pgcrypto;

create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone_number text not null default '',
  serial_number text not null default '',
  hospital_logo_url text not null default '',
  hospital_logo_path text not null default '',
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now()
);

alter table public.doctors
  add column if not exists phone_number text not null default '',
  add column if not exists serial_number text not null default '',
  add column if not exists hospital_logo_url text not null default '',
  add column if not exists hospital_logo_path text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hospital-logos',
  'hospital-logos',
  false,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-test-files',
  'patient-test-files',
  false,
  52428800,
  array['application/gzip', 'application/x-gzip', 'application/octet-stream']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.patient_test_records (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  patient_file_id text not null,
  patient_name text not null,
  gender text not null check (gender in ('Female', 'Male', 'Other')),
  age integer not null check (age > 0),
  case_history text not null default '',
  description text not null,
  test_date text not null,
  test_duration text not null,
  peak_psi numeric not null default 0,
  average_psi numeric not null,
  minimum_psi numeric not null,
  sample_count integer not null check (sample_count > 0),
  status text not null default 'Completed',
  storage_file_path text not null default '',
  imported_at timestamptz not null,
  saved_at timestamptz not null default now(),
  source_file_name text
);

alter table public.patient_test_records
  add column if not exists case_history text not null default '',
  add column if not exists peak_psi numeric not null default 0,
  add column if not exists status text not null default 'Completed',
  add column if not exists storage_file_path text not null default '';

drop trigger if exists trg_prevent_duplicate_patient_file_id on public.patient_test_records;
drop function if exists public.prevent_duplicate_patient_file_id();
drop index if exists public.idx_patient_test_records_patient_file_id_unique;

create table if not exists public.patient_test_samples (
  id bigint generated always as identity primary key,
  record_id uuid not null references public.patient_test_records(id) on delete cascade,
  sample_order integer not null,
  timestamp text not null,
  psi numeric not null
);

create index if not exists idx_patient_test_records_doctor_saved
  on public.patient_test_records(doctor_id, saved_at desc);

create index if not exists idx_patient_test_samples_record_order
  on public.patient_test_samples(record_id, sample_order);

alter table public.doctors enable row level security;
alter table public.patient_test_records enable row level security;
alter table public.patient_test_samples enable row level security;

create or replace function public.save_patient_test(
  p_id uuid,
  p_doctor_id uuid,
  p_patient_file_id text,
  p_patient_name text,
  p_gender text,
  p_age integer,
  p_case_history text,
  p_description text,
  p_test_date text,
  p_test_duration text,
  p_peak_psi numeric,
  p_average_psi numeric,
  p_minimum_psi numeric,
  p_sample_count integer,
  p_imported_at timestamptz,
  p_saved_at timestamptz,
  p_source_file_name text,
  p_status text,
  p_storage_file_path text
)
returns public.patient_test_records
language plpgsql
as $$
declare
  saved_record public.patient_test_records;
begin
  insert into public.patient_test_records (
    id,
    doctor_id,
    patient_file_id,
    patient_name,
    gender,
    age,
    case_history,
    description,
    test_date,
    test_duration,
    peak_psi,
    average_psi,
    minimum_psi,
    sample_count,
    status,
    storage_file_path,
    imported_at,
    saved_at,
    source_file_name
  )
  values (
    p_id,
    p_doctor_id,
    p_patient_file_id,
    p_patient_name,
    p_gender,
    p_age,
    p_case_history,
    p_description,
    p_test_date,
    p_test_duration,
    p_peak_psi,
    p_average_psi,
    p_minimum_psi,
    p_sample_count,
    p_status,
    p_storage_file_path,
    p_imported_at,
    p_saved_at,
    p_source_file_name
  )
  returning * into saved_record;

  return saved_record;
end;
$$;
