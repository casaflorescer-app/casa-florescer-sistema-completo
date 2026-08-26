"use client";

import { RequireSystemAdmin } from "@/components/auth/RequireRole";

export default function SystemLayout({ children }: { children: React.ReactNode }) {
  return <RequireSystemAdmin>{children}</RequireSystemAdmin>;
}
