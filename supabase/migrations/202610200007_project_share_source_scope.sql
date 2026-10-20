alter table public.project_shares
  add column source_visible boolean not null default true;

comment on column public.project_shares.source_visible is
  'Whether public source browsing is enabled for this share capability; false serves only the published snapshot.';
