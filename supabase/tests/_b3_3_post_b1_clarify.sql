-- Clarify B1_05: can_view for samara physician
select public.can_view_practice_care_policies('7673bc0e-a789-4edd-b32f-392e407cc062') as view_as_current;

-- With impersonation via set_config in a DO is better; probe roles of samara
select role, practice_id, can_view_care_policies
from user_practice_roles
where user_id = 'e7eccd47-7bba-44f0-8c5c-558b7a998084';

select pg_get_functiondef('public.can_view_practice_care_policies(uuid)'::regprocedure) as def;
