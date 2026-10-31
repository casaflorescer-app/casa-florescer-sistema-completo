-- Mark 0016 applied (idempotent). Safe after DDL of 0016.
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice 'schema_migrations missing — DDL applied; version table not updated';
    return;
  end if;

  -- Newer CLI: version text/timestamptz variants
  begin
    execute $q$
      insert into supabase_migrations.schema_migrations (version)
      select '0016'
      where not exists (
        select 1 from supabase_migrations.schema_migrations
        where version::text = '0016' or version::text like '0016_%'
      )
    $q$;
  exception when others then
    begin
      execute $q$
        insert into supabase_migrations.schema_migrations (version, name)
        select '0016', 'revoke_system_admin_patient_godmode'
        where not exists (
          select 1 from supabase_migrations.schema_migrations
          where version::text = '0016' or version::text like '0016_%'
        )
      $q$;
    exception when others then
      raise notice 'could not insert schema_migrations: %', sqlerrm;
    end;
  end;
end;
$$;

select version::text as version
from supabase_migrations.schema_migrations
order by version::text;
