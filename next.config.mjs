/**
 * Hospedagem dinâmica (Auth + SSR + middleware).
 *
 * STATIC_EXPORT=true permanece disponível só para build estático legado
 * (GitHub Pages). Auth real exige o modo dinâmico (padrão).
 */
const STATIC_EXPORT = process.env.STATIC_EXPORT === "true";

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
