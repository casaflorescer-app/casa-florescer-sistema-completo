"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { RoleDashboard } from "@/components/dashboard/RoleDashboard";

export default function DashboardPage() {
  const { authorization } = useAuth();
  if (!authorization) return null;
  return <RoleDashboard auth={authorization} />;
}
