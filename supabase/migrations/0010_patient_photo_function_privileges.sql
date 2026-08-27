-- Casa Florescer — privilégios das funções de fotografia (Fase 7B.4).
-- CREATE FUNCTION no Supabase pode conceder EXECUTE explicitamente a anon.
-- REVOKE FROM public não remove esse GRANT nominal a anon.
-- Esta migration restringe as funções ao contexto autenticado,
-- conforme o desenho da Fase 7B.4.

REVOKE EXECUTE ON FUNCTION public.patient_photo_path_ids(text) FROM anon;

REVOKE EXECUTE ON FUNCTION public.can_access_patient_photo(uuid, uuid) FROM anon;

REVOKE EXECUTE ON FUNCTION public.can_manage_patient_photo(uuid, uuid) FROM anon;
