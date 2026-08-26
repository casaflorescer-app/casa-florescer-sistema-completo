import type { SupabaseClient } from "@supabase/supabase-js";
import { countOrganizations } from "@/lib/platform/organizations";
import { countAuditEvents } from "@/lib/platform/audit";
import { countActiveSystemAdmins, countProfiles } from "@/lib/platform/users";
import type { PlatformStats } from "@/lib/platform/types";

export async function loadPlatformStats(supabase: SupabaseClient): Promise<PlatformStats> {
  const [organizations, users, systemAdmins, auditEvents] = await Promise.all([
    countOrganizations(supabase),
    countProfiles(supabase),
    countActiveSystemAdmins(supabase),
    countAuditEvents(supabase),
  ]);
  return { organizations, users, systemAdmins, auditEvents };
}
