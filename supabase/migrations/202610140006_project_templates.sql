-- Template selection is metadata; the server seeds actual source into runtime_files.
alter table public.projects add column if not exists template_id text;
alter table public.projects add column if not exists programming_language text;
do $$ begin
  alter table public.projects add constraint projects_template_language check (
    (template_id is null and programming_language is null)
    or (template_id is not null and programming_language is not null and (
      (template_id = 'empty' and programming_language in ('javascript', 'typescript', 'html', 'python'))
      or (template_id = 'web' and programming_language in ('javascript', 'typescript', 'html'))
    ))
  );
exception when duplicate_object then null;
end $$;
notify pgrst, 'reload schema';
