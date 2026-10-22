"use client";

import { RequireRole } from "@/components/auth/RequireRole";

export default function ClinicAdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["owner", "admin"]}>{children}</RequireRole>;
}
