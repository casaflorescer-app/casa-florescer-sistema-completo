import { join } from "node:path";
import { copyPwaToPublic, repoRoot } from "./scripts/copy-pwa-public.mjs";

copyPwaToPublic(join(repoRoot, "apps", "pwa"), join(repoRoot, "public"));

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/index.html" }],
    };
  },
};

export default nextConfig;
