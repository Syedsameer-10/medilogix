alter table public.patient_test_records
  add column if not exists stimulation_current_ma text not null default '--';

drop function if exists public.save_patient_test(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric,
  integer,
  timestamptz,
  timestamptz,
  text,
  text,
  text
);

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
  p_stimulation_current_ma text,
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
    stimulation_current_ma,
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
    coalesce(nullif(p_stimulation_current_ma, ''), '--'),
    p_storage_file_path,
    p_imported_at,
    p_saved_at,
    p_source_file_name
  )
  returning * into saved_record;

  return saved_record;
end;
$$;
