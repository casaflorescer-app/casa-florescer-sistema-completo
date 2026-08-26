import type { AppRole } from "@/lib/types/database";

export type OrganizationRecord = {
  id: string;
  legalName: string;
  tradeName: string;
  cnpj: string;
  createdAt: string;
};

export type PlatformMembership = {
  practiceId: string;
  practiceName: string;
  role: AppRole;
  clinicalAccess: string;
};

export type PlatformUser = {
  id: string;
  fullName: string;
  email: string;
  organizationId: string;
  organizationName: string | null;
  isActive: boolean;
  createdAt: string;
  lastAccess: null;
  isSystemAdmin: boolean;
  memberships: PlatformMembership[];
};

export type SystemAdminRecord = {
  userId: string;
  userName: string;
  userEmail: string;
  grantedAt: string;
  grantedById: string | null;
  grantedByName: string | null;
  reason: string;
  revokedAt: string | null;
  status: "ativo" | "revogado";
};

export type AuditEventRecord = {
  id: number;
  occurredAt: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityTable: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
};

export type PlatformStats = {
  organizations: number | null;
  users: number | null;
  systemAdmins: number | null;
  auditEvents: number | null;
};

export const AUDIT_ACTIONS = [
  "read",
  "insert",
  "update",
  "delete",
  "break_glass",
  "sign",
  "export",
  "grant",
  "revoke",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
