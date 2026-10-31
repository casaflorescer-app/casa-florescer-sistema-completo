-- Probe auth.users insert capability + enum values (read + harmless probe)
select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='practice_kind';
select count(*)::int as auth_users from auth.users;
select column_name from information_schema.columns where table_schema='auth' and table_name='users' and column_name in ('id','email','encrypted_password','raw_app_meta_data','instance_id','aud','role') order by 1;
select column_name from information_schema.columns where table_schema='auth' and table_name='identities' order by ordinal_position limit 20;
