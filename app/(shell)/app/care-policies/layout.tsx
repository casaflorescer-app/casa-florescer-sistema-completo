"use client";

import { RequireCarePolicyAccess } from "@/components/auth/RequireCarePolicyAccess";

export default function CarePoliciesLayout({ children }: { children: React.ReactNode }) {
  return <RequireCarePolicyAccess mode="view">{children}</RequireCarePolicyAccess>;
}
