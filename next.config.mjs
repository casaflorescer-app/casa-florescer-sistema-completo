/**
 * HOSPEDAGEM ESTÁTICA PROVISÓRIA (GitHub Pages)
 *
 * STATIC_EXPORT = true  → GitHub Pages (fase atual)
 * STATIC_EXPORT = false → Vercel / EasyPanel (hospedagem dinâmica)
 *
 * Ao retomar o servidor dinâmico:
 * 1. Troque STATIC_EXPORT para false (ou defina STATIC_EXPORT=false no ambiente)
 * 2. Copie _dynamic/middleware.ts → middleware.ts (raiz)
 * 3. Copie _dynamic/api → app/api
 * 4. Copie _dynamic/RoleGate.tsx → components/layout/RoleGate.tsx
 * 5. O callback de auth em app/auth/callback/page.tsx serve os dois modos
 */
const STATIC_EXPORT = process.env.STATIC_EXPORT
  ? process.env.STATIC_EXPORT === "true"
  : true;

const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH ??
  (STATIC_EXPORT && process.env.GITHUB_ACTIONS === "true"
    ? "/casa-florescer-sistema-completo"
    : "");

process.env.NEXT_PUBLIC_STATIC_EXPORT = STATIC_EXPORT ? "true" : "false";
process.env.NEXT_PUBLIC_BASE_PATH = basePath;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // GitHub Pages não tem o otimizador /_next/image. No Vercel, desligue STATIC_EXPORT
  // para voltar a usar o <Image> otimizado.
  images: { unoptimized: STATIC_EXPORT },

  ...(STATIC_EXPORT
    ? {
        output: "export",
        trailingSlash: true,
        ...(basePath ? { basePath } : {}),
      }
    : {}),
};

export default nextConfig;
