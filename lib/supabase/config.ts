export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Banco da casa configurado: o middleware não consulta o Auth antigo. */
export function skipLegacyAuth(databaseUrl: string | undefined) {
  return Boolean(databaseUrl);
}
