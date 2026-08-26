import type { SupabaseClient } from "@supabase/supabase-js";
import { mapDbError } from "@/lib/platform/format";
import type { AuditAction, AuditEventRecord } from "@/lib/platform/types";

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export type AuditFilters = {
  from?: string;
  to?: string;
  action?: AuditAction | "";
  actorId?: string;
  entity?: string;
};

export async function listAuditEvents(
  supabase: SupabaseClient,
  filters: AuditFilters,
): Promise<AuditEventRecord[]> {
  let query = supabase
    .from("audit_events")
    .select("id, occurred_at, actor_id, action, entity_table, entity_id, metadata")
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (filters.from) query = query.gte("occurred_at", filters.from);
  if (filters.to) query = query.lte("occurred_at", filters.to);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.actorId) query = query.eq("actor_id", filters.actorId);
  if (filters.entity?.trim()) query = query.ilike("entity_table", `%${filters.entity.trim()}%`);

  const { data, error } = await query;
  if (error) throw new Error(mapDbError(error));

  const actorIds = [
    ...new Set(
      (data ?? []).map((row) => asString(row.actor_id)).filter((id): id is string => Boolean(id)),
    ),
  ];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const profiles = await supabase.from("profiles").select("id, full_name, email").in("id", actorIds);
    if (!profiles.error) {
      for (const row of profiles.data ?? []) {
        const id = asString(row.id);
        if (!id) continue;
        names.set(id, asString(row.full_name) ?? asString(row.email) ?? id);
      }
    }
  }

  return (data ?? []).flatMap((row) => {
    const id = asNumber(row.id);
    const occurredAt = asString(row.occurred_at);
    const action = asString(row.action);
    const entityTable = asString(row.entity_table);
    if (id == null || !occurredAt || !action || !entityTable) return [];
    const actorId = asString(row.actor_id);
    return [
      {
        id,
        occurredAt,
        actorId,
        actorName: actorId ? names.get(actorId) ?? actorId : null,
        action,
        entityTable,
        entityId: asString(row.entity_id),
        metadata: asMetadata(row.metadata),
      },
    ];
  });
}

export async function countAuditEvents(supabase: SupabaseClient) {
  const { count, error } = await supabase
    .from("audit_events")
    .select("id", { count: "exact", head: true });
  if (error) return null;
  return typeof count === "number" ? count : null;
}
