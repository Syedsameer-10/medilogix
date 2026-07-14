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
