-- Preferences are stored per account. Delivery is handled by the corresponding
-- notification systems; this migration does not introduce an email sender.
alter table public.profiles
  add column if not exists notification_preferences jsonb not null
  default '{"projectUpdates":true,"teamActivity":true,"productUpdates":false,"tipsAndInspiration":false,"securityAlerts":true,"billingAlerts":true}'::jsonb;

do $$ begin
  alter table public.profiles
    add constraint profiles_notification_preferences_shape check (
      jsonb_typeof(notification_preferences) = 'object'
      and notification_preferences ?& array['projectUpdates', 'teamActivity', 'productUpdates', 'tipsAndInspiration', 'securityAlerts', 'billingAlerts']
      and notification_preferences - array['projectUpdates', 'teamActivity', 'productUpdates', 'tipsAndInspiration', 'securityAlerts', 'billingAlerts'] = '{}'::jsonb
      and jsonb_typeof(notification_preferences -> 'projectUpdates') = 'boolean'
      and jsonb_typeof(notification_preferences -> 'teamActivity') = 'boolean'
      and jsonb_typeof(notification_preferences -> 'productUpdates') = 'boolean'
      and jsonb_typeof(notification_preferences -> 'tipsAndInspiration') = 'boolean'
      and notification_preferences -> 'securityAlerts' = 'true'::jsonb
      and notification_preferences -> 'billingAlerts' = 'true'::jsonb
    );
exception when duplicate_object then null;
end $$;

-- Existing profiles owner policies restrict reads and updates to auth.uid().
-- Keep the restricted column grants for sensitive avatar and profile fields.
grant update (notification_preferences) on public.profiles to authenticated;

notify pgrst, 'reload schema';
